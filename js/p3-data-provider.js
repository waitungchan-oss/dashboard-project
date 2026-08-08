const DEFAULT_BASE_PATH = './data/';

class P3ProviderError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'P3ProviderError';
        this.code = code;
        Object.assign(this, details);
    }
}

const joinPath = (basePath, path) => {
    const base = String(basePath || DEFAULT_BASE_PATH).replace(/\/+$/, '');
    return `${base}/${String(path || '').replace(/^\/+/, '')}`;
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeSnapshot = (snapshot, monthKey) => {
    if (!isRecord(snapshot)) {
        throw new P3ProviderError('P3_MONTH_JSON_INVALID', `P3 snapshot for ${monthKey} must be an object`, { monthKey });
    }
    return {
        ...snapshot,
        period: snapshot.period || monthKey,
        metrics: isRecord(snapshot.metrics) ? snapshot.metrics : {},
        branchRanking: Array.isArray(snapshot.branchRanking) ? snapshot.branchRanking : [],
        destinationDemand: Array.isArray(snapshot.destinationDemand) ? snapshot.destinationDemand : [],
        sentiment: Array.isArray(snapshot.sentiment) ? snapshot.sentiment : [],
        customerValueChain: isRecord(snapshot.customerValueChain)
            ? {
                ...snapshot.customerValueChain,
                stages: Array.isArray(snapshot.customerValueChain.stages) ? snapshot.customerValueChain.stages : [],
                links: Array.isArray(snapshot.customerValueChain.links) ? snapshot.customerValueChain.links : [],
                unavailableLinks: Array.isArray(snapshot.customerValueChain.unavailableLinks)
                    ? snapshot.customerValueChain.unavailableLinks
                    : []
            }
            : { status: 'unavailable', stages: [], links: [], unavailable: true, unavailableLinks: ['customer_value_chain'] }
    };
};

const getP3Metadata = (monthKey, getMonthEntry) => {
    const entry = getMonthEntry(monthKey);
    const p3 = entry?.p3;
    if (!p3?.path || p3.status === 'unavailable') {
        return { status: 'unavailable', monthKey, reason: 'p3_path_unavailable' };
    }
    return { status: 'ready', monthKey, path: p3.path };
};

const readJson = async ({ url, fetchImpl, codePrefix, monthKey, path }) => {
    let response;
    try {
        response = await fetchImpl(url, { cache: 'no-store' });
    } catch (cause) {
        throw new P3ProviderError(`${codePrefix}_LOAD_FAILED`, `Unable to load ${path}`, {
            monthKey,
            path,
            cause
        });
    }
    if (!response?.ok) {
        throw new P3ProviderError(`${codePrefix}_LOAD_FAILED`, `Unable to load ${path} (HTTP ${response?.status ?? 'unknown'})`, {
            monthKey,
            path,
            status: response?.status
        });
    }
    try {
        return await response.json();
    } catch (cause) {
        throw new P3ProviderError(`${codePrefix}_JSON_INVALID`, `Malformed JSON in ${path}`, {
            monthKey,
            path,
            cause
        });
    }
};

export const createJsonP3DataProvider = ({
    basePath = DEFAULT_BASE_PATH,
    getMonthEntry,
    fetchImpl = globalThis.fetch
} = {}) => {
    if (typeof getMonthEntry !== 'function') throw new TypeError('getMonthEntry must be a function');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

    const loadP3Month = async (monthKey) => {
        const metadata = getP3Metadata(monthKey, getMonthEntry);
        if (metadata.status === 'unavailable') return metadata;
        const snapshot = await readJson({
            url: joinPath(basePath, metadata.path),
            fetchImpl,
            codePrefix: 'P3_MONTH',
            monthKey,
            path: metadata.path
        });
        return normalizeSnapshot(snapshot, monthKey);
    };

    const loadP3Issues = async () => {
        const path = 'p3/issues.json';
        return readJson({
            url: joinPath(basePath, path),
            fetchImpl,
            codePrefix: 'P3_ISSUES',
            path
        });
    };

    const loadP3MonthComparison = async (baseMonth, compareMonth) => {
        const [baseSnapshot, compareSnapshot] = await Promise.all([
            loadP3Month(baseMonth),
            loadP3Month(compareMonth)
        ]);
        if (baseSnapshot.status === 'unavailable' || compareSnapshot.status === 'unavailable') {
            return {
                baseMonth,
                compareMonth,
                status: 'unavailable',
                reason: baseSnapshot.status === 'unavailable' ? baseSnapshot.reason : compareSnapshot.reason,
                baseSnapshot,
                compareSnapshot
            };
        }
        return buildP3Comparison(baseSnapshot, compareSnapshot);
    };

    return { loadP3Month, loadP3Issues, loadP3MonthComparison };
};

const numericValue = (row, field) => typeof row?.[field] === 'number' && Number.isFinite(row[field]) ? row[field] : null;

const compareMetric = (base, compare) => {
    const baseValue = numericValue(base, 'value');
    const compareValue = numericValue(compare, 'value');
    const result = { base, compare, delta: baseValue !== null && compareValue !== null ? compareValue - baseValue : null };
    if (baseValue !== null && compareValue !== null && baseValue !== 0) {
        result.percentageDelta = ((compareValue - baseValue) / baseValue) * 100;
    }
    return result;
};

const alignRows = (baseRows, compareRows, valueField) => {
    const baseByKey = new Map((Array.isArray(baseRows) ? baseRows : []).map((row) => [row?.key, row]));
    const compareByKey = new Map((Array.isArray(compareRows) ? compareRows : []).map((row) => [row?.key, row]));
    const keys = [...new Set([...baseByKey.keys(), ...compareByKey.keys()])].filter(Boolean);
    return keys.map((key) => {
        const base = baseByKey.get(key) ?? null;
        const compare = compareByKey.get(key) ?? null;
        const baseValue = numericValue(base, valueField);
        const compareValue = numericValue(compare, valueField);
        const status = base && compare
            ? (baseValue === null || compareValue === null ? 'unavailable' : 'both')
            : base
                ? 'removed'
                : 'added';
        return {
            key,
            status,
            base,
            compare,
            delta: baseValue !== null && compareValue !== null ? compareValue - baseValue : null
        };
    });
};

const chainStatus = (base, compare) => {
    if (base?.status === 'unavailable' || compare?.status === 'unavailable') return 'unavailable';
    if (base?.status === 'partial' || compare?.status === 'partial') return 'partial';
    return 'complete';
};

export const buildP3Comparison = (baseSnapshot, compareSnapshot) => {
    const baseChain = baseSnapshot?.customerValueChain || {};
    const compareChain = compareSnapshot?.customerValueChain || {};
    const unavailableLinks = [...new Set([
        ...(Array.isArray(baseChain.unavailableLinks) ? baseChain.unavailableLinks : []),
        ...(Array.isArray(compareChain.unavailableLinks) ? compareChain.unavailableLinks : [])
    ])];

    return {
        baseMonth: baseSnapshot?.period,
        compareMonth: compareSnapshot?.period,
        metrics: Object.fromEntries([...new Set([
            ...Object.keys(baseSnapshot?.metrics || {}),
            ...Object.keys(compareSnapshot?.metrics || {})
        ])].map((key) => [key, compareMetric(baseSnapshot?.metrics?.[key] ?? null, compareSnapshot?.metrics?.[key] ?? null)])),
        branchRanking: alignRows(baseSnapshot?.branchRanking, compareSnapshot?.branchRanking, 'score'),
        destinationDemand: alignRows(baseSnapshot?.destinationDemand, compareSnapshot?.destinationDemand, 'value'),
        sentiment: alignRows(baseSnapshot?.sentiment, compareSnapshot?.sentiment, 'count'),
        customerValueChain: {
            status: chainStatus(baseChain, compareChain),
            base: baseChain,
            compare: compareChain,
            stages: alignRows(baseChain.stages, compareChain.stages, 'value'),
            links: alignRows(baseChain.links, compareChain.links, 'count'),
            unavailable: chainStatus(baseChain, compareChain) === 'unavailable',
            unavailableLinks
        }
    };
};

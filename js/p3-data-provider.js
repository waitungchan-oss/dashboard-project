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

const fieldDelta = (base, compare, field) => {
    const baseValue = numericValue(base, field);
    const compareValue = numericValue(compare, field);
    return baseValue !== null && compareValue !== null ? compareValue - baseValue : null;
};

// Ranking snapshots are ordered; when a source rank is absent, expose that stable 1-based order.
const sourceRank = (row, index) => numericValue(row, 'rank') ?? index + 1;

const alignRows = (baseRows, compareRows, valueField, fieldDeltas = []) => {
    const baseByKey = new Map((Array.isArray(baseRows) ? baseRows : []).map((row, index) => [row?.key, { row, index }]));
    const compareByKey = new Map((Array.isArray(compareRows) ? compareRows : []).map((row, index) => [row?.key, { row, index }]));
    const keys = [...new Set([...baseByKey.keys(), ...compareByKey.keys()])].filter(Boolean);
    return keys.map((key) => {
        const baseEntry = baseByKey.get(key) ?? null;
        const compareEntry = compareByKey.get(key) ?? null;
        const base = baseEntry?.row ?? null;
        const compare = compareEntry?.row ?? null;
        const baseRank = baseEntry ? sourceRank(base, baseEntry.index) : null;
        const compareRank = compareEntry ? sourceRank(compare, compareEntry.index) : null;
        const status = base && compare
            ? (numericValue(base, valueField) === null || numericValue(compare, valueField) === null ? 'unavailable' : 'both')
            : base
                ? 'removed'
                : 'added';
        const result = {
            key,
            status,
            base,
            compare,
            delta: fieldDelta(base, compare, valueField),
            rank: compareRank ?? baseRank,
            baseRank,
            compareRank,
            rankDelta: baseRank !== null && compareRank !== null ? compareRank - baseRank : null
        };
        fieldDeltas.forEach(({ field, output }) => {
            result[output] = fieldDelta(base, compare, field);
        });
        return result;
    });
};

const KNOWN_CHAIN_STATUSES = new Set(['complete', 'partial', 'unavailable']);

const chainStatus = (base, compare) => {
    const statuses = [base?.status, compare?.status];
    if (statuses.some(status => !KNOWN_CHAIN_STATUSES.has(status))) return 'unavailable';
    if (statuses.includes('unavailable')) return 'unavailable';
    if (statuses.includes('partial')) return 'partial';
    return 'complete';
};

export const buildP3Comparison = (baseSnapshot, compareSnapshot) => {
    const baseChain = baseSnapshot?.customerValueChain || {};
    const compareChain = compareSnapshot?.customerValueChain || {};
    const derivedChainStatus = chainStatus(baseChain, compareChain);
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
        branchRanking: alignRows(baseSnapshot?.branchRanking, compareSnapshot?.branchRanking, 'score', [
            { field: 'score', output: 'scoreDelta' },
            { field: 'n', output: 'nDelta' }
        ]),
        destinationDemand: alignRows(baseSnapshot?.destinationDemand, compareSnapshot?.destinationDemand, 'value', [
            { field: 'value', output: 'valueDelta' },
            { field: 'rate', output: 'rateDelta' }
        ]),
        sentiment: alignRows(baseSnapshot?.sentiment, compareSnapshot?.sentiment, 'count', [
            { field: 'count', output: 'countDelta' },
            { field: 'rate', output: 'rateDelta' }
        ]),
        customerValueChain: {
            status: derivedChainStatus,
            baseStatus: baseChain.status ?? 'unknown',
            compareStatus: compareChain.status ?? 'unknown',
            base: baseChain,
            compare: compareChain,
            stages: alignRows(baseChain.stages, compareChain.stages, 'value'),
            links: alignRows(baseChain.links, compareChain.links, 'count'),
            unavailable: derivedChainStatus === 'unavailable',
            unavailableLinks
        }
    };
};

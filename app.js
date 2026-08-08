import {
    clearDashboardError,
    escapeHTML,
    hideLoadingOverlay,
    rememberFallback,
    renderListHTML,
    restoreFallback,
    setHTML,
    setText,
    showDashboardError,
    showLoadingOverlay
} from './js/dom-utils.js';
import { exportCSV } from './js/csv-export.js';
import { destroyAllCharts, getValidTourDays } from './js/dashboard-utils.js';
import { createJsonP3DataProvider } from './js/p3-data-provider.js';
import {
    filterP3Issues,
    renderP3Comparison,
    renderP3ComparisonUnavailable,
    renderP3IssueTracker,
    renderP3IssueTrackerUnavailable
} from './js/p3-renderers.js';

let DataStore = {};
window.DataStore = DataStore;

const DATA_PATH = './data/';
const DEFAULT_MONTH = '202605';
const STATIC_STRATEGIC_SUMMARY_MONTH = '202605';
let currentMonthKey = DEFAULT_MONTH;
const P3State = {
    provider: null,
    activeMonthKey: null,
    activeMonth: null,
    issues: null,
    issuesError: null,
    onUpdate: null
};
window.P3State = P3State;
let MonthCatalog = {
    defaultMonth: DEFAULT_MONTH,
    months: [
        { key: '202605', label: '2026年 05月', schema: 'current', status: 'ready' },
        { key: '202604', label: '2026年 04月', schema: 'legacy', status: 'ready' }
    ]
};

const parseMonthKey = (monthVal) => {
    const raw = String(monthVal || '').trim();
    const compact = raw.replace(/\D/g, '');
    if (/^\d{6}$/.test(compact)) return compact;

    const match = raw.match(/(20\d{2}).*?(\d{1,2})/);
    if (match) return `${match[1]}${match[2].padStart(2, '0')}`;

    return null;
};

const normalizeMonthValue = (monthVal) => {
    return parseMonthKey(monthVal) || MonthCatalog.defaultMonth || DEFAULT_MONTH;
};

const formatMonthLabel = (monthKey) => {
    const normalized = normalizeMonthValue(monthKey);
    return `${normalized.slice(0, 4)}年 ${normalized.slice(4, 6)}月`;
};

const updateMonthHeader = (monthKey) => {
    const headerDesc = document.getElementById('header-data-source');
    if (headerDesc) headerDesc.innerText = `當前視圖：${formatMonthLabel(monthKey)} | 數據源：問卷匯總`;
};

const normalizeMonthCatalog = (manifest) => {
    const fallback = MonthCatalog;
    if (!manifest || !Array.isArray(manifest.months)) return fallback;

    const months = manifest.months
        .map((month) => {
            const key = parseMonthKey(month?.key);
            if (!key) return null;
            return {
                key,
                label: month.label || formatMonthLabel(key),
                schema: month.schema || 'current',
                status: month.status || 'ready',
                description: month.description || '',
                p3: month.p3 || null
            };
        })
        .filter(Boolean);

    if (!months.length) return fallback;
    const defaultMonth = parseMonthKey(manifest.defaultMonth) || months[0].key;
    return {
        defaultMonth: months.some(month => month.key === defaultMonth) ? defaultMonth : months[0].key,
        months
    };
};

const notifyP3Update = () => {
    if (typeof P3State.onUpdate !== 'function') return;
    try {
        Promise.resolve(P3State.onUpdate(P3State.activeMonth, P3State.activeMonthKey, P3State))
            .catch(error => console.warn('P3 update hook failed:', error));
    } catch (error) {
        console.warn('P3 update hook failed:', error);
    }
};

const refreshP3ForMonth = async (monthKey) => {
    if (!P3State.provider) {
        notifyP3Update();
        return P3State.activeMonth;
    }
    try {
        const result = await P3State.provider.loadP3Month(monthKey);
        P3State.activeMonthKey = monthKey;
        P3State.activeMonth = result;
        return result;
    } catch (error) {
        P3State.activeMonthKey = monthKey;
        P3State.activeMonth = {
            status: 'error',
            monthKey,
            error: {
                code: error.code || 'P3_MONTH_LOAD_FAILED',
                message: error.message
            }
        };
        console.warn('P3 month loading failed:', error);
        return P3State.activeMonth;
    } finally {
        notifyP3Update();
    }
};
window.refreshP3ForMonth = refreshP3ForMonth;

const p3ComparisonState = {
    baseMonth: null,
    compareMonth: null,
    loading: false,
    requestId: 0,
    latestGlobalMonth: DEFAULT_MONTH,
    updateVersion: 0,
    stale: true
};

const p3IssueTrackerState = {
    filters: { category: '', department: '', status: '', priority: '' },
    currentMonth: DEFAULT_MONTH
};

const getP3IssueTrackerContainer = () => document.getElementById('p3_issue_tracker');

const getP3IssueItems = () => Array.isArray(P3State.issues)
    ? P3State.issues
    : Array.isArray(P3State.issues?.issues) ? P3State.issues.issues : [];

const populateP3IssueFilter = (id, values, label) => {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">${escapeHTML(label)}</option>${values.map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('')}`;
    if (values.includes(current)) select.value = current;
};

const setupP3IssueFilters = () => {
    const issues = getP3IssueItems();
    const validIssues = issues.filter((issue) => filterP3Issues([issue], {}).length === 1);
    const unique = (field) => [...new Set(validIssues.map(issue => issue?.[field]).filter(Boolean))].sort();
    populateP3IssueFilter('p3IssueCategoryFilter', unique('category'), '全部類別');
    populateP3IssueFilter('p3IssueDepartmentFilter', unique('ownerDepartment'), '全部負責部門');
    populateP3IssueFilter('p3IssueStatusFilter', unique('status'), '全部狀態');
    populateP3IssueFilter('p3IssuePriorityFilter', unique('priority'), '全部優先級');
    ['category', 'department', 'status', 'priority'].forEach((field) => {
        const id = `p3Issue${field[0].toUpperCase()}${field.slice(1)}Filter`;
        const select = document.getElementById(id);
        if (!select || select.dataset.bound === 'true') return;
        select.dataset.bound = 'true';
        select.addEventListener('change', () => {
            p3IssueTrackerState.filters[field] = select.value;
            renderP3IssueTrackerView();
        });
    });
};

const renderP3IssueTrackerView = (monthKey = p3IssueTrackerState.currentMonth || currentMonthKey) => {
    const container = getP3IssueTrackerContainer();
    if (!container) return;
    p3IssueTrackerState.currentMonth = monthKey || currentMonthKey;
    if (P3State.issuesError) {
        renderP3IssueTrackerUnavailable(container, P3State.issuesError.message || '營運問題 register 載入失敗。');
        return;
    }
    if (!P3State.issues) {
        renderP3IssueTrackerUnavailable(container, '正在載入營運問題 register…');
        return;
    }
    setupP3IssueFilters();
    renderP3IssueTracker(container, P3State.issues, p3IssueTrackerState.filters, { currentMonth: p3IssueTrackerState.currentMonth });
};

const getP3ComparisonContainer = () => document.getElementById('p3_comparison');

const setP3ComparisonStatus = (message, isError = false) => {
    const status = document.getElementById('p3ComparisonStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('text-red-700', isError);
    status.classList.toggle('text-gray-600', !isError);
};

const getAlternativeMonth = (monthKey) => MonthCatalog.months.find(month => month.key !== monthKey && month.status === 'ready')?.key || null;

const populateP3ComparisonSelectors = (baseMonth = currentMonthKey) => {
    const baseSelector = document.getElementById('p3BaseMonthSelector');
    const compareSelector = document.getElementById('p3CompareMonthSelector');
    if (!baseSelector || !compareSelector) return;

    const months = MonthCatalog.months.filter(month => month.status === 'ready');
    const selectedBase = months.some(month => month.key === baseMonth) ? baseMonth : months[0]?.key;
    const selectedCompare = p3ComparisonState.compareMonth && p3ComparisonState.compareMonth !== selectedBase
        && months.some(month => month.key === p3ComparisonState.compareMonth)
        ? p3ComparisonState.compareMonth
        : getAlternativeMonth(selectedBase);
    const options = (selected) => months.map(month => `<option value="${escapeHTML(month.key)}"${month.key === selected ? ' selected' : ''}>${escapeHTML(month.label)}</option>`).join('');
    baseSelector.innerHTML = options(selectedBase);
    compareSelector.innerHTML = options(selectedCompare);
    p3ComparisonState.baseMonth = selectedBase || null;
    p3ComparisonState.compareMonth = selectedCompare || null;
};

const loadP3MonthComparison = async (baseMonth, compareMonth) => {
    const container = getP3ComparisonContainer();
    if (!container) return;
    if (!baseMonth || !compareMonth || baseMonth === compareMonth) {
        setP3ComparisonStatus('基準月份與比較月份必須不同。', true);
        renderP3ComparisonUnavailable(container, '請選擇兩個不同月份。');
        return;
    }
    if (!P3State.provider) initializeP3Provider();
    const requestId = ++p3ComparisonState.requestId;
    const updateVersion = p3ComparisonState.updateVersion;
    p3ComparisonState.loading = true;
    p3ComparisonState.stale = true;
    setP3ComparisonStatus(`正在載入 ${formatMonthLabel(baseMonth)} 與 ${formatMonthLabel(compareMonth)} 的比較資料…`);
    try {
        const comparison = await P3State.provider.loadP3MonthComparison(baseMonth, compareMonth);
        if (requestId !== p3ComparisonState.requestId) return;
        renderP3Comparison(container, comparison);
        setP3ComparisonStatus(`已比較 ${formatMonthLabel(baseMonth)} 與 ${formatMonthLabel(compareMonth)}。`);
        if (updateVersion === p3ComparisonState.updateVersion) p3ComparisonState.stale = false;
    } catch (error) {
        if (requestId !== p3ComparisonState.requestId) return;
        renderP3ComparisonUnavailable(container, error.message || '月份比較資料載入失敗。');
        setP3ComparisonStatus(error.message || '月份比較資料載入失敗。', true);
    } finally {
        if (requestId === p3ComparisonState.requestId) p3ComparisonState.loading = false;
    }
};

const handleP3SelectorChange = (kind, value) => {
    const nextValue = normalizeMonthValue(value);
    if (kind === 'base') p3ComparisonState.baseMonth = nextValue;
    else p3ComparisonState.compareMonth = nextValue;
    if (p3ComparisonState.baseMonth === p3ComparisonState.compareMonth) {
        const replacement = getAlternativeMonth(nextValue);
        if (kind === 'base') p3ComparisonState.baseMonth = replacement;
        else p3ComparisonState.compareMonth = replacement;
        populateP3ComparisonSelectors(p3ComparisonState.baseMonth);
        setP3ComparisonStatus('基準月份與比較月份必須不同，已自動調整選擇。', true);
    }
    void loadP3MonthComparison(p3ComparisonState.baseMonth, p3ComparisonState.compareMonth);
};

const refreshP3ComparisonOnOpen = () => {
    if (!p3ComparisonState.stale && p3ComparisonState.baseMonth && p3ComparisonState.compareMonth) return;
    populateP3ComparisonSelectors(p3ComparisonState.latestGlobalMonth || currentMonthKey);
    void loadP3MonthComparison(p3ComparisonState.baseMonth, p3ComparisonState.compareMonth);
};

const setupP3Comparison = () => {
    const container = getP3ComparisonContainer();
    const baseSelector = document.getElementById('p3BaseMonthSelector');
    const compareSelector = document.getElementById('p3CompareMonthSelector');
    if (!container || !baseSelector || !compareSelector) return;
    p3ComparisonState.latestGlobalMonth = currentMonthKey;
    populateP3ComparisonSelectors(currentMonthKey);
    baseSelector.onchange = (event) => handleP3SelectorChange('base', event.target.value);
    compareSelector.onchange = (event) => handleP3SelectorChange('compare', event.target.value);
    P3State.onUpdate = (_, monthKey) => {
        p3ComparisonState.latestGlobalMonth = monthKey || currentMonthKey;
        renderP3IssueTrackerView(monthKey || currentMonthKey);
        p3ComparisonState.updateVersion += 1;
        p3ComparisonState.stale = true;
        const section = getP3ComparisonContainer();
        if (!section?.classList.contains('active')) return;
        refreshP3ComparisonOnOpen();
    };
    void loadP3MonthComparison(p3ComparisonState.baseMonth, p3ComparisonState.compareMonth);
};

const populateMonthSelector = () => {
    const selector = document.getElementById('globalMonthSelector');
    if (!selector || !Array.isArray(MonthCatalog.months) || !MonthCatalog.months.length) return;

    const selectedKey = normalizeMonthValue(selector.value || currentMonthKey || MonthCatalog.defaultMonth);
    selector.innerHTML = MonthCatalog.months.map((month) => {
        const selected = month.key === selectedKey ? ' selected' : '';
        const disabled = month.status && month.status !== 'ready' ? ' disabled' : '';
        return `<option value="${escapeHTML(month.key)}"${selected}${disabled}>${escapeHTML(month.label)}</option>`;
    }).join('');

    if (!MonthCatalog.months.some(month => month.key === selectedKey)) {
        selector.value = MonthCatalog.defaultMonth;
    }
};

const fetchMonthCatalog = async () => {
    try {
        const response = await fetch(`${DATA_PATH}months.json`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`無法載入 months.json（HTTP ${response.status}）`);
        }
        const manifest = await response.json();
        MonthCatalog = normalizeMonthCatalog(manifest);
        currentMonthKey = MonthCatalog.defaultMonth;
        populateMonthSelector();
        return MonthCatalog;
    } catch (error) {
        console.warn('Month manifest loading failed:', error);
        showDashboardError(`${error.message}，已改用內建月份清單。`);
        populateMonthSelector();
        return MonthCatalog;
    }
};

const initializeP3Provider = () => {
    if (P3State.provider) return P3State.provider;
    P3State.provider = createJsonP3DataProvider({
        basePath: DATA_PATH,
        getMonthEntry: (monthKey) => MonthCatalog.months.find(month => month.key === monthKey),
        fetchImpl: (...args) => fetch(...args)
    });
    void P3State.provider.loadP3Issues()
        .then(issues => {
            P3State.issues = issues;
            renderP3IssueTrackerView(currentMonthKey);
        })
        .catch(error => {
            P3State.issuesError = { code: error.code || 'P3_ISSUES_LOAD_FAILED', message: error.message };
            console.warn('P3 issue register loading failed:', error);
            renderP3IssueTrackerView(currentMonthKey);
        });
    return P3State.provider;
};

const fetchMonthData = async (monthVal) => {
    const monthKey = normalizeMonthValue(monthVal);
    const response = await fetch(`${DATA_PATH}${encodeURIComponent(monthKey)}.json`, { cache: 'no-store' });
    if (!response.ok) {
throw new Error(`無法載入 ${monthKey}.json（HTTP ${response.status}）`);
    }

    const nextDataStore = await response.json();
    DataStore = nextDataStore;
    window.DataStore = DataStore;
    currentMonthKey = monthKey;
    updateMonthHeader(monthKey);
    const selector = document.getElementById('globalMonthSelector');
    if (selector && selector.value !== monthKey) selector.value = monthKey;
    return DataStore;
};



const DashboardApp = (function() {
    let satCrossChart = null;
    let printState = null;
    let npsDriverChart = null;
    let npsDriverRankedPoints = [];
    let npsDriverIndexByName = new Map();
    let npsSelectedDriverName = '';

    const refreshChartsForPrint = () => {
        if (typeof Chart === 'undefined' || typeof Chart.getChart !== 'function') return;
        document.querySelectorAll('canvas').forEach((canvas) => {
            const chart = Chart.getChart(canvas);
            if (!chart) return;
            chart.resize();
            chart.update('none');
        });
    };

    const setPrintMonthLabels = () => {
        const selector = document.getElementById('globalMonthSelector');
        const monthLabel = selector?.selectedOptions?.[0]?.textContent?.trim() || formatMonthLabel(currentMonthKey);
        document.querySelectorAll('.tab-content').forEach((section) => {
            section.dataset.printMonth = monthLabel;
        });
    };

    const getPrintMonthLabel = () => {
        const selector = document.getElementById('globalMonthSelector');
        return selector?.selectedOptions?.[0]?.textContent?.trim() || formatMonthLabel(currentMonthKey);
    };

    const circularChartTypes = new Set(['doughnut', 'pie', 'polarArea']);

    const captureChartImage = (canvas) => {
        if (!canvas) return { src: '', shape: 'wide' };
        const chart = typeof Chart !== 'undefined' && typeof Chart.getChart === 'function'
            ? Chart.getChart(canvas)
            : null;
        try {
            if (chart) {
                chart.resize();
                chart.update('none');
                return {
                    src: chart.toBase64Image('image/png', 1),
                    shape: circularChartTypes.has(chart.config?.type) ? 'circle' : 'wide'
                };
            }
            return { src: canvas.toDataURL('image/png'), shape: 'wide' };
        } catch (error) {
            console.warn('Chart snapshot failed:', canvas.id, error);
            return { src: '', shape: 'wide' };
        }
    };

    const strategicThemeMap = {
        red: {
            section: 'bg-red-50 border-l-red-500',
            title: 'text-red-800',
            cardBorder: 'border-red-100',
            cardTitle: 'text-red-600 border-red-50'
        },
        yellow: {
            section: 'bg-yellow-50 border-l-yellow-500',
            title: 'text-yellow-800',
            cardBorder: 'border-yellow-100',
            cardTitle: 'text-yellow-600 border-yellow-50'
        },
        blue: {
            section: 'bg-blue-50 border-l-blue-500',
            title: 'text-blue-800',
            cardBorder: 'border-blue-100',
            cardTitle: 'text-blue-600 border-blue-50'
        },
        green: {
            section: 'bg-emerald-50 border-l-emerald-500',
            title: 'text-emerald-800',
            cardBorder: 'border-emerald-100',
            cardTitle: 'text-emerald-700 border-emerald-50'
        }
    };

    const NPS_ZONE_META = {
        maintain: {
            label: '優勢區',
            chipClass: 'bg-green-100 text-green-700',
            itemClass: 'border-l-green-500',
            actionNote: '高影響且高滿意度，優先維持交付水準並複製成功做法。'
        },
        urgent: {
            label: '急需改善區',
            chipClass: 'bg-red-100 text-red-700',
            itemClass: 'border-l-red-500',
            actionNote: '高影響但滿意度偏低，最值得優先投入改善資源。'
        },
        stable: {
            label: '維持現狀區',
            chipClass: 'bg-blue-100 text-blue-700',
            itemClass: 'border-l-blue-500',
            actionNote: '滿意度不差但影響力較低，維持現況並持續觀察即可。'
        },
        low: {
            label: '低優先級區',
            chipClass: 'bg-gray-200 text-gray-700',
            itemClass: 'border-l-gray-400',
            actionNote: '影響力與滿意度都相對較低，先避免投入過量改善成本。'
        }
    };

    const getNpsDriverZoneKey = (point, threshold) => {
        if (!point || !threshold) return 'low';
        if (point.x > threshold.x && point.y < threshold.y) return 'urgent';
        if (point.x > threshold.x && point.y >= threshold.y) return 'maintain';
        if (point.x <= threshold.x && point.y >= threshold.y) return 'stable';
        return 'low';
    };

    const buildNpsDriverRankedPoints = (points, threshold) => {
        return (Array.isArray(points) ? points : [])
            .map((point, index) => {
                const zoneKey = getNpsDriverZoneKey(point, threshold);
                return {
                    ...point,
                    originalIndex: index,
                    zoneKey,
                    zoneMeta: NPS_ZONE_META[zoneKey] || NPS_ZONE_META.low
                };
            })
            .sort((a, b) => (Number(b.x) - Number(a.x)) || (Number(b.y) - Number(a.y)) || String(a.item).localeCompare(String(b.item), 'zh-Hant'))
            .map((point, index) => ({ ...point, rank: index + 1 }));
    };

    const formatNpsMetric = (value, digits) => {
        return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
    };

    const setNpsDriverChartNotice = (message = '') => {
        const canvas = document.getElementById('npsCorrelationChart');
        const container = canvas?.parentElement;
        if (!container) return;

        let noticeEl = container.querySelector('[data-nps-driver-empty]');
        if (!message) {
            noticeEl?.remove();
            return;
        }

        if (!noticeEl) {
            noticeEl = document.createElement('div');
            noticeEl.setAttribute('data-nps-driver-empty', 'true');
            noticeEl.className = 'absolute inset-x-6 bottom-6 rounded-lg border border-dashed border-gray-300 bg-white/95 px-4 py-3 text-center text-sm font-medium text-gray-600 shadow-sm';
            container.appendChild(noticeEl);
        }
        noticeEl.textContent = message;
    };

    const renderNpsDriverUnavailableState = (message) => {
        npsDriverRankedPoints = [];
        npsDriverIndexByName = new Map();
        npsSelectedDriverName = '';
        setNpsDriverChartNotice(message);
        setHTML('npsDriverList', `
            <div class="px-4 py-6 text-sm text-gray-500">${escapeHTML(message)}</div>
        `);
        setHTML('npsDriverDetail', `
            <p class="text-sm font-bold text-gray-800">Driver 明細</p>
            <p class="mt-2 text-sm text-gray-500">${escapeHTML(message)}</p>
        `);
        setHTML('nps-driver-legend', `
            <span class="col-span-full text-sm text-gray-500">${escapeHTML(message)}</span>
        `);
    };

    const renderNpsDriverList = () => {
        const listEl = document.getElementById('npsDriverList');
        if (!listEl) return;

        listEl.innerHTML = npsDriverRankedPoints.map((point) => {
            const isActive = point.item === npsSelectedDriverName;
            return `
                <button type="button"
                    class="nps-driver-row w-full border-l-4 px-4 py-3 text-left transition-colors ${point.zoneMeta.itemClass} ${isActive ? 'bg-blue-50/70' : 'bg-white hover:bg-gray-50'}"
                    data-driver-name="${escapeHTML(point.item)}"
                    aria-pressed="${isActive ? 'true' : 'false'}">
                    <span class="grid gap-3 md:grid-cols-[3rem_minmax(0,1.6fr)_4.5rem_4.5rem_5rem] md:items-center">
                        <span class="inline-flex items-center gap-2 text-xs font-semibold text-gray-600">
                            <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-white">${point.rank}</span>
                        </span>
                        <span class="min-w-0">
                            <span class="block truncate font-semibold text-gray-800">${escapeHTML(point.item)}</span>
                        </span>
                        <span class="grid grid-cols-2 gap-2 text-xs text-gray-600 md:contents">
                            <span class="rounded bg-gray-50 px-3 py-2 md:rounded-none md:bg-transparent md:px-0 md:py-0 md:text-right md:text-sm md:font-semibold md:text-gray-700">
                                <span class="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500 md:hidden">滿意度</span>
                                ${formatNpsMetric(point.y, 2)}
                            </span>
                            <span class="rounded bg-gray-50 px-3 py-2 md:rounded-none md:bg-transparent md:px-0 md:py-0 md:text-right md:text-sm md:font-semibold md:text-gray-700">
                                <span class="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500 md:hidden">影響力</span>
                                ${formatNpsMetric(point.x, 3)}
                            </span>
                            <span class="col-span-2 inline-flex items-center justify-between gap-2 rounded bg-gray-50 px-3 py-2 md:col-span-1 md:justify-end md:rounded-none md:bg-transparent md:px-0 md:py-0">
                                <span class="text-[11px] font-bold uppercase tracking-wide text-gray-500 md:hidden">區域</span>
                                <span class="text-[11px] font-semibold ${point.zoneMeta.chipClass} px-2 py-1 rounded">${point.zoneMeta.label}</span>
                            </span>
                        </span>
                    </span>
                </button>
            `;
        }).join('');

        listEl.querySelectorAll('[data-driver-name]').forEach((button) => {
            button.addEventListener('click', () => {
                DashboardApp.selectNpsDriver(button.getAttribute('data-driver-name'));
            });
        });
    };

    const renderNpsDriverDetail = () => {
        const detailEl = document.getElementById('npsDriverDetail');
        if (!detailEl) return;
        const point = npsDriverRankedPoints.find((entry) => entry.item === npsSelectedDriverName);

        if (!point) {
            detailEl.innerHTML = `
                <p class="text-sm font-bold text-gray-800">Driver 明細</p>
                <p class="mt-2 text-sm text-gray-500">請從圖表或右側排名選擇一個服務項目。</p>
            `;
            return;
        }

        detailEl.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-sm font-bold text-gray-800">${escapeHTML(point.item)}</p>
                    <p class="mt-1 text-xs text-gray-500">Rank #${point.rank} | 依影響力排序</p>
                </div>
                <span class="inline-flex items-center rounded px-2 py-1 text-xs font-semibold ${point.zoneMeta.chipClass}">${point.zoneMeta.label}</span>
            </div>
            <div class="mt-4 grid grid-cols-3 gap-3 text-center">
                <div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                    <p class="text-[11px] font-bold uppercase text-gray-500">滿意度</p>
                    <p class="mt-1 text-lg font-bold text-gray-800">${formatNpsMetric(point.y, 2)}</p>
                </div>
                <div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                    <p class="text-[11px] font-bold uppercase text-gray-500">影響力</p>
                    <p class="mt-1 text-lg font-bold text-gray-800">${formatNpsMetric(point.x, 3)}</p>
                </div>
                <div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                    <p class="text-[11px] font-bold uppercase text-gray-500">推薦相關</p>
                    <p class="mt-1 text-lg font-bold text-gray-800">${formatNpsMetric(point.recommendationCorrelation, 3)}</p>
                </div>
            </div>
            <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                <p class="font-semibold text-gray-800">建議閱讀</p>
                <p class="mt-1 leading-relaxed">${point.zoneMeta.actionNote}</p>
            </div>
        `;
    };

    const syncNpsDriverSelection = () => {
        renderNpsDriverList();
        renderNpsDriverDetail();
        if (!npsDriverChart) return;

        const activeIndex = npsDriverIndexByName.get(npsSelectedDriverName);
        if (Number.isInteger(activeIndex)) {
            const activeElements = [{ datasetIndex: 0, index: activeIndex }];
            npsDriverChart.setActiveElements(activeElements);
            if (npsDriverChart.tooltip && typeof npsDriverChart.tooltip.setActiveElements === 'function') {
                const point = npsDriverChart.getDatasetMeta(0)?.data?.[activeIndex];
                const position = point ? { x: point.x, y: point.y } : { x: 0, y: 0 };
                npsDriverChart.tooltip.setActiveElements(activeElements, position);
            }
        } else {
            npsDriverChart.setActiveElements([]);
            if (npsDriverChart.tooltip && typeof npsDriverChart.tooltip.setActiveElements === 'function') {
                npsDriverChart.tooltip.setActiveElements([], { x: 0, y: 0 });
            }
        }
        npsDriverChart.update('none');
    };

    const normalizeNpsDriverPoints = (points) => {
        return (Array.isArray(points) ? points : []).filter((point) => (
            point
            && typeof point.item === 'string'
            && point.item.trim()
            && Number.isFinite(Number(point.x))
            && Number.isFinite(Number(point.y))
        ));
    };

    const renderStrategicSummaryUnavailable = () => {
        const monthLabel = formatMonthLabel(currentMonthKey);
        const notice = `${monthLabel}未提供綜合戰略分析與建議資料；此區已清空，避免沿用其他月份分析。`;
        setText('strategic-summary-intro', notice);
        setHTML('strategic-summary-sections', `
            <div class="bg-gray-50 p-6 rounded-[2px] border border-gray-100 shadow-sm">
                <h3 class="font-bold text-lg text-gray-700 mb-3 flex items-center">
                    <i class="fas fa-info-circle mr-2"></i>${escapeHTML(monthLabel)}綜合意見待補充
                </h3>
                <p class="text-sm text-gray-600 leading-relaxed">${escapeHTML(notice)}</p>
            </div>
        `);
    };

    const getStrategicSummaryText = (section) => {
        if (!section || !Array.isArray(section.cards)) return '此月份未提供摘要。';
        for (const card of section.cards) {
            if (!card || !Array.isArray(card.items)) continue;
            const firstItem = card.items.find((item) => item && typeof item.text === 'string' && item.text.trim());
            if (firstItem) return firstItem.text.trim();
        }
        return '此月份未提供摘要。';
    };

    const renderStrategicDisclosure = ({
        title,
        icon,
        summaryText,
        bodyHTML,
        sectionClass,
        titleClass,
        iconColorClass,
        open = false
    }) => {
        const openAttr = open ? ' open' : '';
        return `
            <details class="${sectionClass} p-6 rounded-[2px] border-l-4 shadow-sm" data-ux="strategy-section"${openAttr}>
                <summary class="flex items-start justify-between gap-4" data-ux="strategy-summary">
                    <div class="min-w-0">
                        <h3 class="font-bold text-lg ${titleClass} flex items-center">
                            <i class="${escapeHTML(icon || 'fas fa-lightbulb')} mr-2"></i>${escapeHTML(title)}
                        </h3>
                        <p class="mt-2 text-sm text-gray-600 leading-relaxed">${escapeHTML(summaryText)}</p>
                    </div>
                    <span class="strategy-disclosure-icon ${iconColorClass} mt-1 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/80">
                        <i class="fas fa-chevron-down text-xs"></i>
                    </span>
                </summary>
                <div class="mt-5" data-ux="strategy-detail">${bodyHTML}</div>
            </details>
        `;
    };

    const renderStrategicSummary = () => {
        const summary = DataStore.strategicSummary;
        if (!summary) {
            if (currentMonthKey === STATIC_STRATEGIC_SUMMARY_MONTH) {
                restoreFallback('strategic-summary-intro');
                restoreFallback('strategic-summary-sections');
                return;
            }
            renderStrategicSummaryUnavailable();
            return;
        }

        setText('strategic-summary-intro', summary.intro);
        if (!Array.isArray(summary.sections)) return;

        const sectionsHTML = summary.sections.map((section) => {
            const theme = strategicThemeMap[section.theme] || strategicThemeMap.blue;
            const cards = Array.isArray(section.cards) ? section.cards : [];
            const bodyHTML = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    ${cards.map(card => `
                        <div class="bg-white p-5 rounded-sm border ${theme.cardBorder} shadow-sm">
                            <h4 class="font-bold ${theme.cardTitle} mb-2 border-b pb-2">${escapeHTML(card.title)}</h4>
                            ${(Array.isArray(card.items) ? card.items : []).map(item => `
                                <p class="text-sm text-gray-700 leading-relaxed mb-3">
                                    <strong>${escapeHTML(item.label)}：</strong>${escapeHTML(item.text)}
                                </p>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            `;
            return renderStrategicDisclosure({
                title: section.title,
                icon: section.icon || 'fas fa-lightbulb',
                summaryText: getStrategicSummaryText(section),
                bodyHTML,
                sectionClass: theme.section,
                titleClass: theme.title,
                iconColorClass: theme.title,
                open: section.theme === 'red'
            });
        }).join('');

        const final = summary.finalRecommendation;
        const finalHTML = final ? renderStrategicDisclosure({
            title: final.title,
            icon: final.icon || 'fas fa-clipboard-check',
            summaryText: final.text,
            bodyHTML: `<div class="bg-white p-5 rounded-sm border border-emerald-100 shadow-sm"><p class="text-sm text-gray-700 leading-relaxed">${escapeHTML(final.text)}</p></div>`,
            sectionClass: 'bg-emerald-50 border-l-emerald-500',
            titleClass: 'text-emerald-800',
            iconColorClass: 'text-emerald-700',
            open: false
        }) : '';

        setHTML('strategic-summary-sections', sectionsHTML + finalHTML);
    };

    const stripDuplicateIds = (root) => {
        root.querySelectorAll('[id]').forEach((node) => {
            node.dataset.sourceId = node.id;
            node.removeAttribute('id');
        });
    };

    const removeInteractivePrintNodes = (root) => {
        root.querySelectorAll('button, select, input, textarea, script, .print-hidden').forEach((node) => node.remove());
        root.querySelectorAll('.sticky').forEach((node) => node.classList.remove('sticky', 'top-0', 'z-10'));
    };

    const replaceCanvasesWithImages = (clone) => {
        clone.querySelectorAll('canvas').forEach((canvas) => {
            const sourceId = canvas.id || canvas.dataset.sourceId;
            const sourceCanvas = sourceId ? document.getElementById(sourceId) : null;
            const snapshot = captureChartImage(sourceCanvas || canvas);
            const parent = canvas.parentElement;
            if (parent) {
                parent.classList.remove('h-48', 'h-64', 'h-72', 'h-80', 'h-96', 'h-[450px]');
            }
            const frame = document.createElement('div');
            frame.className = 'print-chart-frame';
            if (snapshot.src) {
                const image = document.createElement('img');
                image.src = snapshot.src;
                image.alt = sourceId ? `${sourceId} chart snapshot` : 'chart snapshot';
                image.className = 'print-report-chart-image';
                image.dataset.chartShape = snapshot.shape;
                frame.appendChild(image);
            } else {
                frame.innerHTML = '<div class="text-xs text-gray-500 border border-gray-200 rounded p-4">圖表快照未能生成</div>';
            }
            canvas.replaceWith(frame);
        });
    };

    const clonePrintBlock = (node) => {
        const clone = node.cloneNode(true);
        removeInteractivePrintNodes(clone);
        replaceCanvasesWithImages(clone);
        stripDuplicateIds(clone);

        const wrapper = document.createElement('div');
        wrapper.className = 'print-block';
        wrapper.appendChild(clone);
        return wrapper;
    };

    const finalizePrintClone = (clone) => {
        removeInteractivePrintNodes(clone);
        replaceCanvasesWithImages(clone);
        stripDuplicateIds(clone);

        const wrapper = document.createElement('div');
        wrapper.className = 'print-block';
        wrapper.appendChild(clone);
        return wrapper;
    };

    const chunkArray = (items, size) => {
        const chunks = [];
        for (let i = 0; i < items.length; i += size) {
            chunks.push(items.slice(i, i + size));
        }
        return chunks;
    };

    const PRINT_SECTION_MANIFEST = {
        dashboard: {
            title: '旅行團數據儀表板',
            pages: [
                { blocks: [{ path: [0] }, { path: [1] }, { path: [2] }] },
                { blocks: [{ path: [3] }, { path: [4] }] },
                { blocks: [{ path: [5] }] },
                { blocks: [{ path: [6, 0] }, { path: [6, 1] }] },
                { blocks: [{ path: [6, 2] }] }
            ]
        },
        sales_forecast: {
            title: 'AI 銷售預測',
            pages: [
                { blocks: [{ path: [0] }, { path: [1] }] },
                { blocks: [{ path: [2] }] }
            ]
        },
        nps_zone: {
            title: '推薦意願專區',
            pages: [
                { blocks: [{ path: [0] }, { path: [1] }, { path: [2] }] },
                { blocks: [{ path: [3, 0] }, { path: [3, 1] }] },
                { blocks: [{ path: [3, 2] }] }
            ]
        },
        tourleader: {
            title: '領隊表現專區',
            pages: [
                { blocks: [{ path: [0] }, { path: [1] }] }
            ]
        },
        records: {
            title: '出團記錄分析',
            pages: [
                { blocks: [{ path: [0] }, { path: [1] }] },
                { blocks: [{ path: [2] }] },
                { blocks: [{ path: [3] }, { path: [4] }] },
                { repeat: { path: [5], chunks: [{ selector: 'tbody', size: 12 }] } }
            ]
        },
        feedback_analysis: {
            title: '出團長評回饋',
            pages: [
                { repeat: { path: [0], chunks: [{ selector: '#feedbackGrid', size: 3 }] } }
            ]
        },
        branch_feedback: {
            title: '門市服務意見',
            pages: [
                {
                    repeat: {
                        path: [0],
                        chunks: [
                            { selector: '#branchLeaderboard', size: 7 },
                            { selector: '#branchFeedbackGrid', size: 3 }
                        ]
                    }
                }
            ]
        },
        analysis: {
            title: '綜合意見',
            pages: [
                { blocks: [{ path: [0] }, { path: [1] }, { path: [2] }] }
            ]
        },
        p3_comparison: {
            title: '月份比較',
            pages: [
                { blocks: [{ path: [0] }] },
                { blocks: [{ path: [1] }] },
                { blocks: [{ path: [2] }] },
                { blocks: [{ path: [3] }] },
                { blocks: [{ path: [4] }] }
            ]
        },
        p3_issue_tracker: {
            title: '營運問題追蹤',
            pages: [{ blocks: [{ path: [0] }, { path: [1] }, { path: [2] }] }]
        }
    };

    const getPrintNodeAtPath = (root, path = []) => {
        return path.reduce((node, index) => {
            if (!node || !node.children || !node.children[index]) return null;
            return node.children[index];
        }, root);
    };

    const getChunkCount = (sourceNode, selector, size) => {
        const sourceContainer = sourceNode.querySelector(selector);
        if (!sourceContainer) return 1;
        const items = Array.from(sourceContainer.children || []);
        if (!items.length) return 1;
        return Math.max(1, Math.ceil(items.length / Math.max(1, size || items.length)));
    };

    const clearPrintChunkTarget = (target) => {
        if (!target) return;
        target.innerHTML = '';
    };

    const applyPrintChunkRule = (clone, sourceNode, rule, pageIndex) => {
        const cloneTarget = clone.querySelector(rule.selector);
        const sourceTarget = sourceNode.querySelector(rule.selector);
        if (!cloneTarget || !sourceTarget) return;

        const sourceItems = Array.from(sourceTarget.children || []);
        if (!sourceItems.length) {
            clearPrintChunkTarget(cloneTarget);
            return;
        }

        const chunkSize = Math.max(1, rule.size || sourceItems.length);
        const chunks = chunkArray(sourceItems, chunkSize);
        const selectedChunk = chunks[pageIndex];

        if (!selectedChunk) {
            clearPrintChunkTarget(cloneTarget);
            return;
        }

        if (chunks.length === 1 && pageIndex === 0) return;

        clearPrintChunkTarget(cloneTarget);
        selectedChunk.forEach((item) => cloneTarget.appendChild(item.cloneNode(true)));
    };

    const buildPrintBlockFromSpec = (section, blockSpec) => {
        const sourceNode = getPrintNodeAtPath(section, blockSpec.path || []);
        if (!sourceNode) return null;
        const clone = sourceNode.cloneNode(true);
        return finalizePrintClone(clone);
    };

    const buildStaticPrintPage = (section, pageSpec, title, monthLabel, pageNumber) => {
        const blocks = (pageSpec.blocks || [])
            .map((blockSpec) => buildPrintBlockFromSpec(section, blockSpec))
            .filter(Boolean);
        if (!blocks.length) return null;
        return makePrintPage({ title, monthLabel, pageNumber, blocks });
    };

    const buildRepeatPrintPages = (section, pageSpec, title, monthLabel, pageNumber) => {
        const repeat = pageSpec.repeat || {};
        const sourceNode = getPrintNodeAtPath(section, repeat.path || []);
        if (!sourceNode) return { pages: [], nextPageNumber: pageNumber };

        const chunkRules = Array.isArray(repeat.chunks) ? repeat.chunks : [];
        const chunkCounts = chunkRules.length
            ? chunkRules.map((rule) => getChunkCount(sourceNode, rule.selector, rule.size))
            : [1];
        const pageCount = Math.max(1, ...chunkCounts);
        const pages = [];

        for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
            const clone = sourceNode.cloneNode(true);
            chunkRules.forEach((rule, ruleIndex) => {
                const chunkCount = chunkCounts[ruleIndex];
                if (chunkCount === 1 && pageIndex > 0) {
                    const target = clone.querySelector(rule.selector);
                    if (target) clearPrintChunkTarget(target);
                    return;
                }

                applyPrintChunkRule(clone, sourceNode, rule, pageIndex);
            });

            pages.push(makePrintPage({
                title,
                monthLabel,
                pageNumber: pageNumber + pageIndex,
                blocks: [finalizePrintClone(clone)]
            }));
        }

        return {
            pages,
            nextPageNumber: pageNumber + pageCount
        };
    };

    const makePrintPage = ({ title, monthLabel, pageNumber, blocks }) => {
        const page = document.createElement('section');
        page.className = 'print-page';

        const header = document.createElement('div');
        header.className = 'print-page-header';
        header.innerHTML = `
            <div class="print-page-title">${escapeHTML(title)}｜${escapeHTML(monthLabel)}</div>
            <div class="print-page-meta">Travel BI PDF Report · Page ${pageNumber}</div>
        `;

        const content = document.createElement('div');
        content.className = 'print-page-content';
        blocks.forEach((block) => content.appendChild(block));

        page.appendChild(header);
        page.appendChild(content);
        return page;
    };

    const appendPrintSection = (container, section, monthLabel, pageCounter) => {
        const manifest = PRINT_SECTION_MANIFEST[section.id];
        const title = manifest?.title || section.dataset.printTitle || section.id || 'Dashboard';
        const pageSpecs = Array.isArray(manifest?.pages) ? manifest.pages : [];
        let nextPage = pageCounter;

        if (!pageSpecs.length) {
            const fallbackBlocks = Array.from(section.children || [])
                .map((child) => clonePrintBlock(child))
                .filter(Boolean);
            if (fallbackBlocks.length) {
                container.appendChild(makePrintPage({
                    title,
                    monthLabel,
                    pageNumber: nextPage,
                    blocks: fallbackBlocks
                }));
                nextPage += 1;
            }
            return nextPage;
        }

        pageSpecs.forEach((pageSpec) => {
            if (pageSpec.repeat) {
                const result = buildRepeatPrintPages(section, pageSpec, title, monthLabel, nextPage);
                result.pages.forEach((page) => container.appendChild(page));
                nextPage = result.nextPageNumber;
                return;
            }

            const page = buildStaticPrintPage(section, pageSpec, title, monthLabel, nextPage);
            if (page) {
                container.appendChild(page);
                nextPage += 1;
            }
        });

        return nextPage;
    };

    const buildPrintReport = () => {
        const container = document.getElementById('printReport');
        if (!container) return;
        container.innerHTML = '';
        const monthLabel = getPrintMonthLabel();
        let pageNumber = 1;
        document.querySelectorAll('.tab-content').forEach((section) => {
            pageNumber = appendPrintSection(container, section, monthLabel, pageNumber);
        });
    };

    const restorePrintMode = () => {
        if (!printState) return;
        document.body.classList.remove('print-mode');
        const printReport = document.getElementById('printReport');
        if (printReport) printReport.innerHTML = '';
        document.querySelectorAll('.tab-content').forEach((section) => {
            section.classList.toggle('active', section.id === printState.activeTabId);
        });
        const activeButton = document.querySelector(`button[data-tab-id="${escapeHTML(printState.activeTabId)}"]`);
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active-tab', 'bg-blue-50', 'text-blue-700', 'shadow-sm');
            btn.classList.add('text-gray-600');
        });
        if (activeButton) {
            activeButton.classList.remove('text-gray-600');
            activeButton.classList.add('active-tab', 'bg-blue-50', 'text-blue-700', 'shadow-sm');
        }
        window.scrollTo(0, printState.scrollY || 0);
        printState = null;
        requestAnimationFrame(refreshChartsForPrint);
    };

    return {
        init: function() {
            try {
                this.renderDashboardText();
                this.renderLeadersTable();
                this.renderTourDetailsTable();
                this.renderBranchLeaderboard();
                this.renderBranchFeedbacks(); // 修復：補上門市長評渲染函數
                this.renderFeedbackFilters();
                this.renderWordCloud();
                this.filterFeedback();
                this.initCharts();
                this.setupEventListeners();
                setupP3Comparison();
                renderP3IssueTrackerView(currentMonthKey);
            } catch (e) {
                console.error("Dashboard Initialization Critical Error:", e);
            }
        },

        exportLeadersCSV: function() {
            const headers = ["排名", "領隊姓名", "出團地點", "平均評分", "樣本數(N)"];
            const sorted = [...DataStore.leadersRaw].sort((a, b) => parseFloat(b.score) - parseFloat(a.score) || parseInt(b.n) - parseInt(a.n));
            const data = sorted.map((l, i) => [i+1, escapeHTML(l.name), escapeHTML(l.loc), l.score, l.n]);
            exportCSV(data, "領隊服務評分排行榜", headers);
        },

        exportToursCSV: function() {
            const headers = ["旅遊目的地", "負責領隊", "旅程開始日期", "旅程結束日期", "總天數"];
            const data = DataStore.uniqueTours.map(t => {
                const days = getValidTourDays(t);
                return [escapeHTML(t.dest), escapeHTML(t.leader), t.start || '-', t.end || '-', days || '-'];
            });
            exportCSV(data, "最新出團明細", headers);
        },

        exportBranchesCSV: function() {
            const headers = ["排名", "門店分社", "平均服務態度評分", "樣本數(N)"];
            const sorted = [...DataStore.branchLeaderboardData].sort((a, b) => b.score - a.score);
            const data = sorted.map((b, i) => [i+1, escapeHTML(b.name), b.score, b.n]);
            exportCSV(data, "門市服務滿意度排行榜", headers);
        },

        printReport: async function() {
            if (printState) return;
            const activeSection = document.querySelector('.tab-content.active') || document.getElementById('records');
            printState = {
                activeTabId: activeSection?.id || 'records',
                scrollY: window.scrollY || 0
            };

            setPrintMonthLabels();
            document.querySelectorAll('.tab-content').forEach(section => section.classList.add('active'));
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            refreshChartsForPrint();
            await new Promise(resolve => setTimeout(resolve, 300));
            buildPrintReport();
            document.body.classList.add('print-mode');
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            window.print();
        },

        restorePrintMode: function() {
            restorePrintMode();
        },

        setupEventListeners: function() {
            document.addEventListener('click', (e) => {
                const menu = document.getElementById('tabFilterMenu');
                if (menu && !e.target.closest('#tabFilterMenu') && !e.target.closest('button[onclick="DashboardApp.toggleFilterMenu()"]')) {
                    menu.classList.add('hidden');
                }
                if(e.target.classList.contains('word-tag')) {
                    document.querySelectorAll('.word-tag').forEach(el => el.classList.remove('active'));
                    e.target.classList.add('active');
                }
            });
        },

        renderDashboardText: function() {
            const summary = DataStore.dashboardSummary;
            const labels = DataStore.dashboardTextLabels || {};
            const insights = DataStore.dashboardInsights || {};
            const monthLabel = `${currentMonthKey.slice(0, 4)}年${Number(currentMonthKey.slice(4, 6))}月`;
            ['duration-legend', 'records-cross-insights', 'records-average-days', 'records-total-samples', 'records-top-destination', 'strategic-summary-intro', 'strategic-summary-sections'].forEach(rememberFallback);
            setText('leaderboard-source-label', `數據來源：${monthLabel}領隊服務評分排行榜`);
            setHTML('leaderboard-title', `<i class="fas fa-trophy text-yellow-500 mr-2"></i> ${escapeHTML(monthLabel)}領隊服務評分排行榜`);
            setText('leaderboard-footnote', `* 數據來源：${monthLabel}份最新領隊服務評分全量數據。`);
            const branchTotal = Number.isFinite(DataStore.branchLeaderboardTotal)
                ? DataStore.branchLeaderboardTotal
                : Array.isArray(DataStore.branchLeaderboardData)
                ? DataStore.branchLeaderboardData.reduce((sum, branch) => sum + (Number(branch.n) || 0), 0)
                : null;
            const branchFeedbackTotal = Array.isArray(DataStore.branchRawFeedbacks) ? DataStore.branchRawFeedbacks.length : null;
            if (branchTotal !== null) setText('branch-leaderboard-total', `N=${branchTotal} (最新統計)`);
            if (branchFeedbackTotal !== null) setText('branch-feedback-total', `共提取 ${branchFeedbackTotal} 條門市意見`);
            renderStrategicSummary();

            if (summary) {
                setHTML('kpi-total-respondents', escapeHTML(summary.totalRespondents));
                if (summary.promoConsent) {
                    setHTML('kpi-promo-consent', `${escapeHTML(summary.promoConsent.count)} <span class="text-sm font-normal text-gray-400">/ ${escapeHTML(summary.promoConsent.pct)}</span>`);
                }
                if (summary.nps) {
                    setHTML('kpi-nps-score', `${escapeHTML(summary.nps.score)} 分 <span class="text-sm font-normal text-gray-400">/ 推薦者 ${escapeHTML(summary.nps.promoterPct)}</span>`);
                }
                if (summary.storeSignup) {
                    setHTML('kpi-store-signup', `${escapeHTML(summary.storeSignup.count)}<span class="text-sm font-normal text-gray-400">人 / ${escapeHTML(summary.storeSignup.pct)}</span>`);
                }
            }

            setText('profile-title', labels.profileTitle);
            setText('member-source-label', labels.memberSource);
            setText('satisfaction-title', labels.satisfactionTitle);
            setText('source-reply-label', labels.sourceReply);
            setText('channel-reply-label', labels.channelReply);

            if (Array.isArray(insights.member)) {
                insights.member.slice(0, 3).forEach((text, index) => setHTML(`member-insight-${index + 1}`, text));
            }
            if (Array.isArray(insights.satisfaction)) {
                insights.satisfaction.slice(0, 2).forEach((text, index) => setHTML(`satisfaction-insight-${index + 1}`, text));
            }
            if (Array.isArray(insights.destAge)) {
                insights.destAge.slice(0, 3).forEach((text, index) => setHTML(`dest-age-insight-${index + 1}`, text));
            }
            if (Array.isArray(insights.channels)) {
                insights.channels.slice(0, 3).forEach((item, index) => {
                    const seq = index + 1;
                    setText(`channel-insight-title-${seq}`, item.title);
                    setHTML(`channel-insight-text-${seq}`, item.text);
                });
            }
            if (insights.nps) {
                setHTML('nps-zone-description', insights.nps.description);
                setHTML('nps-zone-indicator', `${escapeHTML(insights.nps.indicatorText)} <span class="text-sm font-normal text-gray-500">${escapeHTML(insights.nps.indicatorSuffix)}</span>`);
            }

            const future = DataStore.futureTrendInsights;
            if (future) {
                if (Array.isArray(future.destinations)) {
                    setHTML('future-dest-table-body', future.destinations.map((row, index) => `
                        <tr class="${index % 2 ? 'bg-[#faf9f8]' : 'bg-white'} hover:bg-[#f3f2f1]">
                            <td class="px-4 py-2 font-bold text-[#118DFF]">${escapeHTML(row.region)}</td>
                            <td class="px-4 py-2 text-right font-bold">${escapeHTML(row.mentions)}</td>
                            <td class="px-4 py-2 text-right">${escapeHTML(row.pct)}</td>
                            <td class="px-4 py-2">${row.meaning}</td>
                        </tr>
                    `).join(''));
                }
                setHTML('future-product-guide-list', renderListHTML(future.productGuide));
                setHTML('loyalty-recommendation-list', renderListHTML(future.loyaltyRecommendations));
                if (Array.isArray(future.drivers)) {
                    setHTML('nps-driver-table-body', future.drivers.map(row => `
                        <tr>
                            <td class="py-1 font-bold text-[#118DFF]">${escapeHTML(row.item)}</td>
                            <td class="py-1 text-right">${escapeHTML(row.score)}</td>
                            <td class="py-1 pl-3">${row.meaning}</td>
                        </tr>
                    `).join(''));
                }
            } else {
                const futureDestData = DataStore.futureDestData;
                const legacyNotice = `${formatMonthLabel(currentMonthKey)}屬 legacy 月份，未提供深度洞察文字；此處僅顯示該月份的目的地提及數據，避免沿用其他月份分析。`;
                if (futureDestData && Array.isArray(futureDestData.labels)) {
                    setHTML('future-dest-table-body', futureDestData.labels.map((label, index) => `
                        <tr class="${index % 2 ? 'bg-[#faf9f8]' : 'bg-white'} hover:bg-[#f3f2f1]">
                            <td class="px-4 py-2 font-bold text-[#118DFF]">${escapeHTML(label)}</td>
                            <td class="px-4 py-2 text-right font-bold">${escapeHTML(futureDestData.values?.[index] ?? '-')}</td>
                            <td class="px-4 py-2 text-right">${escapeHTML(futureDestData.pcts?.[index] ?? '-')}</td>
                            <td class="px-4 py-2 text-[#605e5c]">${escapeHTML(legacyNotice)}</td>
                        </tr>
                    `).join(''));
                } else {
                    setHTML('future-dest-table-body', `
                        <tr>
                            <td colspan="4" class="px-4 py-6 text-center text-[#605e5c]">${escapeHTML(legacyNotice)}</td>
                        </tr>
                    `);
                }
                setHTML('future-product-guide-list', `<li>${escapeHTML(legacyNotice)}</li>`);
                setHTML('loyalty-recommendation-list', `<li>${escapeHTML(legacyNotice)}</li>`);
                setHTML('nps-driver-table-body', `
                    <tr>
                        <td colspan="3" class="py-3 text-center text-[#605e5c]">${escapeHTML(legacyNotice)}</td>
                    </tr>
                `);
            }

            const opinion = DataStore.opinionMiningInsights;
            if (opinion) {
                if (Array.isArray(opinion.keywordCards)) {
                    setHTML('opinion-keyword-grid', opinion.keywordCards.map(card => `
                        <div class="border border-[#e1dfdd] rounded-[2px] p-3 shadow-sm bg-[#faf9f8]" style="border-left: 4px solid ${escapeHTML(card.color || '#118DFF')}">
                            <p class="font-bold text-[#252423] text-sm mb-1">「${escapeHTML(card.title)}」</p>
                            <p class="text-xs text-[#605e5c]">${escapeHTML(card.text)}</p>
                        </div>
                    `).join(''));
                }
                setText('opinion-optimization-title', opinion.optimizationTitle);
                setHTML('opinion-optimization-list', renderListHTML(opinion.optimizationItems));
            } else {
                const opinionNotice = `${formatMonthLabel(currentMonthKey)}屬 legacy 月份，未提供意見建議挖掘資料；此區已清空，避免沿用其他月份分析。`;
                setHTML('opinion-keyword-grid', `
                    <div class="col-span-full border border-[#e1dfdd] rounded-[2px] p-4 shadow-sm bg-[#faf9f8] border-l-4 border-l-[#c8c6c4]">
                        <p class="font-bold text-[#252423] text-sm mb-1">未提供本月深度挖掘</p>
                        <p class="text-xs text-[#605e5c]">${escapeHTML(opinionNotice)}</p>
                    </div>
                `);
                setText('opinion-optimization-title', '產品開發與服務優化方向：未提供本月資料');
                setHTML('opinion-optimization-list', `<li>${escapeHTML(opinionNotice)}</li>`);
            }

            const records = DataStore.recordsSummary;
            if (records) {
                setText('records-top-destination', records.topDestination);
                setHTML('records-average-days', `${escapeHTML(records.averageDays)} <span class="text-sm text-gray-400 font-normal">天</span>`);
                setHTML('records-total-samples', `${escapeHTML(records.totalSamples)} <span class="text-sm text-gray-400 font-normal">份</span>`);
            } else {
                ['records-top-destination', 'records-average-days', 'records-total-samples'].forEach(restoreFallback);
            }

            const recordsInsights = DataStore.recordsInsights;
            if (recordsInsights) {
                const colors = ['bg-teal-500', 'bg-blue-500', 'bg-indigo-500'];
                if (Array.isArray(recordsInsights.durationRows)) {
                    setHTML('duration-legend', recordsInsights.durationRows.map((row, index) => `
                        <div class="flex items-center justify-between text-sm">
                            <span class="flex items-center"><span class="w-3 h-3 ${colors[index % colors.length]} rounded-full mr-2"></span>${escapeHTML(row.label)} (${escapeHTML(row.range).replace(/\\s/g, '')})</span>
                            <span class="font-bold text-gray-700">${escapeHTML(row.pct)}</span>
                        </div>
                    `).join(''));
                }
                if (Array.isArray(recordsInsights.satisfactionCross)) {
                    setHTML('records-cross-insights', recordsInsights.satisfactionCross.map(text => `
                        <div class="bg-white p-4 rounded-lg shadow-sm border border-indigo-50">
                            <p class="text-sm text-gray-700 leading-relaxed">${text}</p>
                        </div>
                    `).join(''));
                }
            } else {
                ['duration-legend', 'records-cross-insights'].forEach(restoreFallback);
            }
        },

        changeMonth: async function(monthVal) {
            const monthKey = normalizeMonthValue(monthVal);
            showLoadingOverlay(`正在載入 ${formatMonthLabel(monthKey)} 數據...`, '正在讀取本地 JSON 並重繪圖表，請稍候...');
            clearDashboardError();

            try {
                await fetchMonthData(monthKey);
                void refreshP3ForMonth(monthKey);
                destroyAllCharts();
                this.renderLeadersTable();
                this.renderTourDetailsTable();
                this.renderBranchLeaderboard();
                this.renderBranchFeedbacks();
                this.renderFeedbackFilters();
                this.renderWordCloud();
                this.filterFeedback();
                this.renderDashboardText();
                this.initCharts();
                renderP3IssueTrackerView(monthKey);
                console.log(`本地月份數據已切換: ${monthKey}`);
            } catch (error) {
                console.error('Month data loading failed:', error);
                showDashboardError(error.message);
            } finally {
                hideLoadingOverlay();
            }
        },

        switchTab: function(tabId, btnElement) {
            if (tabId === 'p3_comparison') refreshP3ComparisonOnOpen();
            if (tabId === 'p3_issue_tracker') renderP3IssueTrackerView(currentMonthKey);
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            const target = document.getElementById(tabId);
            if (target) target.classList.add('active');
            
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active-tab', 'bg-blue-50', 'text-blue-700', 'shadow-sm');
                btn.classList.add('text-gray-600');
            });
            
            const btn = btnElement || document.querySelector(`button[data-tab-id="${escapeHTML(tabId)}"]`);
            if(btn) {
                btn.classList.remove('text-gray-600');
                btn.classList.add('active-tab', 'bg-blue-50', 'text-blue-700', 'shadow-sm');
            }
        },
        
        toggleFilterMenu: function() {
            const menu = document.getElementById('tabFilterMenu');
            if(!menu) return;
            if(menu.classList.contains('hidden')) {
                menu.classList.remove('hidden');
                if(document.getElementById('filterCheckboxes')?.children.length === 0) {
                    this.generateFilterCheckboxes();
                }
            } else {
                menu.classList.add('hidden');
            }
        },
        
        generateFilterCheckboxes: function() {
            const container = document.getElementById('filterCheckboxes');
            if(!container) return;
            const tabs = [
                {id: 'dashboard', name: '旅行團數據儀表板'}, {id: 'sales_forecast', name: 'AI 銷售預測'},
                {id: 'nps_zone', name: '推薦意願專區'}, {id: 'tourleader', name: '領隊表現專區'},
                {id: 'records', name: '出團記錄分析'}, {id: 'feedback_analysis', name: '出團長評回饋'},
                {id: 'branch_feedback', name: '門市服務意見'}, {id: 'analysis', name: '綜合意見'},
                {id: 'p3_comparison', name: '月份比較'}, {id: 'p3_issue_tracker', name: '營運問題追蹤'}
            ];
            container.innerHTML = tabs.map(tab => `
                <label class="flex items-center px-3 py-2 hover:bg-gray-50 rounded cursor-pointer transition-colors">
                    <input type="checkbox" checked class="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" 
                        onchange="DashboardApp.toggleTabVisibility('${escapeHTML(tab.id)}', this.checked)">
                    <span class="ml-3 text-sm text-gray-700 font-medium">${escapeHTML(tab.name)}</span>
                </label>
            `).join('');
        },
        
        toggleTabVisibility: function(tabId, isChecked) {
            const btn = document.querySelector(`button[data-tab-id="${escapeHTML(tabId)}"]`);
            if(!btn) return;
            isChecked ? btn.classList.remove('hidden') : btn.classList.add('hidden');
            if(!isChecked && btn.classList.contains('active-tab')) {
                const firstVisible = document.querySelector('.tab-btn:not(.hidden)');
                if(firstVisible) this.switchTab(firstVisible.getAttribute('data-tab-id'), firstVisible);
            }
        },

        renderLeadersTable: function() {
            const tableBody = document.getElementById('fullLeadersTable');
            if(!tableBody || !DataStore.leadersRaw) return;
            const sorted = [...DataStore.leadersRaw].sort((a, b) => parseFloat(b.score) - parseFloat(a.score) || parseInt(b.n) - parseInt(a.n));
            tableBody.innerHTML = sorted.map((l, i) => {
                let badgeClass = 'bg-gray-100 text-gray-600'; let trClass = 'bg-white hover:bg-gray-50';
                if (i === 0) { badgeClass = 'bg-yellow-100 text-yellow-800'; trClass = 'bg-yellow-50/30 hover:bg-yellow-50'; } 
                else if (i === 1) { badgeClass = 'bg-gray-200 text-gray-800'; } else if (i === 2) { badgeClass = 'bg-orange-100 text-orange-800'; }
                
                let scoreNum = parseFloat(l.score);
                let scoreColorHex = scoreNum >= 9.8 ? '#00B8AA' : (scoreNum >= 9 ? '#118DFF' : '#605e5c');
                // 資料棒基於10分滿分計算
                let barWidth = (scoreNum / 10) * 100;
                
                return `<tr class="border-b border-gray-100 ${trClass}">
                    <td class="px-6 py-4"><span class="w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${badgeClass}">${i+1}</span></td>
                    <td class="px-6 py-4 font-medium text-gray-900">${escapeHTML(l.name)}</td>
                    <td class="px-6 py-4 text-gray-500 text-sm">${escapeHTML(l.loc)}</td>
                    <td class="px-6 py-4 relative min-w-[100px]">
                        <div class="absolute left-0 top-2 bottom-2 rounded-r-[2px]" style="width: calc(${barWidth}% - 24px); background-color: ${scoreColorHex}; opacity: 0.15;"></div>
                        <div class="text-right font-bold relative z-10" style="color: ${scoreColorHex};">${l.score}</div>
                    </td>
                    <td class="px-6 py-4 text-right text-gray-500">${l.n || 0}</td>
                </tr>`;
            }).join('');
        },

        renderTourDetailsTable: function() {
            const el = document.getElementById('tourDetailBody');
            if(!el || !DataStore.uniqueTours) return;

            const grouped = {};
            DataStore.uniqueTours.forEach(t => {
                const days = getValidTourDays(t);

                if(!grouped[t.dest]) {
                    grouped[t.dest] = [];
                }
                grouped[t.dest].push({ leader: t.leader, daysLabel: days ? `${days}天` : '-' });
            });

            const rows = Object.keys(grouped).sort().map(dest => {
                const leadersHtml = grouped[dest].map(l => 
                    `<span class="inline-flex items-center px-2.5 py-1 rounded-[2px] text-xs font-semibold bg-[#e6f3ff] text-[#118DFF] mr-2 mb-2 border border-[#118DFF]/20 shadow-sm">${escapeHTML(l.leader)} <span class="ml-1.5 px-1.5 py-0.5 bg-[#118DFF]/10 rounded-sm text-[#0c6ac2]">${escapeHTML(l.daysLabel)}</span></span>`
                ).join('');

                return `<tr class="border-b border-[#e1dfdd] hover:bg-[#f3f2f1] transition-colors">
                    <td class="px-6 py-4 font-bold text-[#252423] border-r border-[#e1dfdd]/50 align-top w-1/4">${escapeHTML(dest)}</td>
                    <td class="px-6 py-4">${leadersHtml}</td>
                </tr>`;
            });

            el.innerHTML = rows.join('');
        },

        renderBranchLeaderboard: function() {
             const branchLB = document.getElementById('branchLeaderboard');
             if(!branchLB || !DataStore.branchLeaderboardData) return;
             
             const leaderboard = DataStore.branchLeaderboardData.sort((a, b) => b.score - a.score);
             
             branchLB.innerHTML = leaderboard.map((b, i) => {
                let rankClass = i === 0 ? "rank-1" : (i === 1 ? "rank-2" : (i === 2 ? "rank-3" : "bg-white"));
                let medal = i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : `<span class="text-gray-400 font-bold ml-2">#${i+1}</span>`));
                let trendIcon = i === 0 ? '<i class="fas fa-caret-up text-green-500"></i>' : (parseFloat(b.score) < 4.45 ? '<i class="fas fa-caret-down text-red-500"></i>' : '<i class="fas fa-minus text-gray-300"></i>');
                
                let scoreNum = parseFloat(b.score);
                // 適配 5 分制的高亮邏輯
                let scoreColorHex = scoreNum >= 4.6 ? '#00B8AA' : (scoreNum >= 4.45 ? '#118DFF' : '#E66C37');
                // 資料底色棒寬度基於 5 分滿分計算
                let barWidth = (scoreNum / 5) * 100;

                return `
                <div class="relative flex items-center justify-between p-3 rounded-sm mb-2 border border-gray-100 ${rankClass} overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0" style="width: ${barWidth}%; background-color: ${scoreColorHex}; opacity: 0.1;"></div>
                    
                    <div class="flex items-center relative z-10">
                        <div class="w-10 text-xl text-center">${medal}</div>
                        <div><span class="font-medium text-gray-800 text-sm block">${escapeHTML(b.name)}</span><span class="text-xs text-gray-500">樣本數: ${b.n}</span></div>
                    </div>
                    <div class="text-right flex items-center space-x-3 relative z-10">
                        <span class="text-xl font-bold" style="color: ${scoreColorHex};">${b.score.toFixed(2)}</span>
                        <span class="text-xs">${trendIcon}</span>
                    </div>
                </div>`;
            }).join('');
        },

        renderBranchFeedbacks: function() {
            const container = document.getElementById('branchFeedbackGrid');
            if (!container || !DataStore.branchRawFeedbacks) return;
            
            container.innerHTML = DataStore.branchRawFeedbacks.map(f => {
                const borderClass = f.type === 'positive' ? 'border-l-4 border-l-[#00B8AA]' : (f.type === 'suggestion' ? 'border-l-4 border-l-[#F2C80F]' : 'border-l-4 border-l-[#FD625E]');
                const icon = f.type === 'positive' ? '<i class="fas fa-thumbs-up text-[#00B8AA]"></i>' : (f.type === 'suggestion' ? '<i class="fas fa-lightbulb text-[#F2C80F]"></i>' : '<i class="fas fa-exclamation-triangle text-[#FD625E]"></i>');
                const typeText = f.type === 'positive' ? '表揚' : (f.type === 'suggestion' ? '建議' : '投訴');
                const typeColor = f.type === 'positive' ? 'text-[#00B8AA] bg-[#00B8AA]/10' : (f.type === 'suggestion' ? 'text-[#E66C37] bg-[#F2C80F]/20' : 'text-[#FD625E] bg-[#FD625E]/10');
                
                return `
                <div class="bg-[#faf9f8] rounded-[2px] p-4 shadow-sm border border-gray-200 ${borderClass} card-hover h-full flex flex-col justify-between">
                    <div class="flex justify-between items-start mb-2">
                        <span class="font-bold text-gray-800 text-sm"><i class="fas fa-store-alt text-gray-400 mr-1"></i>${escapeHTML(f.branch)}</span>
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeColor}">${icon}</span>
                    </div>
                    <p class="text-gray-700 text-sm leading-relaxed mt-2 whitespace-pre-wrap flex-grow">"${escapeHTML(f.content)}"</p>
                </div>`;
            }).join('');
        },

        renderWordCloud: function() {
            const wc = document.getElementById('wordCloudContainer');
            if(wc) {
                const fallbackKeywords = [
                    { text: "領隊經驗豐富", weight: 50, color: "text-[#00B8AA]" },
                    { text: "強行推銷購物", weight: 48, color: "text-[#FD625E]" },
                    { text: "門市出錯導遊搭救", weight: 45, color: "text-[#118DFF]" },
                    { text: "退款速度太慢", weight: 42, color: "text-[#FD625E]" },
                    { text: "行程太趕/節奏快", weight: 38, color: "text-[#F2C80F]" },
                    { text: "旅遊巴太舊/損壞", weight: 35, color: "text-[#FD625E]" },
                    { text: "醫療隨行好安心", weight: 32, color: "text-[#00B8AA]" },
                    { text: "帶團僵化無解釋", weight: 30, color: "text-[#FD625E]" },
                    { text: "司機幫忙搬行李", weight: 28, color: "text-[#00B8AA]" },
                    { text: "自費項目不合理", weight: 25, color: "text-[#E66C37]" },
                    { text: "膳食需介紹/改善", weight: 24, color: "text-[#E66C37]" },
                    { text: "彈性與資訊透明", weight: 20, color: "text-[#118DFF]" }
                ];
                const keywords = Array.isArray(DataStore.feedbackKeywordCloud) && DataStore.feedbackKeywordCloud.length
                    ? DataStore.feedbackKeywordCloud
                    : fallbackKeywords;
                wc.innerHTML = keywords.map(k => {
                    const color = typeof k.color === 'string' && /^#[0-9a-f]{6}$/i.test(k.color) ? k.color : '';
                    const colorStyle = color ? ` color: ${color};` : '';
                    return `<span class="word-tag" style="font-size: ${Number(k.weight) || 16}px; font-weight: bold;${colorStyle}" title="${escapeHTML(k.group || '關鍵詞')}">${escapeHTML(k.text)}</span>`;
                }).join('');
            }
        },

        renderFeedbackFilters: function() {
            const destEl = document.getElementById('destFilter');
            const leaderEl = document.getElementById('leaderFilter');
            const searchEl = document.getElementById('feedbackSearch');
            const feedbacks = Array.isArray(DataStore.rawFeedbacks) ? DataStore.rawFeedbacks : [];

            const uniqueValues = (key) => {
                const seen = new Set();
                const values = [];
                feedbacks.forEach(item => {
                    const value = item && item[key] ? String(item[key]).trim() : '';
                    if (!value || seen.has(value)) return;
                    seen.add(value);
                    values.push(value);
                });
                return values.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
            };

            const rebuildSelect = (selectEl, allLabel, values) => {
                if (!selectEl) return;
                const previousValue = selectEl.value || 'all';
                selectEl.innerHTML = `<option value="all">${allLabel}</option>` + values.map(value =>
                    `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`
                ).join('');
                selectEl.value = values.includes(previousValue) ? previousValue : 'all';
            };

            rebuildSelect(destEl, '所有目的地', uniqueValues('dest'));
            rebuildSelect(leaderEl, '所有領隊', uniqueValues('leader'));
            if (searchEl) searchEl.value = '';
        },

        clearFeedbackSearch: function() {
            const searchEl = document.getElementById('feedbackSearch');
            if (!searchEl) return;
            searchEl.value = '';
            this.filterFeedback();
        },

        filterFeedback: function() {
            const destEl = document.getElementById('destFilter'); 
            const typeEl = document.getElementById('typeFilter');
            const leaderEl = document.getElementById('leaderFilter');
            const searchEl = document.getElementById('feedbackSearch');
            const container = document.getElementById('feedbackGrid');
            const statusBar = document.getElementById('sentimentStatusBar');
            const resultCountEl = document.getElementById('feedbackResultCount');
            
            if (!container || !DataStore.rawFeedbacks) return;
            
            const dest = destEl ? destEl.value : 'all'; 
            const type = typeEl ? typeEl.value : 'all';
            const leader = leaderEl ? leaderEl.value : 'all';
            const searchTerm = searchEl ? searchEl.value.trim().toLocaleLowerCase('zh-Hant') : '';
            
            const filtered = DataStore.rawFeedbacks.filter(f => 
                (dest === 'all' || (f.dest && f.dest.includes(dest))) &&
                (type === 'all' || f.type === type) &&
                (leader === 'all' || f.leader === leader) &&
                (!searchTerm || [f.dest, f.leader, f.tourNo, f.content]
                    .filter(Boolean)
                    .some(value => String(value).toLocaleLowerCase('zh-Hant').includes(searchTerm)))
            );

            if (resultCountEl) {
                const total = DataStore.rawFeedbacks.length;
                resultCountEl.textContent = filtered.length === total
                    ? `目前顯示 ${filtered.length} 則長評`
                    : `目前顯示 ${filtered.length} / ${total} 則長評`;
            }

            if(statusBar) {
                if (filtered.length === 0) {
                    statusBar.innerHTML = '';
                } else {
                    let posCount = 0, sugCount = 0, negCount = 0;
                    filtered.forEach(f => {
                        if(f.type === 'positive') posCount++;
                        else if(f.type === 'suggestion') sugCount++;
                        else if(f.type === 'negative') negCount++;
                    });
                    const total = filtered.length;
                    const posPct = ((posCount/total)*100).toFixed(1);
                    const sugPct = ((sugCount/total)*100).toFixed(1);
                    const negPct = ((negCount/total)*100).toFixed(1);

                    statusBar.innerHTML = `
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-bold text-[#252423]">情緒佔比結構分析 (Total: ${total} 則)</span>
                        </div>
                        <div class="w-full h-3 bg-[#e1dfdd] rounded-[2px] flex overflow-hidden mb-3 shadow-inner">
                            <div style="width: ${posPct}%; background-color: #00B8AA;" class="h-full transition-all duration-500"></div>
                            <div style="width: ${sugPct}%; background-color: #F2C80F;" class="h-full transition-all duration-500"></div>
                            <div style="width: ${negPct}%; background-color: #FD625E;" class="h-full transition-all duration-500"></div>
                        </div>
                        <div class="flex space-x-4 text-xs font-semibold">
                            <span style="color: #00B8AA;"><i class="fas fa-thumbs-up mr-1"></i>表揚 ${posPct}% (${posCount})</span>
                            <span style="color: #E66C37;"><i class="fas fa-lightbulb mr-1"></i>建議 ${sugPct}% (${sugCount})</span>
                            <span style="color: #FD625E;"><i class="fas fa-exclamation-triangle mr-1"></i>投訴 ${negPct}% (${negCount})</span>
                        </div>
                    `;
                }
            }

            if (filtered.length === 0) {
                container.innerHTML = '<div class="col-span-full text-center text-gray-400 py-10">沒有符合條件的留言記錄，請調整篩選或搜尋關鍵字。</div>';
                return;
            }
            
            container.innerHTML = filtered.map(f => {
                const borderClass = f.type === 'positive' ? 'border-l-4 border-l-[#00B8AA]' : (f.type === 'suggestion' ? 'border-l-4 border-l-[#F2C80F]' : 'border-l-4 border-l-[#FD625E]');
                const icon = f.type === 'positive' ? '<i class="fas fa-thumbs-up text-[#00B8AA]"></i>' : (f.type === 'suggestion' ? '<i class="fas fa-lightbulb text-[#F2C80F]"></i>' : '<i class="fas fa-exclamation-triangle text-[#FD625E]"></i>');
                const typeText = f.type === 'positive' ? '表揚' : (f.type === 'suggestion' ? '建議' : '投訴');
                const typeColor = f.type === 'positive' ? 'text-[#00B8AA] bg-[#00B8AA]/10' : (f.type === 'suggestion' ? 'text-[#E66C37] bg-[#F2C80F]/20' : 'text-[#FD625E] bg-[#FD625E]/10');
                const tourLabel = f.tourNo ? f.tourNo : '未提供';
                return `
                <div class="bg-[#faf9f8] rounded-[2px] shadow-sm border border-gray-200 p-5 ${borderClass} card-hover">
                    <div class="flex justify-between items-start mb-3">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-[2px] text-xs font-medium ${typeColor}">${icon} <span class="ml-1">${typeText}</span></span>
                        <div class="text-right"><div class="text-xs font-bold text-gray-500">${escapeHTML(f.dest || '未知')}</div></div>
                    </div>
                    <p class="text-[#252423] text-sm italic leading-relaxed mb-4 whitespace-pre-wrap">"${escapeHTML(f.content)}"</p>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-[#e1dfdd] text-xs text-gray-500">
                        <div class="flex items-center"><i class="fas fa-map-marker-alt mr-1"></i> 目的地: ${escapeHTML(f.dest || '未知')}</div>
                        <div class="flex items-center"><i class="fas fa-user-circle mr-1"></i> 領隊: ${escapeHTML(f.leader || '未提供')}</div>
                        <div class="flex items-center font-semibold" data-feedback-field="tourNo"><i class="fas fa-ticket-alt mr-1"></i> 團號: ${escapeHTML(tourLabel)}</div>
                    </div>
                </div>`;
            }).join('');
        },

        filterSatChart: function(destinationName) {
            if(!satCrossChart || !DataStore.satisfactionCrossData) return;
            const index = DataStore.satisfactionCrossData.labels.indexOf(destinationName);
            if(index === -1) return;
            satCrossChart.data.labels = [destinationName];
            satCrossChart.data.datasets.forEach(dataset => {
                const originalDataset = DataStore.satisfactionCrossData.datasets.find(d => d.label === dataset.label);
                if (originalDataset) dataset.data = [originalDataset.data[index]];
            });
            satCrossChart.update();
            const resetBtn = document.getElementById('resetBtn'); const subtitle = document.getElementById('crossChartSubtitle');
            if(resetBtn) resetBtn.classList.remove('hidden');
            if(subtitle) subtitle.innerText = `分析：單一目的地 [${escapeHTML(destinationName)}] 在各年齡層的平均滿意度得分`;
        },

        resetDrillDown: function() {
            if(!satCrossChart || !DataStore.satisfactionCrossData) return;
            satCrossChart.data.labels = DataStore.satisfactionCrossData.labels;
            satCrossChart.data.datasets.forEach((dataset, i) => { dataset.data = DataStore.satisfactionCrossData.datasets[i]?.data || []; });
            satCrossChart.update();
            const resetBtn = document.getElementById('resetBtn'); const subtitle = document.getElementById('crossChartSubtitle');
            if(resetBtn) resetBtn.classList.add('hidden');
            if(subtitle) subtitle.innerText = "分析：不同年齡層在各目的地的平均滿意度得分 (Score: 0-10)";
        },

        setSatCrossChart: function(chart) { satCrossChart = chart; },

        selectNpsDriver: function(name) {
            if (!npsDriverRankedPoints.length) return;
            const canonical = npsDriverRankedPoints.find((point) => point.item === name) || npsDriverRankedPoints[0];
            npsSelectedDriverName = canonical?.item || '';
            syncNpsDriverSelection();
        },

        initCharts: function() {
            // 核心對抗性審查：防止 Chart.js Canvas 記憶體洩漏 (Memory Leak / Overlapping)
            const initChartSafe = (canvasId, config) => {
                const canvas = document.getElementById(canvasId);
                if(canvas) { 
                    try { 
                        // 若已存在舊圖表，則必須先銷毀，避免疊加與佔用資源
                        const existingChart = Chart.getChart(canvas);
                        if (existingChart) existingChart.destroy();
                        return new Chart(canvas, config); 
                    } catch(e) { 
                        console.warn(`Chart failed to init on ${canvasId}:`, e); 
                    } 
                }
                return null;
            };

            const pbi1 = '#118DFF'; // Blue
            const pbi2 = '#12239E'; // Dark Blue
            const pbi3 = '#E66C37'; // Orange
            const pbi4 = '#00B8AA'; // Teal
            const pbi5 = '#6B007B'; // Purple
            const pbi6 = '#E044A7'; // Pink
            const pbi7 = '#F2C80F'; // Yellow
            const pbi8 = '#FD625E'; // Red (Negative)
            const pbiPalette = [pbi1, pbi2, pbi3, pbi4, pbi5, pbi6, pbi7];
            const softGrey = '#c8c6c4';
            const maxFrom = (values, fallback) => Math.max(fallback, ...(values || []).filter(v => Number.isFinite(v)));
            const npsThreshold = DataStore.npsCorrelationData?.threshold || { x: 0.380, y: 4.45 };

            const crosshairPlugin = {
                id: 'quadrantCrosshair',
                beforeDraw: (chart) => {
                    if (chart.config.options.plugins.quadrantCrosshair === false) return;
                    const {ctx, chartArea: {top, bottom, left, right}, scales: {x, y}} = chart;
                    ctx.save();
                    ctx.strokeStyle = '#a19f9d';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);

                    const xPos = x.getPixelForValue(npsThreshold.x);
                    const yPos = y.getPixelForValue(npsThreshold.y);

                    if (!isNaN(xPos)) {
                        ctx.beginPath(); ctx.moveTo(xPos, top); ctx.lineTo(xPos, bottom); ctx.stroke();
                    }
                    if (!isNaN(yPos)) {
                        ctx.beginPath(); ctx.moveTo(left, yPos); ctx.lineTo(right, yPos); ctx.stroke();
                    }
                    ctx.restore();
                }
            };
            Chart.register(crosshairPlugin);

            const genderData = DataStore.genderData || { labels: ['女 (Female)', '男 (Male)'], values: [114, 93] };
            initChartSafe('genderChart', { type: 'pie', data: { labels: genderData.labels, datasets: [{ data: genderData.values, backgroundColor: [pbi6, pbi1, softGrey], borderWidth: 1, borderColor: '#fff', datalabels: { formatter: (val) => val + " 人" } }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' }, quadrantCrosshair: false } } });

            const ageData = DataStore.ageData || { labels: ['18歲或以下', '19-25', '26-35', '36-45', '46-55', '56-65', '66+'], values: [4, 2, 8, 25, 45, 56, 52] };
            initChartSafe('ageChart', { type: 'bar', data: { labels: ageData.labels, datasets: [{ label: '人數', data: ageData.values, backgroundColor: pbi1, borderRadius: 0, datalabels: { anchor: 'end', align: 'top', color: '#605e5c', font: { weight: 'bold', size: 12 }, formatter: (val) => val > 0 ? val + " 人" : "" } }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, quadrantCrosshair: false }, scales: { y: { display: false, max: maxFrom(ageData.values, 70) }, x: { grid: { display: false } } } } });

            const memberConsentCrossData = DataStore.memberConsentCrossData || { labels: ['是會員', '非會員'], datasets: [{ label: '同意', data: [11, 59] }, { label: '不同意', data: [5, 144] }] };
            initChartSafe('memberConsentCrossChart', { type: 'bar', data: { labels: memberConsentCrossData.labels, datasets: memberConsentCrossData.datasets.map((dataset, idx) => ({ ...dataset, backgroundColor: idx === 0 ? pbi4 : softGrey, stack: 'Stack 0', borderRadius: 0 })) }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', layout: { padding: { right: 40 } }, plugins: { legend: { position: 'top' }, quadrantCrosshair: false, datalabels: { anchor: function(ctx) { return ctx.datasetIndex === 0 ? 'end' : 'center'; }, align: function(ctx) { return ctx.datasetIndex === 0 ? 'right' : 'center'; }, offset: function(ctx) { return ctx.datasetIndex === 0 ? 6 : 0; }, clip: false, color: function(ctx) { return ctx.datasetIndex === 0 ? '#252423' : '#252423'; }, font: { weight: 'bold' }, formatter: (val, ctx) => { let total = ctx.chart.data.datasets.reduce((sum, dataset) => sum + (Number(dataset.data[ctx.dataIndex]) || 0), 0); return total ? val + "人 (" + ((val/total)*100).toFixed(1) + "%)" : ""; } } }, scales: { x: { stacked: true, grid: { display: false }, max: maxFrom(memberConsentCrossData.labels.map((_, idx) => memberConsentCrossData.datasets.reduce((sum, dataset) => sum + (Number(dataset.data[idx]) || 0), 0)), 250) }, y: { stacked: true, grid: { display: false } } } } });

            const satisfactionDistributionData = DataStore.satisfactionDistributionData || { labels: ['旅車司機', '交通', '隨團領隊', '當地導遊', '觀光節目安排', '酒店', '餐廳及膳食', '購物安排', '自費活動安排'], datasets: [{ label: '非常滿意/滿意', data: [222, 218, 217, 213, 206, 199, 181, 161, 140] }, { label: '普通', data: [1, 5, 6, 8, 16, 18, 38, 30, 28] }, { label: '非常不滿意/不滿意', data: [0, 0, 0, 0, 0, 0, 0, 0, 0] }] };
            const satisfactionMax = maxFrom(satisfactionDistributionData.labels.map((_, idx) => satisfactionDistributionData.datasets.reduce((sum, dataset) => sum + (Number(dataset.data[idx]) || 0), 0)), 250);
            initChartSafe('satisfactionChart', { type: 'bar', data: { labels: satisfactionDistributionData.labels, datasets: satisfactionDistributionData.datasets.map((dataset, idx) => ({ ...dataset, backgroundColor: idx === 0 ? pbi1 : (idx === 1 ? '#e1dfdd' : pbi8), borderRadius: 0, datalabels: idx === 0 ? { align: 'center', anchor: 'center', color: '#fff' } : (idx === 1 ? { color: '#252423', align: 'center', anchor: 'center', formatter: (val) => val > 0 ? val : '' } : { display: false }) })) }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, quadrantCrosshair: false }, scales: { x: { stacked: true, grid: { display: false }, max: satisfactionMax }, y: { stacked: true, grid: { display: false } } } } });

            const destAgeCrossData = DataStore.destAgeCrossData || { labels: ['韓國', '張家界', '桂林', '雲南', '北京'], datasets: [{ label: '18歲或以下', data: [0, 0, 0, 0, 0] }, { label: '19-25歲', data: [0, 0, 0, 0, 0] }, { label: '26-35歲', data: [0, 1, 1, 0, 1] }, { label: '36-45歲', data: [10, 3, 1, 0, 3] }, { label: '46-55歲', data: [11, 6, 9, 7, 1] }, { label: '56-65歲', data: [10, 17, 8, 6, 3] }, { label: '66歲或以上', data: [0, 0, 0, 0, 0] }] };
            const destAgeTotals = destAgeCrossData.totals || destAgeCrossData.labels.map((_, idx) => destAgeCrossData.datasets.reduce((sum, dataset) => sum + (Number(dataset.data[idx]) || 0), 0));
            initChartSafe('destAgeCrossChart', { type: 'bar', data: { labels: destAgeCrossData.labels, datasets: destAgeCrossData.datasets.map((dataset, idx) => ({ ...dataset, backgroundColor: idx === 0 ? '#323130' : (pbiPalette[idx % pbiPalette.length] || softGrey), stack: 'stack1' })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, quadrantCrosshair: false, datalabels: { display: function(ctx) { return ctx.dataset.data[ctx.dataIndex] > 0; }, anchor: 'center', align: 'center', color: '#fff' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, max: maxFrom(destAgeTotals, 35), grid: { display: true } } } } });

            if(DataStore.sourceData) { initChartSafe('sourceChart', { type: 'bar', data: { labels: DataStore.sourceData.labels, datasets: [{ data: DataStore.sourceData.values, backgroundColor: pbi1, borderRadius: 0 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 80 } }, plugins: { legend: { display: false }, quadrantCrosshair: false, datalabels: { anchor: 'end', align: 'right', color: '#252423', font: { weight: 'bold' }, formatter: (val, ctx) => val + ' (' + DataStore.sourceData.pcts[ctx.dataIndex] + ')' } }, scales: { x: { display: false, max: 110 }, y: { grid: { display: false } } } } }); }
            if(DataStore.channelData) { initChartSafe('channelChart', { type: 'doughnut', data: { labels: DataStore.channelData.labels, datasets: [{ data: DataStore.channelData.values, backgroundColor: [pbi1, pbi4, pbi3, pbi7, pbi8], borderWidth: 1, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', layout: { padding: 20 }, plugins: { legend: { position: 'bottom' }, quadrantCrosshair: false, datalabels: { color: function(ctx) { return ctx.dataIndex === 0 ? '#fff' : '#252423'; }, anchor: function(ctx) { return ctx.dataIndex === 0 ? 'center' : 'end'; }, align: function(ctx) { return ctx.dataIndex === 0 ? 'center' : 'end'; }, font: { weight: 'bold' }, formatter: (val, ctx) => val > 5 ? DataStore.channelData.pcts[ctx.dataIndex] : '' } } } }); }
            
            if(DataStore.salesData) {
                const { history_labels, history_values, forecast_labels, forecast_values } = DataStore.salesData;
                const labels = history_labels.concat(forecast_labels);
                const chartHistoryData = history_values.concat(Array(forecast_values.length).fill(null));
                const lastHistoryVal = history_values[history_values.length - 1];
                const forecastData = Array(history_values.length - 1).fill(null);
                forecastData.push(lastHistoryVal);
                forecastData.push.apply(forecastData, forecast_values);
                initChartSafe('salesForecastChart', { type: 'line', data: { labels: labels, datasets: [ { label: '歷史實際銷售額 (HKD)', data: chartHistoryData, borderColor: pbi1, backgroundColor: pbi1+'1a', fill: true, tension: 0, pointRadius: 4, datalabels: { display: true, color: '#252423', align: 'top', anchor: 'end', font: { weight: 'bold', size: 10 }, formatter: (val) => val ? (val/10000).toFixed(1) + '萬' : '' } }, { label: 'AI 預測銷售額 (HKD)', data: forecastData, borderColor: pbi4, borderDash: [5, 5], pointBackgroundColor: '#fff', pointBorderColor: pbi4, fill: false, tension: 0, pointRadius: 4, datalabels: { display: true, color: '#252423', align: 'top', anchor: 'end', font: { weight: 'bold', size: 10 }, formatter: (val) => val ? (val/10000).toFixed(1) + '萬' : '' } } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, quadrantCrosshair: false, tooltip: { callbacks: { label: function(ctx) { let l = ctx.dataset.label || ''; if(l) return l + ': ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'HKD' }).format(ctx.parsed.y); return null; } } } }, scales: { y: { beginAtZero: false, title: { display: true, text: '銷售金額 (HKD)' } }, x: { grid: { display: false } } } } });
            }
            
            if(DataStore.customerSegments) { initChartSafe('rfmChart', { type: 'pie', data: { labels: Object.keys(DataStore.customerSegments), datasets: [{ data: Object.values(DataStore.customerSegments), backgroundColor: [pbi1, pbi4, pbi8], borderWidth: 1, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' }, quadrantCrosshair: false, datalabels: { color: '#fff', font: { weight: 'bold' }, formatter: (val) => val + '%' } } } }); }
            
            if(DataStore.satisfactionCrossData) {
                const crossData = JSON.parse(JSON.stringify(DataStore.satisfactionCrossData));
                const pointStyles = ['circle', 'triangle', 'rect', 'rectRot', 'star', 'crossRot', 'rectRounded'];
                crossData.datasets.forEach((ds, idx) => {
                    ds.type = 'line';
                    ds.showLine = false; 
                    ds.pointRadius = 7; 
                    ds.pointHoverRadius = 10;
                    ds.backgroundColor = pbiPalette[idx % pbiPalette.length];
                    ds.pointBackgroundColor = ds.backgroundColor + '80'; 
                    ds.pointBorderColor = ds.backgroundColor; 
                    ds.pointBorderWidth = 2;
                    ds.pointStyle = pointStyles[idx % pointStyles.length]; 
                });
                const crossChart = initChartSafe('satisfactionCrossChart', { type: 'line', data: crossData, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 15 } }, datalabels: { display: false }, quadrantCrosshair: false, tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y + ' 分'; } } } }, scales: { y: { beginAtZero: false, min: 3, max: 10, grid: { display: true, color: '#f3f2f1' } }, x: { offset: true, grid: { display: true, drawOnChartArea: true, color: '#e1dfdd', borderDash: [5, 5], drawTicks: false } } } } });
                if(crossChart) DashboardApp.setSatCrossChart(crossChart);
            }

            const npsCorrelationData = DataStore.npsCorrelationData || {};
            const npsPoints = normalizeNpsDriverPoints(npsCorrelationData.points);
            const npsXValues = npsPoints.map(point => Number(point.x)).filter(Number.isFinite);
            const npsYValues = npsPoints.map(point => Number(point.y)).filter(Number.isFinite);
            const npsXMin = Math.max(0, Math.floor((Math.min(...npsXValues, 0.2) - 0.05) * 10) / 10);
            const npsXMax = Math.min(1, Math.ceil((Math.max(...npsXValues, 0.6) + 0.05) * 10) / 10);
            const npsYMin = Math.max(0, Math.floor((Math.min(...npsYValues, 4.0) - 0.15) * 10) / 10);
            const npsYMax = Math.ceil((Math.max(...npsYValues, 5.0) + 0.15) * 10) / 10;
            const npsScaleLabel = npsYMax > 6 ? '平均滿意度評分 (Satisfaction: 1-10分)' : '平均滿意度評分 (Satisfaction: 1-5分)';
            const npsThresholdData = npsCorrelationData.threshold || npsThreshold;
            const hasNpsDriverData = npsPoints.length > 0;

            if (hasNpsDriverData) {
                setNpsDriverChartNotice('');
                npsDriverRankedPoints = buildNpsDriverRankedPoints(npsPoints, npsThresholdData);
                npsDriverIndexByName = new Map(npsPoints.map((point, index) => [point.item, index]));
                npsSelectedDriverName = npsDriverRankedPoints[0]?.item || '';
            } else {
                renderNpsDriverUnavailableState('此月份沒有可用驅動因素資料');
            }
            npsDriverChart = initChartSafe('npsCorrelationChart', {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: '服務環節',
                        data: npsPoints,
                        backgroundColor: (ctx) => {
                            const val = ctx.raw;
                            if (!val) return '#ccc';
                            const zoneKey = getNpsDriverZoneKey(val, npsThresholdData);
                            if (zoneKey === 'urgent') return pbi8;
                            if (zoneKey === 'maintain') return pbi4;
                            if (zoneKey === 'stable') return pbi1;
                            return softGrey;
                        },
                        pointRadius: (ctx) => (ctx.raw?.item === npsSelectedDriverName ? 13 : 10),
                        pointHoverRadius: 13,
                        pointBorderWidth: (ctx) => (ctx.raw?.item === npsSelectedDriverName ? 3 : 1),
                        pointBorderColor: (ctx) => (ctx.raw?.item === npsSelectedDriverName ? '#252423' : '#ffffff')
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (_, activeEls) => {
                        if (!hasNpsDriverData) return;
                        if (!activeEls.length) return;
                        const point = npsPoints[activeEls[0].index];
                        if (point?.item) DashboardApp.selectNpsDriver(point.item);
                    },
                    onHover: (event, activeEls) => {
                        if (event?.native?.target) event.native.target.style.cursor = activeEls[0] ? 'pointer' : 'default';
                    },
                    layout: { padding: { top: 25, right: 30, left: 15, bottom: 10 } },
                    plugins: {
                        legend: { display: false },
                        quadrantCrosshair: hasNpsDriverData,
                        datalabels: {
                            display: hasNpsDriverData,
                            align: 'center',
                            anchor: 'center',
                            color: '#fff',
                            backgroundColor: '#252423',
                            borderRadius: 10,
                            padding: 3,
                            font: { weight: 'bold', size: 10 },
                            formatter: (_, ctx) => {
                                const point = npsPoints[ctx.dataIndex];
                                const rankedPoint = npsDriverRankedPoints.find((entry) => entry.item === point?.item);
                                return rankedPoint ? String(rankedPoint.rank) : '';
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `${ctx.raw.item}: 滿意度 ${ctx.raw.y.toFixed(2)}, 對總分相關性 ${ctx.raw.x.toFixed(3)}, 對推薦意願相關性 ${formatNpsMetric(ctx.raw.recommendationCorrelation, 3)}`
                            }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: '對總分影響力 / 相關性 (Importance)', font: { weight: 'bold' } }, min: npsXMin, max: npsXMax },
                        y: { title: { display: true, text: npsScaleLabel, font: { weight: 'bold' } }, min: npsYMin, max: npsYMax }
                    }
                }
            });
            if (hasNpsDriverData) {
                setHTML('nps-driver-legend', npsDriverRankedPoints.map((point) => `<span class="flex items-center gap-2"><strong class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white">${point.rank}</strong><span>${escapeHTML(point.item)}</span></span>`).join(''));
                syncNpsDriverSelection();
            }
            
            const topDestData = DataStore.topDestData || { labels: ['韓國', '張家界', '桂林', '雲南', '北京'], values: [52, 39, 32, 24, 14] };
            const topDestChart = initChartSafe('topDestChart', { type: 'bar', data: { labels: topDestData.labels, datasets: [{ label: '出團數量', data: topDestData.values, backgroundColor: (ctx) => ctx.dataIndex < 3 ? pbi1 : (ctx.dataIndex < 6 ? '#71B9F5' : softGrey), borderRadius: 0, barThickness: 20 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, onClick: (e, activeEls) => { if(activeEls.length > 0) { DashboardApp.filterSatChart(topDestChart.data.labels[activeEls[0].index]); } else { DashboardApp.resetDrillDown(); } }, onHover: (e, el) => { e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; }, plugins: { legend: { display: false }, quadrantCrosshair: false, datalabels: { anchor: 'end', align: 'end', color: '#252423', formatter: (val) => val + "人" } }, scales: { x: { display: false, max: maxFrom(topDestData.values, 60) }, y: { grid: { display: false } } } } });
            
            const durationDistData = DataStore.durationDistData || { labels: ['短線 (1-4天)', '中長線 (5-7天)', '長線 (8天或以上)'], values: [33, 151, 36] };
            initChartSafe('durationDistChart', { type: 'doughnut', data: { labels: durationDistData.labels, datasets: [{ data: durationDistData.values, backgroundColor: [pbi4, pbi1, pbi2], borderWidth: 0, datalabels: { color: '#fff', font: { weight: 'bold' }, formatter: (val, ctx) => { let total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0); return total ? ((val/total)*100).toFixed(1) + "%" : ""; } } }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false }, quadrantCrosshair: false } } });

            if(DataStore.futureDestData) { initChartSafe('futureDestChart', { type: 'bar', data: { labels: DataStore.futureDestData.labels, datasets: [{ data: DataStore.futureDestData.values, backgroundColor: (ctx) => { return ctx.dataIndex < 3 ? pbi1 : (ctx.dataIndex < 6 ? pbi4 : '#c8c6c4'); }, borderRadius: 0 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 40 } }, plugins: { legend: { display: false }, quadrantCrosshair: false, datalabels: { anchor: 'end', align: 'right', color: '#252423', font: { weight: 'bold' }, formatter: (val) => val } }, scales: { x: { display: false, max: 60 }, y: { grid: { display: false } } } } }); }
            if(DataStore.npsDistData) { initChartSafe('npsDistChart', { type: 'doughnut', data: { labels: DataStore.npsDistData.labels, datasets: [{ data: DataStore.npsDistData.values, backgroundColor: [pbi1, pbi8], borderWidth: 1, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { boxWidth: 12 } }, quadrantCrosshair: false, datalabels: { display: false } } } }); }
            if(DataStore.npsScoreData) { initChartSafe('npsScoreChart', { type: 'bar', data: { labels: DataStore.npsScoreData.labels, datasets: [{ data: DataStore.npsScoreData.values, backgroundColor: pbi4, borderRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, quadrantCrosshair: false, datalabels: { anchor: 'end', align: 'top', color: '#252423', font: { weight: 'bold' }, formatter: (val) => val } }, scales: { y: { display: false, max: 180 }, x: { grid: { display: false } } } } }); }
        }
    };
})();


window.DashboardApp = DashboardApp;
window.addEventListener('afterprint', () => {
    if (window.DashboardApp && typeof window.DashboardApp.restorePrintMode === 'function') {
        window.DashboardApp.restorePrintMode();
    }
});

// 智能啟動器
async function bootApp() {
    showLoadingOverlay('正在載入數據庫...', '正在讀取本地 JSON 數據源並初始化圖表引擎，請稍候...');

    if (typeof Chart === 'undefined' || typeof ChartDataLabels === 'undefined') {
        console.warn("資源尚未就緒，500ms 後重試...");
        setTimeout(bootApp, 500);
        return;
    }

    try {
        await fetchMonthCatalog();
        initializeP3Provider();
        const selector = document.getElementById('globalMonthSelector');
        await fetchMonthData(selector ? selector.value : currentMonthKey);
        void refreshP3ForMonth(currentMonthKey);

        Chart.register(ChartDataLabels);
        Chart.defaults.font.family = '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif';
        Chart.defaults.color = '#605e5c';
        Chart.defaults.set('plugins.datalabels', { color: '#ffffff', font: { weight: '600', size: 11 }, display: 'auto' });
        Chart.defaults.set('plugins.tooltip', { backgroundColor: '#252423', titleColor: '#ffffff', bodyColor: '#ffffff', cornerRadius: 2, padding: 10 });

        DashboardApp.init();
    } catch (error) {
        console.error('Dashboard boot failed:', error);
        showDashboardError(error.message);
    } finally {
        hideLoadingOverlay();
    }
}

// 捕捉全局 JS 錯誤並顯示提示
window.onerror = function(msg) {
    const errorBoundary = document.getElementById('js-error-boundary');
    if (errorBoundary) {
        errorBoundary.classList.remove('hidden');
    }
    console.error("Dashboard Global Error: ", msg);
};

if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}

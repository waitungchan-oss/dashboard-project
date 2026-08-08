const text = (value, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);

const formatValue = (value) => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : text(value);

const create = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
};

const append = (parent, ...children) => {
    children.filter(Boolean).forEach(child => parent.appendChild(child));
    return parent;
};

const statusLabel = {
    both: '兩月皆有',
    added: '比較月新增',
    removed: '比較月移除',
    unavailable: '資料不可用'
};

const rowStatus = (row) => statusLabel[row?.status] || statusLabel.unavailable;

const makeStatusBadge = (status) => create(
    'span',
    `inline-flex items-center px-2 py-1 text-xs font-semibold border ${status === 'both' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`,
    rowStatus({ status })
);

const makeComparisonCell = (row, field) => {
    const cell = create('td', 'px-3 py-3 align-top text-sm');
    const base = row?.base?.[field];
    const compare = row?.compare?.[field];
    append(cell,
        create('div', 'text-gray-700', `基準月：${formatValue(base)}`),
        create('div', 'text-gray-700', `比較月：${formatValue(compare)}`),
        create('div', 'font-semibold text-gray-900', `Delta：${formatValue(row?.delta)}`)
    );
    return cell;
};

const makeTable = (columns, rows, rowBuilder) => {
    const table = create('table', 'w-full text-left border-collapse');
    const head = create('thead', 'bg-gray-50');
    const headRow = create('tr');
    columns.forEach(column => append(headRow, create('th', 'px-3 py-3 text-xs font-bold text-gray-600 uppercase', column)));
    append(head, headRow);
    const body = create('tbody');
    if (!rows.length) {
        const empty = create('tr');
        const cell = create('td', 'px-3 py-5 text-sm text-gray-500', '沒有可比較資料');
        cell.colSpan = columns.length;
        append(empty, cell);
        append(body, empty);
    } else {
        rows.forEach(row => append(body, rowBuilder(row)));
    }
    append(table, head, body);
    return table;
};

const renderMetricCards = (container, metrics) => {
    container.replaceChildren();
    Object.entries(metrics || {}).forEach(([key, metric]) => {
        const card = create('article', 'bg-white border border-gray-200 p-4 min-w-0');
        append(card,
            create('h3', 'font-bold text-gray-900 break-words', key),
            create('p', 'mt-2 text-sm text-gray-700', `基準月：${formatValue(metric?.base?.value)}`),
            create('p', 'text-sm text-gray-700', `比較月：${formatValue(metric?.compare?.value)}`),
            create('p', 'mt-1 text-base font-bold text-blue-800', `Delta：${formatValue(metric?.delta)}`),
            create('p', 'mt-2 text-xs text-gray-500', `Unit：${text(metric?.compare?.unit || metric?.base?.unit)}`),
            create('p', 'text-xs text-gray-500', `N：${text(metric?.compare?.n || metric?.base?.n)}`),
            create('p', 'mt-2 text-xs text-gray-600 break-words', `Definition：${text(metric?.compare?.definition || metric?.base?.definition)}`)
        );
        append(container, card);
    });
};

const renderRows = (container, rows, kind) => {
    container.replaceChildren();
    const config = kind === 'branch'
        ? {
            columns: ['狀態', '門市', '排名', '評分 / Delta', '樣本 N / Delta'],
            field: 'score',
            row: (item) => {
                const tr = create('tr', 'border-t border-gray-100');
                const baseRank = item?.base?.rank;
                const compareRank = item?.compare?.rank;
                append(tr,
                    create('td', 'px-3 py-3 align-top', undefined),
                    create('td', 'px-3 py-3 align-top font-semibold text-gray-900 break-words', item?.key),
                    create('td', 'px-3 py-3 align-top text-sm', `基準月：${formatValue(baseRank)}；比較月：${formatValue(compareRank)}；Delta：${formatValue(item?.base?.rankDelta ?? item?.compare?.rankDelta)}`),
                    makeComparisonCell(item, 'score'),
                    makeComparisonCell(item, 'n')
                );
                tr.children[0].appendChild(makeStatusBadge(item?.status));
                return tr;
            }
        }
        : kind === 'destination'
            ? {
                columns: ['狀態', '目的地', '排名', '數量 / Delta', '比率 / Delta'],
                row: (item) => {
                    const tr = create('tr', 'border-t border-gray-100');
                    append(tr,
                        create('td', 'px-3 py-3 align-top', undefined),
                        create('td', 'px-3 py-3 align-top font-semibold text-gray-900 break-words', item?.key),
                        create('td', 'px-3 py-3 align-top text-sm', `基準月：${formatValue(item?.base?.rank)}；比較月：${formatValue(item?.compare?.rank)}；Delta：${formatValue(item?.base?.rankDelta ?? item?.compare?.rankDelta)}`),
                        makeComparisonCell(item, 'value'),
                        makeComparisonCell(item, 'rate')
                    );
                    tr.children[0].appendChild(makeStatusBadge(item?.status));
                    return tr;
                }
            }
            : {
                columns: ['狀態', '情緒類別', '總數', 'Count / Delta', 'Rate / Delta'],
                row: (item) => {
                    const tr = create('tr', 'border-t border-gray-100');
                    append(tr,
                        create('td', 'px-3 py-3 align-top', undefined),
                        create('td', 'px-3 py-3 align-top font-semibold text-gray-900 break-words', item?.key || item?.base?.label || item?.compare?.label),
                        create('td', 'px-3 py-3 align-top text-sm', `基準月：${formatValue(item?.base?.total)}；比較月：${formatValue(item?.compare?.total)}`),
                        makeComparisonCell(item, 'count'),
                        makeComparisonCell(item, 'rate')
                    );
                    tr.children[0].appendChild(makeStatusBadge(item?.status));
                    return tr;
                }
            };
    append(container, makeTable(config.columns, Array.isArray(rows) ? rows : [], config.row));
};

export const renderP3ComparisonUnavailable = (container, message = '月份比較資料不可用') => {
    if (!container) return;
    const statusRegion = container.id === 'p3ComparisonStatus'
        ? container
        : container.querySelector('#p3ComparisonStatus');
    if (statusRegion) statusRegion.textContent = message;
    const targets = ['#p3MetricCards', '#p3BranchComparison', '#p3DestinationComparison', '#p3SentimentComparison'];
    targets.forEach(selector => {
        const target = container.matches?.(selector) ? container : container.querySelector(selector);
        if (!target) return;
        target.replaceChildren(create('p', 'p-4 border border-red-200 bg-red-50 text-red-800 text-sm', message));
    });
};

export const renderP3Comparison = (container, comparison, options = {}) => {
    if (!container) return;
    const status = comparison?.status || 'ready';
    if (status === 'unavailable' || status === 'error') {
        renderP3ComparisonUnavailable(container, options.message || comparison?.reason || '月份比較資料不可用');
        return;
    }
    const metricCards = container.querySelector('#p3MetricCards');
    const branch = container.querySelector('#p3BranchComparison');
    const destination = container.querySelector('#p3DestinationComparison');
    const sentiment = container.querySelector('#p3SentimentComparison');
    renderMetricCards(metricCards, comparison.metrics);
    renderRows(branch, comparison.branchRanking, 'branch');
    renderRows(destination, comparison.destinationDemand, 'destination');
    renderRows(sentiment, comparison.sentiment, 'sentiment');
    const statusRegion = container.querySelector('#p3ComparisonStatus');
    if (statusRegion) statusRegion.textContent = options.message || `已比較 ${text(comparison.baseMonth)} 與 ${text(comparison.compareMonth)}`;
};

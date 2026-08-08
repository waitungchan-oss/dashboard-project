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

const ISSUE_REQUIRED_FIELDS = [
    'id', 'category', 'title', 'ownerDepartment', 'priority', 'status',
    'recommendedAction', 'trackingMetrics', 'firstSeenMonth', 'lastSeenMonth', 'sourceRefs'
];

const isCompleteIssue = (issue) => issue && ISSUE_REQUIRED_FIELDS.every((field) => {
    if (!(field in issue)) return false;
    if (['trackingMetrics', 'sourceRefs'].includes(field)) return Array.isArray(issue[field]);
    return issue[field] !== null && issue[field] !== undefined && issue[field] !== '';
});

const issueList = (issues) => Array.isArray(issues) ? issues : issues?.issues;

const matchesIssueFilter = (value, selected) => {
    if (!selected || (Array.isArray(selected) && !selected.length)) return true;
    return Array.isArray(selected) ? selected.includes(value) : value === selected;
};

export const filterP3Issues = (issues, filters = {}) => (issueList(issues) || [])
    .filter(isCompleteIssue)
    .filter((issue) => matchesIssueFilter(issue.category, filters.category))
    .filter((issue) => matchesIssueFilter(issue.ownerDepartment, filters.department || filters.ownerDepartment))
    .filter((issue) => matchesIssueFilter(issue.status, filters.status))
    .filter((issue) => matchesIssueFilter(issue.priority, filters.priority));

const formatIssueMetric = (metric) => {
    const value = formatValue(metric?.value);
    const target = metric?.target === undefined || metric?.target === null ? '' : `；目標：${formatValue(metric.target)}`;
    return `${text(metric?.key)}（${text(metric?.period)}）：${value}${target} ${text(metric?.unit, '')}`.trim();
};

const issueSourceLabel = (issue) => (Array.isArray(issue?.sourceRefs) ? issue.sourceRefs : [])
    .map((source) => `${text(source?.month)} ${text(source?.section, '')}`.trim())
    .filter(Boolean)
    .join('、');

const makeIssueCard = (issue, currentMonth) => {
    const card = create('article', 'bg-white border border-gray-200 p-5 shadow-sm');
    const currentSnapshot = (issue.monthlySnapshots || []).find((snapshot) => snapshot?.period === currentMonth);
    append(card,
        create('h3', 'text-lg font-bold text-gray-900 break-words', `${text(issue.id)}｜${text(issue.title)}`),
        create('p', 'mt-2 text-sm text-gray-600', `類別：${text(issue.category)}；優先級：${text(issue.priority)}；狀態：${text(issue.status)}`),
        create('p', 'mt-2 text-sm text-gray-700 break-words', `負責部門：${text(issue.ownerDepartment)}`),
        create('p', 'mt-2 text-sm text-gray-700 break-words', `證據來源月份：${issueSourceLabel(issue) || '—'}`),
        create('p', 'mt-2 text-sm text-gray-700 break-words', `建議行動：${text(issue.recommendedAction)}`),
        create('p', 'mt-2 text-sm text-gray-700 break-words', `追蹤指標：${(issue.trackingMetrics || []).map(formatIssueMetric).join('、') || '—'}`),
        create('p', 'mt-2 text-xs text-gray-600', `觀察視窗：${text(issue.firstSeenMonth)} 至 ${text(issue.lastSeenMonth)}`),
        create('p', 'mt-1 text-xs text-gray-600', `目前觀察月份：${text(currentMonth)}；本月值：${formatValue(currentSnapshot?.value)}`)
    );
    return card;
};

export const renderP3IssueTrackerUnavailable = (container, message = '營運問題 register 不可用') => {
    if (!container) return;
    const status = container.id === 'p3IssueStatus' ? container : container.querySelector?.('#p3IssueStatus');
    const grid = container.id === 'p3IssueGrid' ? container : container.querySelector?.('#p3IssueGrid');
    if (status) status.textContent = message;
    if (grid) grid.replaceChildren(create('p', 'p-4 border border-red-200 bg-red-50 text-red-800 text-sm', message));
};

export const renderP3IssueTracker = (container, issues, filters = {}, options = {}) => {
    if (!container) return;
    const grid = container.id === 'p3IssueGrid' ? container : container.querySelector?.('#p3IssueGrid');
    const count = container.id === 'p3IssueResultCount' ? container : container.querySelector?.('#p3IssueResultCount');
    const status = container.id === 'p3IssueStatus' ? container : container.querySelector?.('#p3IssueStatus');
    const allIssues = issueList(issues) || [];
    const invalidCount = allIssues.filter((issue) => !isCompleteIssue(issue)).length;
    const filtered = filterP3Issues(allIssues, filters);
    if (grid) {
        if (!filtered.length) {
            const message = allIssues.length
                ? '沒有符合目前篩選條件的營運問題。'
                : '目前沒有營運問題。';
            grid.replaceChildren(create('p', 'p-4 border border-gray-200 bg-gray-50 text-gray-600 text-sm', message));
        } else {
            grid.replaceChildren(...filtered.map((issue) => makeIssueCard(issue, options.currentMonth)));
        }
    }
    if (count) count.textContent = `顯示 ${filtered.length} 筆問題`;
    if (status) status.textContent = invalidCount ? `已排除 ${invalidCount} 筆不完整問題資料。` : `已載入 ${allIssues.length} 筆問題。`;
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

const makeComparisonCell = (row, field, deltaField) => {
    const cell = create('td', 'px-3 py-3 align-top text-sm');
    const base = row?.base?.[field];
    const compare = row?.compare?.[field];
    append(cell,
        create('div', 'text-gray-700', `基準月：${formatValue(base)}`),
        create('div', 'text-gray-700', `比較月：${formatValue(compare)}`),
        create('div', 'font-semibold text-gray-900', `Delta：${formatValue(row?.[deltaField])}`)
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
            row: (item) => {
                const tr = create('tr', 'border-t border-gray-100');
                append(tr,
                    create('td', 'px-3 py-3 align-top', undefined),
                    create('td', 'px-3 py-3 align-top font-semibold text-gray-900 break-words', item?.key),
                    create('td', 'px-3 py-3 align-top text-sm', `基準月：${formatValue(item?.baseRank)}；比較月：${formatValue(item?.compareRank)}；Delta：${formatValue(item?.rankDelta)}`),
                    makeComparisonCell(item, 'score', 'scoreDelta'),
                    makeComparisonCell(item, 'n', 'nDelta')
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
                        create('td', 'px-3 py-3 align-top text-sm', `基準月：${formatValue(item?.baseRank)}；比較月：${formatValue(item?.compareRank)}；Delta：${formatValue(item?.rankDelta)}`),
                        makeComparisonCell(item, 'value', 'valueDelta'),
                        makeComparisonCell(item, 'rate', 'rateDelta')
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
                        makeComparisonCell(item, 'count', 'countDelta'),
                        makeComparisonCell(item, 'rate', 'rateDelta')
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

const VALUE_CHAIN_STAGE_LABELS = {
    recommendation_intention: '推薦意願',
    long_feedback_sentiment: '長評情緒',
    member_status: '會員狀態',
    message_consent: '訊息同意',
    repeat_customer: '回訪客群'
};

const valueChainStatusLabel = (status) => ({
    complete: '完整：目前資料可呈現已觀察的價值鏈路',
    partial: '部分完整：僅呈現有資料支持的階段與連結',
    unavailable: '不可用：目前沒有足夠的 P3 資料'
}[status] || '不可用：P3 資料狀態未定義');

const sourceRefsPresent = (value) => Array.isArray(value) && value.length > 0;

export const getP3CustomerValueChainViewModel = (snapshot) => {
    const chain = snapshot?.customerValueChain;
    const allowedStatuses = new Set(['complete', 'partial', 'unavailable']);
    const initialStatus = allowedStatuses.has(chain?.status) ? chain.status : 'unavailable';
    const unavailable = [
        ...(Array.isArray(chain?.unavailable) ? chain.unavailable : chain?.unavailable ? [chain.unavailable] : []),
        ...(Array.isArray(chain?.unavailableLinks) ? chain.unavailableLinks : [])
    ].filter(Boolean).map(String);
    const stages = Array.isArray(chain?.stages)
        ? chain.stages.filter(stage => stage && typeof stage === 'object').map(stage => ({
            ...stage,
            label: stage.label || VALUE_CHAIN_STAGE_LABELS[stage.key] || text(stage.key)
        }))
        : [];
    const links = [];
    (Array.isArray(chain?.links) ? chain.links : []).forEach((link) => {
        if (link && sourceRefsPresent(link.sourceRefs)) {
            links.push(link);
            return;
        }
        const linkKey = link?.key || `${text(link?.from, 'unknown')} to ${text(link?.to, 'unknown')}`;
        unavailable.push(`連結 ${linkKey} 缺少 sourceRefs，未呈現。`);
    });
    const status = initialStatus === 'complete' && unavailable.length ? 'partial' : initialStatus;
    return {
        period: snapshot?.period || null,
        status,
        stages,
        links,
        unavailable: [...new Set(unavailable)]
    };
};

const valueChainTarget = (container, selector) => container?.matches?.(selector)
    ? container
    : container?.querySelector?.(selector);

const renderValueChainItems = (target, items, builder, emptyMessage) => {
    if (!target) return;
    target.replaceChildren(...(items.length ? items.map(builder) : [
        create('p', 'p-4 border border-gray-200 bg-gray-50 text-gray-600 text-sm', emptyMessage)
    ]));
};

export const renderP3CustomerValueChainUnavailable = (container, message = '客戶價值鏈路資料不可用') => {
    if (!container) return;
    const status = valueChainTarget(container, '#p3ValueChainStatus');
    const stages = valueChainTarget(container, '#p3ValueChainStages');
    const links = valueChainTarget(container, '#p3ValueChainLinks');
    const unavailable = valueChainTarget(container, '#p3ValueChainUnavailable');
    if (status) status.textContent = message;
    if (stages) stages.replaceChildren();
    if (links) links.replaceChildren();
    if (unavailable) unavailable.replaceChildren(create('p', 'p-4 border border-red-200 bg-red-50 text-red-800 text-sm', message));
};

export const renderP3CustomerValueChain = (container, snapshot) => {
    if (!container) return;
    const model = getP3CustomerValueChainViewModel(snapshot);
    if (model.status === 'unavailable') {
        renderP3CustomerValueChainUnavailable(container, `不可用：${model.unavailable.join('；') || valueChainStatusLabel(model.status)}`);
        return;
    }
    const status = valueChainTarget(container, '#p3ValueChainStatus');
    const stages = valueChainTarget(container, '#p3ValueChainStages');
    const links = valueChainTarget(container, '#p3ValueChainLinks');
    const unavailable = valueChainTarget(container, '#p3ValueChainUnavailable');
    if (status) status.textContent = valueChainStatusLabel(model.status);
    renderValueChainItems(stages, model.stages, (stage) => create(
        'article', 'bg-white border border-gray-200 p-4 min-w-0',
        `${text(stage.label)}：${formatValue(stage.value)}${stage.unit ? `（${stage.unit}）` : ''}${stage.n !== undefined ? `；N=${formatValue(stage.n)}` : ''}`
    ), '目前沒有可觀察的價值鏈階段。');
    renderValueChainItems(links, model.links, (link) => create(
        'article', 'bg-white border border-green-200 p-4 min-w-0',
        `${text(link.label || link.key)}：${formatValue(link.value)}（來源 ${link.sourceRefs.map(source => `${text(source.month)} ${text(source.path || source.section, '')}`).join('、')}）`
    ), '目前沒有具備 sourceRefs 的價值鏈連結。');
    if (unavailable) {
        unavailable.replaceChildren(...(model.unavailable.length
            ? model.unavailable.map(reason => create('p', 'text-sm text-amber-800', reason))
            : [create('p', 'text-sm text-gray-600', '沒有額外的不可用原因。')]));
    }
};

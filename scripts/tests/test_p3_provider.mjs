import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
    buildP3Comparison,
    createJsonP3DataProvider
} from '../../js/p3-data-provider.js';
import {
    filterP3Issues,
    renderP3IssueTracker,
    getP3CustomerValueChainViewModel,
    renderP3CustomerValueChain,
    renderP3CustomerValueChainUnavailable
} from '../../js/p3-renderers.js';

const issue = (overrides = {}) => ({
    id: 'ISSUE-SHOPPING-001',
    category: 'shopping',
    title: 'Shopping pressure',
    ownerDepartment: 'Product Operations',
    priority: 'high',
    status: 'open',
    recommendedAction: 'Review the route and follow-up checks.',
    trackingMetrics: [{ key: 'shopping_rate', period: '202605', value: 0.2, target: 0.1, unit: 'rate' }],
    firstSeenMonth: '202604',
    lastSeenMonth: '202605',
    monthlySnapshots: [{ period: '202605', value: 0.2 }],
    sourceRefs: [{ kind: 'month', month: '202605', path: 'data/202605.json#/rawFeedbacks/1' }],
    ...overrides
});

const fakeDocument = {
    createElement(tag) {
        return {
            tagName: tag,
            children: [],
            className: '',
            textContent: '',
            appendChild(child) { this.children.push(child); return child; },
            replaceChildren(...children) { this.children = children; },
            querySelector() { return null; }
        };
    }
};

const snapshot = (period, overrides = {}) => ({
    version: '1.0',
    period,
    sampleSize: 10,
    metrics: {
        nps: { value: period === '202605' ? 80 : 85, unit: 'score', n: 10, definition: 'nps' }
    },
    branchRanking: [
        { key: 'alpha', score: period === '202605' ? 4 : 5, n: 2 },
        ...(period === '202605' ? [{ key: 'removed', score: 3, n: 1 }] : [{ key: 'added', score: 2, n: 1 }])
    ],
    destinationDemand: [
        { key: 'japan', value: period === '202605' ? 10 : 14 },
        ...(period === '202605' ? [{ key: 'old', value: 2 }] : [{ key: 'new', value: 6 }])
    ],
    sentiment: [
        { key: 'positive', label: 'Positive', count: period === '202605' ? 6 : 7, rate: 0.6 },
        ...(period === '202605' ? [{ key: 'negative', label: 'Negative', count: 4, rate: 0.4 }] : [{ key: 'suggestion', label: 'Suggestion', count: 3, rate: 0.3 }])
    ],
    customerValueChain: {
        status: 'partial',
        stages: [{ key: 'recommendation', value: 8 }],
        links: [],
        unavailable: false,
        unavailableLinks: ['recommendation_to_consent']
    },
    ...overrides
});

const valueChainSnapshot = (overrides = {}) => ({
    period: '202605',
    customerValueChain: {
        status: 'complete',
        stages: [
            { key: 'recommendation_intention', label: '推薦意願', value: 8, unit: 'count', n: 10, sourceRefs: [{ month: '202605', path: 'p3#/stages/0' }] },
            { key: 'long_feedback_sentiment', label: '長評情緒', value: 'positive', n: 7, sourceRefs: [{ month: '202605', path: 'p3#/stages/1' }] },
            { key: 'member_status', label: '會員狀態', value: 'member', n: 6, sourceRefs: [{ month: '202605', path: 'p3#/stages/2' }] },
            { key: 'message_consent', label: '訊息同意', value: 5, unit: 'count', n: 10, sourceRefs: [{ month: '202605', path: 'p3#/stages/3' }] },
            { key: 'repeat_customer', label: '回訪客群', value: 3, unit: 'count', n: 10, sourceRefs: [{ month: '202605', path: 'p3#/stages/4' }] }
        ],
        links: [{
            key: 'recommendation_to_member',
            from: 'recommendation_intention',
            to: 'member_status',
            label: '推薦意願至會員狀態',
            value: 4,
            sourceRefs: [{ month: '202605', path: 'p3#/links/0' }]
        }],
        unavailable: []
    },
    ...overrides
});

test('loads the manifest P3 path with no-store and returns parsed JSON', async () => {
    const calls = [];
    const expected = snapshot('202605');
    const provider = createJsonP3DataProvider({
        basePath: './data/',
        getMonthEntry: () => ({ p3: { status: 'ready', path: 'p3/monthly/202605.json' } }),
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, status: 200, json: async () => expected };
        }
    });

    assert.deepEqual(await provider.loadP3Month('202605'), expected);
    assert.deepEqual(calls, [{
        url: './data/p3/monthly/202605.json',
        options: { cache: 'no-store' }
    }]);
});

test('throws a structured month-key error when a P3 response fails', async () => {
    const provider = createJsonP3DataProvider({
        getMonthEntry: () => ({ p3: { status: 'ready', path: 'p3/monthly/missing.json' } }),
        fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) })
    });

    await assert.rejects(
        provider.loadP3Month('202605'),
        (error) => error.code === 'P3_MONTH_LOAD_FAILED'
            && error.monthKey === '202605'
            && error.status === 404
    );
});

test('returns structured malformed JSON errors and unavailable state for missing paths', async () => {
    const malformed = createJsonP3DataProvider({
        getMonthEntry: () => ({ p3: { status: 'ready', path: 'p3/monthly/bad.json' } }),
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } })
    });
    await assert.rejects(malformed.loadP3Month('202605'), (error) => error.code === 'P3_MONTH_JSON_INVALID');

    const unavailable = createJsonP3DataProvider({ getMonthEntry: () => ({}) });
    assert.deepEqual(await unavailable.loadP3Month('202605'), {
        status: 'unavailable',
        monthKey: '202605',
        reason: 'p3_path_unavailable'
    });
});

test('loads the issue register through its configured path', async () => {
    const provider = createJsonP3DataProvider({
        basePath: '/assets/data',
        getMonthEntry: () => ({}),
        fetchImpl: async (url) => ({ ok: true, status: 200, json: async () => ({ url }) })
    });

    assert.deepEqual(await provider.loadP3Issues(), { url: '/assets/data/p3/issues.json' });
});

test('filters issues by category and open status, while no filters keep the full register', () => {
    const issues = [issue(), issue({ id: 'ISSUE-HOTEL-001', category: 'hotel', status: 'monitoring' })];

    assert.deepEqual(filterP3Issues(issues, { category: 'shopping' }).map(item => item.id), ['ISSUE-SHOPPING-001']);
    assert.deepEqual(filterP3Issues(issues, { status: 'open' }).map(item => item.id), ['ISSUE-SHOPPING-001']);
    assert.equal(filterP3Issues(issues, {}).length, 2);
});

test('omits incomplete issues and exposes validation error in the tracker status', () => {
    const container = fakeDocument.createElement('section');
    container.querySelector = (selector) => selector === '#p3IssueGrid'
        ? container.grid
        : selector === '#p3IssueResultCount' ? container.count : container.status;
    container.grid = fakeDocument.createElement('div');
    container.count = fakeDocument.createElement('span');
    container.status = fakeDocument.createElement('p');
    global.document = fakeDocument;

    renderP3IssueTracker(container, [issue(), { id: 'BROKEN', category: 'shopping' }], {});

    assert.match(container.status.textContent, /不完整/);
    assert.match(container.count.textContent, /1/);
    assert.equal(container.grid.children.length, 1);
});

test('renders department, action, tracking metric and observation fields', () => {
    const container = fakeDocument.createElement('section');
    container.querySelector = (selector) => selector === '#p3IssueGrid' ? container.grid : container.status;
    container.grid = fakeDocument.createElement('div');
    container.status = fakeDocument.createElement('p');
    global.document = fakeDocument;

    renderP3IssueTracker(container, [issue()], {});

    const cardText = JSON.stringify(container.grid.children[0]);
    assert.match(cardText, /Product Operations/);
    assert.match(cardText, /Review the route/);
    assert.match(cardText, /shopping_rate/);
    assert.match(cardText, /202604/);
    assert.match(cardText, /202605/);
});

test('renders distinct empty states for an empty register and a filter with no matches', () => {
    const makeContainer = () => {
        const container = fakeDocument.createElement('section');
        container.querySelector = (selector) => selector === '#p3IssueGrid'
            ? container.grid
            : selector === '#p3IssueResultCount' ? container.count : container.status;
        container.grid = fakeDocument.createElement('div');
        container.count = fakeDocument.createElement('span');
        container.status = fakeDocument.createElement('p');
        return container;
    };
    global.document = fakeDocument;

    const emptyRegister = makeContainer();
    renderP3IssueTracker(emptyRegister, [], {});
    assert.equal(emptyRegister.grid.children.length, 1);
    assert.match(emptyRegister.grid.children[0].textContent, /沒有營運問題/);

    const noMatch = makeContainer();
    renderP3IssueTracker(noMatch, [issue()], { category: 'hotel' });
    assert.equal(noMatch.grid.children.length, 1);
    assert.match(noMatch.grid.children[0].textContent, /沒有符合目前篩選條件/);
});

test('builds metric deltas and stable-key row statuses', () => {
    const result = buildP3Comparison(snapshot('202605'), snapshot('202606'));

    assert.equal(result.baseMonth, '202605');
    assert.equal(result.compareMonth, '202606');
    assert.equal(result.metrics.nps.delta, 5);
    assert.equal(result.metrics.nps.percentageDelta, 6.25);

    assert.deepEqual(result.branchRanking.map((row) => [row.key, row.status]), [
        ['alpha', 'both'], ['removed', 'removed'], ['added', 'added']
    ]);
    assert.equal(result.branchRanking[0].delta, 1);
    assert.equal(result.branchRanking[0].scoreDelta, 1);
    assert.equal(result.branchRanking[0].nDelta, 0);
    assert.equal(result.branchRanking[0].baseRank, 1);
    assert.equal(result.branchRanking[0].compareRank, 1);
    assert.equal(result.branchRanking[0].rank, 1);
    assert.equal(result.branchRanking[0].rankDelta, 0);
    assert.deepEqual(result.destinationDemand.map((row) => [row.key, row.status]), [
        ['japan', 'both'], ['old', 'removed'], ['new', 'added']
    ]);
    assert.equal(result.destinationDemand[0].valueDelta, 4);
    assert.equal(result.destinationDemand[0].rateDelta, null);
    assert.deepEqual(result.sentiment.map((row) => [row.key, row.status]), [
        ['positive', 'both'], ['negative', 'removed'], ['suggestion', 'added']
    ]);
    assert.equal(result.sentiment[0].countDelta, 1);
    assert.equal(result.sentiment[0].rateDelta, 0);
});

test('uses explicit source ranks and preserves unavailable field deltas', () => {
    const result = buildP3Comparison(
        snapshot('202605', {
            branchRanking: [{ key: 'alpha', rank: 4, score: 4, n: 2 }],
            destinationDemand: [{ key: 'japan', rank: 7, value: 10, rate: 0.5 }],
            sentiment: [{ key: 'positive', count: 2 }]
        }),
        snapshot('202606', {
            branchRanking: [{ key: 'alpha', rank: 2, score: 5, n: 3 }],
            destinationDemand: [{ key: 'japan', rank: 3, value: 14 }],
            sentiment: [{ key: 'positive', count: 3 }]
        })
    );

    assert.deepEqual(result.branchRanking[0], {
        key: 'alpha',
        status: 'both',
        base: result.branchRanking[0].base,
        compare: result.branchRanking[0].compare,
        delta: 1,
        scoreDelta: 1,
        nDelta: 1,
        rank: 2,
        baseRank: 4,
        compareRank: 2,
        rankDelta: -2
    });
    assert.equal(result.destinationDemand[0].baseRank, 7);
    assert.equal(result.destinationDemand[0].compareRank, 3);
    assert.equal(result.destinationDemand[0].rankDelta, -4);
    assert.equal(result.destinationDemand[0].rateDelta, null);
    assert.equal(result.sentiment[0].countDelta, 1);
    assert.equal(result.sentiment[0].rateDelta, null);
});

test('omits percentage delta for zero base and preserves unavailable customer links', () => {
    const result = buildP3Comparison(
        snapshot('202605', {
            metrics: { zero: { value: 0, unit: 'rate', n: 0, definition: 'zero' } },
            customerValueChain: { status: 'unavailable', stages: [], links: [], unavailable: true, unavailableLinks: ['consent_to_repeat_purchase'] }
        }),
        snapshot('202606', {
            metrics: { zero: { value: 2, unit: 'rate', n: 10, definition: 'zero' } },
            customerValueChain: { status: 'unavailable', stages: [], links: [], unavailable: true, unavailableLinks: ['consent_to_repeat_purchase'] }
        })
    );

    assert.equal(result.metrics.zero.delta, 2);
    assert.equal(Object.hasOwn(result.metrics.zero, 'percentageDelta'), false);
    assert.equal(result.customerValueChain.status, 'unavailable');
    assert.deepEqual(result.customerValueChain.unavailableLinks, ['consent_to_repeat_purchase']);
    assert.deepEqual(result.customerValueChain.links, []);
});

test('marks aligned rows unavailable when their comparison value is unavailable', () => {
    const result = buildP3Comparison(
        snapshot('202605', { branchRanking: [{ key: 'alpha' }] }),
        snapshot('202606', { branchRanking: [{ key: 'alpha' }] })
    );

    assert.equal(result.branchRanking[0].status, 'unavailable');
});

test('preserves unknown customer chain statuses without deriving complete', () => {
    const result = buildP3Comparison(
        snapshot('202605', {
            customerValueChain: { status: 'observed_unknown', stages: [], links: [], unavailableLinks: ['unknown_link'] }
        }),
        snapshot('202606', {
            customerValueChain: { stages: [], links: [], unavailableLinks: ['missing_link'] }
        })
    );

    assert.equal(result.customerValueChain.status, 'unavailable');
    assert.equal(result.customerValueChain.base.status, 'observed_unknown');
    assert.equal(Object.hasOwn(result.customerValueChain.compare, 'status'), false);
    assert.equal(result.customerValueChain.baseStatus, 'observed_unknown');
    assert.equal(result.customerValueChain.compareStatus, 'unknown');
    assert.deepEqual(result.customerValueChain.unavailableLinks, ['unknown_link', 'missing_link']);
});

test('keeps P3 lifecycle work off the existing dashboard critical path', () => {
    const appSource = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');

    assert.doesNotMatch(appSource, /await initializeP3Provider\(\)/);
    assert.doesNotMatch(appSource, /await refreshP3ForMonth\(monthKey\)/);
    assert.match(appSource, /P3State\.onUpdate/);
});

test('builds a complete customer value chain view model from observed stages and sourced links', () => {
    const model = getP3CustomerValueChainViewModel(valueChainSnapshot());

    assert.equal(model.status, 'complete');
    assert.deepEqual(model.stages.map(stage => stage.key), [
        'recommendation_intention', 'long_feedback_sentiment', 'member_status',
        'message_consent', 'repeat_customer'
    ]);
    assert.equal(model.links.length, 1);
    assert.match(model.stages.find(stage => stage.key === 'repeat_customer').label, /回訪客群/);
    assert.doesNotMatch(JSON.stringify(model), /repeat_purchase/);

    const container = fakeDocument.createElement('section');
    const status = fakeDocument.createElement('p');
    const stages = fakeDocument.createElement('div');
    const links = fakeDocument.createElement('div');
    const unavailable = fakeDocument.createElement('div');
    container.querySelector = (selector) => ({
        '#p3ValueChainStatus': status,
        '#p3ValueChainStages': stages,
        '#p3ValueChainLinks': links,
        '#p3ValueChainUnavailable': unavailable
    }[selector]);
    global.document = fakeDocument;
    renderP3CustomerValueChain(container, valueChainSnapshot());
    assert.match(status.textContent, /完整/);
    assert.equal(stages.children.length, 5);
    assert.equal(links.children.length, 1);
});

test('preserves partial status and exact unavailable reasons without inventing links', () => {
    const partialSnapshot = valueChainSnapshot({
        customerValueChain: {
            status: 'partial',
            stages: [{ key: 'repeat_customer', label: '回訪客群', value: 3, sourceRefs: [] }],
            links: [],
            unavailable: ['consent_to_verified_future_repurchase: no joint source']
        }
    });
    const model = getP3CustomerValueChainViewModel(partialSnapshot);

    assert.equal(model.status, 'partial');
    assert.deepEqual(model.stages, []);
    assert.match(model.unavailable.join(' '), /stage repeat_customer 缺少有效 sourceRefs/);
    assert.deepEqual(model.links, []);
    assert.deepEqual(model.unavailable, [
        'consent_to_verified_future_repurchase: no joint source',
        'stage repeat_customer 缺少有效 sourceRefs，未呈現。'
    ]);

    const container = fakeDocument.createElement('section');
    const status = fakeDocument.createElement('p');
    const stages = fakeDocument.createElement('div');
    const links = fakeDocument.createElement('div');
    const unavailable = fakeDocument.createElement('div');
    container.querySelector = (selector) => ({
        '#p3ValueChainStatus': status,
        '#p3ValueChainStages': stages,
        '#p3ValueChainLinks': links,
        '#p3ValueChainUnavailable': unavailable
    }[selector]);
    global.document = fakeDocument;
    renderP3CustomerValueChain(container, partialSnapshot);
    assert.match(status.textContent, /部分完整/);
    assert.match(JSON.stringify(unavailable), /consent_to_verified_future_repurchase/);
});

test('renders unavailable customer chain with no fabricated link', () => {
    const container = fakeDocument.createElement('section');
    const status = fakeDocument.createElement('p');
    const stages = fakeDocument.createElement('div');
    const links = fakeDocument.createElement('div');
    const unavailable = fakeDocument.createElement('div');
    container.querySelector = (selector) => ({
        '#p3ValueChainStatus': status,
        '#p3ValueChainStages': stages,
        '#p3ValueChainLinks': links,
        '#p3ValueChainUnavailable': unavailable
    }[selector]);
    global.document = fakeDocument;

    renderP3CustomerValueChain(container, {
        period: '202604',
        customerValueChain: { status: 'unavailable', stages: [], links: [], unavailable: ['P3 snapshot missing'] }
    });

    assert.match(status.textContent, /unavailable|不可用/i);
    assert.equal(links.children.length, 0);
    assert.match(JSON.stringify(unavailable), /P3 snapshot missing/);
});

test('requires sourceRefs before a customer value chain link can render', () => {
    const model = getP3CustomerValueChainViewModel(valueChainSnapshot({
        customerValueChain: {
            status: 'complete',
            stages: [],
            links: [{ key: 'unsupported', from: 'a', to: 'b', value: 9, sourceRefs: [] }],
            unavailable: []
        }
    }));

    assert.deepEqual(model.links, []);
    assert.match(model.unavailable.join(' '), /sourceRefs|來源/);
});

test('explicit unavailable renderer keeps the value-chain tab isolated', () => {
    const container = fakeDocument.createElement('section');
    const status = fakeDocument.createElement('p');
    const unavailable = fakeDocument.createElement('div');
    container.querySelector = (selector) => selector === '#p3ValueChainStatus' ? status : unavailable;
    global.document = fakeDocument;

    renderP3CustomerValueChainUnavailable(container, '沒有 P3 snapshot');

    assert.equal(status.textContent, '沒有 P3 snapshot');
    assert.match(JSON.stringify(unavailable), /沒有 P3 snapshot/);
});

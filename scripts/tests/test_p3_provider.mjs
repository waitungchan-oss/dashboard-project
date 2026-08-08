import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildP3Comparison,
    createJsonP3DataProvider
} from '../../js/p3-data-provider.js';

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
    assert.deepEqual(result.destinationDemand.map((row) => [row.key, row.status]), [
        ['japan', 'both'], ['old', 'removed'], ['new', 'added']
    ]);
    assert.deepEqual(result.sentiment.map((row) => [row.key, row.status]), [
        ['positive', 'both'], ['negative', 'removed'], ['suggestion', 'added']
    ]);
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

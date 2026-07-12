'use strict';
require('../src/test/setup');
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const React = require('react');
const { renderHook, act, cleanup } = require('@testing-library/react');

afterEach(() => {
  cleanup();
  global.__resetBrowserMocks();
});

function fakeRowRefs(rects) {
  const map = new Map();
  for (const [agent, rect] of Object.entries(rects)) {
    map.set(agent, { getBoundingClientRect: () => rect });
  }
  return { current: map };
}

const RECT = { top: 100, right: 200, height: 40 };

test('useBursts: first snapshot never fires a burst (previous === undefined)', async () => {
  const { useBursts } = await import('../src/hooks/useBursts.js');
  const rowRefs = fakeRowRefs({ Alpet: RECT });
  const { result } = renderHook(() => useBursts(rowRefs));

  act(() => {
    result.current.syncBursts([{ agent: 'Alpet', solved: 3 }]);
  });

  assert.strictEqual(result.current.bursts.length, 0);
});

test('useBursts: an increased solved count fires a burst positioned at the row', async () => {
  const { useBursts } = await import('../src/hooks/useBursts.js');
  const rowRefs = fakeRowRefs({ Alpet: RECT });
  const { result } = renderHook(() => useBursts(rowRefs));

  act(() => { result.current.syncBursts([{ agent: 'Alpet', solved: 3 }]); });
  act(() => { result.current.syncBursts([{ agent: 'Alpet', solved: 4 }]); });

  assert.strictEqual(result.current.bursts.length, 1);
  assert.strictEqual(result.current.bursts[0].x, RECT.right - 48);
  assert.strictEqual(result.current.bursts[0].y, RECT.top + RECT.height / 2);
  assert.ok(Array.isArray(result.current.bursts[0].particles));
});

test('useBursts: an unchanged or decreased solved count does not fire a burst', async () => {
  const { useBursts } = await import('../src/hooks/useBursts.js');
  const rowRefs = fakeRowRefs({ Alpet: RECT });
  const { result } = renderHook(() => useBursts(rowRefs));

  act(() => { result.current.syncBursts([{ agent: 'Alpet', solved: 5 }]); });
  act(() => { result.current.syncBursts([{ agent: 'Alpet', solved: 5 }]); });
  assert.strictEqual(result.current.bursts.length, 0);

  act(() => { result.current.syncBursts([{ agent: 'Alpet', solved: 2 }]); });
  assert.strictEqual(result.current.bursts.length, 0);
});

test('useBursts: resetBursts clears tracked solve counts so the next sync is treated as a first snapshot', async () => {
  const { useBursts } = await import('../src/hooks/useBursts.js');
  const rowRefs = fakeRowRefs({ Alpet: RECT });
  const { result } = renderHook(() => useBursts(rowRefs));

  act(() => { result.current.syncBursts([{ agent: 'Alpet', solved: 3 }]); });
  act(() => { result.current.resetBursts(); });
  act(() => { result.current.syncBursts([{ agent: 'Alpet', solved: 4 }]); });

  assert.strictEqual(result.current.bursts.length, 0);
});

test('useShockwave: fires (increments shock, sets shaking) only when effects contain an urgent monster_defeated', async () => {
  const { useShockwave } = await import('../src/hooks/useShockwave.js');

  const { result, rerender } = renderHook(({ effects }) => useShockwave(effects), {
    initialProps: { effects: [] }
  });

  assert.strictEqual(result.current.shock, 0);
  assert.strictEqual(result.current.shaking, false);

  rerender({ effects: [{ type: 'monster_defeated', priority: 'high' }] });
  assert.strictEqual(result.current.shock, 0);
  assert.strictEqual(result.current.shaking, false);

  rerender({ effects: [{ type: 'monster_spawned', priority: 'urgent' }] });
  assert.strictEqual(result.current.shock, 0);
  assert.strictEqual(result.current.shaking, false);

  rerender({ effects: [{ type: 'monster_defeated', priority: 'urgent' }] });
  assert.strictEqual(result.current.shock, 1);
  assert.strictEqual(result.current.shaking, true);
});

test('useShockwave: a second urgent defeat bumps the shock counter again', async () => {
  const { useShockwave } = await import('../src/hooks/useShockwave.js');

  const { result, rerender } = renderHook(({ effects }) => useShockwave(effects), {
    initialProps: { effects: [{ type: 'monster_defeated', priority: 'urgent' }] }
  });
  assert.strictEqual(result.current.shock, 1);

  rerender({ effects: [{ type: 'monster_defeated', priority: 'urgent', id: 2 }] });
  assert.strictEqual(result.current.shock, 2);
});

test('useShockwave: an unrelated effects update during the shake window does not stall shaking=false', async () => {
  const { useShockwave } = await import('../src/hooks/useShockwave.js');

  const { result, rerender } = renderHook(({ effects }) => useShockwave(effects), {
    initialProps: { effects: [] }
  });

  rerender({ effects: [{ type: 'monster_defeated', priority: 'urgent' }] });
  assert.strictEqual(result.current.shock, 1);
  assert.strictEqual(result.current.shaking, true);

  // An unrelated snapshot update lands mid-shake (new array reference, no urgent defeat).
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  rerender({ effects: [{ type: 'new_ticket' }] });
  assert.strictEqual(result.current.shock, 1);
  assert.strictEqual(result.current.shaking, true, 'unrelated effects update should not cancel the pending shake reset');

  // Wait past the original 600ms window (measured from the urgent defeat, not the unrelated update).
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 600)); });
  assert.strictEqual(result.current.shaking, false, 'shaking should reset even though an unrelated update occurred mid-window');
});

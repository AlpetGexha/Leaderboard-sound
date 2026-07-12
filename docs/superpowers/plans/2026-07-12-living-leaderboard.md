# Living Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the leaderboard itself the show — animated overtakes, particle bursts on every solve, streak "heat" auras that grow with kill tiers, and a screen-shaking shockwave when an urgent boss falls — so excitement comes from visuals instead of interrupting banners/audio.

**Architecture:** All effect math lives in a new pure module `src/domain/fx.js` (testable with node:test + jsdom setup, like the other domain files). Two new hooks (`useBursts`, `useShockwave`) adapt that math to React state, one new component (`FxLayer`) renders a fixed, pointer-events-none overlay, and CSS keyframes do the actual animation. The only backend change is one line in `lib/engine.js`: the `monster_defeated` effect gains a `priority` field so the frontend knows when an urgent boss died. Everything is gated by a new `features.livingBoard` config flag (default enabled when omitted, like the other fun features).

**Tech Stack:** React 18 (existing), plain CSS keyframes (no animation library), Node `node:test` via `npm test`. Backend is CommonJS, frontend is ESM — tests reach ESM via `require('../src/test/setup')` then dynamic `import()`.

**⚠️ Working-tree note:** The repo already has unrelated uncommitted modifications (see `git status`). At each commit step, stage **only the files named in that task** — never `git add -A`. Also: `dist/` shows churn after builds; do not commit build output.

---

### Task 1: Engine — carry `priority` on `monster_defeated` effects

The frontend needs to know an urgent ticket was solved to fire the shockwave. The engine already has the matched enemy (with priority) in scope.

**Files:**
- Modify: `lib/engine.js:212`
- Test: `tests/engine.test.js`

- [ ] **Step 1: Update the existing effect assertion and add an urgent test (they will fail)**

In `tests/engine.test.js`, find the test `'solving a spawned ticket defeats its matching monster, regardless of solver'` and change its assertion to expect the new field (created tickets default to `medium` priority):

```js
  assert.deepStrictEqual(resolved.effects, [
    { type: 'monster_defeated', ticketId: 'T-1', agent: 'Bajram', priority: 'medium' }
  ]);
```

Then add a new test right after it (uses the file's existing `AGENTS`, `ev`, `createDay`, `applyEvent` helpers):

```js
test('defeating an urgent monster reports urgent priority in the effect', () => {
  const s = createDay(AGENTS);
  applyEvent(s, { ...ev('ticket.created', 'Alpet', 'U-9', 1000, 'KFC'), priority: 'urgent' });
  const resolved = applyEvent(s, ev('ticket.resolved', 'Kushtrim', 'U-9', 2000, 'KFC'));
  assert.strictEqual(resolved.effects[0].priority, 'urgent');
});
```

- [ ] **Step 2: Run the engine tests to verify they fail**

Run: `node --import tsx --test tests/engine.test.js`
Expected: FAIL — `deepStrictEqual` mismatch (actual effect has no `priority`), and the new test fails with `undefined !== 'urgent'`.

- [ ] **Step 3: Add priority to the effect in the engine**

In `lib/engine.js` line 212, change the return of the resolved branch:

```js
    return {
      accepted: true, announcements,
      effects: matched
        ? [{ type: 'monster_defeated', ticketId: event.ticketId, agent: event.agent, priority: matched.priority || 'medium' }]
        : []
    };
```

(`matched` is the invasion enemy found earlier in this function; enemies already carry a `priority` field — see the invasion snapshot test.)

- [ ] **Step 4: Run the engine tests to verify they pass**

Run: `node --import tsx --test tests/engine.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/engine.js tests/engine.test.js
git commit -m "feat: report defeated monster priority in engine effects"
```

---

### Task 2: Domain FX math — `heatLevel` and `burstParticles`

Pure, deterministic math for the visual effects. `heatLevel` maps a solve count to an aura tier aligned with the kill tiers (3 = TRIPLE KILL → embers, 5 = UNSTOPPABLE → flames, 10 = GODLIKE → inferno). `burstParticles` generates particle descriptors with an injectable RNG so tests are deterministic.

**Files:**
- Create: `src/domain/fx.js`
- Test: `tests/fx.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/fx.test.js`:

```js
'use strict';
require('../src/test/setup');
const { test } = require('node:test');
const assert = require('node:assert');

test('heatLevel maps solve counts onto kill-tier auras', async () => {
  const { heatLevel } = await import('../src/domain/fx.js');
  assert.strictEqual(heatLevel(0), 0);
  assert.strictEqual(heatLevel(2), 0);
  assert.strictEqual(heatLevel(3), 1);
  assert.strictEqual(heatLevel(4), 1);
  assert.strictEqual(heatLevel(5), 2);
  assert.strictEqual(heatLevel(9), 2);
  assert.strictEqual(heatLevel(10), 3);
  assert.strictEqual(heatLevel(25), 3);
});

test('burstParticles is deterministic under an injected rng and stays in range', async () => {
  const { burstParticles } = await import('../src/domain/fx.js');
  const rng = () => 0.5;
  const a = burstParticles(12, rng);
  const b = burstParticles(12, rng);
  assert.strictEqual(a.length, 12);
  assert.deepStrictEqual(a, b);
  for (const p of a) {
    assert.strictEqual(typeof p.dx, 'number');
    assert.strictEqual(typeof p.dy, 'number');
    const distance = Math.hypot(p.dx, p.dy);
    assert.ok(distance >= 35 && distance <= 115, `distance ${distance} out of range`);
    assert.ok(p.size >= 4 && p.size <= 10, `size ${p.size} out of range`);
    assert.ok(p.durationMs >= 500 && p.durationMs <= 900, `duration ${p.durationMs} out of range`);
  }
});

test('burstParticles defaults to 14 particles', async () => {
  const { burstParticles } = await import('../src/domain/fx.js');
  assert.strictEqual(burstParticles().length, 14);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test tests/fx.test.js`
Expected: FAIL — cannot find module `../src/domain/fx.js`.

- [ ] **Step 3: Implement `src/domain/fx.js`**

```js
export function heatLevel(solved) {
  if (solved >= 10) return 3;
  if (solved >= 5) return 2;
  if (solved >= 3) return 1;
  return 0;
}

export function burstParticles(count = 14, random = Math.random) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + random() * 0.5;
    const distance = 40 + random() * 70;
    return {
      id: i,
      dx: Math.round(Math.cos(angle) * distance),
      dy: Math.round(Math.sin(angle) * distance),
      size: Math.round(4 + random() * 6),
      durationMs: Math.round(500 + random() * 400)
    };
  });
}
```

(Rounding `dx`/`dy` can shift distance by up to ~0.71px from the 40–110 raw range, hence the 35–115 tolerance in the test.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test tests/fx.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/fx.js tests/fx.test.js
git commit -m "feat: add pure fx math for heat tiers and particle bursts"
```

---

### Task 3: Heat auras on board rows

Rows visually "heat up" with the agent's solve count. Component + CSS only; the logic was tested in Task 2. This repo does not render-test components, so this task is verified visually in Task 8.

**Files:**
- Modify: `src/components/Leaderboard.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add the heat class to rows**

In `src/components/Leaderboard.jsx`, import the helper and extend the row class list. `fxEnabled` defaults to `true`; App passes the real flag in Task 6 so `features.livingBoard: false` also disables heat auras:

```jsx
import React from 'react';
import { heatLevel } from '../domain/fx.js';

export function Leaderboard({ rows, rowRefs, scoredAgents, onScoreAnimationEnd, fxEnabled = true }) {
  return (
    <section className="board-wrap">
      <ol className="board">
        {rows.map(row => {
          const heat = fxEnabled ? heatLevel(row.solved) : 0;
          return (
            <li
              key={row.agent}
              ref={node => {
                if (node) rowRefs.current.set(row.agent, node);
                else rowRefs.current.delete(row.agent);
              }}
              className={[
                'board-row',
                row.rank === 1 && row.solved > 0 ? 'top1' : '',
                scoredAgents.has(row.agent) ? 'scored' : '',
                heat ? `heat-${heat}` : ''
              ].filter(Boolean).join(' ')}
              data-agent={row.agent}
              onAnimationEnd={() => onScoreAnimationEnd(row.agent)}
            >
              <span className="rank">#{row.rank}</span>
              <span className="agent">{row.agent} {row.streak ? <span className="streak-badge">*</span> : null}</span>
              <span className="solved">{row.solved}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
```

- [ ] **Step 2: Add heat CSS**

In `src/styles.css`, directly after the `.board-row.moving` rule, add:

```css
.board-row.heat-1 .solved { color: #ffb85c; text-shadow: 0 0 12px rgba(255,160,60,.75); }
.board-row.heat-2 { border-color: rgba(255,120,30,.65); }
.board-row.heat-2 .solved { color: #ff8a3c; text-shadow: 0 0 14px rgba(255,120,30,.9); }
.board-row.heat-2::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, transparent 55%, rgba(255,120,30,.14));
  animation: heatShimmer 2.2s ease-in-out infinite;
}
.board-row.heat-3 { border-color: var(--accent); }
.board-row.heat-3 .solved { color: var(--accent); text-shadow: 0 0 16px rgba(255,59,59,.95); }
.board-row.heat-3::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, transparent 45%, rgba(255,59,59,.20));
  animation: heatShimmer 1.3s ease-in-out infinite;
}
@keyframes heatShimmer { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
```

(`.board-row` already has `position: relative; overflow: hidden`, so the `::before` overlay clips to the row.)

- [ ] **Step 3: Run the full suite to confirm nothing broke**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/Leaderboard.jsx src/styles.css
git commit -m "feat: heat auras on leaderboard rows keyed to kill tiers"
```

---

### Task 4: Overtake trails in the FLIP animation

When ranks change, the existing FLIP animation slides rows. Add direction classes so a climbing row leaves a green glow and a falling row briefly dims red.

**Files:**
- Modify: `src/hooks/useFlipAnimation.js`
- Modify: `src/styles.css`

- [ ] **Step 1: Add direction classes in `applyFlip`**

In `src/hooks/useFlipAnimation.js`, replace the body of `applyFlip` (`delta > 0` means the row's old position was lower on screen, i.e. it moved **up**):

```js
  const applyFlip = useCallback(() => {
    const oldTops = oldTopsRef.current;
    for (const [agent, node] of rowRefs.current.entries()) {
      const oldTop = oldTops[agent];
      if (oldTop === undefined) continue;
      const delta = oldTop - node.getBoundingClientRect().top;
      if (!delta) continue;
      const direction = delta > 0 ? 'moving-up' : 'moving-down';
      node.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        node.classList.add('moving', direction);
        node.style.transform = '';
        node.addEventListener('transitionend', () => node.classList.remove('moving', direction), { once: true });
      });
    }
  }, []);
```

- [ ] **Step 2: Add the trail CSS**

In `src/styles.css`, directly after `.board-row.moving`:

```css
.board-row.moving-up {
  border-color: var(--green);
  box-shadow: 0 14px 30px -12px rgba(61,214,140,.55), 0 0 18px rgba(61,214,140,.35);
}
.board-row.moving-down { filter: saturate(.6) brightness(.85); }
```

(The `transition` on `.board-row` already animates `border-color`; `box-shadow`/`filter` snap on and disappear when the class is removed at `transitionend` — a deliberate "streak past" flash.)

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFlipAnimation.js src/styles.css
git commit -m "feat: directional glow trails on rank overtakes"
```

---

### Task 5: FX guard — `isUrgentDefeat`

A pure predicate (gates the shockwave effect), following the repo's guards pattern.

**Files:**
- Create: `src/guards/fxGuards.js`
- Test: `tests/guards.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/guards.test.js`:

```js
test('isUrgentDefeat fires only for urgent monster_defeated effects', async () => {
  const { isUrgentDefeat } = await import('../src/guards/fxGuards.js');
  assert.strictEqual(isUrgentDefeat({ type: 'monster_defeated', priority: 'urgent' }), true);
  assert.strictEqual(isUrgentDefeat({ type: 'monster_defeated', priority: 'medium' }), false);
  assert.strictEqual(isUrgentDefeat({ type: 'monster_defeated' }), false);
  assert.strictEqual(isUrgentDefeat({ type: 'monster_spawned', priority: 'urgent' }), false);
  assert.strictEqual(isUrgentDefeat(null), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test tests/guards.test.js`
Expected: FAIL — cannot find module `../src/guards/fxGuards.js`. (Pre-existing guard tests still pass.)

- [ ] **Step 3: Implement `src/guards/fxGuards.js`**

```js
export function isUrgentDefeat(effect) {
  return effect?.type === 'monster_defeated' && effect.priority === 'urgent';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx --test tests/guards.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/guards/fxGuards.js tests/guards.test.js
git commit -m "feat: add urgent-defeat fx guard"
```

---

### Task 6: Hooks + FxLayer + wiring in App

Two hooks adapt effects to React state; `FxLayer` renders a fixed pointer-events-none overlay. Hooks are thin DOM/React glue over the tested domain/guard code — the repo has no hook-render test setup, so these are verified in Task 8.

**Files:**
- Create: `src/hooks/useBursts.js`
- Create: `src/hooks/useShockwave.js`
- Create: `src/components/FxLayer.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Create `src/hooks/useBursts.js`**

Mirrors `useScoreFlash`'s solved-count diffing so bursts fire exactly once per solve, independent of the pulse animation's clear timing. `syncBursts` must run after `applyFlip` (in the same layout effect) so row rects are final.

```js
import { useCallback, useRef, useState } from 'react';
import { burstParticles } from '../domain/fx.js';

let burstSeq = 0;

export function useBursts(rowRefs) {
  const [bursts, setBursts] = useState([]);
  const lastSolvedRef = useRef({});

  const syncBursts = useCallback(leaderboard => {
    const next = [];
    for (const row of leaderboard) {
      const previous = lastSolvedRef.current[row.agent];
      if (previous === undefined || row.solved <= previous) continue;
      const node = rowRefs.current.get(row.agent);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      next.push({
        id: `burst-${++burstSeq}`,
        x: rect.right - 48,
        y: rect.top + rect.height / 2,
        particles: burstParticles()
      });
    }
    lastSolvedRef.current = Object.fromEntries(leaderboard.map(row => [row.agent, row.solved]));
    if (!next.length) return;
    setBursts(current => [...current, ...next]);
    setTimeout(() => setBursts(current => current.filter(burst => !next.includes(burst))), 1100);
  }, [rowRefs]);

  const resetBursts = useCallback(() => { lastSolvedRef.current = {}; }, []);

  return { bursts, syncBursts, resetBursts };
}
```

- [ ] **Step 2: Create `src/hooks/useShockwave.js`**

```js
import { useEffect, useState } from 'react';
import { isUrgentDefeat } from '../guards/fxGuards.js';

export function useShockwave(effects) {
  const [shock, setShock] = useState(0);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!effects.some(isUrgentDefeat)) return undefined;
    setShock(id => id + 1);
    setShaking(true);
    const timer = setTimeout(() => setShaking(false), 600);
    return () => clearTimeout(timer);
  }, [effects]);

  return { shock, shaking };
}
```

(`shock` is a counter used as a render key so back-to-back urgent defeats restart the ring; `0` is falsy so nothing renders initially.)

- [ ] **Step 3: Create `src/components/FxLayer.jsx`**

```jsx
import React from 'react';

export function FxLayer({ bursts, shock }) {
  return (
    <div className="fx-layer" aria-hidden="true">
      {bursts.map(burst => (
        <div key={burst.id} className="fx-burst" style={{ left: burst.x, top: burst.y }}>
          {burst.particles.map(particle => (
            <span
              key={particle.id}
              className="fx-particle"
              style={{
                '--dx': `${particle.dx}px`,
                '--dy': `${particle.dy}px`,
                '--size': `${particle.size}px`,
                '--dur': `${particle.durationMs}ms`
              }}
            />
          ))}
        </div>
      ))}
      {shock ? <div key={shock} className="fx-shockwave" /> : null}
    </div>
  );
}
```

- [ ] **Step 4: Wire into `src/App.jsx`**

Add imports:

```jsx
import { useBursts } from './hooks/useBursts.js';
import { useShockwave } from './hooks/useShockwave.js';
import { FxLayer } from './components/FxLayer.jsx';
```

Inside `App()`, after the `useScoreFlash` line:

```jsx
  const { bursts, syncBursts, resetBursts } = useBursts(rowRefs);
```

In `onBeforeApply`, next to `resetScores()`:

```jsx
    if (next.dayRolled) { resetScores(); resetBursts(); }
```

(Replace the existing `if (next.dayRolled) resetScores();` line.)

After the `useArenaSnapshot` call, add the shockwave hook and the feature gate:

```jsx
  const { shock, shaking } = useShockwave(snapshot?.effects || EMPTY_EFFECTS);
  const fxEnabled = snapshot?.config?.features?.livingBoard !== false;
```

Extend the layout effect so bursts measure rows after the FLIP settles:

```jsx
  useLayoutEffect(() => {
    if (!snapshot) return;
    applyFlip();
    syncSolved(snapshot.state.leaderboard);
    if (fxEnabled) syncBursts(snapshot.state.leaderboard);
  }, [snapshot, applyFlip, syncSolved, syncBursts, fxEnabled]);
```

Apply the shake class on the shell and render the layer (shell div and, right before `<TestPanel …/>`):

```jsx
      <div
        className={fxEnabled && shaking ? 'dashboard-shell shake' : 'dashboard-shell'}
        inert={!unlocked ? true : undefined}
        aria-hidden={!unlocked}
      >
```

```jsx
        {fxEnabled ? <FxLayer bursts={bursts} shock={shock} /> : null}
```

Finally pass the flag into the board so heat auras obey it too:

```jsx
          <Leaderboard
            rows={state.leaderboard}
            rowRefs={rowRefs}
            scoredAgents={scoredAgents}
            onScoreAnimationEnd={clearScored}
            fxEnabled={fxEnabled}
          />
```

- [ ] **Step 5: Add FX CSS**

Append to `src/styles.css` (before the `@media (prefers-reduced-motion: reduce)` block, which already neutralizes all of these for motion-sensitive users):

```css
.fx-layer { position: fixed; inset: 0; z-index: 55; pointer-events: none; }
.fx-burst { position: absolute; }
.fx-particle {
  position: absolute; width: var(--size); height: var(--size); border-radius: 50%;
  background: var(--green); box-shadow: 0 0 10px var(--green);
  animation: fxFly var(--dur) ease-out forwards;
}
@keyframes fxFly {
  from { opacity: 1; transform: translate(0, 0) scale(1); }
  to { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.25); }
}
.fx-shockwave {
  position: fixed; left: 50%; top: 50%; width: 44px; height: 44px;
  border: 3px solid var(--accent); border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: fxShock .7s ease-out forwards;
}
@keyframes fxShock {
  from { opacity: .9; box-shadow: 0 0 40px rgba(255,59,59,.8); transform: translate(-50%, -50%) scale(1); }
  to { opacity: 0; box-shadow: 0 0 4px rgba(255,59,59,0); transform: translate(-50%, -50%) scale(28); }
}
.dashboard-shell.shake { animation: screenShake .5s ease-out; }
@keyframes screenShake {
  0%, 100% { transform: none; }
  15% { transform: translate(-8px, 4px); }
  30% { transform: translate(7px, -5px); }
  45% { transform: translate(-6px, -3px); }
  60% { transform: translate(5px, 4px); }
  75% { transform: translate(-3px, 2px); }
  90% { transform: translate(2px, -1px); }
}
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useBursts.js src/hooks/useShockwave.js src/components/FxLayer.jsx src/App.jsx src/styles.css
git commit -m "feat: particle bursts, urgent shockwave, and screen shake fx layer"
```

---

### Task 7: Config flag and docs

**Files:**
- Modify: `config.json` (the `features` block)
- Modify: `README.md` (features config block + a short paragraph)

- [ ] **Step 1: Add the flag to `config.json`**

In the existing `"features"` object, add:

```json
    "livingBoard": true
```

- [ ] **Step 2: Document it in `README.md`**

In the README's `features` JSON example (Config section), add `"livingBoard": true` alongside the other flags. Then add this paragraph after the existing fun-features paragraphs:

```markdown
Living Board adds ambient animation to the leaderboard itself: rows glow and
trail when they overtake each other, every solve fires a particle burst on the
scoring row, agents at 3/5/10 solves gain growing heat auras, and defeating an
urgent ticket triggers a fullscreen shockwave with a brief screen shake.
Disable it with `features.livingBoard: false`; `prefers-reduced-motion` users
get none of the motion regardless.
```

- [ ] **Step 3: Run the suite once more**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add config.json README.md
git commit -m "docs: add livingBoard feature flag and document living board fx"
```

---

### Task 8: Build and manual verification

**Files:** none (verification only). Do not commit `dist/` churn.

- [ ] **Step 1: Build the frontend**

Run: `npm run build`
Expected: Vite build succeeds.

- [ ] **Step 2: Manual verification via the test panel**

Run: `DEV=1 node server.js` (or `npm run dev`), open `http://localhost:3000?test=1`, click `CLICK TO ARM SPEAKERS`, then use the test panel:

1. **Burst:** click Solve for any agent → green particle burst erupts from that row's score number.
2. **Overtake trail:** give agent B more solves than agent A → B's row slides up with a green glow; A's row dims briefly while sliding down.
3. **Heat:** give one agent 3, then 5, then 10 solves → score turns amber (3), row shimmers orange (5), red inferno shimmer (10).
4. **Shockwave:** create a ticket with priority `urgent`, then resolve that same ticket ID → fullscreen red shockwave ring + screen shake (alongside the existing BOSS DEFEATED overlay).
5. **Flag off:** set `"livingBoard": false` in `config.json`, restart, confirm bursts, shockwave, shake, and heat auras are all gone.
6. Re-enable the flag.

- [ ] **Step 3: Run the full test suite one final time**

Run: `npm test`
Expected: PASS.

---

## Verification checklist (spec coverage)

- Animated rank overtakes with directional trails — Task 4
- Particle burst on every solve — Tasks 2, 6
- Streak heat auras tied to kill tiers — Tasks 2, 3
- Urgent boss shockwave + screen shake — Tasks 1, 5, 6
- Feature flag + docs — Task 7
- Reduced-motion safety — existing global CSS rule, noted in Tasks 6/7

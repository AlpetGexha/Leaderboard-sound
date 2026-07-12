'use strict';
require('../src/test/setup');
const { test } = require('node:test');
const assert = require('node:assert');

test('agentsWithIncreasedSolved skips agents with no prior solved count (first snapshot)', async () => {
  const { agentsWithIncreasedSolved } = await import('../src/domain/scoring.js');
  const increased = agentsWithIncreasedSolved([{ agent: 'Alpet', solved: 3 }], {});
  assert.deepStrictEqual(increased, []);
});

test('agentsWithIncreasedSolved returns agents whose solved count rose', async () => {
  const { agentsWithIncreasedSolved } = await import('../src/domain/scoring.js');
  const leaderboard = [
    { agent: 'Alpet', solved: 4 },
    { agent: 'Bajram', solved: 2 },
    { agent: 'Kushtrim', solved: 5 }
  ];
  const previous = { Alpet: 3, Bajram: 2, Kushtrim: 4 };
  assert.deepStrictEqual(agentsWithIncreasedSolved(leaderboard, previous), ['Alpet', 'Kushtrim']);
});

test('agentsWithIncreasedSolved ignores unchanged or decreased counts', async () => {
  const { agentsWithIncreasedSolved } = await import('../src/domain/scoring.js');
  const leaderboard = [{ agent: 'Alpet', solved: 2 }];
  assert.deepStrictEqual(agentsWithIncreasedSolved(leaderboard, { Alpet: 2 }), []);
  assert.deepStrictEqual(agentsWithIncreasedSolved(leaderboard, { Alpet: 5 }), []);
});

test('solvedMapFrom builds an agent-to-solved-count map from a leaderboard', async () => {
  const { solvedMapFrom } = await import('../src/domain/scoring.js');
  const leaderboard = [{ agent: 'Alpet', solved: 3 }, { agent: 'Bajram', solved: 0 }];
  assert.deepStrictEqual(solvedMapFrom(leaderboard), { Alpet: 3, Bajram: 0 });
});

export function agentsWithIncreasedSolved(leaderboard, previousSolved) {
  const increased = [];
  for (const row of leaderboard) {
    const previous = previousSolved[row.agent];
    if (previous !== undefined && row.solved > previous) increased.push(row.agent);
  }
  return increased;
}

export function solvedMapFrom(leaderboard) {
  return Object.fromEntries(leaderboard.map(row => [row.agent, row.solved]));
}

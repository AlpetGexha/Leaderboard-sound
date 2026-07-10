import { useCallback, useRef, useState } from 'react';

export function useScoreFlash() {
  const [scoredAgents, setScoredAgents] = useState(() => new Set());
  const lastSolvedRef = useRef({});

  const syncSolved = useCallback(leaderboard => {
    const increased = new Set();
    for (const row of leaderboard) {
      const previous = lastSolvedRef.current[row.agent];
      if (previous !== undefined && row.solved > previous) increased.add(row.agent);
    }
    if (increased.size) setScoredAgents(increased);
    lastSolvedRef.current = Object.fromEntries(leaderboard.map(row => [row.agent, row.solved]));
  }, []);

  const resetScores = useCallback(() => {
    lastSolvedRef.current = {};
  }, []);

  const clearScored = useCallback(agent => {
    setScoredAgents(current => {
      if (!current.has(agent)) return current;
      const next = new Set(current);
      next.delete(agent);
      return next;
    });
  }, []);

  return { scoredAgents, clearScored, resetScores, syncSolved };
}

import { useCallback, useRef, useState } from 'react';
import { agentsWithIncreasedSolved, solvedMapFrom } from '../domain/scoring.js';

export function useScoreFlash() {
  const [scoredAgents, setScoredAgents] = useState(() => new Set());
  const lastSolvedRef = useRef({});

  const syncSolved = useCallback(leaderboard => {
    const increased = agentsWithIncreasedSolved(leaderboard, lastSolvedRef.current);
    if (increased.length) setScoredAgents(new Set(increased));
    lastSolvedRef.current = solvedMapFrom(leaderboard);
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

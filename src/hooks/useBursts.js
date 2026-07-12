import { useCallback, useRef, useState } from 'react';
import { burstParticles } from '../domain/fx.js';
import { agentsWithIncreasedSolved, solvedMapFrom } from '../domain/scoring.js';

export function useBursts(rowRefs) {
  const [bursts, setBursts] = useState([]);
  const lastSolvedRef = useRef({});
  const burstSeqRef = useRef(0);

  const syncBursts = useCallback(leaderboard => {
    const next = [];
    for (const agent of agentsWithIncreasedSolved(leaderboard, lastSolvedRef.current)) {
      const node = rowRefs.current.get(agent);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      next.push({
        id: `burst-${++burstSeqRef.current}`,
        x: rect.right - 48,
        y: rect.top + rect.height / 2,
        particles: burstParticles()
      });
    }
    lastSolvedRef.current = solvedMapFrom(leaderboard);
    if (!next.length) return;
    setBursts(current => [...current, ...next]);
    setTimeout(() => setBursts(current => current.filter(burst => !next.includes(burst))), 1100);
  }, [rowRefs]);

  const resetBursts = useCallback(() => { lastSolvedRef.current = {}; }, []);

  return { bursts, syncBursts, resetBursts };
}

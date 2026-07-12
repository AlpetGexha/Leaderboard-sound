import { useCallback, useRef, useState } from 'react';
import { burstParticles } from '../domain/fx.js';

export function useBursts(rowRefs) {
  const [bursts, setBursts] = useState([]);
  const lastSolvedRef = useRef({});
  const burstSeqRef = useRef(0);

  const syncBursts = useCallback(leaderboard => {
    const next = [];
    for (const row of leaderboard) {
      const previous = lastSolvedRef.current[row.agent];
      if (previous === undefined || row.solved <= previous) continue;
      const node = rowRefs.current.get(row.agent);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      next.push({
        id: `burst-${++burstSeqRef.current}`,
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

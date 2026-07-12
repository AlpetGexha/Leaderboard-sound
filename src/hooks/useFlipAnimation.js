import { useCallback, useRef } from 'react';

export function useFlipAnimation() {
  const rowRefs = useRef(new Map());
  const oldTopsRef = useRef({});
  const pendingCleanupRef = useRef(new Map());

  const captureOldTops = useCallback(() => {
    oldTopsRef.current = Object.fromEntries(
      [...rowRefs.current.entries()].map(([agent, node]) => [agent, node.getBoundingClientRect().top])
    );
  }, []);

  const applyFlip = useCallback(() => {
    const oldTops = oldTopsRef.current;
    const pendingCleanup = pendingCleanupRef.current;
    // Prune listeners for nodes no longer present in rowRefs (e.g. an agent
    // dropped from the roster mid-transition, whose transitionend never
    // fires), so the Map can't grow unbounded and hold detached DOM nodes.
    if (pendingCleanup.size) {
      const liveNodes = new Set(rowRefs.current.values());
      for (const [node, cleanupFn] of pendingCleanup) {
        if (liveNodes.has(node)) continue;
        node.removeEventListener('transitionend', cleanupFn);
        pendingCleanup.delete(node);
      }
    }
    for (const [agent, node] of rowRefs.current.entries()) {
      const oldTop = oldTops[agent];
      if (oldTop === undefined) continue;
      const delta = oldTop - node.getBoundingClientRect().top;
      if (!delta) continue;
      const direction = delta > 0 ? 'moving-up' : 'moving-down';
      const prevCleanup = pendingCleanup.get(node);
      if (prevCleanup) node.removeEventListener('transitionend', prevCleanup);
      // Drop 'moving' (not just the direction classes) before re-setting the
      // invert transform: 'moving' carries the transition, so if it stayed
      // attached this assignment would animate instead of snapping, breaking
      // FLIP's invert step for a row that re-ranks again mid-transition.
      node.classList.remove('moving', 'moving-up', 'moving-down');
      node.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        node.classList.add('moving', direction);
        node.style.transform = '';
        const onEnd = () => {
          node.classList.remove('moving', direction);
          pendingCleanup.delete(node);
        };
        pendingCleanup.set(node, onEnd);
        node.addEventListener('transitionend', onEnd, { once: true });
      });
    }
  }, []);

  return { rowRefs, captureOldTops, applyFlip };
}

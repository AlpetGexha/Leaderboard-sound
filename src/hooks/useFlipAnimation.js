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
    for (const [agent, node] of rowRefs.current.entries()) {
      const oldTop = oldTops[agent];
      if (oldTop === undefined) continue;
      const delta = oldTop - node.getBoundingClientRect().top;
      if (!delta) continue;
      const direction = delta > 0 ? 'moving-up' : 'moving-down';
      const prevCleanup = pendingCleanup.get(node);
      if (prevCleanup) node.removeEventListener('transitionend', prevCleanup);
      node.classList.remove('moving-up', 'moving-down');
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

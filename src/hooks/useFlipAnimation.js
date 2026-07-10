import { useCallback, useRef } from 'react';

export function useFlipAnimation() {
  const rowRefs = useRef(new Map());
  const oldTopsRef = useRef({});

  const captureOldTops = useCallback(() => {
    oldTopsRef.current = Object.fromEntries(
      [...rowRefs.current.entries()].map(([agent, node]) => [agent, node.getBoundingClientRect().top])
    );
  }, []);

  const applyFlip = useCallback(() => {
    const oldTops = oldTopsRef.current;
    for (const [agent, node] of rowRefs.current.entries()) {
      const oldTop = oldTops[agent];
      if (oldTop === undefined) continue;
      const delta = oldTop - node.getBoundingClientRect().top;
      if (!delta) continue;
      node.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        node.classList.add('moving');
        node.style.transform = '';
        node.addEventListener('transitionend', () => node.classList.remove('moving'), { once: true });
      });
    }
  }, []);

  return { rowRefs, captureOldTops, applyFlip };
}

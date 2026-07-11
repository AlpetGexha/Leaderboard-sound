import { useEffect, useRef, useState } from 'react';
import { fetchState } from '../services/arenaApi.js';
import { subscribe } from '../services/eventStream.js';

export function useArenaSnapshot({ onBeforeApply, onAfterApply }) {
  const [snapshot, setSnapshot] = useState(null);
  const [live, setLive] = useState(false);
  const onBeforeApplyRef = useRef(onBeforeApply);
  const onAfterApplyRef = useRef(onAfterApply);

  // The effect must run once (one EventSource per mount), but these callbacks
  // change identity every render. Refs keep the dep array empty without
  // capturing a stale closure.
  onBeforeApplyRef.current = onBeforeApply;
  onAfterApplyRef.current = onAfterApply;

  useEffect(() => {
    let cancelled = false;

    // onBeforeApply configures the announcer and captures pre-render row
    // positions; onAfterApply enqueues announcements. Enqueue must follow
    // configure so a frame that introduces a sample plays it, matching the
    // original applySnapshot-then-enqueue order.
    function apply(next) {
      if (cancelled || !next) return;
      onBeforeApplyRef.current?.(next);
      setSnapshot(next);
      onAfterApplyRef.current?.(next);
    }

    fetchState().then(apply);

    const unsubscribe = subscribe({
      onOpen: () => {
        setLive(true);
        fetchState().then(apply);
      },
      onError: () => setLive(false),
      onMessage: apply
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { snapshot, live };
}

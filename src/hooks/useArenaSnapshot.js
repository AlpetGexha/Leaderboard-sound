import { useEffect, useRef, useState } from 'react';
import { fetchState } from '../services/arenaApi.js';
import { subscribe } from '../services/eventStream.js';

export function useArenaSnapshot({ onBeforeApply, onMessage }) {
  const [snapshot, setSnapshot] = useState(null);
  const [live, setLive] = useState(false);
  const onBeforeApplyRef = useRef(onBeforeApply);
  const onMessageRef = useRef(onMessage);

  // The effect must run once (one EventSource per mount), but these callbacks
  // change identity every render. Refs keep the dep array empty without
  // capturing a stale closure.
  onBeforeApplyRef.current = onBeforeApply;
  onMessageRef.current = onMessage;

  useEffect(() => {
    let cancelled = false;

    function apply(next) {
      if (cancelled || !next) return;
      onBeforeApplyRef.current?.(next);
      setSnapshot(next);
    }

    fetchState().then(apply);

    const unsubscribe = subscribe({
      onOpen: () => {
        setLive(true);
        fetchState().then(apply);
      },
      onError: () => setLive(false),
      onMessage: msg => {
        // onMessage runs before apply so dayRolled can reset the score
        // baseline before the new snapshot renders.
        onMessageRef.current?.(msg);
        apply(msg);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { snapshot, live };
}

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
    let frameId = null;
    let receivedStreamFrame = false;
    let pendingFrames = [];

    // onBeforeApply configures the announcer and captures pre-render row
    // positions; onAfterApply enqueues announcements. Enqueue must follow
    // configure so a frame that introduces a sample plays it, matching the
    // original applySnapshot-then-enqueue order.
    function flush() {
      frameId = null;
      if (cancelled || !pendingFrames.length) return;

      // Rendering every incoming event makes a busy arena monopolize the main
      // thread. Keep the newest board state, but preserve every announcement
      // and effect produced during this visual frame.
      const frames = pendingFrames;
      pendingFrames = [];
      const latest = frames[frames.length - 1];
      const next = {
        ...latest,
        announcements: frames.flatMap(frame => frame.announcements || []),
        effects: frames.flatMap(frame => frame.effects || [])
      };
      onBeforeApplyRef.current?.(next);
      setSnapshot(next);
      onAfterApplyRef.current?.(next);
    }

    function apply(next) {
      if (cancelled || !next) return;
      pendingFrames.push(next);
      if (frameId === null) frameId = requestAnimationFrame(flush);
    }

    // SSE sends an initial snapshot. The fetch is only a fast fallback; once a
    // stream frame arrives, a slower HTTP response must not replace newer data.
    fetchState().then(next => {
      if (!receivedStreamFrame) apply(next);
    });

    const unsubscribe = subscribe({
      onOpen: () => setLive(true),
      onError: () => setLive(false),
      onMessage: next => {
        receivedStreamFrame = true;
        apply(next);
      }
    });

    return () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      unsubscribe();
    };
  }, []);

  return { snapshot, live };
}

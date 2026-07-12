import { useCallback, useMemo, useRef, useState } from 'react';
import { createAnnouncer } from '../services/announcer/createAnnouncer.js';
import { createDedupeGuard } from '../guards/announcementGuards.js';

export function useAnnouncementQueue() {
  const [current, setCurrent] = useState(null);
  const [queued, setQueued] = useState([]);
  const unlockedRef = useRef(false);
  const pendingAnnouncementsRef = useRef([]);
  const pendingCeremonyRef = useRef(null);
  const isDuplicateRef = useRef(null);
  if (!isDuplicateRef.current) isDuplicateRef.current = createDedupeGuard();

  const announcer = useMemo(() => createAnnouncer({
    onShow: a => setCurrent(a),
    onHide: () => setCurrent(null),
    onQueueChange: setQueued
  }), []);

  const enqueueCeremony = useCallback(ceremony => {
    if (!ceremony) return;
    const storageKey = `ticket-arena:ceremony:v1:${ceremony.id}`;
    let seen = false;
    try { seen = localStorage.getItem(storageKey) === 'shown'; } catch (_) { /* storage may be unavailable */ }
    if (seen) return;
    for (const award of ceremony.awards || []) announcer.enqueue({
      announcementId: `${ceremony.id}:${award.key}`,
      kind: 'award', title: award.title, line: award.line, agent: award.winner
    });
    try { localStorage.setItem(storageKey, 'shown'); } catch (_) { /* queue still works */ }
  }, [announcer]);

  const ingestFrame = useCallback(msg => {
    for (const item of msg.announcements || []) {
      if (isDuplicateRef.current(item)) continue;
      if (unlockedRef.current) announcer.enqueue(item);
      else pendingAnnouncementsRef.current.push(item);
    }
    const ceremony = msg.ceremony;
    if (ceremony) {
      if (unlockedRef.current) enqueueCeremony(ceremony);
      else pendingCeremonyRef.current = ceremony;
    }
  }, [announcer, enqueueCeremony]);

  const unlock = useCallback(() => {
    announcer.unlock();
    unlockedRef.current = true;
    for (const item of pendingAnnouncementsRef.current) announcer.enqueue(item);
    pendingAnnouncementsRef.current = [];
    const pending = pendingCeremonyRef.current;
    pendingCeremonyRef.current = null;
    enqueueCeremony(pending);
  }, [announcer, enqueueCeremony]);

  return { announcer, current, queued, ingestFrame, unlock };
}

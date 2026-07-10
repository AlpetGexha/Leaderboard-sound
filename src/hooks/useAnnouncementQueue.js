import { useCallback, useMemo, useRef, useState } from 'react';
import { createAnnouncer } from '../services/announcer/createAnnouncer.js';
import { createDedupeGuard } from '../guards/announcementGuards.js';

export function useAnnouncementQueue() {
  const [current, setCurrent] = useState(null);
  const isDuplicateRef = useRef(null);
  if (!isDuplicateRef.current) isDuplicateRef.current = createDedupeGuard();

  const announcer = useMemo(() => createAnnouncer({
    onShow: a => setCurrent(a),
    onHide: () => setCurrent(null)
  }), []);

  const ingestFrame = useCallback(msg => {
    for (const item of msg.announcements || []) {
      if (isDuplicateRef.current(item)) continue;
      announcer.enqueue(item);
    }
  }, [announcer]);

  return { announcer, current, ingestFrame };
}

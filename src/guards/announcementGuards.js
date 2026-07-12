const SEEN_MAX = 200;
const SEEN_KEEP = 100;

export function announcementId(a) {
  return a.announcementId || `${a.kind}:${a.ticketId || a.line}:${a.ts || ''}`;
}

// Stateful guard: returns true when this announcement has already been played.
// Bounded so a long-running board never grows the set without limit.
export function createDedupeGuard({ max = SEEN_MAX, keep = SEEN_KEEP } = {}) {
  let seen = new Set();
  return function isDuplicate(a) {
    const id = announcementId(a);
    if (seen.has(id)) return true;
    seen.add(id);
    if (seen.size > max) seen = new Set([...seen].slice(-keep));
    return false;
  };
}

export function isBigAnnouncement(a) {
  if (!a) return false;
  return a.kind === 'first_blood' || a.kind === 'award' || a.kind === 'urgent_boss_spawned' ||
    a.kind === 'urgent_boss_defeated' || a.kind === 'team_combo' || (a.kind === 'tier' && a.count >= 2);
}

export function isSolveAnnouncement(a) {
  return Boolean(a && a.kind === 'tier' && a.count === 1);
}

export function canSpeak(profile, text) {
  return Boolean(profile && profile.tts && profile.tts.enabled && text);
}

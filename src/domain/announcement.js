export const SAMPLE_KEYS = {
  first_blood: 'first_blood',
  new_ticket: 'new_ticket',
  1: 'solved',
  2: 'double_kill',
  3: 'triple_kill',
  4: 'killing_spree',
  5: 'unstoppable',
  7: 'rampage',
  10: 'godlike',
  15: 'monster_kill'
};

export function sampleKey(a) {
  if (a.kind === 'tier') return SAMPLE_KEYS[a.count] || `tier_${a.count}`;
  return SAMPLE_KEYS[a.kind] || a.kind;
}

export function sampleFallbackMs(a) {
  return a.kind === 'tier' && a.count >= 5 ? 900 : 650;
}

// When a mapped MP3 already announces the title, the spoken line must not repeat it.
export function voiceLine(a, hasSample) {
  if (!hasSample) return a.line || '';
  if (!a.title || !a.line) return a.line || '';
  const prefix = `${a.title}, `;
  return a.line.startsWith(prefix) ? a.line.slice(prefix.length) : a.line;
}

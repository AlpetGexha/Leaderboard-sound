export const SAMPLE_KEYS = {
  first_blood: 'first_blood',
  first_blood_boss_defeated: 'first_blood',
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
  const kind = a.sampleKind || a.kind;
  const count = a.sampleCount ?? a.count;
  if (kind === 'tier') return SAMPLE_KEYS[count] || `tier_${count}`;
  return SAMPLE_KEYS[kind] || kind;
}

export function sampleFallbackMs(a) {
  const kind = a.sampleKind || a.kind;
  const count = a.sampleCount ?? a.count;
  return kind === 'tier' && count >= 5 ? 900 : 650;
}

export function voiceLine(a) {
  return a.line || '';
}

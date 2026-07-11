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

export function voiceLine(a) {
  return a.line || '';
}

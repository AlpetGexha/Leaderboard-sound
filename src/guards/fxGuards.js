export function isUrgentDefeat(effect) {
  return effect?.type === 'monster_defeated' && effect.priority === 'urgent';
}

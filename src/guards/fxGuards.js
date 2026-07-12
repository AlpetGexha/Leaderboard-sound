export function isMonsterDefeated(effect) {
  return effect?.type === 'monster_defeated';
}

export function isMonsterSpawned(effect) {
  return effect?.type === 'monster_spawned';
}

export function isUrgentDefeat(effect) {
  return isMonsterDefeated(effect) && effect.priority === 'urgent';
}

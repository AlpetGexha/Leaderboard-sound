export const DEFAULT_SERVICES = ['KFC', 'Prishtina MALL', 'JYSK', 'burgerking', 'comoditahome'];

export const EMPTY_STATE = { leaderboard: [], firstBlood: null, feed: [], invasion: { activeCount: 0, enemies: [] } };

export function servicesFrom(snapshot) {
  return snapshot?.config?.services?.length ? snapshot.config.services : DEFAULT_SERVICES;
}

export function agentsFrom(snapshot) {
  if (snapshot?.config?.agents?.length) return snapshot.config.agents;
  return (snapshot?.state?.leaderboard || []).map(row => row.agent);
}

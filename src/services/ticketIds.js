export function createTicketIds(seed = Math.floor(Date.now() / 1000) % 100000) {
  let seq = seed;
  const open = {};

  function mint() {
    return `T-${++seq}`;
  }

  return {
    forCreate(agent) {
      const id = mint();
      open[agent] = id;
      return id;
    },
    forResolve(agent) {
      if (open[agent]) {
        const id = open[agent];
        delete open[agent];
        return id;
      }
      return mint();
    }
  };
}

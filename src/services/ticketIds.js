export function createTicketIds(seed = Math.floor(Date.now() / 1000) % 100000) {
  let seq = seed;
  let open = [];

  function mint() {
    return `T-${++seq}`;
  }

  return {
    forCreate(agent) {
      const id = mint();
      open.push(id);
      return id;
    },
    forResolve() {
      return open.shift() || mint();
    },
    syncOpen(ticketIds) {
      open = [...new Set((ticketIds || []).filter(Boolean).map(String))];
    }
  };
}

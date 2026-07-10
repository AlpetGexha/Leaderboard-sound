import { sendTicketEvent } from './sendTicketEvent.js';

export function resolveTicket(deps, { agent, service }) {
  return sendTicketEvent(deps, {
    type: 'ticket.resolved',
    agent,
    service,
    ticketId: deps.ticketIds.forResolve(agent)
  });
}

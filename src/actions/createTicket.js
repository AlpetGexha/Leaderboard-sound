import { sendTicketEvent } from './sendTicketEvent.js';

export function createTicket(deps, { agent, service }) {
  return sendTicketEvent(deps, {
    type: 'ticket.created',
    agent,
    service,
    ticketId: deps.ticketIds.forCreate(agent)
  });
}

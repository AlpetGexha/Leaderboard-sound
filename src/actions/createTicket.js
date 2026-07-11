import { sendTicketEvent } from './sendTicketEvent.js';

export function createTicket(deps, { agent, service, priority = 'medium' }) {
  return sendTicketEvent(deps, {
    type: 'ticket.created',
    agent,
    service,
    priority,
    ticketId: deps.ticketIds.forCreate(agent)
  });
}

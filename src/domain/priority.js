export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export function randomPriority(random = Math.random) {
  const index = Math.min(TICKET_PRIORITIES.length - 1, Math.floor(random() * TICKET_PRIORITIES.length));
  return TICKET_PRIORITIES[Math.max(0, index)];
}

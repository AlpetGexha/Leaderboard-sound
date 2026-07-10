// `fetch` is referenced bare so tests can swap `global.fetch` after this module loads.

export async function fetchState() {
  try {
    const res = await fetch('/api/state');
    return await res.json();
  } catch (_) {
    // A failed snapshot fetch is not actionable: SSE will deliver the next one.
    return null;
  }
}

export function postEvent(payload, secret) {
  return fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': secret },
    body: JSON.stringify(payload)
  });
}

export function postDevReset() {
  return fetch('/api/dev/reset', { method: 'POST' });
}

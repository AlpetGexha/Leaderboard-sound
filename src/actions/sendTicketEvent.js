const BAD_SECRET_MESSAGE =
  'Test event rejected: bad webhook secret. The server is not using arena-dev-secret.';

// notify wraps window.alert rather than aliasing it: a bare reference to the
// native alert throws "Illegal invocation" when called with this !== window.
export async function sendTicketEvent({ api, secretStore, notify = message => window.alert(message) }, payload) {
  let secret = secretStore.get();
  let res = await api.postEvent(payload, secret);

  if (res.status === 401) {
    secret = secretStore.reset();
    res = await api.postEvent(payload, secret);
    if (res.status === 401) {
      notify(BAD_SECRET_MESSAGE);
      return { ok: false, secret };
    }
  }

  if (!res.ok) console.warn('test event rejected:', res.status, await res.text());
  return { ok: res.ok, secret };
}

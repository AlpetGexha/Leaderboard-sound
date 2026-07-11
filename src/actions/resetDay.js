const NOT_DEV_MESSAGE = 'reset only works when server runs with DEV=1';

// notify wraps window.alert rather than aliasing it: a bare reference to the
// native alert throws "Illegal invocation" when called with this !== window.
export async function resetDay({ api, notify = message => window.alert(message) }) {
  const res = await api.postDevReset();
  if (!res.ok) notify(NOT_DEV_MESSAGE);
  return { ok: res.ok };
}

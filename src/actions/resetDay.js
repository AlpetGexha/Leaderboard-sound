const NOT_DEV_MESSAGE = 'reset only works when server runs with DEV=1';

export async function resetDay({ api, notify = window.alert }) {
  const res = await api.postDevReset();
  if (!res.ok) notify(NOT_DEV_MESSAGE);
  return { ok: res.ok };
}

// Adapter over EventSource. Handlers are assigned as properties, not via
// addEventListener, because the test harness's MockEventSource only exposes properties.
export function subscribe({ onOpen = () => {}, onMessage = () => {}, onError = () => {} } = {}) {
  const es = new EventSource('/events');

  es.onopen = () => onOpen();
  es.onerror = () => onError();
  es.onmessage = event => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (_) {
      // A malformed frame must not kill the stream's handler for subsequent frames.
      return;
    }
    onMessage(msg);
  };

  return function unsubscribe() {
    if (es.close) es.close();
  };
}

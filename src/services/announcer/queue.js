export function createQueue({ gapMs, playOne, onChange = () => {}, maxPending = Infinity }) {
  const items = [];
  let playing = false;

  function notify() {
    onChange(items.slice());
  }

  async function pump() {
    if (playing) return;
    const item = items.shift();
    if (!item) return;
    notify();
    playing = true;
    try {
      await playOne(item);
    } catch (_) {
      // A failed announcement is not actionable and must not stall the queue.
      // Contained here rather than at the call sites: pump is invoked both
      // fire-and-forget from enqueue and from the inter-announcement timer.
    } finally {
      playing = false;
      if (items.length) setTimeout(pump, gapMs);
    }
  }

  return {
    enqueue(item) {
      items.push(item);
      // During a busy incident, an audio queue that is minutes behind is worse
      // than a concise view of the current action. Keep the newest pending work
      // without interrupting the item that is already playing.
      if (items.length > maxPending) items.splice(0, items.length - maxPending);
      notify();
      pump();
    },
    get size() {
      return items.length;
    }
  };
}

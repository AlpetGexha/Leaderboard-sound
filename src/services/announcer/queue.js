export function createQueue({ gapMs, playOne }) {
  const items = [];
  let playing = false;

  async function pump() {
    if (playing) return;
    const item = items.shift();
    if (!item) return;
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
      pump();
    },
    get size() {
      return items.length;
    }
  };
}

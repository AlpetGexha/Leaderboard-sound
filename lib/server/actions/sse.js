'use strict';

async function sseAction(context) {
  const { req, res, deps } = context;
  const { arena, sse } = deps;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();
  // A short reconnect delay avoids reconnect storms if a busy client is
  // intentionally dropped for falling behind the live stream.
  res.write('retry: 3000\n\n');
  res.write(`data: ${JSON.stringify(arena.snapshot())}\n\n`);
  sse.add(res);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), sse.keepAliveMs);
  req.on('close', () => {
    clearInterval(keepAlive);
    sse.remove(res);
  });
}

module.exports = { sseAction };

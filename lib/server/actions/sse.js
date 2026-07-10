'use strict';

async function sseAction(context) {
  const { req, res, deps } = context;
  const { arena, sse } = deps;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write(`data: ${JSON.stringify(arena.snapshot())}\n\n`);
  sse.add(res);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), sse.keepAliveMs);
  req.on('close', () => {
    clearInterval(keepAlive);
    sse.remove(res);
  });
}

module.exports = { sseAction };

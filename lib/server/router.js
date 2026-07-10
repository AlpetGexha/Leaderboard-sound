'use strict';
const { sendRejection, sendText } = require('./http/responses');

function methodMatches(routeMethod, method) {
  if (Array.isArray(routeMethod)) return routeMethod.includes(method);
  return routeMethod === method;
}

function matchRoute(route, method, url) {
  if (!methodMatches(route.method, method)) return false;
  if (route.path) return url.pathname === route.path;
  if (route.prefix) return url.pathname.startsWith(route.prefix);
  return true;
}

// Strategy: the first route whose method and path match wins, so any catch-all
// must be declared last. Guards run in declaration order; the first one to
// return a rejection ends the request.
function createRouter(routes, deps) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const context = { req, res, url, deps, body: undefined };

    for (const route of routes) {
      if (!matchRoute(route, req.method, url)) continue;

      for (const guard of route.guards || []) {
        const rejection = await guard(context);
        if (rejection) return sendRejection(res, rejection);
      }
      return route.action(context);
    }

    return sendText(res, 405, 'method not allowed');
  };
}

module.exports = { createRouter, matchRoute };

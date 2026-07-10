'use strict';

async function webhookSecretGuard(context) {
  const { webhookSecret } = context.deps;
  if (!webhookSecret) return null;
  if (context.req.headers['x-webhook-secret'] === webhookSecret) return null;
  return { status: 401, json: { error: 'bad secret' } };
}

module.exports = { webhookSecretGuard };

import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from './app.js';

function fakePool() {
  return {
    query: async (sql, params) => {
      if (sql.includes('from profiles')) {
        return { rows: [{ display_name: 'Test Pilot', settings_json: {}, updated_at: new Date().toISOString() }] };
      }
      if (sql.includes('from progress')) {
        return { rows: [{ slot: params[1], save_json: { level: 2 }, updated_at: new Date().toISOString() }] };
      }
      if (sql.includes('insert into progress')) {
        return { rows: [{ slot: params[1], save_json: params[2], updated_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    }
  };
}

const config = {
  nodeEnv: 'test',
  frontendOrigin: 'http://localhost:8080',
  publicBaseUrl: 'http://localhost:3000',
  sessionSecret: 'test-secret',
  microsoft: {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    tenantId: 'common',
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
  }
};

test('health endpoint responds', async () => {
  const app = createApp({ config, pool: fakePool() });
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('me requires auth', async () => {
  const app = createApp({ config, pool: fakePool() });
  const res = await request(app).get('/api/me');
  assert.equal(res.status, 401);
});

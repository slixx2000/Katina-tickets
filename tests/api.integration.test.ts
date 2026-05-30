import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DEV_AUTH_BYPASS = 'true';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  process.env.VITE_APP_URL = 'http://localhost:3000';
  delete process.env.DATABASE_URL;

  const serverModule = await import('../server/index');
  app = serverModule.app;
});

describe('API integration', () => {
  it('exchanges a dev access token into server session cookies', async () => {
    const response = await request(app)
      .post('/api/auth/exchange')
      .set('Origin', 'http://localhost:3000')
      .set('Referer', 'http://localhost:3000/admin')
      .send({ accessToken: 'dev-session:admin@example.com:SUPER_ADMIN' });

    expect(response.status).toBe(200);
    expect(response.body.authenticated).toBe(true);
    expect(response.body.user.email).toBe('admin@example.com');

    const setCookie = response.headers['set-cookie'];
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie.length).toBeGreaterThanOrEqual(2);
  });

  it('treats duplicate webhook event IDs as idempotent duplicates', async () => {
    const payload = {
      eventId: 'evt-duplicate-1',
      reference: 'LENCO-TEST-REF-12345',
      status: 'paid',
      data: {
        id: 'pay-123',
      },
    };

    const firstResponse = await request(app)
      .post('/api/webhook')
      .send(payload);

    const secondResponse = await request(app)
      .post('/api/webhook')
      .send(payload);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.success).toBe(true);
    expect(firstResponse.body.duplicate).not.toBe(true);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.success).toBe(true);
    expect(secondResponse.body.duplicate).toBe(true);
  });
});

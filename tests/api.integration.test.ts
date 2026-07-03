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
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';

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

  it('requires authentication before creating payment sessions', async () => {
    const response = await request(app)
      .post('/api/pay')
      .send({
        amount: 1250,
        currency: 'ZMW',
        description: 'Priority Ticket x1',
        metadata: {
          ticketType: 'vip',
          quantity: 1,
        },
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('accepts authenticated customer payment attempts (provider may still reject)', async () => {
    const sessionResponse = await request(app)
      .post('/api/auth/exchange')
      .set('Origin', 'http://localhost:3000')
      .set('Referer', 'http://localhost:3000')
      .send({ accessToken: 'dev-session:customer@example.com:CUSTOMER' });

    expect(sessionResponse.status).toBe(200);
    const cookie = sessionResponse.headers['set-cookie'];
    expect(Array.isArray(cookie)).toBe(true);

    const payResponse = await request(app)
      .post('/api/pay')
      .set('Cookie', cookie)
      .send({
        amount: 1250,
        currency: 'ZMW',
        description: 'Priority Ticket x1',
        metadata: {
          ticketType: 'vip',
          quantity: 1,
        },
      });

    expect(payResponse.status).not.toBe(401);
  });

  it('rate limits repeated payment attempts from the same session', async () => {
    const sessionResponse = await request(app)
      .post('/api/auth/exchange')
      .set('Origin', 'http://localhost:3000')
      .set('Referer', 'http://localhost:3000')
      .send({ accessToken: 'dev-session:ratelimit@example.com:CUSTOMER' });

    expect(sessionResponse.status).toBe(200);
    const cookie = sessionResponse.headers['set-cookie'];

    let saw429 = false;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const payResponse = await request(app)
        .post('/api/pay')
        .set('Cookie', cookie)
        .send({
          amount: 1250,
          currency: 'ZMW',
          description: `Priority Ticket x1 (${attempt})`,
          metadata: {
            ticketType: 'vip',
            quantity: 1,
          },
        });

      if (payResponse.status === 429) {
        saw429 = true;
        break;
      }
    }

    expect(saw429).toBe(true);
  });

  it('requires authentication before reading reservation details', async () => {
    const response = await request(app).get('/api/payments/LENCO-TEST-REF-12345/reservation');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('requires authentication before reading ticket tokens', async () => {
    const response = await request(app).get('/api/payments/LENCO-TEST-REF-12345/ticket-token');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('requires authentication before reading my tickets', async () => {
    const response = await request(app).get('/api/me/tickets');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('returns ticket list payload for authenticated customers', async () => {
    const sessionResponse = await request(app)
      .post('/api/auth/exchange')
      .set('Origin', 'http://localhost:3000')
      .set('Referer', 'http://localhost:3000')
      .send({ accessToken: 'dev-session:customer2@example.com:CUSTOMER' });

    expect(sessionResponse.status).toBe(200);
    const cookie = sessionResponse.headers['set-cookie'];

    const response = await request(app)
      .get('/api/me/tickets')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.items)).toBe(true);
  });
});

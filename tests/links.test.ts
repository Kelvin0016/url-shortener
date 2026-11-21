import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db';
import { redis } from '../src/redis';

const json = { 'content-type': 'application/json' };

beforeAll(async () => {
  await pool.query(readFileSync('schema.sql', 'utf8'));
});

beforeEach(async () => {
  await pool.query('TRUNCATE links RESTART IDENTITY');
  await redis.flushdb();
});

afterAll(async () => {
  await pool.end();
  await redis.quit();
});

describe('POST /api/links', () => {
  it('creates a link with a random code', async () => {
    const res = await request(app).post('/api/links').set(json).send({ url: 'https://example.com' });
    expect(res.status).toBe(201);
    expect(res.body.url).toBe('https://example.com');
    expect(res.body.code).toMatch(/^[A-Za-z0-9_-]{7}$/);
  });
});

describe('POST /api/links errors', () => {
  it('rejects an invalid URL with 400', async () => {
    const res = await request(app).post('/api/links').set(json).send({ url: 'not a url' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when a custom code is taken', async () => {
    const body = { url: 'https://example.com', code: 'hello' };
    const first = await request(app).post('/api/links').set(json).send(body);
    const second = await request(app).post('/api/links').set(json).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it('blocks the 11th request in a minute with 429', async () => {
    for (let i = 0; i < 10; i++) {
      const ok = await request(app).post('/api/links').set(json).send({ url: 'https://example.com' });
      expect(ok.status).toBe(201);
    }
    const blocked = await request(app).post('/api/links').set(json).send({ url: 'https://example.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});

describe('GET /:code', () => {
  it('redirects with 302, first from Postgres then from the cache', async () => {
    await request(app).post('/api/links').set(json).send({ url: 'https://example.com', code: 'hello' });

    const miss = await request(app).get('/hello');
    expect(miss.status).toBe(302);
    expect(miss.headers.location).toBe('https://example.com');
    expect(miss.headers['x-cache']).toBe('MISS');

    const hit = await request(app).get('/hello');
    expect(hit.status).toBe(302);
    expect(hit.headers['x-cache']).toBe('HIT');
  });

  it('returns 404 for an unknown code', async () => {
    const res = await request(app).get('/nope123');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/links/:code/stats', () => {
  it('counts a click', async () => {
    await request(app).post('/api/links').set(json).send({ url: 'https://example.com', code: 'hello' });
    await request(app).get('/hello');

    const res = await request(app).get('/api/links/hello/stats');
    expect(res.status).toBe(200);
    expect(res.body.clicks).toBe(1);
  });
});

describe('GUI', () => {
  it('serves the page at /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('serves the script', async () => {
    const res = await request(app).get('/app.js');
    expect(res.status).toBe(200);
  });
});

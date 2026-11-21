import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db';
import { redis } from '../redis';
import { rateLimit } from '../rateLimit';

export const links = Router();

const CODE_RE = /^[A-Za-z0-9_-]{3,16}$/;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Create a short link
links.post('/api/links', rateLimit, async (req, res) => {
  const { url, code: custom } = req.body ?? {};

  if (!isHttpUrl(url)) {
    return res.status(400).json({ error: 'url must be a valid http(s) URL' });
  }
  if (custom !== undefined && (typeof custom !== 'string' || !CODE_RE.test(custom))) {
    return res.status(400).json({ error: 'code must be 3-16 chars: letters, digits, _ or -' });
  }

  const editToken = randomBytes(24).toString('base64url');

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = custom ?? randomBytes(5).toString('base64url');
    try {
      const { rows } = await pool.query(
        'INSERT INTO links (code, url, edit_token_hash) VALUES ($1, $2, $3) RETURNING code, url, created_at',
        [code, url, hashToken(editToken)],
      );
      return res.status(201).json({ ...rows[0], editToken });
    } catch (err: any) {
      if (err.code !== '23505') throw err; // 23505 = unique_violation
      if (custom) return res.status(409).json({ error: 'code already taken' });
      // random code collided: loop and try a new one
    }
  }
  res.status(500).json({ error: 'could not generate a unique code' });
});

// List links, newest first. There are no accounts yet, so this list is public:
// it must never include the edit token hash.
links.get('/api/links', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT code, url, clicks::int AS clicks, created_at FROM links ORDER BY created_at DESC LIMIT 100',
  );
  res.json(rows);
});

// Edit a link's destination (needs the edit token from creation)
links.patch('/api/links/:code', rateLimit, async (req, res) => {
  const { code } = req.params;
  const { url } = req.body ?? {};
  const auth = req.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'edit token required' });
  }
  if (!isHttpUrl(url)) {
    return res.status(400).json({ error: 'url must be a valid http(s) URL' });
  }

  const { rows } = await pool.query(
    'UPDATE links SET url = $1 WHERE code = $2 AND edit_token_hash = $3 RETURNING code, url',
    [url, code, hashToken(token)],
  );
  if (!rows[0]) {
    return res.status(403).json({ error: 'wrong code or edit token' });
  }

  await redis.del(`link:${code}`);
  res.json(rows[0]);
});

// Redirect (cache-aside: try Redis first, fall back to Postgres)
const CACHE_TTL = 3600; // seconds

links.get('/:code', async (req, res) => {
  const { code } = req.params;
  const key = `link:${code}`;

  const cached = await redis.get(key);
  if (cached) {
    // Count the click without making the visitor wait for Postgres
    pool.query('UPDATE links SET clicks = clicks + 1 WHERE code = $1', [code])
      .catch((err) => console.error('click update failed', err));
    res.set('X-Cache', 'HIT');
    return res.redirect(302, cached);
  }

  const { rows } = await pool.query(
    'UPDATE links SET clicks = clicks + 1 WHERE code = $1 RETURNING url',
    [code],
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });

  await redis.set(key, rows[0].url, 'EX', CACHE_TTL);
  res.set('X-Cache', 'MISS');
  res.redirect(302, rows[0].url);
});

// Stats
links.get('/api/links/:code/stats', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT code, url, clicks::int AS clicks, created_at FROM links WHERE code = $1',
    [req.params.code],
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

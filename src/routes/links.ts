import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { pool } from '../db';

export const links = Router();

const CODE_RE = /^[A-Za-z0-9_-]{3,16}$/;

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
links.post('/api/links', async (req, res) => {
  const { url, code: custom } = req.body ?? {};

  if (!isHttpUrl(url)) {
    return res.status(400).json({ error: 'url must be a valid http(s) URL' });
  }
  if (custom !== undefined && (typeof custom !== 'string' || !CODE_RE.test(custom))) {
    return res.status(400).json({ error: 'code must be 3-16 chars: letters, digits, _ or -' });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = custom ?? randomBytes(5).toString('base64url');
    try {
      const { rows } = await pool.query(
        'INSERT INTO links (code, url) VALUES ($1, $2) RETURNING code, url, created_at',
        [code, url],
      );
      return res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err.code !== '23505') throw err; // 23505 = unique_violation
      if (custom) return res.status(409).json({ error: 'code already taken' });
      // random code collided: loop and try a new one
    }
  }
  res.status(500).json({ error: 'could not generate a unique code' });
});

// Redirect
links.get('/:code', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE links SET clicks = clicks + 1 WHERE code = $1 RETURNING url',
    [req.params.code],
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
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

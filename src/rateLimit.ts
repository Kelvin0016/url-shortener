import type { Request, Response, NextFunction } from 'express';
import { redis } from './redis';

const LIMIT = 10;   // requests allowed
const WINDOW = 60;  // per this many seconds

export async function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = `rate:${req.ip}`;

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW);

  if (count > LIMIT) {
    res.set('Retry-After', String(await redis.ttl(key)));
    return res.status(429).json({ error: 'too many requests, try again later' });
  }
  next();
}

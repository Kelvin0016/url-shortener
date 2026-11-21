import express from 'express';
import path from 'node:path';
import { links } from './routes/links';

export const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(links);
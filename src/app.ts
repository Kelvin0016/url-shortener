import express from 'express';
import { links } from './routes/links';



export const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(links);

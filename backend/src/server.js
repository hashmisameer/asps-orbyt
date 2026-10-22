import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { errorHandler } from './middleware/errors.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { companyRouter } from './modules/companies/company.routes.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

// Quick check that the API and database are reachable
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, database: 'not reachable' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/companies', companyRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(errorHandler);

app.listen(env.port, () => console.log(`ORBYT API running on http://localhost:${env.port}`));

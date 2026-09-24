import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { requireUser } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { draftsRouter } from './routes/drafts.js';
import { ebayListingRouter } from './routes/ebayListing.js';
import { listingQueueRouter } from './routes/listingQueue.js';
import { researchRouter } from './routes/research.js';
import { exportRouter } from './routes/export.js';
import { healthRouter } from './routes/health.js';
import { importRouter } from './routes/import.js';
import { partsRouter } from './routes/parts.js';
import { salesRouter } from './routes/sales.js';
import { photosRouter } from './routes/photos.js';
import { discrepanciesRouter } from './routes/discrepancies.js';
import { submissionsRouter } from './routes/submissions.js';
import { usersRouter } from './routes/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Sign-in first, then the gate: every API route after it needs a signed-in person,
// apart from the few requireUser lets through (health, photo images for eBay).
app.use('/api', authRouter);
app.use('/api', requireUser);
app.use('/api', healthRouter);
app.use('/api', partsRouter);
app.use('/api', photosRouter);
app.use('/api', importRouter);
app.use('/api', submissionsRouter);
app.use('/api', discrepanciesRouter);
app.use('/api', usersRouter);
app.use('/api', exportRouter);
app.use('/api', salesRouter);
app.use('/api', draftsRouter);
app.use('/api', ebayListingRouter);
app.use('/api', listingQueueRouter);
app.use('/api', researchRouter);

if (process.env.NODE_ENV === 'production') {
  const webDist = path.resolve(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  // SPA fallback for client-side routes. Path-less middleware (rather than a '*' route)
  // avoids Express 5's path-to-regexp wildcard syntax entirely.
  app.use((_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use(errorHandler);

// env.port is Render's PORT when it sets one (4000 locally), already a number: listen()
// with a hostname only accepts a numeric port, and process.env.PORT is a string. Bound
// to 0.0.0.0 so Render's router can reach it on every interface.
app.listen(env.port, '0.0.0.0', () => {
  console.log(`Server listening on port ${env.port}`);
});

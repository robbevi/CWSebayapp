import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { importRouter } from './routes/import.js';
import { partsRouter } from './routes/parts.js';
import { photosRouter } from './routes/photos.js';
import { submissionsRouter } from './routes/submissions.js';
import { usersRouter } from './routes/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', healthRouter);
app.use('/api', partsRouter);
app.use('/api', photosRouter);
app.use('/api', importRouter);
app.use('/api', submissionsRouter);
app.use('/api', usersRouter);

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

app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});

import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  res.status(500).json({ error: message });
};

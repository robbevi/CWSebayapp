import { Router } from 'express';
import { env } from '../config/env.js';

export const usersRouter = Router();

usersRouter.get('/users', (_req, res) => {
  res.json(env.appUsers);
});

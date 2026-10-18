import { Router } from 'express';
import { createAiController } from '../controllers/aiController.js';

export function createAiRouter(planner) {
  const router = Router();
  router.post('/plan-task', createAiController(planner));
  return router;
}
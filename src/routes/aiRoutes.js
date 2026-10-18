import { Router } from 'express';
import { createAiController } from '../controllers/aiController.js';

export function createAiRouter(planner, planStore) {
  const router = Router();
  router.post('/plan-task', createAiController(planner, planStore));
  return router;
}
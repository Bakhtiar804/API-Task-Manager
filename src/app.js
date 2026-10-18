import express from 'express';
import { createAiRouter } from './routes/aiRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import { planTask } from './services/geminiService.js';

export function createApp({ planner = planTask } = {}) {
  const app = express();

  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (request, response) => {
    response.status(200).json({ success: true, status: 'ok' });
  });
  app.use('/api/tasks', taskRoutes);
  app.use('/api/ai', createAiRouter(planner));
  app.use((request, response) => {
    response.status(404).json({ success: false, error: 'Route not found' });
  });
  app.use((error, request, response, next) => {
    if (response.headersSent) {
      return next(error);
    }

    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return response.status(400).json({ success: false, error: 'Request body must be valid JSON' });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((item) => item.message);
      return response.status(400).json({ success: false, error: messages.join(', ') });
    }

    console.error(error);
    return response.status(500).json({ success: false, error: 'Internal server error' });
  });

  return app;
}

const app = createApp();
export default app;
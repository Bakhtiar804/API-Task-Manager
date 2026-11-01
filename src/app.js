import express from 'express';
import { fileURLToPath } from 'node:url';
import AiPlan from './models/AiPlan.js';
import { createAiRouter } from './routes/aiRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import { planTask } from './services/geminiService.js';

export function createApp({ planner = planTask, planStore = AiPlan } = {}) {
  const app = express();

  app.use((request, response, next) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');

    const requestedHeaders = request.get('Access-Control-Request-Headers');
    if (requestedHeaders) {
      response.setHeader('Access-Control-Allow-Headers', requestedHeaders);
      response.vary('Access-Control-Request-Headers');
    }

    if (request.method === 'OPTIONS') {
      return response.sendStatus(204);
    }

    return next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (request, response) => {
    response.status(200).json({ success: true, status: 'ok' });
  });
  app.use('/api/tasks', taskRoutes);
  app.use('/api/ai', createAiRouter(planner, planStore));
  app.use(express.static(fileURLToPath(new URL('../../public/', import.meta.url))));
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

import AiPlan from '../models/AiPlan.js';

function isValidPlan(plan) {
  return plan
    && typeof plan.summary === 'string'
    && plan.summary.trim().length > 0
    && ['low', 'medium', 'high'].includes(plan.priority)
    && Number.isFinite(plan.estimatedHours)
    && plan.estimatedHours > 0
    && Array.isArray(plan.steps)
    && plan.steps.length > 0
    && plan.steps.every((step) => typeof step === 'string' && step.trim().length > 0);
}

export function createAiController(planner, planStore = AiPlan) {
  return async function planTask(request, response) {
    const description = request.body?.description;
    if (typeof description !== 'string' || !description.trim()) {
      return response.status(400).json({ success: false, error: 'Description is required' });
    }
    if (description.trim().length > 4000) {
      return response.status(400).json({ success: false, error: 'Description must be 4000 characters or fewer' });
    }

    const normalizedDescription = description.trim();
    let plan;
    try {
      plan = await planner(normalizedDescription);
    } catch (error) {
      const status = error.status === 503 ? 503 : 502;
      return response.status(status).json({
        success: false,
        error: status === 503 ? 'AI provider is not configured' : 'Unable to generate a valid task plan'
      });
    }

    if (!isValidPlan(plan)) {
      return response.status(502).json({
        success: false,
        error: 'Unable to generate a valid task plan'
      });
    }

    try {
      await planStore.create({ description: normalizedDescription, ...plan });
    } catch {
      return response.status(500).json({
        success: false,
        error: 'Unable to save generated task plan'
      });
    }

    return response.status(200).json({ success: true, plan });
  };
}
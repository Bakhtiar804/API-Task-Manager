export function createAiController(planner) {
  return async function planTask(request, response) {
    const description = request.body?.description;
    if (typeof description !== 'string' || !description.trim()) {
      return response.status(400).json({ success: false, error: 'Description is required' });
    }
    if (description.trim().length > 4000) {
      return response.status(400).json({ success: false, error: 'Description must be 4000 characters or fewer' });
    }

    try {
      const plan = await planner(description.trim());
      return response.status(200).json({ success: true, plan });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 502;
      return response.status(status).json({
        success: false,
        error: status === 503 ? 'AI provider is not configured' : 'Unable to generate a valid task plan'
      });
    }
  };
}
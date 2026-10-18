export class AiProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'AiProviderError';
    this.status = status;
  }
}

function parsePlan(content) {
  let plan;
  try {
    plan = JSON.parse(content);
  } catch {
    throw new AiProviderError('AI returned malformed JSON');
  }

  const valid = plan
    && typeof plan.summary === 'string'
    && plan.summary.trim().length > 0
    && ['low', 'medium', 'high'].includes(plan.priority)
    && Number.isFinite(plan.estimatedHours)
    && plan.estimatedHours > 0
    && Array.isArray(plan.steps)
    && plan.steps.length > 0
    && plan.steps.every((step) => typeof step === 'string' && step.trim().length > 0);

  if (!valid) {
    throw new AiProviderError('AI response did not match the required plan structure');
  }

  return {
    summary: plan.summary.trim(),
    priority: plan.priority,
    estimatedHours: plan.estimatedHours,
    steps: plan.steps.map((step) => step.trim())
  };
}

export async function planTask(description, {
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!apiKey || !model) {
    throw new AiProviderError('Gemini credentials and model are required', 503);
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: 'Create a practical task plan. Return only a JSON object with summary (short string), priority (low, medium, or high), estimatedHours (positive number), and steps (array of actionable strings).'
          }]
        },
        contents: [{ role: 'user', parts: [{ text: description }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    });
  } catch {
    throw new AiProviderError('Gemini request failed');
  }

  if (!response.ok) {
    throw new AiProviderError(`Gemini returned HTTP ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AiProviderError('Gemini returned an unreadable response');
  }

  const parts = payload?.candidates?.[0]?.content?.parts;
  const content = Array.isArray(parts)
    ? parts.filter((part) => typeof part.text === 'string').map((part) => part.text).join('')
    : '';
  if (!content) {
    throw new AiProviderError('Gemini response did not contain a plan');
  }

  return parsePlan(content);
}
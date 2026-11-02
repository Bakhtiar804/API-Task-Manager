import { setTimeout as delay } from 'node:timers/promises';

export class AiProviderError extends Error {
  constructor(message, status = 502, code = status === 503 ? 'AI_NOT_CONFIGURED' : 'AI_INVALID_RESPONSE') {
    super(message);
    this.name = 'AiProviderError';
    this.status = status;
    this.code = code;
  }
}

function parsePlan(content) {
  let plan;
  try {
    plan = JSON.parse(content);
  } catch {
    throw new AiProviderError('AI returned malformed JSON');
  }

  if (plan && typeof plan.priority === 'string') plan.priority = plan.priority.trim().toLowerCase();

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
  model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  fetchImpl = globalThis.fetch,
  sleep = delay,
  maxRetries = 0
} = {}) {
  apiKey = apiKey?.trim();
  model = model?.trim().replace(/^models\//, '');
  if (!apiKey || !model) {
    throw new AiProviderError('Gemini credentials and model are required', 503);
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let response;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        'x-goog-api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: 'Accept short task titles and everyday tasks as valid input. Make reasonable assumptions and state them in the steps when needed. Create a practical task plan. Return only a JSON object with summary (short string), priority (low, medium, or high), estimatedHours (positive number), and steps (array of actionable strings).'
          }]
        },
        contents: [{ role: 'user', parts: [{ text: description }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              summary: { type: 'STRING' },
              priority: { type: 'STRING', enum: ['low', 'medium', 'high'] },
              estimatedHours: { type: 'NUMBER', description: 'Positive estimated effort in hours; use fractions for short tasks.' },
              steps: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 1 }
            },
            required: ['summary', 'priority', 'estimatedHours', 'steps']
          }
        }
      })
    });
  } catch {
    if (attempt < maxRetries) { await sleep(500 * (attempt + 1)); continue; }
    throw new AiProviderError('Gemini request failed', 504, 'AI_TIMEOUT');
  }
  if ([500, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
    await response.body?.cancel();
    await sleep(500 * (attempt + 1));
    continue;
  }
  if (!response.ok) {
    const code = response.status === 429 ? 'AI_RATE_LIMITED'
      : [401, 403].includes(response.status) ? 'AI_CREDENTIALS'
      : response.status === 404 ? 'AI_MODEL_UNAVAILABLE'
      : response.status >= 500 ? 'AI_UNAVAILABLE' : 'AI_REQUEST_REJECTED';
    const status = code === 'AI_RATE_LIMITED' ? 429 : code === 'AI_UNAVAILABLE' ? 503 : 502;
    throw new AiProviderError(`Gemini returned HTTP ${response.status}`, status, code);
  }
  break;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AiProviderError('Gemini returned an unreadable response');
  }

  const parts = payload?.candidates?.[0]?.content?.parts;
  const content = Array.isArray(parts)
    ? parts.filter((part) => !part.thought && typeof part.text === 'string').map((part) => part.text).join('')
    : '';
  if (!content) {
    throw new AiProviderError('Gemini response did not contain a plan');
  }

  return parsePlan(content);
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AiProviderError, planTask } from '../src/services/geminiService.js';
import AiPlan from '../src/models/AiPlan.js';

const validPlan = {
  summary: 'Build a portfolio website',
  priority: 'high',
  estimatedHours: 12,
  steps: ['Choose a layout', 'Build the pages', 'Deploy the site']
};

test('AI plan model validates plan data and enables creation timestamps', async () => {
  const document = new AiPlan({
    description: 'Build a portfolio website',
    ...validPlan
  });
  await document.validate();

  assert.equal(AiPlan.schema.options.timestamps, true);
  assert.equal(document.description, 'Build a portfolio website');

  const invalidDocument = new AiPlan({
    description: 'Build a portfolio website',
    ...validPlan,
    priority: 'urgent'
  });
  assert.equal(invalidDocument.validateSync().errors.priority.name, 'ValidatorError');
});

test('AI plan endpoint validates input and returns the requested structure', async () => {
  const savedPlans = [];
  const app = createApp({
    planner: async () => validPlan,
    planStore: { create: async (document) => savedPlans.push(document) }
  });

  const empty = await request(app).post('/api/ai/plan-task').send({ description: '   ' });
  assert.equal(empty.status, 400);

  const result = await request(app).post('/api/ai/plan-task').send({
    description: 'I need to build a portfolio website within three days.'
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, plan: validPlan });
  assert.deepEqual(savedPlans, [{
    description: 'I need to build a portfolio website within three days.',
    ...validPlan
  }]);
});

test('AI endpoint does not save invalid plans and preserves provider status codes', async () => {
  let saved = false;
  const planStore = { create: async () => { saved = true; } };
  const invalidApp = createApp({
    planner: async () => ({ ...validPlan, priority: 'urgent' }),
    planStore
  });

  const invalidPlan = await request(invalidApp).post('/api/ai/plan-task').send({ description: 'Plan this task' });
  assert.equal(invalidPlan.status, 502);
  assert.equal(saved, false);

  const unconfiguredApp = createApp({
    planner: async () => { throw new AiProviderError('missing credentials', 503); },
    planStore
  });
  const unconfigured = await request(unconfiguredApp).post('/api/ai/plan-task').send({ description: 'Plan this task' });
  assert.equal(unconfigured.status, 503);
  assert.equal(saved, false);
});

test('AI endpoint returns a generic error when MongoDB cannot save the plan', async () => {
  const app = createApp({
    planner: async () => validPlan,
    planStore: {
      create: async () => { throw new Error('mongodb://credentials/provider response'); }
    }
  });

  const result = await request(app).post('/api/ai/plan-task').send({ description: 'Plan this task' });
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { success: false, error: 'Unable to save generated task plan' });
});

test('Gemini service sends the documented request and parses a valid plan', async () => {
  let capturedUrl;
  let capturedOptions;
  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(validPlan) }] } }]
      })
    };
  };

  const plan = await planTask('Build a portfolio website', {
    apiKey: 'test-key',
    model: 'gemini-3.8-flash',
    fetchImpl
  });

  assert.equal(capturedUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(capturedOptions.headers['x-goog-api-key'], 'test-key');
  assert.equal(JSON.parse(capturedOptions.body).generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(plan, validPlan);
});

test('AI endpoint handles provider errors without exposing provider details', async () => {
  const app = createApp({
    planner: async () => {
      throw new AiProviderError('provider secret detail');
    }
  });

  const result = await request(app).post('/api/ai/plan-task').send({ description: 'Plan a task' });
  assert.equal(result.status, 502);
  assert.equal(result.body.error, 'Unable to generate a valid task plan');
  assert.equal(JSON.stringify(result.body).includes('provider secret detail'), false);
});

test('Gemini service rejects malformed provider output and handles upstream failures', async () => {
  const malformed = () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '{not-json' }] } }] })
  });
  await assert.rejects(
    planTask('Plan a task', { apiKey: 'test-key', model: 'gemini-3.8-flash', fetchImpl: async () => malformed() }),
    /malformed JSON/
  );

  await assert.rejects(
    planTask('Plan a task', {
      apiKey: 'test-key',
      model: 'gemini-3.8-flash',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          candidates: [{
            content: { parts: [{ text: JSON.stringify({ ...validPlan, priority: 'urgent' }) }] }
          }]
        })
      })
    }),
    /required plan structure/
  );

  await assert.rejects(
    planTask('Plan a task', {
      apiKey: 'test-key',
      model: 'gemini-3.8-flash',
      fetchImpl: async () => ({ ok: false, status: 503 })
    }),
    /HTTP 503/
  );
});
test('Gemini retries temporary unavailability and accepts short everyday task titles', async () => {
  let attempts = 0;
  const plan = await planTask('mobile panel change', {
    apiKey: 'test-key', model: 'models/gemini-3.8-flash', sleep: async () => {},
    fetchImpl: async (url, options) => {
      attempts++;
      assert.match(url, /models\/gemini-3.8-flash:generateContent$/);
      const body = JSON.parse(options.body);
      assert.equal(body.contents[0].parts[0].text, 'mobile panel change');
      assert.ok(body.generationConfig.responseSchema.required.includes('estimatedHours'));
      assert.ok(options.signal);
      if (attempts < 3) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(validPlan) }] } }] }) };
    }
  });
  assert.equal(attempts, 3);
  assert.deepEqual(plan, validPlan);
});

test('provider failures have safe distinct codes and bounded retries', async () => {
  for (const [upstream, code, expectedStatus, attempts] of [[503, 'AI_UNAVAILABLE', 503, 3], [429, 'AI_RATE_LIMITED', 429, 1], [403, 'AI_CREDENTIALS', 502, 1], [404, 'AI_MODEL_UNAVAILABLE', 502, 1]]) {
    let calls = 0;
    await assert.rejects(planTask('mobile panel change', {
      apiKey: 'test-key', model: 'test-model', sleep: async () => {},
      fetchImpl: async () => { calls++; return { ok: false, status: upstream }; }
    }), error => error.code === code && error.status === expectedStatus);
    assert.equal(calls, attempts);
    const app = createApp({ planner: async () => { throw new AiProviderError('secret provider detail', expectedStatus, code); } });
    const result = await request(app).post('/api/ai/plan-task').send({ description: 'mobile panel change' });
    assert.equal(result.status, expectedStatus);
    assert.equal(result.body.code, code);
    assert.ok(!JSON.stringify(result.body).includes('secret provider detail'));
  }
});

test('connection failures stop after three attempts and return a timeout code', async () => {
  let calls = 0;
  await assert.rejects(planTask('mobile panel change', {
    apiKey: 'test-key', model: 'test-model', sleep: async () => {},
    fetchImpl: async () => { calls++; throw new Error('private connection data'); }
  }), error => error.status === 504 && error.code === 'AI_TIMEOUT');
  assert.equal(calls, 3);
});

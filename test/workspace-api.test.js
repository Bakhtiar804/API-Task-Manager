import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Task from '../src/models/Task.js';
import { hashToken } from '../src/middleware/workspace.js';

test('guest workspaces isolate all CRUD and AI records, reject missing or forged access, and hide legacy data', async () => {
  const workspaces = new Map(); const records = new Map(); const plans = [];
  let count = 0;
  const store = {
    create: async ({ tokenHash }) => { const doc = { _id: String(++count).padStart(24, '0') }; workspaces.set(tokenHash, doc); return doc; },
    findOne: async ({ tokenHash }) => workspaces.get(tokenHash) || null
  };
  const app = createApp({ workspaceStore: store, planner: async () => ({ summary: 'Plan', priority: 'low', estimatedHours: 1, steps: ['Start'] }), planStore: { create: async doc => plans.push(doc) } });
  const methods = ['create', 'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete'];
  const original = Object.fromEntries(methods.map(key => [key, Task[key]]));
  const match = (query) => [...records.values()].find(doc => doc._id === query._id && doc.workspace === query.workspace);
  Task.create = async fields => { const doc = { _id: String(records.size + 100).padStart(24, '0'), ...fields }; records.set(doc._id, doc); return doc; };
  Task.find = query => ({ sort: async () => [...records.values()].filter(doc => doc.workspace === query.workspace) });
  Task.findOne = async query => match(query) || null;
  Task.findOneAndUpdate = async (query, fields) => { const doc = match(query); if (!doc) return null; Object.assign(doc, fields); return doc; };
  Task.findOneAndDelete = async query => { const doc = match(query); if (!doc) return null; records.delete(doc._id); return doc; };
  try {
    const a = await request(app).post('/api/workspaces'); const b = await request(app).post('/api/workspaces');
    assert.equal(a.status, 201); assert.equal(b.status, 201); assert.notEqual(a.body.token, b.body.token);
    assert.ok(workspaces.has(hashToken(a.body.token))); assert.ok(!JSON.stringify([...workspaces.values()]).includes(a.body.token));
    const call = (token, method, path) => request(app)[method](path).set('Authorization', 'Bearer ' + token);
    const created = await call(a.body.token, 'post', '/api/tasks').send({ title: 'Private A' });
    assert.equal(created.status, 201); const id = created.body.task._id;
    records.set('legacy', { _id: 'legacy', title: 'Old shared task' });
    const listA = await call(a.body.token, 'get', '/api/tasks'); assert.equal(listA.body.tasks.length, 1);
    const listB = await call(b.body.token, 'get', '/api/tasks'); assert.equal(listB.body.tasks.length, 0);
    for (const method of ['get', 'put', 'delete']) {
      const result = await call(b.body.token, method, '/api/tasks/' + id).send({ title: 'Stolen' });
      assert.equal(result.status, 404);
    }
    assert.equal((await call(a.body.token, 'get', '/api/tasks/' + id)).body.task.title, 'Private A');
    assert.equal((await call(a.body.token, 'put', '/api/tasks/' + id).send({ status: 'completed' })).status, 200);
    assert.equal((await call(a.body.token, 'put', '/api/tasks/' + id).send({ workspace: b.body.workspace.id })).status, 400);
    for (const path of ['/api/tasks', '/api/workspace']) assert.equal((await request(app).get(path)).status, 401);
    assert.equal((await call('forma_' + 'f'.repeat(64), 'get', '/api/tasks')).status, 401);
    assert.equal((await request(app).post('/api/ai/plan-task').send({ description: 'Plan' })).status, 401);
    assert.equal((await call(a.body.token, 'post', '/api/ai/plan-task').send({ description: 'Plan' })).status, 200);
    assert.equal(plans[0].workspace, a.body.workspace.id);
    assert.equal((await call(a.body.token, 'delete', '/api/tasks/' + id)).status, 200);
  } finally { for (const method of methods) Task[method] = original[method]; }
});

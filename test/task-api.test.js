import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Task from '../src/models/Task.js';

const app = createApp();
const taskMethods = ['create', 'find', 'findById', 'findByIdAndUpdate', 'findByIdAndDelete'];
const originalMethods = Object.fromEntries(taskMethods.map((method) => [method, Task[method]]));
let currentTask;

beforeEach(() => {
  currentTask = null;
  Task.create = async (fields) => {
    currentTask = {
      _id: new mongoose.Types.ObjectId(),
      status: 'pending',
      ...fields
    };
    return currentTask;
  };
  Task.find = () => ({ sort: async () => (currentTask ? [currentTask] : []) });
  Task.findById = async (id) => currentTask?._id.toString() === id ? currentTask : null;
  Task.findByIdAndUpdate = async (id, fields) => {
    if (currentTask?._id.toString() !== id) {
      return null;
    }
    currentTask = { ...currentTask, ...fields };
    return currentTask;
  };
  Task.findByIdAndDelete = async (id) => {
    if (currentTask?._id.toString() !== id) {
      return null;
    }
    const deletedTask = currentTask;
    currentTask = null;
    return deletedTask;
  };
});

afterEach(() => {
  for (const method of taskMethods) {
    Task[method] = originalMethods[method];
  }
});

test('task CRUD, validation, invalid IDs, and missing tasks', async () => {
  const missingTitle = await request(app).post('/api/tasks').send({ description: 'No title' });
  assert.equal(missingTitle.status, 400);
  assert.match(missingTitle.body.error, /title/i);

  const invalidStatus = await request(app).post('/api/tasks').send({ title: 'Write tests', status: 'blocked' });
  assert.equal(invalidStatus.status, 400);
  assert.match(invalidStatus.body.error, /status/i);

  const invalidDueDate = await request(app).post('/api/tasks').send({ title: 'Write tests', dueDate: 12345 });
  assert.equal(invalidDueDate.status, 400);
  assert.match(invalidDueDate.body.error, /date/i);

  const created = await request(app).post('/api/tasks').send({
    title: 'Write tests',
    description: 'Cover task management',
    dueDate: '2030-01-10T00:00:00.000Z'
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.task.status, 'pending');
  const taskId = created.body.task._id;

  const allTasks = await request(app).get('/api/tasks/');
  assert.equal(allTasks.status, 200);
  assert.equal(allTasks.body.count, 1);
  assert.equal(allTasks.body.tasks[0].title, 'Write tests');

  const fetched = await request(app).get(`/api/tasks/${taskId}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.task.title, 'Write tests');

  const updated = await request(app).put(`/api/tasks/${taskId}`).send({ status: 'in-progress' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.task.status, 'in-progress');

  const badUpdate = await request(app).put(`/api/tasks/${taskId}`).send({ status: 'blocked' });
  assert.equal(badUpdate.status, 400);

  const invalidId = await request(app).get('/api/tasks/not-an-object-id');
  assert.equal(invalidId.status, 400);

  const absentId = new mongoose.Types.ObjectId().toString();
  for (const method of ['get', 'put', 'delete']) {
    const result = await request(app)[method](`/api/tasks/${absentId}`).send({ title: 'Updated' });
    assert.equal(result.status, 404, `${method} should return 404 for a missing task`);
  }

  const deleted = await request(app).delete(`/api/tasks/${taskId}`);
  assert.equal(deleted.status, 200);
  const afterDelete = await request(app).get(`/api/tasks/${taskId}`);
  assert.equal(afterDelete.status, 404);
});

test('task routes reject invalid IDs for update and delete', async () => {
  const updated = await request(app).put('/api/tasks/invalid').send({ title: 'Updated' });
  const deleted = await request(app).delete('/api/tasks/invalid');
  assert.equal(updated.status, 400);
  assert.equal(deleted.status, 400);
});

test('health check and task collection work without a trailing slash', async () => {
  const health = await request(app).get('/health');
  const tasks = await request(app).get('/api/tasks');

  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { success: true, status: 'ok' });
  assert.equal(tasks.status, 200);
  assert.equal(tasks.body.success, true);
});
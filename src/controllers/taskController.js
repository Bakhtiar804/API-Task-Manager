import mongoose from 'mongoose';
import Task from '../models/Task.js';

const writableFields = new Set(['title', 'description', 'status', 'dueDate']);
const validStatuses = new Set(['pending', 'in-progress', 'completed']);

function validateTaskFields(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }

  const fields = Object.keys(body);
  const unsupported = fields.find((field) => !writableFields.has(field));
  if (unsupported) {
    return `Unsupported field: ${unsupported}`;
  }

  if (!partial && (typeof body.title !== 'string' || !body.title.trim())) {
    return 'Title is required';
  }
  if (partial && Object.hasOwn(body, 'title') && (typeof body.title !== 'string' || !body.title.trim())) {
    return 'Title must be a non-empty string';
  }
  if (Object.hasOwn(body, 'description') && typeof body.description !== 'string') {
    return 'Description must be a string';
  }
  if (Object.hasOwn(body, 'status') && !validStatuses.has(body.status)) {
    return 'Status must be pending, in-progress or completed';
  }
  if (Object.hasOwn(body, 'dueDate') && body.dueDate !== null
    && (typeof body.dueDate !== 'string' || Number.isNaN(Date.parse(body.dueDate)))) {
    return 'Due date must be a valid date string';
  }
  if (partial && fields.length === 0) {
    return 'At least one task field must be provided';
  }

  return null;
}

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function invalidId(response) {
  return response.status(400).json({ success: false, error: 'Invalid task ID' });
}

export async function createTask(request, response, next) {
  const validationError = validateTaskFields(request.body);
  if (validationError) {
    return response.status(400).json({ success: false, error: validationError });
  }

  try {
    const task = await Task.create(request.body);
    return response.status(201).json({ success: true, task });
  } catch (error) {
    return next(error);
  }
}

export async function getTasks(request, response, next) {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    return response.status(200).json({ success: true, count: tasks.length, tasks });
  } catch (error) {
    return next(error);
  }
}

export async function getTask(request, response, next) {
  if (!isValidId(request.params.id)) {
    return invalidId(response);
  }

  try {
    const task = await Task.findById(request.params.id);
    if (!task) {
      return response.status(404).json({ success: false, error: 'Task not found' });
    }
    return response.status(200).json({ success: true, task });
  } catch (error) {
    return next(error);
  }
}

export async function updateTask(request, response, next) {
  if (!isValidId(request.params.id)) {
    return invalidId(response);
  }

  const validationError = validateTaskFields(request.body, { partial: true });
  if (validationError) {
    return response.status(400).json({ success: false, error: validationError });
  }

  try {
    const task = await Task.findByIdAndUpdate(request.params.id, request.body, {
      new: true,
      runValidators: true
    });
    if (!task) {
      return response.status(404).json({ success: false, error: 'Task not found' });
    }
    return response.status(200).json({ success: true, task });
  } catch (error) {
    return next(error);
  }
}

export async function deleteTask(request, response, next) {
  if (!isValidId(request.params.id)) {
    return invalidId(response);
  }

  try {
    const task = await Task.findByIdAndDelete(request.params.id);
    if (!task) {
      return response.status(404).json({ success: false, error: 'Task not found' });
    }
    return response.status(200).json({ success: true, message: 'Task deleted' });
  } catch (error) {
    return next(error);
  }
}
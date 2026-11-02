import requestImpl from 'supertest';
import { createApp as realCreateApp } from './src/app.js';
export const workspaceId = '000000000000000000000001';
export const token = 'forma_' + 'a'.repeat(64);
export const createApp = (options = {}) => realCreateApp({ workspaceStore: { findOne: async () => ({ _id: workspaceId }) }, ...options });
export const request = (app) => new Proxy(requestImpl(app), {
  get(target, method) {
    if (['get', 'post', 'put', 'patch', 'delete', 'options'].includes(method)) return (...args) => target[method](...args).set('Authorization', 'Bearer ' + token);
    return target[method];
  }
});

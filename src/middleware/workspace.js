import { createHash, randomBytes } from 'node:crypto';

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const validToken = (token) => /^forma_[a-f0-9]{64}$/.test(token || '');

export function workspaceAccess(store) {
  return async (request, response, next) => {
    const token = request.get('Authorization')?.replace(/^Bearer /, '');
    response.setHeader('Cache-Control', 'no-store');
    if (!validToken(token)) return response.status(401).json({ success: false, error: 'A private workspace code is required', code: 'WORKSPACE_REQUIRED' });
    try {
      const workspace = await store.findOne({ tokenHash: hashToken(token) });
      if (!workspace) return response.status(401).json({ success: false, error: 'Workspace code is invalid or no longer active', code: 'WORKSPACE_INVALID' });
      request.workspaceId = workspace._id;
      next();
    } catch (error) { next(error); }
  };
}

export function createWorkspace(store) {
  return async (request, response, next) => {
    const token = 'forma_' + randomBytes(32).toString('hex');
    try {
      const workspace = await store.create({ tokenHash: hashToken(token) });
      response.setHeader('Cache-Control', 'no-store');
      response.status(201).json({ success: true, token, workspace: { id: workspace._id } });
    } catch (error) { next(error); }
  };
}

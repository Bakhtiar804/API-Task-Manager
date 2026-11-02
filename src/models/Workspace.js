import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false }
}, { timestamps: true });

export default mongoose.model('Workspace', workspaceSchema);

import mongoose from 'mongoose';

const aiPlanSchema = new mongoose.Schema({
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [1, 'Description is required'],
    maxlength: [4000, 'Description must be 4000 characters or fewer']
  },
  summary: {
    type: String,
    required: [true, 'Summary is required'],
    trim: true,
    minlength: [1, 'Summary is required']
  },
  priority: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high']
  },
  estimatedHours: {
    type: Number,
    required: true,
    min: [Number.EPSILON, 'Estimated hours must be greater than zero']
  },
  steps: {
    type: [{ type: String, trim: true, minlength: 1 }],
    required: true,
    validate: {
      validator: (steps) => Array.isArray(steps) && steps.length > 0,
      message: 'At least one step is required'
    }
  }
}, { timestamps: true });

export default mongoose.model('AiPlan', aiPlanSchema);
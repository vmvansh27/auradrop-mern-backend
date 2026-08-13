const { Schema, model } = require('mongoose');

module.exports = model('RoadmapItem', new Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['completed', 'in_progress', 'planned'], default: 'planned' },
  targetLabel: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

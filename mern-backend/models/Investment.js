const { Schema, model } = require('mongoose');
module.exports = model('Investment', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: Schema.Types.ObjectId, ref: 'InvestmentPlan' },
  amount: { type: Number, required: true },
  roi: { type: Number, required: true },
  expectedReturn: { type: Number, required: true },
  startedAt: { type: Date, default: Date.now },
  maturesAt: { type: Date, required: true },
  status: { type: String, enum: ['active', 'matured', 'cancelled'], default: 'active' },
}, { timestamps: true }));

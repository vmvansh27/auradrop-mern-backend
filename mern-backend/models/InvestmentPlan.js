const { Schema, model } = require('mongoose');

module.exports = model('InvestmentPlan', new Schema({
  name: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  roi: { type: Number, required: true, min: 0 },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { timestamps: true }));

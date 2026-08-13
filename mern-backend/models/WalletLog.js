const { Schema, model } = require('mongoose');
module.exports = model('WalletLog', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  direction: { type: String, enum: ['in','out'] },
  amount: Number,
  hash: String,
  from: String,
  to: String,
  confirmations: Number,
  status: String,
}, { timestamps: true }));

const { Schema, model } = require('mongoose');
module.exports = model('Transaction', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['deposit','withdraw','investment','profit','referral','signup_bonus'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending','completed','rejected','active'], default: 'pending' },
  hash: String,
  note: String,
}, { timestamps: true }));

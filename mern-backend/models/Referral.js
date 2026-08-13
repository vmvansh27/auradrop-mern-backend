const { Schema, model } = require('mongoose');
module.exports = model('Referral', new Schema({
  referrer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  referred: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reward: { type: Number, default: 0 },
}, { timestamps: true }));

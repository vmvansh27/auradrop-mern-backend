const { Schema, model } = require('mongoose');
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  name: String,
  isAdmin: { type: Boolean, default: false },
  balance: { type: Number, default: 0 },
  invested: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  referralEarnings: { type: Number, default: 0 },
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  currentLevel: { type: String, default: 'Level 1' },
  walletAddress: String, // BEP20 deposit address (derived/assigned)
  kycStatus: { type: String, enum: ['not_started', 'pending', 'approved', 'rejected'], default: 'not_started' },
  otp: { code: String, expiresAt: Date },
}, { timestamps: true });
module.exports = model('User', userSchema);

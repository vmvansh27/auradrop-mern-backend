const { Schema, model } = require('mongoose');

module.exports = model('KycSubmission', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  country: { type: String, required: true, trim: true },
  documentType: { type: String, required: true, trim: true },
  documentNumber: { type: String, required: true, trim: true },
  documentFrontUrl: { type: String, required: true, trim: true },
  documentBackUrl: { type: String, trim: true },
  selfieUrl: { type: String, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectionReason: String,
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
}, { timestamps: true }));

const { Schema, model } = require('mongoose');

module.exports = model('Notification', new Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  image: String,
  type: { type: String, enum: ['info', 'success', 'warning'], default: 'info' },
  active: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

const { Schema, model } = require('mongoose');

module.exports = model('SocialLink', new Schema({
  label: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  icon: { type: String, trim: true, default: 'globe' },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

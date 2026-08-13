const { Schema, model } = require('mongoose');

module.exports = model('Post', new Schema({
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  image: String,
  published: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

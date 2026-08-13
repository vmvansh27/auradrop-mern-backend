const mongoose = require('mongoose');
module.exports = async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');
};

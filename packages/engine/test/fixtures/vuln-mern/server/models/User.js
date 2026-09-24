const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: String,
  role: { type: String, default: 'user' },
  apiKey: { type: String, select: false },
});

module.exports = mongoose.model('User', userSchema);

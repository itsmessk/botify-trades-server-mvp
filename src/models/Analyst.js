const mongoose = require('mongoose');

const analystSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  bio: {
    type: String,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  subscriberCount: {
    type: Number,
    default: 0,
  },
  winRate: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

module.exports = mongoose.model('Analyst', analystSchema);

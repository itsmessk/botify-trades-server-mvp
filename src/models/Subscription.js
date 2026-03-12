const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  analystId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Analyst',
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

subscriptionSchema.index({ userId: 1, analystId: 1 }, { unique: true });
subscriptionSchema.index({ analystId: 1, isActive: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);

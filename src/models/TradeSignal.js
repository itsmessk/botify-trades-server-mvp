const mongoose = require('mongoose');

const tradeSignalSchema = new mongoose.Schema({
  analystId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Analyst',
    required: true,
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  action: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  orderType: {
    type: String,
    enum: ['MARKET', 'LIMIT'],
    required: true,
  },
  limitPrice: {
    type: Number,
    default: null,
  },
  status: {
    type: String,
    enum: ['PENDING', 'FILLED', 'FAILED'],
    default: 'PENDING',
  },
  ibkrOrderId: {
    type: String,
    default: null,
  },
  executedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

tradeSignalSchema.index({ analystId: 1, createdAt: -1 });

module.exports = mongoose.model('TradeSignal', tradeSignalSchema);

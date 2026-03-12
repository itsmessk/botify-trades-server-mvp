const mongoose = require('mongoose');

const copiedTradeSchema = new mongoose.Schema({
  tradeSignalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TradeSignal',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
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
  filledPrice: {
    type: Number,
    default: null,
  },
  filledQty: {
    type: Number,
    default: null,
  },
  error: {
    type: String,
    default: null,
  },
  executedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

copiedTradeSchema.index({ userId: 1, createdAt: -1 });
copiedTradeSchema.index({ tradeSignalId: 1 });

module.exports = mongoose.model('CopiedTrade', copiedTradeSchema);

const { z } = require('zod');
const { Analyst, TradeSignal, Subscription, AuditLog, User } = require('../models');
const tradeQueue = require('../lib/queue/tradeQueue');
const IBKRClient = process.env.IBKR_MOCK === 'true'
  ? require('../lib/ibkr/MockIBKRClient')
  : require('../lib/ibkr/IBKRClient');
const { decrypt } = require('../lib/crypto/encryption');
const logger = require('../config/logger');

// Zod schema for trade signal creation
const signalSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required').max(10).toUpperCase(),
  action: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive('Quantity must be positive'),
  orderType: z.enum(['MARKET', 'LIMIT']),
  limitPrice: z.number().positive().optional().nullable(),
}).refine(
  (data) => !(data.orderType === 'LIMIT' && !data.limitPrice),
  { message: 'Limit price is required for LIMIT orders', path: ['limitPrice'] }
);

// POST /api/analyst/signal — Create and execute a trade signal
async function createSignal(req, res, next) {
  try {
    const data = signalSchema.parse(req.body);

    // Find analyst profile for this user
    const analyst = await Analyst.findOne({ userId: req.user._id });
    if (!analyst) {
      return res.status(404).json({ message: 'Analyst profile not found' });
    }

    // Create the trade signal in DB
    const signal = await TradeSignal.create({
      analystId: analyst._id,
      symbol: data.symbol,
      action: data.action,
      quantity: data.quantity,
      orderType: data.orderType,
      limitPrice: data.limitPrice || null,
      status: 'PENDING',
    });

    // Execute the analyst's own trade on IBKR (if they have credentials)
    const user = await User.findById(req.user._id);
    if (user.ibkrApiKeyEncrypted && user.ibkrAccountId) {
      try {
        const apiKey = decrypt(user.ibkrApiKeyEncrypted, process.env.ENCRYPTION_KEY);
        const ibkr = new IBKRClient(apiKey, user.ibkrAccountId);
        await ibkr.authenticate();

        const orderResult = await ibkr.placeOrder({
          symbol: data.symbol,
          action: data.action,
          quantity: data.quantity,
          orderType: data.orderType,
          limitPrice: data.limitPrice,
        });

        ibkr.destroy();

        signal.status = 'FILLED';
        signal.ibkrOrderId = orderResult?.order_id || orderResult?.[0]?.order_id || null;
        signal.executedAt = new Date();
        await signal.save();

        logger.info(`Analyst ${analyst._id} signal executed: ${data.symbol} ${data.action}`);
      } catch (ibkrError) {
        logger.error(`Analyst IBKR order failed: ${ibkrError.message}`);
        signal.status = 'FAILED';
        await signal.save();
      }
    } else {
      // No IBKR credentials — mark as filled (signal-only mode)
      signal.status = 'FILLED';
      signal.executedAt = new Date();
      await signal.save();
    }

    // Enqueue trade copy job for all subscribers
    await tradeQueue.add('copy-trade', {
      tradeSignalId: signal._id.toString(),
      analystId: analyst._id.toString(),
    });

    await AuditLog.create({
      userId: req.user._id,
      action: 'CREATE_SIGNAL',
      metadata: { signalId: signal._id, symbol: data.symbol, action: data.action },
    });

    logger.info(`Trade signal created: ${signal._id}`);

    res.status(201).json({
      message: 'Trade signal created and queued for copy',
      signal,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/analyst/signals — Analyst's own trade history
async function getSignals(req, res, next) {
  try {
    const analyst = await Analyst.findOne({ userId: req.user._id });
    if (!analyst) {
      return res.status(404).json({ message: 'Analyst profile not found' });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const [signals, total] = await Promise.all([
      TradeSignal.find({ analystId: analyst._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      TradeSignal.countDocuments({ analystId: analyst._id }),
    ]);

    res.json({
      signals,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/analyst/subscribers — Analyst's subscriber list
async function getSubscribers(req, res, next) {
  try {
    const analyst = await Analyst.findOne({ userId: req.user._id });
    if (!analyst) {
      return res.status(404).json({ message: 'Analyst profile not found' });
    }

    const subscriptions = await Subscription.find({
      analystId: analyst._id,
      isActive: true,
    }).populate('userId', 'email createdAt');

    res.json({
      subscriberCount: subscriptions.length,
      subscribers: subscriptions.map((s) => ({
        id: s.userId._id,
        email: s.userId.email,
        subscribedAt: s.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/analyst/profile — Get analyst's own profile
async function getProfile(req, res, next) {
  try {
    const analyst = await Analyst.findOne({ userId: req.user._id }).populate('userId', 'email');
    if (!analyst) {
      return res.status(404).json({ message: 'Analyst profile not found' });
    }

    const totalSignals = await TradeSignal.countDocuments({ analystId: analyst._id });
    const filledSignals = await TradeSignal.countDocuments({ analystId: analyst._id, status: 'FILLED' });

    res.json({
      analyst: {
        id: analyst._id,
        email: analyst.userId.email,
        bio: analyst.bio,
        subscriberCount: analyst.subscriberCount,
        winRate: analyst.winRate,
        totalSignals,
        filledSignals,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { createSignal, getSignals, getSubscribers, getProfile, signalSchema };

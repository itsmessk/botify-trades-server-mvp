const { z } = require('zod');
const { User, Analyst, Subscription, CopiedTrade, AuditLog } = require('../models');
const { encrypt } = require('../lib/crypto/encryption');
const IBKRClient = process.env.IBKR_MOCK === 'true'
  ? require('../lib/ibkr/MockIBKRClient')
  : require('../lib/ibkr/IBKRClient');
const logger = require('../config/logger');

// Zod schema for IBKR connection
const ibkrConnectSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  accountId: z.string().min(1, 'Account ID is required'),
});

// POST /api/user/ibkr-connect — Save and validate IBKR API key
async function ibkrConnect(req, res, next) {
  try {
    const { apiKey, accountId } = ibkrConnectSchema.parse(req.body);

    // Validate IBKR credentials by attempting connection
    try {
      const ibkr = new IBKRClient(apiKey, accountId);
      await ibkr.authenticate();
      ibkr.destroy();
    } catch (ibkrError) {
      logger.warn(`IBKR validation failed for user ${req.user._id}: ${ibkrError.message}`);
      // Allow saving even if validation fails — IBKR gateway may not be running
    }

    // Encrypt the API key before storing
    const encryptedKey = encrypt(apiKey, process.env.ENCRYPTION_KEY);

    await User.findByIdAndUpdate(req.user._id, {
      ibkrApiKeyEncrypted: encryptedKey,
      ibkrAccountId: accountId,
    });

    await AuditLog.create({
      userId: req.user._id,
      action: 'IBKR_CONNECT',
      metadata: { accountId },
    });

    logger.info(`User ${req.user._id} connected IBKR account ${accountId}`);

    res.json({ message: 'IBKR account connected successfully' });
  } catch (error) {
    next(error);
  }
}

// POST /api/user/subscribe/:analystId — Subscribe to an analyst
async function subscribe(req, res, next) {
  try {
    const { analystId } = req.params;

    const analyst = await Analyst.findById(analystId);
    if (!analyst || !analyst.isActive) {
      return res.status(404).json({ message: 'Analyst not found or inactive' });
    }

    // Check if already subscribed
    const existing = await Subscription.findOne({
      userId: req.user._id,
      analystId,
    });

    if (existing && existing.isActive) {
      return res.status(409).json({ message: 'Already subscribed to this analyst' });
    }

    if (existing && !existing.isActive) {
      // Reactivate existing subscription
      existing.isActive = true;
      await existing.save();
    } else {
      await Subscription.create({
        userId: req.user._id,
        analystId,
      });
    }

    // Increment subscriber count
    await Analyst.findByIdAndUpdate(analystId, { $inc: { subscriberCount: 1 } });

    await AuditLog.create({
      userId: req.user._id,
      action: 'SUBSCRIBE',
      metadata: { analystId },
    });

    logger.info(`User ${req.user._id} subscribed to analyst ${analystId}`);

    res.json({ message: 'Subscribed successfully' });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/user/unsubscribe/:analystId — Unsubscribe from an analyst
async function unsubscribe(req, res, next) {
  try {
    const { analystId } = req.params;

    const subscription = await Subscription.findOne({
      userId: req.user._id,
      analystId,
      isActive: true,
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    subscription.isActive = false;
    await subscription.save();

    await Analyst.findByIdAndUpdate(analystId, { $inc: { subscriberCount: -1 } });

    await AuditLog.create({
      userId: req.user._id,
      action: 'UNSUBSCRIBE',
      metadata: { analystId },
    });

    logger.info(`User ${req.user._id} unsubscribed from analyst ${analystId}`);

    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    next(error);
  }
}

// GET /api/user/analysts — Browse all active analysts
async function getAnalysts(req, res, next) {
  try {
    const analysts = await Analyst.find({ isActive: true })
      .populate('userId', 'email');

    // Get user's current subscriptions
    const subscriptions = await Subscription.find({
      userId: req.user._id,
      isActive: true,
    });
    const subscribedIds = new Set(subscriptions.map((s) => s.analystId.toString()));

    const result = analysts.map((a) => ({
      id: a._id,
      email: a.userId.email,
      bio: a.bio,
      subscriberCount: a.subscriberCount,
      winRate: a.winRate,
      isSubscribed: subscribedIds.has(a._id.toString()),
    }));

    res.json({ analysts: result });
  } catch (error) {
    next(error);
  }
}

// GET /api/user/trades — User's copied trade history
async function getTrades(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const [trades, total] = await Promise.all([
      CopiedTrade.find({ userId: req.user._id })
        .populate({
          path: 'tradeSignalId',
          select: 'symbol action quantity orderType limitPrice status',
          populate: { path: 'analystId', select: 'userId', populate: { path: 'userId', select: 'email' } },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CopiedTrade.countDocuments({ userId: req.user._id }),
    ]);

    res.json({
      trades,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { ibkrConnect, subscribe, unsubscribe, getAnalysts, getTrades, ibkrConnectSchema };

const { Worker } = require('bullmq');
const redis = require('../../config/redis');
const logger = require('../../config/logger');
const { TradeSignal, Subscription, CopiedTrade, User } = require('../../models');
const { decrypt } = require('../crypto/encryption');
const IBKRClient = process.env.IBKR_MOCK === 'true'
  ? require('../ibkr/MockIBKRClient')
  : require('../ibkr/IBKRClient');
const { getIO } = require('../socket/socket');

/**
 * BullMQ Worker: Trade Copier
 *
 * Steps:
 * 1. Receive job with tradeSignalId and analystId
 * 2. Fetch the TradeSignal from MongoDB
 * 3. Query all active subscriptions for this analyst
 * 4. For each subscriber:
 *    a. Decrypt their IBKR API key
 *    b. Instantiate IBKRClient
 *    c. Place the order
 *    d. Save CopiedTrade result
 *    e. Emit real-time notification via Socket.io
 * 5. Emit admin broadcast
 */
const tradeCopierWorker = new Worker(
  'trade-copier',
  async (job) => {
    const { tradeSignalId, analystId } = job.data;
    logger.info(`Processing trade copy job: signal=${tradeSignalId}, analyst=${analystId}`);

    // 1. Fetch the trade signal
    const signal = await TradeSignal.findById(tradeSignalId);
    if (!signal) {
      throw new Error(`TradeSignal not found: ${tradeSignalId}`);
    }

    // 2. Get all active subscribers for this analyst
    const subscriptions = await Subscription.find({
      analystId,
      isActive: true,
    }).populate('userId');

    logger.info(`Copying trade to ${subscriptions.length} subscribers`);

    const io = getIO();

    // 3. Process each subscriber
    for (const sub of subscriptions) {
      const user = sub.userId;
      let copiedTrade;

      try {
        // In real mode, skip users without IBKR credentials
        if (!user.ibkrApiKeyEncrypted || !user.ibkrAccountId) {
          if (process.env.IBKR_MOCK !== 'true') {
            logger.warn(`User ${user._id} has no IBKR credentials, skipping`);
            copiedTrade = await CopiedTrade.create({
              tradeSignalId: signal._id,
              userId: user._id,
              status: 'FAILED',
              error: 'No IBKR credentials configured',
            });
            io.to(`user:${user._id}`).emit('trade:failed', {
              tradeId: copiedTrade._id,
              symbol: signal.symbol,
              error: 'No IBKR credentials configured',
            });
            continue;
          }
          // Mock mode: proceed with dummy credentials so users can see simulated trades
          logger.info(`User ${user._id} has no IBKR credentials — using mock fallback`);
        }

        // Decrypt the user's IBKR API key (or use dummy in mock mode)
        const apiKey = (user.ibkrApiKeyEncrypted)
          ? decrypt(user.ibkrApiKeyEncrypted, process.env.ENCRYPTION_KEY)
          : 'mock-api-key';
        const accountId = user.ibkrAccountId || 'mock-account-id';

        // Create IBKR client instance for this user
        const ibkr = new IBKRClient(apiKey, accountId);

        // Authenticate the session
        await ibkr.authenticate();

        // Place the order matching the analyst's signal
        const orderResult = await ibkr.placeOrder({
          symbol: signal.symbol,
          action: signal.action,
          quantity: signal.quantity,
          orderType: signal.orderType,
          limitPrice: signal.limitPrice,
        });

        // Clean up the IBKR session
        ibkr.destroy();

        // Save successful copied trade
        copiedTrade = await CopiedTrade.create({
          tradeSignalId: signal._id,
          userId: user._id,
          status: 'FILLED',
          ibkrOrderId: orderResult?.order_id || orderResult?.[0]?.order_id || null,
          filledPrice: signal.limitPrice || null,
          filledQty: signal.quantity,
          executedAt: new Date(),
        });

        logger.info(`Trade copied for user ${user._id}: ${signal.symbol} ${signal.action}`);

        // Emit success to the user's personal room
        io.to(`user:${user._id}`).emit('trade:copied', {
          tradeId: copiedTrade._id,
          symbol: signal.symbol,
          action: signal.action,
          qty: signal.quantity,
          status: 'FILLED',
        });
      } catch (error) {
        logger.error(`Trade copy failed for user ${user._id}: ${error.message}`);

        copiedTrade = await CopiedTrade.create({
          tradeSignalId: signal._id,
          userId: user._id,
          status: 'FAILED',
          error: error.message,
        });

        io.to(`user:${user._id}`).emit('trade:failed', {
          tradeId: copiedTrade._id,
          symbol: signal.symbol,
          error: error.message,
        });
      }

      // Emit to admin room for all outcomes
      io.to('admin-room').emit('trade:update', {
        tradeSignalId: signal._id,
        copiedTradeId: copiedTrade._id,
        userId: user._id,
        symbol: signal.symbol,
        action: signal.action,
        quantity: signal.quantity,
        status: copiedTrade.status,
      });
    }

    logger.info(`Trade copy job completed: signal=${tradeSignalId}`);
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

tradeCopierWorker.on('failed', (job, err) => {
  logger.error(`Trade copier job ${job.id} failed: ${err.message}`);
});

tradeCopierWorker.on('completed', (job) => {
  logger.info(`Trade copier job ${job.id} completed`);
});

module.exports = tradeCopierWorker;

const { User, TradeSignal, CopiedTrade, AuditLog, Analyst, Subscription } = require('../models');
const logger = require('../config/logger');

// GET /api/admin/transactions — All trades (paginated + filtered)
async function getTransactions(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [copiedTrades, total] = await Promise.all([
      CopiedTrade.find(filter)
        .populate('userId', 'email')
        .populate({
          path: 'tradeSignalId',
          select: 'symbol action quantity orderType limitPrice status analystId executedAt',
          populate: {
            path: 'analystId',
            select: 'userId',
            populate: { path: 'userId', select: 'email' },
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CopiedTrade.countDocuments(filter),
    ]);

    // Also get trade signals directly (analyst's own trades)
    const signalFilter = {};
    if (req.query.status) {
      signalFilter.status = req.query.status;
    }

    const transactions = copiedTrades.map((ct) => ({
      id: ct._id,
      user: ct.userId?.email || 'N/A',
      analyst: ct.tradeSignalId?.analystId?.userId?.email || 'N/A',
      symbol: ct.tradeSignalId?.symbol || 'N/A',
      action: ct.tradeSignalId?.action || 'N/A',
      quantity: ct.tradeSignalId?.quantity || 0,
      price: ct.filledPrice,
      status: ct.status,
      error: ct.error,
      time: ct.executedAt || ct.createdAt,
    }));

    res.json({
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/users — All users
async function getUsers(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.role) {
      filter.role = req.query.role;
    }
    if (req.query.search) {
      filter.email = { $regex: req.query.search, $options: 'i' };
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-passwordHash -refreshToken -ibkrApiKeyEncrypted')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/users/:id/status — Activate/deactivate user
async function updateUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deactivating superadmins (only another superadmin can)
    if (user.role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Cannot modify superadmin status' });
    }

    user.isActive = isActive;
    await user.save();

    // If deactivating an analyst, also deactivate their analyst profile
    if (!isActive && user.role === 'analyst') {
      await Analyst.findOneAndUpdate({ userId: user._id }, { isActive: false });
    }
    if (isActive && user.role === 'analyst') {
      await Analyst.findOneAndUpdate({ userId: user._id }, { isActive: true });
    }

    await AuditLog.create({
      userId: req.user._id,
      action: isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      metadata: { targetUserId: id },
    });

    logger.info(`User ${id} ${isActive ? 'activated' : 'deactivated'} by ${req.user._id}`);

    res.json({ message: `User ${isActive ? 'activated' : 'deactivated'}` });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/stats — Platform statistics (superadmin)
async function getStats(req, res, next) {
  try {
    const [
      totalUsers,
      totalAnalysts,
      totalSubscriptions,
      totalSignals,
      totalCopiedTrades,
      filledTrades,
      failedTrades,
    ] = await Promise.all([
      User.countDocuments(),
      Analyst.countDocuments(),
      Subscription.countDocuments({ isActive: true }),
      TradeSignal.countDocuments(),
      CopiedTrade.countDocuments(),
      CopiedTrade.countDocuments({ status: 'FILLED' }),
      CopiedTrade.countDocuments({ status: 'FAILED' }),
    ]);

    res.json({
      stats: {
        totalUsers,
        totalAnalysts,
        totalSubscriptions,
        totalSignals,
        totalCopiedTrades,
        filledTrades,
        failedTrades,
        successRate: totalCopiedTrades > 0
          ? ((filledTrades / totalCopiedTrades) * 100).toFixed(1)
          : 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getTransactions, getUsers, updateUserStatus, getStats };

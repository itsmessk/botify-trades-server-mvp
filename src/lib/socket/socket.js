const jwt = require('jsonwebtoken');
const logger = require('../../config/logger');

let io = null;

/**
 * Initialize Socket.io with the HTTP server.
 * Authenticates connections via JWT and assigns users to rooms.
 */
function initSocket(server) {
  const { Server } = require('socket.io');

  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true,
    },
  });

  // JWT authentication middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      next();
    } catch (error) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: user ${socket.userId}`);

    // Join user's personal room for targeted notifications
    socket.join(`user:${socket.userId}`);

    // Admin/SuperAdmin also join the admin room for broadcast updates
    if (socket.userRole === 'admin' || socket.userRole === 'superadmin') {
      socket.join('admin-room');
    }

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: user ${socket.userId}`);
    });
  });

  logger.info('Socket.io initialized');
  return io;
}

/**
 * Get the Socket.io instance (must be initialized first).
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocket(server) first.');
  }
  return io;
}

module.exports = { initSocket, getIO };

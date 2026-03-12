require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./config/logger');
const { initSocket } = require('./lib/socket/socket');

// Import worker so it starts processing jobs
require('./lib/queue/tradeCopier.worker');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Create HTTP server and attach Socket.io
    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

start();

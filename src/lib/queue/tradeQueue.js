const { Queue } = require('bullmq');
const redis = require('../../config/redis');

const tradeQueue = new Queue('trade-copier', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

module.exports = tradeQueue;

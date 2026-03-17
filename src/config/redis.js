const Redis = require('ioredis');
const logger = require('./logger');

const redisOptions = {
  maxRetriesPerRequest: null,
};

let redis;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, redisOptions);
} else {
  redisOptions.host = process.env.REDIS_HOST || 'localhost';
  redisOptions.port = parseInt(process.env.REDIS_PORT, 10) || 6379;

  if (process.env.REDIS_USER) {
    redisOptions.username = process.env.REDIS_USER;
  }

  if (process.env.REDIS_PASSWORD) {
    redisOptions.password = process.env.REDIS_PASSWORD;
  }

  redis = new Redis(redisOptions);
}

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error(`Redis error: ${err.message}`));

module.exports = redis;

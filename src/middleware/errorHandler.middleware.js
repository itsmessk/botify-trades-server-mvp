const logger = require('../config/logger');

const errorHandler = (err, req, res, _next) => {
  logger.error(`Error: ${err.message}`, { stack: err.stack });

  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: 'Validation error', errors: err.errors });
  }

  if (err.code === 11000) {
    return res.status(409).json({ message: 'Duplicate entry' });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID format' });
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({ message });
};

module.exports = errorHandler;

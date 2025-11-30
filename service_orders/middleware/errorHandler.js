const logger = require('../config/logger');
const { createError } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(err.status || 500).json(createError(
    err.code || 'INTERNAL_ERROR',
    err.message || 'Internal server error'
  ));
};

const notFoundHandler = (req, res) => {
  res.status(404).json(createError('NOT_FOUND', 'Route not found'));
};

module.exports = {
  errorHandler,
  notFoundHandler
};


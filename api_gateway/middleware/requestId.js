// X-Request-ID middleware
const requestIdMiddleware = (req, res, next) => {
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = require('crypto').randomUUID();
  }
  res.setHeader('X-Request-ID', req.headers['x-request-id']);
  next();
};

module.exports = requestIdMiddleware;


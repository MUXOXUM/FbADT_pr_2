const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');
const config = require('./config');
const logger = require('./config/logger');
const { authMiddleware } = require('./middleware/auth');
const limiter = require('./middleware/rateLimit');
const requestIdMiddleware = require('./middleware/requestId');
const createProxy = require('./utils/proxy');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// HTTP Logger
const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || req.id
});

// Middleware
app.use(httpLogger);
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true
}));
app.use(express.json());
app.use('/v1', limiter);
app.use(requestIdMiddleware);

// Apply auth middleware to all routes
app.use('/v1', authMiddleware);

// Proxy routes
app.use('/v1/users', createProxy(config.USERS_SERVICE_URL, {
  '^/v1/users': '/v1/users'
}));

app.use('/v1/orders', createProxy(config.ORDERS_SERVICE_URL, {
  '^/v1/orders': '/v1/orders'
}));

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'OK',
      service: 'API Gateway',
      timestamp: new Date().toISOString()
    }
  });
});

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Start server
app.listen(config.PORT, '0.0.0.0', () => {
  logger.info({ port: config.PORT }, 'API Gateway started');
});

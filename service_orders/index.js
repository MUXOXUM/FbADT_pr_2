const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');
const config = require('./config');
const logger = require('./config/logger');
const orderRoutes = require('./routes/orderRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { ordersDb } = require('./database/orders');

const app = express();

// HTTP Logger
const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || req.id
});

// Middleware
app.use(httpLogger);
app.use(cors());
app.use(express.json());

// Routes
app.use('/v1/orders', orderRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'OK',
      service: 'Orders Service',
      timestamp: new Date().toISOString()
    }
  });
});

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Export app and db for testing
module.exports = { app, ordersDb };

// Start server only if this file is run directly
if (require.main === module) {
  app.listen(config.PORT, '0.0.0.0', () => {
    logger.info({ port: config.PORT }, 'Orders service started');
  });
}

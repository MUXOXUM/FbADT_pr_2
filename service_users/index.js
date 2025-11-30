const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const logger = require('./config/logger');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { usersDb, createUser } = require('./database/users');

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
app.use('/v1/users', authRoutes);
app.use('/v1/users', userRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'OK',
      service: 'Users Service',
      timestamp: new Date().toISOString()
    }
  });
});

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Export app and db for testing
module.exports = { app, usersDb };

// Start server only if this file is run directly
if (require.main === module) {
  app.listen(config.PORT, '0.0.0.0', () => {
    logger.info({ port: config.PORT }, 'Users service started');
    
    // Create default admin user for testing
    const adminId = uuidv4();
    const now = new Date().toISOString();
    bcrypt.hash('admin123', 10).then(hash => {
      createUser({
        id: adminId,
        email: 'admin@example.com',
        passwordHash: hash,
        name: 'Admin User',
        roles: ['admin', 'user'],
        createdAt: now,
        updatedAt: now
      });
      logger.info('Default admin user created: admin@example.com / admin123');
    });
  });
}

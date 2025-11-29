const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const pino = require('pino');
const pinoHttp = require('pino-http');

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Logger setup
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  })
});

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || req.id
});

// Middleware
app.use(httpLogger);
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn({ ip: req.ip }, 'Rate limit exceeded');
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later'
      }
    });
  }
});

app.use('/v1', limiter);

// X-Request-ID middleware
app.use((req, res, next) => {
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = require('crypto').randomUUID();
  }
  res.setHeader('X-Request-ID', req.headers['x-request-id']);
  next();
});

// Service URLs
const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL || 'http://service_users:8000';
const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || 'http://service_orders:8000';

// JWT verification middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authorization token required'
      }
    });
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn({ error: error.message }, 'Invalid token');
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token'
      }
    });
  }
};

// Public routes (no auth required)
const publicRoutes = [
  '/v1/users/register',
  '/v1/users/login'
];

// Check if route is public
const isPublicRoute = (path) => {
  return publicRoutes.some(route => path.startsWith(route));
};

// Auth middleware that skips public routes
const authMiddleware = (req, res, next) => {
  if (isPublicRoute(req.path)) {
    return next();
  }
  verifyToken(req, res, next);
};

// Proxy configuration
const createProxy = (target, pathRewrite) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    onProxyReq: (proxyReq, req, res) => {
      // Forward X-Request-ID
      if (req.headers['x-request-id']) {
        proxyReq.setHeader('X-Request-ID', req.headers['x-request-id']);
      }
      // Forward user info if authenticated
      if (req.user) {
        proxyReq.setHeader('X-User-Id', req.user.userId);
        proxyReq.setHeader('X-User-Roles', JSON.stringify(req.user.roles || []));
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      // Forward X-Request-ID in response
      if (req.headers['x-request-id']) {
        proxyRes.headers['x-request-id'] = req.headers['x-request-id'];
      }
    },
    onError: (err, req, res) => {
      logger.error({ err, path: req.path }, 'Proxy error');
      res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable'
        }
      });
    }
  });
};

// Apply auth middleware to all routes
app.use('/v1', authMiddleware);

// Proxy routes
app.use('/v1/users', createProxy(USERS_SERVICE_URL, {
  '^/v1/users': '/v1/users'
}));

app.use('/v1/orders', createProxy(ORDERS_SERVICE_URL, {
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

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Internal server error'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found'
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'API Gateway started');
});

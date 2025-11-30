const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../config/logger');

// Public routes (no auth required)
const publicRoutes = [
  '/v1/users/register',
  '/v1/users/login'
];

// Check if route is public
const isPublicRoute = (path) => {
  return publicRoutes.some(route => path.startsWith(route));
};

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
    const decoded = jwt.verify(token, config.JWT_SECRET);
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

// Auth middleware that skips public routes
const authMiddleware = (req, res, next) => {
  if (isPublicRoute(req.path)) {
    return next();
  }
  verifyToken(req, res, next);
};

module.exports = {
  authMiddleware,
  isPublicRoute
};


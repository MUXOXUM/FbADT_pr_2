const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('../config/logger');

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

module.exports = createProxy;


const logger = require('../config/logger');

// Extract user from headers (set by gateway)
const getUserFromHeaders = (req) => {
  const userId = req.headers['x-user-id'];
  const rolesHeader = req.headers['x-user-roles'];
  let roles = [];
  
  if (rolesHeader) {
    try {
      roles = JSON.parse(rolesHeader);
    } catch (e) {
      logger.warn('Failed to parse user roles from header');
    }
  }
  
  return { userId, roles };
};

// Check if user is admin
const isAdmin = (req) => {
  const { roles } = getUserFromHeaders(req);
  return Array.isArray(roles) && roles.includes('admin');
};

// Check if user can access order
const canAccessOrder = (req, order) => {
  const { userId, roles } = getUserFromHeaders(req);
  return order.userId === userId || (Array.isArray(roles) && roles.includes('admin'));
};

module.exports = {
  getUserFromHeaders,
  isAdmin,
  canAccessOrder
};


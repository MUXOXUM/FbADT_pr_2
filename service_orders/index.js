const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const axios = require('axios');
const pino = require('pino');
const pinoHttp = require('pino-http');

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL || 'http://service_users:8000';

// Logger setup
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // В production и при запуске тестов не используем pino-pretty,
  // его можно включить вручную через переменную окружения PINO_PRETTY=true
  ...(process.env.PINO_PRETTY === 'true' && {
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
app.use(cors());
app.use(express.json());

// In-memory database
let ordersDb = {};

// Order statuses
const ORDER_STATUS = {
  CREATED: 'created',
  IN_WORK: 'in_work',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Domain events (prepared for message broker integration)
const eventEmitter = {
  events: [],
  emit(eventType, data) {
    const event = {
      id: uuidv4(),
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    };
    this.events.push(event);
    logger.info({ event }, 'Domain event emitted');
    // TODO: Publish to message broker in future iterations
  }
};

// Validation schemas
const orderItemSchema = z.object({
  product: z.string().min(1, 'Product name is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  price: z.number().positive('Price must be positive')
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'At least one item is required')
});

const updateStatusSchema = z.object({
  status: z.enum([ORDER_STATUS.IN_WORK, ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED], {
    errorMap: () => ({ message: 'Invalid status' })
  })
});

// Helper function to create standardized response
const createResponse = (success, data = null, error = null) => {
  return { success, data, error };
};

// Helper function to create error response
const createError = (code, message) => {
  return createResponse(false, null, { code, message });
};

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

// Verify user exists in users service
const verifyUserExists = async (userId) => {
  try {
    const response = await axios.get(`${USERS_SERVICE_URL}/v1/users/${userId}`, {
      headers: {
        'X-User-Id': userId,
        'X-User-Roles': JSON.stringify(['admin'])
      },
      validateStatus: () => true
    });
    return response.status === 200;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to verify user');
    return false;
  }
};

// Check if user can access order
const canAccessOrder = (req, order) => {
  const { userId, roles } = getUserFromHeaders(req);
  return order.userId === userId || (Array.isArray(roles) && roles.includes('admin'));
};

// Create order
app.post('/v1/orders', async (req, res) => {
  try {
    const { userId } = getUserFromHeaders(req);
    
    if (!userId) {
      return res.status(401).json(createError('UNAUTHORIZED', 'User ID not found'));
    }
    
    // Verify user exists
    const userExists = await verifyUserExists(userId);
    if (!userExists) {
      return res.status(404).json(createError('USER_NOT_FOUND', 'User not found'));
    }
    
    const validatedData = createOrderSchema.parse(req.body);
    
    // Calculate total
    const total = validatedData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Create order
    const orderId = uuidv4();
    const now = new Date().toISOString();
    const newOrder = {
      id: orderId,
      userId,
      items: validatedData.items,
      status: ORDER_STATUS.CREATED,
      total,
      createdAt: now,
      updatedAt: now
    };
    
    ordersDb[orderId] = newOrder;
    
    logger.info({ orderId, userId }, 'Order created');
    
    // Emit domain event
    eventEmitter.emit('order.created', {
      orderId,
      userId,
      total,
      items: validatedData.items
    });
    
    res.status(201).json(createResponse(true, newOrder));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createError('VALIDATION_ERROR', error.errors[0].message));
    }
    logger.error({ error }, 'Create order error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to create order'));
  }
});

// Get order by ID
app.get('/v1/orders/:orderId', (req, res) => {
  try {
    const order = ordersDb[req.params.orderId];
    
    if (!order) {
      return res.status(404).json(createError('ORDER_NOT_FOUND', 'Order not found'));
    }
    
    // Check permissions
    if (!canAccessOrder(req, order)) {
      return res.status(403).json(createError('FORBIDDEN', 'Access denied'));
    }
    
    res.json(createResponse(true, order));
  } catch (error) {
    logger.error({ error }, 'Get order error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to get order'));
  }
});

// List orders
app.get('/v1/orders', (req, res) => {
  try {
    const { userId, roles } = getUserFromHeaders(req);
    
    if (!userId) {
      return res.status(401).json(createError('UNAUTHORIZED', 'User ID not found'));
    }
    
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Filter orders
    let orders = Object.values(ordersDb);
    
    // Non-admin users can only see their own orders
    if (!isAdmin(req)) {
      orders = orders.filter(order => order.userId === userId);
    } else if (req.query.userId) {
      // Admin can filter by userId
      orders = orders.filter(order => order.userId === req.query.userId);
    }
    
    // Filter by status
    if (req.query.status) {
      orders = orders.filter(order => order.status === req.query.status);
    }
    
    // Sorting
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
    orders.sort((a, b) => {
      if (sortBy === 'total') {
        return (a.total - b.total) * sortOrder;
      }
      if (sortBy === 'createdAt' || sortBy === 'updatedAt') {
        return (new Date(a[sortBy]) - new Date(b[sortBy])) * sortOrder;
      }
      return 0;
    });
    
    // Paginate
    const total = orders.length;
    const paginatedOrders = orders.slice(offset, offset + limit);
    
    res.json(createResponse(true, {
      orders: paginatedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }));
  } catch (error) {
    logger.error({ error }, 'List orders error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to list orders'));
  }
});

// Update order status
app.patch('/v1/orders/:orderId/status', (req, res) => {
  try {
    const order = ordersDb[req.params.orderId];
    
    if (!order) {
      return res.status(404).json(createError('ORDER_NOT_FOUND', 'Order not found'));
    }
    
    // Check permissions - only admin or order owner can update status
    if (!canAccessOrder(req, order)) {
      return res.status(403).json(createError('FORBIDDEN', 'Access denied'));
    }
    
    // Only admin can update to completed or in_work
    const { roles } = getUserFromHeaders(req);
    const isAdminUser = Array.isArray(roles) && roles.includes('admin');
    const validatedData = updateStatusSchema.parse(req.body);
    
    if (!isAdminUser && validatedData.status !== ORDER_STATUS.CANCELLED) {
      return res.status(403).json(createError('FORBIDDEN', 'Only admin can update status to in_work or completed'));
    }
    
    // Prevent status changes from cancelled or completed
    if (order.status === ORDER_STATUS.CANCELLED) {
      return res.status(400).json(createError('INVALID_STATUS', 'Cannot update cancelled order'));
    }
    
    if (order.status === ORDER_STATUS.COMPLETED && validatedData.status !== ORDER_STATUS.COMPLETED) {
      return res.status(400).json(createError('INVALID_STATUS', 'Cannot change status of completed order'));
    }
    
    // Update order
    const oldStatus = order.status;
    order.status = validatedData.status;
    order.updatedAt = new Date().toISOString();
    
    logger.info({ orderId: order.id, oldStatus, newStatus: validatedData.status }, 'Order status updated');
    
    // Emit domain event
    eventEmitter.emit('order.status_updated', {
      orderId: order.id,
      userId: order.userId,
      oldStatus,
      newStatus: validatedData.status
    });
    
    res.json(createResponse(true, order));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createError('VALIDATION_ERROR', error.errors[0].message));
    }
    logger.error({ error }, 'Update order status error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to update order status'));
  }
});

// Cancel order
app.post('/v1/orders/:orderId/cancel', (req, res) => {
  try {
    const order = ordersDb[req.params.orderId];
    
    if (!order) {
      return res.status(404).json(createError('ORDER_NOT_FOUND', 'Order not found'));
    }
    
    // Check permissions
    if (!canAccessOrder(req, order)) {
      return res.status(403).json(createError('FORBIDDEN', 'Access denied'));
    }
    
    // Prevent cancelling already cancelled or completed orders
    if (order.status === ORDER_STATUS.CANCELLED) {
      return res.status(400).json(createError('INVALID_STATUS', 'Order is already cancelled'));
    }
    
    if (order.status === ORDER_STATUS.COMPLETED) {
      return res.status(400).json(createError('INVALID_STATUS', 'Cannot cancel completed order'));
    }
    
    // Update order
    const oldStatus = order.status;
    order.status = ORDER_STATUS.CANCELLED;
    order.updatedAt = new Date().toISOString();
    
    logger.info({ orderId: order.id }, 'Order cancelled');
    
    // Emit domain event
    eventEmitter.emit('order.status_updated', {
      orderId: order.id,
      userId: order.userId,
      oldStatus,
      newStatus: ORDER_STATUS.CANCELLED
    });
    
    res.json(createResponse(true, order));
  } catch (error) {
    logger.error({ error }, 'Cancel order error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to cancel order'));
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json(createResponse(true, {
    status: 'OK',
    service: 'Orders Service',
    timestamp: new Date().toISOString()
  }));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(err.status || 500).json(createError(
    err.code || 'INTERNAL_ERROR',
    err.message || 'Internal server error'
  ));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json(createError('NOT_FOUND', 'Route not found'));
});

// Export app and db for testing
module.exports = { app, ordersDb };

// Start server only if this file is run directly
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'Orders service started');
  });
}

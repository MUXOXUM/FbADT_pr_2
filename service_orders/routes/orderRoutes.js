const express = require('express');
const { z } = require('zod');
const logger = require('../config/logger');
const { createResponse, createError } = require('../utils/response');
const { createOrderSchema, updateStatusSchema } = require('../models/validation');
const { ORDER_STATUS } = require('../models/constants');
const { getUserFromHeaders, isAdmin, canAccessOrder } = require('../middleware/auth');
const { verifyUserExists } = require('../services/userService');
const { createNewOrder, getOrder, listOrders, updateOrderStatus, cancelOrder } = require('../services/orderService');
const { getOrderById } = require('../database/orders');

const router = express.Router();

// Create order
router.post('/', async (req, res) => {
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
    const order = createNewOrder(userId, validatedData.items);
    res.status(201).json(createResponse(true, order));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createError('VALIDATION_ERROR', error.errors[0].message));
    }
    if (error.status) {
      return res.status(error.status).json(createError(error.code, error.message));
    }
    logger.error({ error }, 'Create order error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to create order'));
  }
});

// Get order by ID
router.get('/:orderId', (req, res) => {
  try {
    const order = getOrderById(req.params.orderId);
    
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
router.get('/', (req, res) => {
  try {
    const { userId, roles } = getUserFromHeaders(req);
    
    if (!userId) {
      return res.status(401).json(createError('UNAUTHORIZED', 'User ID not found'));
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const filters = {};
    // Non-admin users can only see their own orders
    if (!isAdmin(req)) {
      filters.userId = userId;
    } else if (req.query.userId) {
      // Admin can filter by userId
      filters.userId = req.query.userId;
    }
    
    if (req.query.status) {
      filters.status = req.query.status;
    }
    
    const pagination = { page, limit };
    const sortOptions = {
      sortBy: req.query.sortBy || 'createdAt',
      sortOrder: req.query.sortOrder || 'desc'
    };
    
    const result = listOrders(filters, pagination, sortOptions);
    res.json(createResponse(true, result));
  } catch (error) {
    logger.error({ error }, 'List orders error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to list orders'));
  }
});

// Update order status
router.patch('/:orderId/status', (req, res) => {
  try {
    const order = getOrderById(req.params.orderId);
    
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
    
    const updatedOrder = updateOrderStatus(order.id, validatedData.status);
    res.json(createResponse(true, updatedOrder));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(createError('VALIDATION_ERROR', error.errors[0].message));
    }
    if (error.status) {
      return res.status(error.status).json(createError(error.code, error.message));
    }
    logger.error({ error }, 'Update order status error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to update order status'));
  }
});

// Cancel order
router.post('/:orderId/cancel', (req, res) => {
  try {
    const order = getOrderById(req.params.orderId);
    
    if (!order) {
      return res.status(404).json(createError('ORDER_NOT_FOUND', 'Order not found'));
    }
    
    // Check permissions
    if (!canAccessOrder(req, order)) {
      return res.status(403).json(createError('FORBIDDEN', 'Access denied'));
    }
    
    const cancelledOrder = cancelOrder(order.id);
    res.json(createResponse(true, cancelledOrder));
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(createError(error.code, error.message));
    }
    logger.error({ error }, 'Cancel order error');
    res.status(500).json(createError('INTERNAL_ERROR', 'Failed to cancel order'));
  }
});

module.exports = router;


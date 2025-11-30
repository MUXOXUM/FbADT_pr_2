const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const { ORDER_STATUS } = require('../models/constants');
const { getOrderById, createOrder, updateOrder, getAllOrders } = require('../database/orders');
const eventEmitter = require('../utils/events');

const createNewOrder = (userId, items) => {
  // Calculate total
  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Create order
  const orderId = uuidv4();
  const now = new Date().toISOString();
  const newOrder = {
    id: orderId,
    userId,
    items,
    status: ORDER_STATUS.CREATED,
    total,
    createdAt: now,
    updatedAt: now
  };
  
  createOrder(newOrder);
  
  logger.info({ orderId, userId }, 'Order created');
  
  // Emit domain event
  eventEmitter.emit('order.created', {
    orderId,
    userId,
    total,
    items
  });
  
  return newOrder;
};

const getOrder = (orderId) => {
  const order = getOrderById(orderId);
  if (!order) {
    throw { code: 'ORDER_NOT_FOUND', message: 'Order not found', status: 404 };
  }
  return order;
};

const listOrders = (filters = {}, pagination = {}, sortOptions = {}) => {
  const page = pagination.page || 1;
  const limit = pagination.limit || 10;
  const offset = (page - 1) * limit;
  
  // Filter orders
  let orders = getAllOrders();
  
  if (filters.userId) {
    orders = orders.filter(order => order.userId === filters.userId);
  }
  
  if (filters.status) {
    orders = orders.filter(order => order.status === filters.status);
  }
  
  // Sorting
  const sortBy = sortOptions.sortBy || 'createdAt';
  const sortOrder = sortOptions.sortOrder === 'asc' ? 1 : -1;
  
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
  
  return {
    orders: paginatedOrders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const updateOrderStatus = (orderId, newStatus) => {
  const order = getOrderById(orderId);
  if (!order) {
    throw { code: 'ORDER_NOT_FOUND', message: 'Order not found', status: 404 };
  }
  
  // Prevent status changes from cancelled or completed
  if (order.status === ORDER_STATUS.CANCELLED) {
    throw { code: 'INVALID_STATUS', message: 'Cannot update cancelled order', status: 400 };
  }
  
  if (order.status === ORDER_STATUS.COMPLETED && newStatus !== ORDER_STATUS.COMPLETED) {
    throw { code: 'INVALID_STATUS', message: 'Cannot change status of completed order', status: 400 };
  }
  
  const oldStatus = order.status;
  const updatedOrder = updateOrder(orderId, { status: newStatus });
  
  logger.info({ orderId, oldStatus, newStatus }, 'Order status updated');
  
  // Emit domain event
  eventEmitter.emit('order.status_updated', {
    orderId,
    userId: order.userId,
    oldStatus,
    newStatus
  });
  
  return updatedOrder;
};

const cancelOrder = (orderId) => {
  const order = getOrderById(orderId);
  if (!order) {
    throw { code: 'ORDER_NOT_FOUND', message: 'Order not found', status: 404 };
  }
  
  // Prevent cancelling already cancelled or completed orders
  if (order.status === ORDER_STATUS.CANCELLED) {
    throw { code: 'INVALID_STATUS', message: 'Order is already cancelled', status: 400 };
  }
  
  if (order.status === ORDER_STATUS.COMPLETED) {
    throw { code: 'INVALID_STATUS', message: 'Cannot cancel completed order', status: 400 };
  }
  
  const oldStatus = order.status;
  const updatedOrder = updateOrder(orderId, { status: ORDER_STATUS.CANCELLED });
  
  logger.info({ orderId }, 'Order cancelled');
  
  // Emit domain event
  eventEmitter.emit('order.status_updated', {
    orderId,
    userId: order.userId,
    oldStatus,
    newStatus: ORDER_STATUS.CANCELLED
  });
  
  return updatedOrder;
};

module.exports = {
  createNewOrder,
  getOrder,
  listOrders,
  updateOrderStatus,
  cancelOrder
};


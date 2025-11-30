// In-memory database
let ordersDb = {};

const getOrderById = (orderId) => {
  return ordersDb[orderId];
};

const createOrder = (order) => {
  ordersDb[order.id] = order;
  return order;
};

const updateOrder = (orderId, updates) => {
  if (!ordersDb[orderId]) {
    return null;
  }
  ordersDb[orderId] = {
    ...ordersDb[orderId],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  return ordersDb[orderId];
};

const getAllOrders = () => {
  return Object.values(ordersDb);
};

const deleteOrder = (orderId) => {
  delete ordersDb[orderId];
};

// For testing
const clearDatabase = () => {
  ordersDb = {};
};

module.exports = {
  ordersDb,
  getOrderById,
  createOrder,
  updateOrder,
  getAllOrders,
  deleteOrder,
  clearDatabase
};


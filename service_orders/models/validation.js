const { z } = require('zod');
const { ORDER_STATUS } = require('./constants');

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

module.exports = {
  orderItemSchema,
  createOrderSchema,
  updateStatusSchema
};


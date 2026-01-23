/**
 * Order Dispatch Controller
 * Handles HTTP requests for order dispatch
 */

const orderDispatchService = require('../services/orderDispatchService');
const { ResponseUtil, Logger } = require('../utils');

/**
 * Create new order
 * @route POST /api/v1/orders
 */
const createOrder = async (req, res, next) => {
  try {
    const { products, ...orderData } = req.body;
    
    Logger.info('Creating new order', { 
      customer: orderData.customer_name,
      productsCount: products?.length || 1 
    });
    
    const result = await orderDispatchService.createOrder(orderData, products);
    
    return ResponseUtil.success(
      res,
      result.data,
      result.message,
      201
    );
  } catch (error) {
    Logger.error('Error in createOrder controller', error);
    next(error);
  }
};

/**
 * Get all orders with pagination
 * @route GET /api/v1/orders
 */
const getAllOrders = async (req, res, next) => {
  try {
    const { page, limit, order_no, customer_name, order_type, ...otherFilters } = req.query;
    
    const filters = {
      order_no,
      customer_name,
      order_type,
      ...otherFilters
    };
    
    // Remove undefined/null filters
    Object.keys(filters).forEach(key => {
      if (!filters[key]) delete filters[key];
    });
    
    const result = await orderDispatchService.getAllOrders(filters, { page, limit });
    
    return ResponseUtil.success(
      res,
      {
        orders: result.data,
        pagination: result.pagination
      },
      'Orders fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getAllOrders controller', error);
    next(error);
  }
};

/**
 * Get order by order number
 * @route GET /api/v1/orders/:orderNo
 */
const getOrderByNumber = async (req, res, next) => {
  try {
    const { orderNo } = req.params;
    
    const result = await orderDispatchService.getOrderByNumber(orderNo);
    
    if (!result.success) {
      return ResponseUtil.notFound(res, 'Order not found');
    }
    
    return ResponseUtil.success(
      res,
      result.data,
      'Order fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getOrderByNumber controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

/**
 * Update order by ID
 * @route PUT /api/v1/orders/:id
 */
const updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.order_no;
    delete updateData.created_at;
    
    const result = await orderDispatchService.updateOrder(id, updateData);
    
    return ResponseUtil.success(
      res,
      result.data,
      result.message
    );
  } catch (error) {
    Logger.error('Error in updateOrder controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

/**
 * Delete order by ID
 * @route DELETE /api/v1/orders/:id
 */
const deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await orderDispatchService.deleteOrder(id);
    
    return ResponseUtil.success(
      res,
      null,
      result.message
    );
  } catch (error) {
    Logger.error('Error in deleteOrder controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

module.exports = {
  createOrder,
  getAllOrders,
  getOrderByNumber,
  updateOrder,
  deleteOrder
};

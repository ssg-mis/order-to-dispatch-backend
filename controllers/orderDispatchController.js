/**
 * Order Dispatch Controller
 * Handles HTTP requests for order dispatch
 */

const orderDispatchService = require('../services/orderDispatchService');
const { ResponseUtil, Logger } = require('../utils');
const { notifyNextStage } = require('../services/stageNotifier');

/**
 * Create new order (Order Punch) - v2 schema.
 * @route POST /api/v1/orders
 * @body  { customerId, orderType, items: [{ skuId, orderQuantity, ... }], ... }
 *
 * NOTE: WhatsApp stage-notification (fire-and-forget to next-stage users) is
 * intentionally NOT wired here yet - it depends on the users/notification layer
 * which reads the old `login` table and hasn't been migrated to the v2 schema.
 * Re-add once that layer is ported.
 */
const createOrder = async (req, res, next) => {
  try {
    const { items, ...orderData } = req.body;
    Logger.info('Creating new order', { customerId: orderData.customerId, itemCount: items?.length || 0 });
    const result = await orderDispatchService.createOrder(orderData, items);

    // Fire-and-forget next-stage nudge: a pre-approval order lands at Pre
    // Approval, a regular order skips straight to Approval of Order.
    const isPreApprovalOrder = String(orderData.orderType || '').toLowerCase().trim() === 'pre-approval';
    notifyNextStage(
      { orderId: result.data?.order?.id },
      { targetPage: isPreApprovalOrder ? 'Pre Approval' : 'Approval of Order', userId: orderData.userId ?? req.user?.id ?? null }
    );

    return ResponseUtil.success(res, result.data, result.message, 201);
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
    const orderNo = req.query.orderNo || req.params.orderNo;
    
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

/**
 * Get all suffixes for a given order prefix
 * @route GET /api/v1/orders/suffixes/:prefix
 */
const getOrderSuffixes = async (req, res, next) => {
  try {
    const prefix = req.query.prefix || req.params.prefix;
    
    if (!prefix) {
      return ResponseUtil.badRequest(res, 'Prefix is required');
    }
    
    const suffixes = await orderDispatchService.getOrderSuffixes(prefix);
    
    return ResponseUtil.success(
      res,
      suffixes,
      'Order suffixes fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getOrderSuffixes controller', error);
    next(error);
  }
};

module.exports = {
  createOrder,
  getAllOrders,
  getOrderByNumber,
  updateOrder,
  deleteOrder,
  getOrderSuffixes
};

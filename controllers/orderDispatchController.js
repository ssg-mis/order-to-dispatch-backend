/**
 * Order Dispatch Controller
 * Handles HTTP requests for order dispatch
 */

const orderDispatchService = require('../services/orderDispatchService');
const { ResponseUtil, Logger } = require('../utils');
const { whatsappShareService } = require('../services/whatsappShareService');

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
    
    // Log all field lengths to help debug VARCHAR constraints
    Logger.info('Order data field lengths:', {
      customer_name: orderData.customer_name?.length,
      order_type: orderData.order_type?.length,
      customer_type: orderData.customer_type?.length,
      order_type_delivery_purpose: orderData.order_type_delivery_purpose?.length,
      type_of_transporting: orderData.type_of_transporting?.length,
      broker_name: orderData.broker_name?.length,
      payment_terms: orderData.payment_terms?.length
    });
    
    const result = await orderDispatchService.createOrder(orderData, products);
    
    // Trigger WhatsApp notifications for the relevant stage
    try {
      const orderTypeLower = orderData.order_type?.toLowerCase() || '';
      const targetPage = orderTypeLower === 'pre approval' ? 'Pre Approval' : 'Approval of Order';
      const docDetails = {
        stage: `🆕 *New Order Punched*\n📍 *Pending in ${targetPage}*`,
        order_type: orderData.order_type,
        do_date: orderData.delivery_date,
        do_number: result.data.order_no,
        customer_name: orderData.customer_name,
        oil_type: products?.[0]?.oil_type || orderData.oil_type,
        rate_15_kg: products?.[0]?.rate_per_15kg || orderData.rate_per_15kg,
        rate_1_ltr: products?.[0]?.rate_per_ltr || orderData.rate_per_ltr,
        order_punch_remarks: orderData.order_punch_remarks
      };

      if (req.pageAccessDetails) {
        // Send to all users who have access to targetPage
        await whatsappShareService(docDetails, req.pageAccessDetails, targetPage);
      }
    } catch (notifyError) {
      Logger.warn('Failed to send WhatsApp notifications for new order', notifyError);
      // Don't fail the order creation if notification fails
    }

    return ResponseUtil.success(
      res,
      result.data,
      result.message,
      201
    );
  } catch (error) {
    Logger.error('Error in createOrder controller', error);
    Logger.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position
    });
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

/**
 * Get all suffixes for a given order prefix
 * @route GET /api/v1/orders/suffixes/:prefix
 */
const getOrderSuffixes = async (req, res, next) => {
  try {
    const { prefix } = req.params;
    
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

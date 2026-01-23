/**
 * Order Dispatch Routes
 * RESTful API endpoints for order management
 */

const express = require('express');
const router = express.Router();
const orderDispatchController = require('../controllers/orderDispatchController');
const orderDispatchValidator = require('../validators/orderDispatchValidator');

/**
 * @route   POST /api/v1/orders
 * @desc    Create new order (supports single or multiple products)
 * @access  Public
 * @body    {
 *   customer_name: string (required),
 *   order_type: string (required),
 *   products: array (optional) - for multiple products
 *   ... other order fields
 * }
 */
router.post(
  '/',
  orderDispatchValidator.validateCreate,
  orderDispatchController.createOrder
);

/**
 * @route   GET /api/v1/orders
 * @desc    Get all orders with pagination and filters
 * @access  Public
 * @query   page, limit, order_no, customer_name, order_type
 */
router.get(
  '/',
  orderDispatchController.getAllOrders
);

/**
 * @route   GET /api/v1/orders/:orderNo
 * @desc    Get all rows for a specific order number (DO-001, etc.)
 * @access  Public
 */
router.get(
  '/:orderNo',
  orderDispatchValidator.validateOrderNumber,
  orderDispatchController.getOrderByNumber
);

/**
 * @route   PUT /api/v1/orders/update/:id
 * @desc    Update specific order row by ID
 * @access  Public
 */
router.put(
  '/update/:id',
  orderDispatchValidator.validateId,
  orderDispatchValidator.validateUpdate,
  orderDispatchController.updateOrder
);

/**
 * @route   DELETE /api/v1/orders/delete/:id
 * @desc    Delete specific order row by ID
 * @access  Public
 */
router.delete(
  '/delete/:id',
  orderDispatchValidator.validateId,
  orderDispatchController.deleteOrder
);

module.exports = router;

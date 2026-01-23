/**
 * Sample Routes
 * RESTful API endpoints with validation
 */

const express = require('express');
const router = express.Router();
const sampleController = require('../controllers/sampleController');
const sampleValidator = require('../validators/sampleValidator');
// Uncomment when authentication is needed
// const authMiddleware = require('../middleware/authMiddleware');

/**
 * @route   GET /api/v1/samples
 * @desc    Get all items with pagination
 * @access  Public
 */
router.get('/', sampleController.getAllItems);

/**
 * @route   GET /api/v1/samples/:id
 * @desc    Get single item by ID
 * @access  Public
 */
router.get(
  '/:id',
  sampleValidator.validateId,
  sampleController.getItemById
);

/**
 * @route   POST /api/v1/samples
 * @desc    Create new item
 * @access  Public (add authMiddleware when needed)
 */
router.post(
  '/',
  // authMiddleware, // Uncomment for protected routes
  sampleValidator.validateCreate,
  sampleController.createItem
);

/**
 * @route   PUT /api/v1/samples/:id
 * @desc    Update item
 * @access  Public (add authMiddleware when needed)
 */
router.put(
  '/:id',
  // authMiddleware, // Uncomment for protected routes
  sampleValidator.validateId,
  sampleValidator.validateUpdate,
  sampleController.updateItem
);

/**
 * @route   DELETE /api/v1/samples/:id
 * @desc    Delete item
 * @access  Public (add authMiddleware when needed)
 */
router.delete(
  '/:id',
  // authMiddleware, // Uncomment for protected routes
  sampleValidator.validateId,
  sampleController.deleteItem
);

module.exports = router;

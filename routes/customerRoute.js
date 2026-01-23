/**
 * Customer Routes
 * API endpoints for customer operations
 */

const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

/**
 * @route   GET /api/v1/customers
 * @desc    Get all active customers
 * @access  Public
 */
router.get('/', customerController.getAllCustomers);

/**
 * @route   GET /api/v1/customers/:id
 * @desc    Get customer by ID
 * @access  Public
 */
router.get('/:id', customerController.getCustomerById);

/**
 * @route   GET /api/v1/customers/name/:name
 * @desc    Get customer by name
 * @access  Public
 */
router.get('/name/:name', customerController.getCustomerByName);

module.exports = router;

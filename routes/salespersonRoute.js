/**
 * Salesperson Routes
 * API endpoints for salesperson operations
 */

const express = require('express');
const router = express.Router();
const salespersonController = require('../controllers/salespersonController');

/**
 * @route   GET /api/v1/salespersons
 * @desc    Get all active salespersons
 * @access  Public
 */
router.get('/', salespersonController.getAllSalespersons);

/**
 * @route   GET /api/v1/salespersons/:id
 * @desc    Get salesperson by ID
 * @access  Public
 */
router.get('/:id', salespersonController.getSalespersonById);

/**
 * @route   POST /api/v1/salespersons
 * @desc    Create a new salesperson
 * @access  Public
 */
router.post('/', salespersonController.createSalesperson);

/**
 * @route   PUT /api/v1/salespersons/:id
 * @desc    Update an existing salesperson
 * @access  Public
 */
router.put('/:id', salespersonController.updateSalesperson);

/**
 * @route   DELETE /api/v1/salespersons/:id
 * @desc    Delete a salesperson
 * @access  Public
 */
router.delete('/:id', salespersonController.deleteSalesperson);

module.exports = router;

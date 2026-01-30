/**
 * Depot Routes
 * API endpoints for depot operations
 */

const express = require('express');
const router = express.Router();
const depotController = require('../controllers/depotController');

/**
 * @route   GET /api/v1/depots
 * @desc    Get all active depots
 * @access  Public
 */
router.get('/', depotController.getAllDepots);

/**
 * @route   GET /api/v1/depots/:id
 * @desc    Get depot by ID
 * @access  Public
 */
router.get('/:id', depotController.getDepotById);

/**
 * @route   GET /api/v1/depots/name/:name
 * @desc    Get depot by name
 * @access  Public
 */
router.get('/name/:name', depotController.getDepotByName);

/**
 * @route   POST /api/v1/depots
 * @desc    Create a new depot
 * @access  Public
 */
router.post('/', depotController.createDepot);

/**
 * @route   PUT /api/v1/depots/:id
 * @desc    Update an existing depot
 * @access  Public
 */
router.put('/:id', depotController.updateDepot);

/**
 * @route   DELETE /api/v1/depots/:id
 * @desc    Delete a depot
 * @access  Public
 */
router.delete('/:id', depotController.deleteDepot);

module.exports = router;

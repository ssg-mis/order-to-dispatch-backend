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

module.exports = router;

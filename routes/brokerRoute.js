/**
 * Broker Routes
 * API endpoints for broker operations
 */

const express = require('express');
const router = express.Router();
const brokerController = require('../controllers/brokerController');

/**
 * @route   GET /api/v1/brokers
 * @desc    Get all active brokers
 * @access  Public
 */
router.get('/', brokerController.getAllBrokers);

/**
 * @route   GET /api/v1/brokers/:id
 * @desc    Get broker by ID
 * @access  Public
 */
router.get('/:id', brokerController.getBrokerById);

/**
 * @route   GET /api/v1/brokers/name/:name
 * @desc    Get broker by name
 * @access  Public
 */
router.get('/name/:name', brokerController.getBrokerByName);

/**
 * @route   POST /api/v1/brokers
 * @desc    Create a new broker
 * @access  Public
 */
router.post('/', brokerController.createBroker);

/**
 * @route   PUT /api/v1/brokers/:id
 * @desc    Update an existing broker
 * @access  Public
 */
router.put('/:id', brokerController.updateBroker);

/**
 * @route   DELETE /api/v1/brokers/:id
 * @desc    Delete a broker
 * @access  Public
 */
router.delete('/:id', brokerController.deleteBroker);

module.exports = router;

const express = require('express');
const router = express.Router();
const transportMasterController = require('../controllers/transportMasterController');

/**
 * @route   GET /api/v1/transport-master
 * @desc    Get all transporters
 * @access  Private
 */
router.get('/', transportMasterController.getAllTransporters);

/**
 * @route   GET /api/v1/transport-master/:id
 * @desc    Get transporter by ID
 * @access  Private
 */
router.get('/:id', transportMasterController.getTransporterById);

/**
 * @route   POST /api/v1/transport-master
 * @desc    Create new transporter
 * @access  Private
 */
router.post('/', transportMasterController.createTransporter);

/**
 * @route   PUT /api/v1/transport-master/:id
 * @desc    Update transporter
 * @access  Private
 */
router.put('/:id', transportMasterController.updateTransporter);

/**
 * @route   DELETE /api/v1/transport-master/:id
 * @desc    Delete transporter (soft delete)
 * @access  Private
 */
router.delete('/:id', transportMasterController.deleteTransporter);

module.exports = router;

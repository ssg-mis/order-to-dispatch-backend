const express = require('express');
const router = express.Router();
const driverMasterController = require('../controllers/driverMasterController');

/**
 * @route   GET /api/v1/driver-master
 * @desc    Get all drivers
 * @access  Private
 */
router.get('/', driverMasterController.getAllDrivers);

/**
 * @route   GET /api/v1/driver-master/:id
 * @desc    Get driver by ID
 * @access  Private
 */
router.get('/:id', driverMasterController.getDriverById);

/**
 * @route   POST /api/v1/driver-master
 * @desc    Create new driver
 * @access  Private
 */
router.post('/', driverMasterController.createDriver);

/**
 * @route   PUT /api/v1/driver-master/:id
 * @desc    Update driver
 * @access  Private
 */
router.put('/:id', driverMasterController.updateDriver);

/**
 * @route   DELETE /api/v1/driver-master/:id
 * @desc    Delete driver (soft delete)
 * @access  Private
 */
router.delete('/:id', driverMasterController.deleteDriver);

module.exports = router;

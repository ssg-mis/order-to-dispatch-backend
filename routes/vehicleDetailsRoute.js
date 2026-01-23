/**
 * Vehicle Details Routes
 * API routes for vehicle details management (Stage 6)
 */

const express = require('express');
const router = express.Router();
const vehicleDetailsController = require('../controllers/vehicleDetailsController');

// GET /api/v1/vehicle-details/pending - Get pending vehicle assignments
router.get('/pending', vehicleDetailsController.getPendingVehicleDetails);

// GET /api/v1/vehicle-details/history - Get vehicle details history
router.get('/history', vehicleDetailsController.getVehicleDetailsHistory);

// POST /api/v1/vehicle-details/submit/:id - Submit vehicle details
router.post('/submit/:id', vehicleDetailsController.submitVehicleDetails);

// GET /api/v1/vehicle-details/:id - Get vehicle details by ID
router.get('/:id', vehicleDetailsController.getVehicleDetailsById);

module.exports = router;

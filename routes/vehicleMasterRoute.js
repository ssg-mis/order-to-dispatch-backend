/**
 * Vehicle Master Routes
 */

const express = require('express');
const router = express.Router();
const vehicleMasterController = require('../controllers/vehicleMasterController');

// GET /api/v1/vehicle-master - Get all vehicles
router.get('/', vehicleMasterController.getAllVehicles);

// GET /api/v1/vehicle-master/:id - Get vehicle by ID
router.get('/:id', vehicleMasterController.getVehicleById);

// POST /api/v1/vehicle-master - Create a new vehicle
router.post('/', vehicleMasterController.createVehicle);

// PUT /api/v1/vehicle-master/:id - Update an existing vehicle
router.put('/:id', vehicleMasterController.updateVehicle);

// DELETE /api/v1/vehicle-master/:id - Delete a vehicle
router.delete('/:id', vehicleMasterController.deleteVehicle);

module.exports = router;

/**
 * Material Load Routes
 * API routes for material load management (Stage 7)
 */

const express = require('express');
const router = express.Router();
const materialLoadController = require('../controllers/materialLoadController');

// GET /api/v1/material-load/pending - Get pending material loads
router.get('/pending', materialLoadController.getPendingMaterialLoads);

// GET /api/v1/material-load/history - Get material load history
router.get('/history', materialLoadController.getMaterialLoadHistory);

// POST /api/v1/material-load/submit/:id - Submit material load
router.post('/submit/:id', materialLoadController.submitMaterialLoad);

// GET /api/v1/material-load/:id - Get material load by ID
router.get('/:id', materialLoadController.getMaterialLoadById);

module.exports = router;

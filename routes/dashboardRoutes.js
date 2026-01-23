/**
 * Dashboard Routes
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// GET /api/v1/dashboard/stats
router.get('/stats', dashboardController.getDashboardStats);

// GET /api/v1/dashboard/overview
router.get('/overview', dashboardController.getDashboardOverview);

module.exports = router;

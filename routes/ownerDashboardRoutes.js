/**
 * Owner Dashboard Routes
 */

const express = require('express');
const router  = express.Router();
const ownerDashboardController = require('../controllers/ownerDashboardController');

// GET /api/v1/owner-dashboard
router.get('/', ownerDashboardController.getFullDashboard);

module.exports = router;

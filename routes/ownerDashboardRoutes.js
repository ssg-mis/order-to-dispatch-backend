/**
 * Owner Dashboard Routes
 */

const express = require('express');
const router  = express.Router();
const ownerDashboardController = require('../controllers/ownerDashboardController');

// GET /api/v1/owner-dashboard
router.get('/', ownerDashboardController.getFullDashboard);

// GET /api/v1/owner-dashboard/user-detail/:userId
router.get('/user-detail/:userId', ownerDashboardController.getUserDetail);

// Drill-down endpoints
router.get('/customer-orders',  ownerDashboardController.getCustomerOrders);
router.get('/order-journey',    ownerDashboardController.getOrderJourney);
router.get('/stage-orders',     ownerDashboardController.getStageOrders);
router.get('/oiltype-orders',   ownerDashboardController.getOilTypeOrders);

module.exports = router;

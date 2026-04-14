const express = require('express');
const router = express.Router();
const damageAdjustmentController = require('../controllers/damageAdjustmentController');
const { pageAccess } = require('../middleware/pageAccessMiddleware');

// Get pending records
router.get('/pending', damageAdjustmentController.getPendingAdjustments);

// Get history
router.get('/history', damageAdjustmentController.getAdjustmentHistory);

// Submit adjustment
router.post('/submit/:id', pageAccess, damageAdjustmentController.submitAdjustment);

module.exports = router;

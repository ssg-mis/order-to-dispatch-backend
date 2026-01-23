const express = require('express');
const router = express.Router();
const damageAdjustmentController = require('../controllers/damageAdjustmentController');

// Get pending records
router.get('/pending', damageAdjustmentController.getPendingAdjustments);

// Get history
router.get('/history', damageAdjustmentController.getAdjustmentHistory);

// Submit adjustment
router.post('/submit/:id', damageAdjustmentController.submitAdjustment);

module.exports = router;

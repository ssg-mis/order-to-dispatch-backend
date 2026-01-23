const express = require('express');
const router = express.Router();
const gateOutController = require('../controllers/gateOutController');

// Get pending records
router.get('/pending', gateOutController.getPendingGateOut);

// Get history
router.get('/history', gateOutController.getGateOutHistory);

// Submit gate out
router.post('/submit/:id', gateOutController.submitGateOut);

module.exports = router;

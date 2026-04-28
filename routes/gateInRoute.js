/**
 * Gate In Routes
 */

const express = require('express');
const router = express.Router();
const gateInController = require('../controllers/gateInController');

router.get('/pending', gateInController.getPending);
router.get('/history', gateInController.getHistory);
router.get('/check',   gateInController.getByOrderKey);
router.post('/submit', gateInController.submitGateIn);

module.exports = router;

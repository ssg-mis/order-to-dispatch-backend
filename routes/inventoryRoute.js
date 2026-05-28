const express = require('express');
const router = express.Router();
const { getInventoryData, upsertOpeningQty, getInventoryDetail } = require('../controllers/inventoryController');

router.get('/data', getInventoryData);
router.get('/detail', getInventoryDetail);
router.put('/opening-qty', upsertOpeningQty);

module.exports = router;

const express = require('express');
const router = express.Router();
const { getInventoryData, upsertOpeningQty, getInventoryDetail, getPendingOpeningQty, reviewOpeningQty } = require('../controllers/inventoryController');

router.get('/data', getInventoryData);
router.get('/detail', getInventoryDetail);
router.get('/opening-qty/pending', getPendingOpeningQty);
router.put('/opening-qty', upsertOpeningQty);
router.patch('/opening-qty/:id/approval', reviewOpeningQty);

module.exports = router;

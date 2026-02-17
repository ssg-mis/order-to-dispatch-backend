
const express = require('express');
const router = express.Router();
const {
  getAllSkuDetails,
  getSkuDetailById,
  createSkuDetail,
  updateSkuDetail,
  deleteSkuDetail
} = require('../controllers/skuDetailsController');

router.get('/', getAllSkuDetails);
router.get('/:id', getSkuDetailById);
router.post('/', createSkuDetail);
router.put('/:id', updateSkuDetail);
router.delete('/:id', deleteSkuDetail);

module.exports = router;

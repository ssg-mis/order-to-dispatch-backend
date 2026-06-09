
const express = require('express');
const router = express.Router();
const {
  getAllSkuDetails,
  getSkuDetailById,
  createSkuDetail,
  updateSkuDetail,
  deleteSkuDetail,
  getPendingSkuDetails,
  reviewSkuDetail
} = require('../controllers/skuDetailsController');
const { masterTabAccess } = require('../middleware/masterTabAccessMiddleware');

router.use(masterTabAccess('sku_details'));

router.get('/', getAllSkuDetails);
router.get('/pending', getPendingSkuDetails);
router.patch('/:id/approval', reviewSkuDetail);
router.get('/:id', getSkuDetailById);
router.post('/', createSkuDetail);
router.put('/:id', updateSkuDetail);
router.delete('/:id', deleteSkuDetail);

module.exports = router;

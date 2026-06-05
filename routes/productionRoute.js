const express = require('express');
const router = express.Router();
const { getByDate, bulkUpsert } = require('../controllers/productionController');

router.get('/', getByDate);
router.post('/bulk', bulkUpsert);

module.exports = router;

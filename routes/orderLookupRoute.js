const express = require('express');
const router = express.Router();
const orderLookupController = require('../controllers/orderLookupController');

// Cross-stage DO lookup: given a DO number (or substring), resolve which
// workflow stage each matching order is currently sitting at.
router.get('/', orderLookupController.lookupByDoNumber);

module.exports = router;

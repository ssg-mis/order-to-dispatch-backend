const express = require('express');
const router = express.Router();
const commonController = require('../controllers/commonController');

router.get('/next-id', commonController.getNextId);

module.exports = router;

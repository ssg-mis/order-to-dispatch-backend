const express = require('express');
const router = express.Router();
const commonController = require('../controllers/commonController');
const varCalcController = require('../controllers/varCalcController');

router.get('/next-id', commonController.getNextId);
router.get('/var-calc/latest', varCalcController.getLatestVarCalc);
router.get('/var-calc/history', varCalcController.getAllVarCalc);
router.post('/var-calc', varCalcController.saveVarCalc);

module.exports = router;

const express = require('express');
const router = express.Router();
const processStageController = require('../controllers/processStageController');

router.get('/', processStageController.getAllProcessStages);
router.post('/', processStageController.saveProcessStage);

module.exports = router;

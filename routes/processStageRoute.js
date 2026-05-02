const express = require('express');
const router = express.Router();
const processStageController = require('../controllers/processStageController');

router.get('/', processStageController.getAllProcessStages);
router.post('/', processStageController.saveProcessStage);
router.put('/:id', processStageController.updateProcessStage);
router.delete('/:id', processStageController.deleteProcessStage);

module.exports = router;

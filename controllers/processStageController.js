const processStageService = require('../services/processStageService');
const { Logger } = require('../utils');

const getAllProcessStages = async (req, res) => {
  try {
    const stages = await processStageService.getAll();
    res.json({
      success: true,
      message: 'Process stages retrieved successfully',
      data: stages,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in getAllProcessStages controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve process stages',
      timestamp: new Date().toISOString()
    });
  }
};

const saveProcessStage = async (req, res) => {
  try {
    const stage = await processStageService.save(req.body);
    res.status(201).json({
      success: true,
      message: 'Process stage TAT saved successfully',
      data: stage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in saveProcessStage controller', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to save process stage TAT',
      timestamp: new Date().toISOString()
    });
  }
};

const updateProcessStage = async (req, res) => {
  try {
    const { id } = req.params;
    const stage = await processStageService.update(id, req.body);
    res.json({
      success: true,
      message: 'Process stage TAT updated successfully',
      data: stage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in updateProcessStage controller', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update process stage TAT',
      timestamp: new Date().toISOString()
    });
  }
};

const deleteProcessStage = async (req, res) => {
  try {
    const { id } = req.params;
    await processStageService.delete(id);
    res.json({
      success: true,
      message: 'Process stage deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('Error in deleteProcessStage controller', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to delete process stage',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  getAllProcessStages,
  saveProcessStage,
  updateProcessStage,
  deleteProcessStage
};

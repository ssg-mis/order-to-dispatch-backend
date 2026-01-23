/**
 * Material Load Controller
 * API endpoints for material load management (Stage 7)
 */

const materialLoadService = require('../services/materialLoadService');
const { Logger } = require('../utils');

/**
 * Get pending material loads
 * GET /api/v1/material-load/pending
 */
const getPendingMaterialLoads = async (req, res, next) => {
  try {
    const filters = {
      d_sr_number: req.query.d_sr_number,
      so_no: req.query.so_no,
      party_name: req.query.party_name,
    };
    
    const pagination = {
      page: req.query.page,
      limit: req.query.limit,
    };
    
    const result = await materialLoadService.getPendingMaterialLoads(filters, pagination);
    
    res.status(200).json({
      success: true,
      message: 'Pending material loads fetched successfully',
      data: {
        materialLoads: result.data,
        pagination: result.pagination
      }
    });
  } catch (error) {
    Logger.error('Error in getPendingMaterialLoads controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch pending material loads'
    });
  }
};

/**
 * Get material load history
 * GET /api/v1/material-load/history
 */
const getMaterialLoadHistory = async (req, res, next) => {
  try {
    const filters = {
      d_sr_number: req.query.d_sr_number,
      so_no: req.query.so_no,
      party_name: req.query.party_name,
    };
    
    const pagination = {
      page: req.query.page,
      limit: req.query.limit,
    };
    
    const result = await materialLoadService.getMaterialLoadHistory(filters, pagination);
    
    res.status(200).json({
      success: true,
      message: 'Material load history fetched successfully',
      data: {
        materialLoads: result.data,
        pagination: result.pagination
      }
    });
  } catch (error) {
    Logger.error('Error in getMaterialLoadHistory controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch material load history'
    });
  }
};

/**
 * Submit material load
 * POST /api/v1/material-load/submit/:id
 */
const submitMaterialLoad = async (req, res, next) => {
  try {
    const { id } = req.params;
    const materialLoadData = req.body;
    
    Logger.info(`Submit material load request for ID: ${id}`, { materialLoadData });
    
    const result = await materialLoadService.submitMaterialLoad(id, materialLoadData);
    
    res.status(200).json(result);
  } catch (error) {
    Logger.error('Error in submitMaterialLoad controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit material load'
    });
  }
};

/**
 * Get material load by ID
 * GET /api/v1/material-load/:id
 */
const getMaterialLoadById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await materialLoadService.getMaterialLoadById(id);
    
    res.status(200).json(result);
  } catch (error) {
    Logger.error('Error in getMaterialLoadById controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch material load'
    });
  }
};

module.exports = {
  getPendingMaterialLoads,
  getMaterialLoadHistory,
  submitMaterialLoad,
  getMaterialLoadById,
};

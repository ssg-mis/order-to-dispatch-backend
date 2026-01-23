/**
 * Sample Controller
 * Handles HTTP requests and delegates to service layer
 */

const sampleService = require('../services/sampleService');
const { ResponseUtil, Logger } = require('../utils');

/**
 * Get all items
 * @route GET /api/v1/samples
 */
const getAllItems = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, ...filters } = req.query;
    
    const result = await sampleService.getAllItems(filters, { page, limit });
    
    return ResponseUtil.success(
      res,
      result.data,
      'Items fetched successfully',
      200
    );
  } catch (error) {
    Logger.error('Error in getAllItems controller', error);
    next(error);
  }
};

/**
 * Get single item by ID
 * @route GET /api/v1/samples/:id
 */
const getItemById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await sampleService.getItemById(id);
    
    if (!result.success) {
      return ResponseUtil.notFound(res, 'Item not found');
    }
    
    return ResponseUtil.success(
      res,
      result.data,
      'Item fetched successfully'
    );
  } catch (error) {
    Logger.error('Error in getItemById controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

/**
 * Create new item
 * @route POST /api/v1/samples
 */
const createItem = async (req, res, next) => {
  try {
    const itemData = req.body;
    
    const result = await sampleService.createItem(itemData);
    
    return ResponseUtil.success(
      res,
      result.data,
      result.message,
      201
    );
  } catch (error) {
    Logger.error('Error in createItem controller', error);
    next(error);
  }
};

/**
 * Update item
 * @route PUT /api/v1/samples/:id
 */
const updateItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const result = await sampleService.updateItem(id, updateData);
    
    return ResponseUtil.success(
      res,
      result.data,
      result.message
    );
  } catch (error) {
    Logger.error('Error in updateItem controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

/**
 * Delete item
 * @route DELETE /api/v1/samples/:id
 */
const deleteItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await sampleService.deleteItem(id);
    
    return ResponseUtil.success(
      res,
      null,
      result.message
    );
  } catch (error) {
    Logger.error('Error in deleteItem controller', error);
    if (error.message.includes('not found')) {
      return ResponseUtil.notFound(res, error.message);
    }
    next(error);
  }
};

module.exports = {
  getAllItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem
};

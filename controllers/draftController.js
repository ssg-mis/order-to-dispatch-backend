/**
 * Draft Controller
 * Handles HTTP requests for Save as Draft functionality (Actual Dispatch stage)
 */

const draftService = require('../services/draftService');
const { ResponseUtil, Logger } = require('../utils');

/**
 * Save or update a draft
 * @route POST /api/v1/drafts
 * @body { username, orderKey, data }
 */
const saveDraft = async (req, res, next) => {
  try {
    const { username, orderKey, data } = req.body;

    if (!username || !orderKey || !data) {
      return ResponseUtil.validationError(res, [
        { field: 'username', message: 'username is required' },
        { field: 'orderKey', message: 'orderKey is required' },
        { field: 'data', message: 'data is required' },
      ].filter(e => !req.body[e.field]));
    }

    const result = await draftService.saveDraft(username, orderKey, data);
    return ResponseUtil.success(res, result.data, 'Draft saved successfully');
  } catch (error) {
    Logger.error('Error in saveDraft controller', error);
    next(error);
  }
};

/**
 * Retrieve a draft
 * @route GET /api/v1/drafts?username={u}&orderKey={k}
 */
const getDraft = async (req, res, next) => {
  try {
    const { username, orderKey } = req.query;

    if (!username || !orderKey) {
      return ResponseUtil.validationError(res, [
        !username && { field: 'username', message: 'username is required' },
        !orderKey && { field: 'orderKey', message: 'orderKey is required' },
      ].filter(Boolean));
    }

    const result = await draftService.getDraft(username, orderKey);
    return ResponseUtil.success(res, result.data, result.data ? 'Draft found' : 'No draft found');
  } catch (error) {
    Logger.error('Error in getDraft controller', error);
    next(error);
  }
};

/**
 * Delete a draft
 * @route DELETE /api/v1/drafts?username={u}&orderKey={k}
 */
const deleteDraft = async (req, res, next) => {
  try {
    const { username, orderKey } = req.query;

    if (!username || !orderKey) {
      return ResponseUtil.validationError(res, [
        !username && { field: 'username', message: 'username is required' },
        !orderKey && { field: 'orderKey', message: 'orderKey is required' },
      ].filter(Boolean));
    }

    await draftService.deleteDraft(username, orderKey);
    return ResponseUtil.success(res, null, 'Draft deleted successfully');
  } catch (error) {
    Logger.error('Error in deleteDraft controller', error);
    next(error);
  }
};

module.exports = {
  saveDraft,
  getDraft,
  deleteDraft,
};

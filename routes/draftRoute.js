/**
 * Draft Routes
 * RESTful endpoints for Save as Draft (Actual Dispatch stage)
 */

const express = require('express');
const router = express.Router();
const draftController = require('../controllers/draftController');

/**
 * @route   POST /api/v1/drafts
 * @desc    Create or update a draft (upsert)
 * @body    { username, orderKey, data }
 */
router.post('/', draftController.saveDraft);

/**
 * @route   GET /api/v1/drafts?orderKey={k}
 * @desc    Retrieve a draft by orderKey — shared across all users
 */
router.get('/', draftController.getDraft);

/**
 * @route   DELETE /api/v1/drafts?orderKey={k}
 * @desc    Delete a draft after successful submission
 */
router.delete('/', draftController.deleteDraft);

module.exports = router;

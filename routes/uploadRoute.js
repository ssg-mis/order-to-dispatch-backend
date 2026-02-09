/**
 * Upload Routes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadService = require('../services/uploadService');
const { ResponseUtil } = require('../utils');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/**
 * @route   POST /api/v1/upload
 * @desc    Upload a file to S3
 * @access  Public (should ideally be protected)
 */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return ResponseUtil.badRequest(res, 'No file uploaded');
    }

    const url = await uploadService.uploadToS3(req.file);

    return ResponseUtil.success(
      res,
      { url },
      'File uploaded successfully',
      201
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;

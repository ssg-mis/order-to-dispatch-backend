/**
 * Upload Routes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadService = require('../services/uploadService');
const { ResponseUtil } = require('../utils');

const MAX_UPLOAD_SIZE_MB = 10;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const UPLOAD_SIZE_BUFFER_BYTES = 512 * 1024;

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES + UPLOAD_SIZE_BUFFER_BYTES
  }
});

/**
 * @route   POST /api/v1/upload
 * @desc    Upload a file to S3
 * @access  Public (should ideally be protected)
 */
router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return ResponseUtil.badRequest(res, `File size must be ${MAX_UPLOAD_SIZE_MB} MB or less`);
      }
      return next(error);
    }
    next();
  });
}, async (req, res, next) => {
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

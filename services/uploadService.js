/**
 * Upload Service
 * Handles file uploads to AWS S3
 */

const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../utils/s3Client');
const { Logger } = require('../utils');
const path = require('path');

class UploadService {
  /**
   * Upload a file to S3
   * @param {Object} file - Multer file object
   * @param {string} folder - Folder in bucket
   * @returns {Promise<string>} Public URL of the uploaded file
   */
  async uploadToS3(file, folder = 'order-so-copies') {
    try {
      const fileName = `${folder}/${Date.now()}-${path.basename(file.originalname)}`;
      
      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      const command = new PutObjectCommand(params);
      await s3Client.send(command);

      const region = process.env.AWS_REGION || 'ap-south-1';
      const url = `https://${process.env.AWS_BUCKET_NAME}.s3.${region}.amazonaws.com/${fileName}`;
      
      Logger.info(`File uploaded successfully to S3: ${url}`);
      return url;
    } catch (error) {
      Logger.error('Error uploading to S3', error);
      throw new Error('Failed to upload file to S3');
    }
  }
}

module.exports = new UploadService();

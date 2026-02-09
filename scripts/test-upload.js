/**
 * Test S3 Upload
 * Run this script to verify S3 configuration and upload logic.
 * Usage: node scripts/test-upload.js
 */

const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const REGION = process.env.AWS_REGION || 'ap-south-1';
const BUCKET = process.env.AWS_BUCKET_NAME;

const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function testUpload() {
  console.log(`Testing upload to bucket: ${BUCKET} in region: ${REGION}`);
  
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ AWS Credentials missing in .env');
    return;
  }

  const testContent = `Test upload at ${new Date().toISOString()}`;
  const fileName = `test-uploads/test-${Date.now()}.txt`;

  try {
    const params = {
      Bucket: BUCKET,
      Key: fileName,
      Body: testContent,
      ContentType: 'text/plain',
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${fileName}`;
    console.log(`✅ Successfully uploaded test file!`);
    console.log(`🔗 URL: ${url}`);
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    if (error.name === 'NoSuchBucket') {
      console.error('Bucket does not exist. Please create it first.');
    }
  }
}

testUpload();

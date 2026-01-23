/**
 * Security Guard Approval Routes
 * API routes for security guard approval management (Stage 8)
 */

const express = require('express');
const router = express.Router();
const securityGuardApprovalController = require('../controllers/securityGuardApprovalController');

// GET /api/v1/security-approval/pending - Get pending security guard approvals
router.get('/pending', securityGuardApprovalController.getPendingApprovals);

// GET /api/v1/security-approval/history - Get security guard approval history
router.get('/history', securityGuardApprovalController.getApprovalHistory);

// POST /api/v1/security-approval/submit/:id - Submit security guard approval
router.post('/submit/:id', securityGuardApprovalController.submitApproval);

// GET /api/v1/security-approval/:id - Get security guard approval by ID
router.get('/:id', securityGuardApprovalController.getApprovalById);

module.exports = router;

/**
 * Security Guard Approval Routes (Gate 5: Security Guard Approval) — v2 schema.
 * Operates on `security_guard_checks` (per shipment). :id = security_guard_checks id.
 *   - Pending: security_guard_checks.planned_at NOT NULL, actual_at NULL
 *   - History: security_guard_checks.planned_at NOT NULL, actual_at NOT NULL
 */

const express = require('express');
const router = express.Router();
const securityGuardApprovalController = require('../controllers/securityGuardApprovalController');
const securityGuardApprovalValidator = require('../validators/securityGuardApprovalValidator');
// pageAccess middleware (WhatsApp notification targeting, reads legacy `login`
// table on prod RDS) intentionally not applied until the notification layer is migrated.

/** @route GET /api/v1/security-approval/pending */
router.get('/pending', securityGuardApprovalController.getPendingApprovals);

/** @route GET /api/v1/security-approval/history */
router.get('/history', securityGuardApprovalController.getApprovalHistory);

/** @route GET /api/v1/security-approval/filters */
router.get('/filters', securityGuardApprovalController.getFilterOptions);

/**
 * @route POST /api/v1/security-approval/submit/:id   (:id = security_guard_checks id)
 * @body  { verdictStatus: 'APPROVE'|'REJECT', biltyNo?, biltyImage?, vehicleImageAttachment?, remarks?, userId? }
 */
router.post('/submit/:id', securityGuardApprovalValidator.validateSubmit, securityGuardApprovalController.submitApproval);

/** @route GET /api/v1/security-approval/:id   (:id = security_guard_checks id) — keep last (matches any /:id) */
router.get('/:id', securityGuardApprovalController.getApprovalById);

module.exports = router;

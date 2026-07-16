/**
 * Commitment Punch Routes — v2 schema.
 * A commitment is a bulk pre-sale promise; /:id/process raises it, spawning a
 * real order (orders + order_items) pending at Order Approval.
 */

const express = require('express');
const router = express.Router();
const { createCommitment, getAll, getPending, processCommitment, getDetails } = require('../controllers/commitmentPunchController');
// pageAccess middleware intentionally not applied until the notification layer is migrated.

/** @route POST /api/v1/commitment-punch — create a commitment (one or more lines) */
router.post('/', createCommitment);

/** @route GET /api/v1/commitment-punch — list commitments */
router.get('/', getAll);

/** @route GET /api/v1/commitment-punch/pending — commitments with balance left to raise */
router.get('/pending', getPending);

/** @route GET /api/v1/commitment-punch/:id/details — all raises for a commitment */
router.get('/:id/details', getDetails);

/** @route PUT /api/v1/commitment-punch/:id/process — raise a chunk → spawns an order */
router.put('/:id/process', processCommitment);

module.exports = router;

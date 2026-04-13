/**
 * Commitment Punch Routes
 */

const express = require('express');
const router = express.Router();
const { createCommitment, getAll, getPending, processCommitment } = require('../controllers/commitmentPunchController');

// POST /api/v1/commitment-punch — Create a new commitment
router.post('/', createCommitment);

// GET /api/v1/commitment-punch — Get all commitments
router.get('/', getAll);

// GET /api/v1/commitment-punch/pending — Get pending commitments (planned1 NOT NULL, actual1 IS NULL)
router.get('/pending', getPending);

// PUT /api/v1/commitment-punch/:id/process — Process a commitment
router.put('/:id/process', processCommitment);

module.exports = router;

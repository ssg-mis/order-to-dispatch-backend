/**
 * Commitment Punch Controller
 */

const commitmentPunchService = require('../services/commitmentPunchService');
const { ResponseUtil, Logger } = require('../utils');

/**
 * POST /api/v1/commitment-punch
 * Create a new commitment (one or more product rows)
 */
const createCommitment = async (req, res, next) => {
  try {
    const { rows, ...data } = req.body;
    Logger.info('Creating commitment punch', { party: data.party_name, rows: rows?.length || 1 });
    const result = await commitmentPunchService.createCommitment(data, rows || []);
    return ResponseUtil.success(res, result.data, result.message, 201);
  } catch (error) {
    Logger.error('Error creating commitment', error);
    next(error);
  }
};

/**
 * GET /api/v1/commitment-punch
 * Fetch all commitments with optional filters
 */
const getAll = async (req, res, next) => {
  try {
    const { page, limit, party_name, search } = req.query;
    const result = await commitmentPunchService.getAll({ party_name, search }, { page, limit });
    return ResponseUtil.success(res, { commitments: result.data, pagination: result.pagination }, 'Commitments fetched');
  } catch (error) {
    Logger.error('Error fetching commitments', error);
    next(error);
  }
};

/**
 * GET /api/v1/commitment-punch/pending
 * Fetch pending commitments (planned1 NOT NULL, actual1 IS NULL)
 */
const getPending = async (req, res, next) => {
  try {
    const { page, limit, search } = req.query;
    const result = await commitmentPunchService.getPending({ search }, { page, limit });
    return ResponseUtil.success(res, { commitments: result.data, pagination: result.pagination }, 'Pending commitments fetched');
  } catch (error) {
    Logger.error('Error fetching pending commitments', error);
    next(error);
  }
};

/**
 * GET /api/v1/commitment-punch/:id/details
 * Fetch all processed details (commitment_details rows) for a commitment
 */
const getDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await commitmentPunchService.getDetails(id);
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    Logger.error('Error fetching commitment details', error);
    next(error);
  }
};

/**
 * PUT /api/v1/commitment-punch/:id/process
 * Process a commitment (set PO details, SKU details, mark actual1)
 */
const processCommitment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await commitmentPunchService.processCommitment(id, req.body);
    return ResponseUtil.success(res, result.data, result.message);
  } catch (error) {
    Logger.error('Error processing commitment', error);
    next(error);
  }
};

module.exports = { createCommitment, getAll, getPending, processCommitment, getDetails };


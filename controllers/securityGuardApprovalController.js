/**
 * Security Guard Approval Controller
 * API endpoints for security guard approval management (Stage 8)
 */

const securityGuardApprovalService = require('../services/securityGuardApprovalService');
const { Logger } = require('../utils');
const { whatsappShareService } = require('../services/whatsappShareService');

/**
 * Get pending security guard approvals
 * GET /api/v1/security-approval/pending
 */
const getPendingApprovals = async (req, res, next) => {
  try {
    const filters = {
      d_sr_number: req.query.d_sr_number,
      so_no: req.query.so_no,
      party_name: req.query.party_name,
    };
    
    const pagination = {
      page: req.query.page,
      limit: req.query.limit,
    };
    
    const result = await securityGuardApprovalService.getPendingApprovals(filters, pagination);
    
    res.status(200).json({
      success: true,
      message: 'Pending security guard approvals fetched successfully',
      data: {
        approvals: result.data,
        pagination: result.pagination
      }
    });
  } catch (error) {
    Logger.error('Error in getPendingApprovals controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch pending security guard approvals'
    });
  }
};

/**
 * Get security guard approval history
 * GET /api/v1/security-approval/history
 */
const getApprovalHistory = async (req, res, next) => {
  try {
    const filters = {
      d_sr_number: req.query.d_sr_number,
      so_no: req.query.so_no,
      party_name: req.query.party_name,
    };
    
    const pagination = {
      page: req.query.page,
      limit: req.query.limit,
    };
    
    const result = await securityGuardApprovalService.getApprovalHistory(filters, pagination);
    
    res.status(200).json({
      success: true,
      message: 'Security guard approval history fetched successfully',
      data: {
        approvals: result.data,
        pagination: result.pagination
      }
    });
  } catch (error) {
    Logger.error('Error in getApprovalHistory controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch security guard approval history'
    });
  }
};

/**
 * Submit security guard approval
 * POST /api/v1/security-approval/submit/:id
 */
const submitApproval = async (req, res, next) => {
  try {
    const { id } = req.params;
    const approvalData = req.body;
    
    Logger.info(`Submit security guard approval request for ID: ${id}`, { approvalData });
    
    const result = await securityGuardApprovalService.submitApproval(id, approvalData);
    
    // Trigger WhatsApp notification for the next stage
    try {
      if (result.success && result.data && result.data.so_no) {
        const docDetails = {
          stage: `👮 *Security Guard Approval Completed*`,
          do_number: result.data.so_no
        };
        if (req.pageAccessDetails) {
          await whatsappShareService(docDetails, req.pageAccessDetails, 'Gate Out');
        }
      }
    } catch (notifyError) {
      Logger.warn('Failed to send WhatsApp notifications for Security Guard Approval', notifyError);
    }
    
    res.status(200).json(result);
  } catch (error) {
    Logger.error('Error in submitApproval controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit security guard approval'
    });
  }
};

/**
 * Get security guard approval by ID
 * GET /api/v1/security-approval/:id
 */
const getApprovalById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await securityGuardApprovalService.getApprovalById(id);
    
    res.status(200).json(result);
  } catch (error) {
    Logger.error('Error in getApprovalById controller', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch security guard approval'
    });
  }
};

module.exports = {
  getPendingApprovals,
  getApprovalHistory,
  submitApproval,
  getApprovalById,
};

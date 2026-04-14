const express = require('express');
const confirmMaterialReceiptService = require('../services/confirmMaterialReceiptService');
const { Logger } = require('../utils');
const { whatsappShareService } = require('../services/whatsappShareService');

// Get pending receipts
async function getPendingReceipts(req, res) {
  try {
    const filters = {
      d_sr_number: req.query.d_sr_number,
      so_no: req.query.so_no,
      party_name: req.query.party_name
    };

    const pagination = {
      page: req.query.page,
      limit: req.query.limit
    };

    const result = await confirmMaterialReceiptService.getPendingReceipts(filters, pagination);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getPendingReceipts controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Get receipt history
async function getReceiptHistory(req, res) {
  try {
    const filters = {
      d_sr_number: req.query.d_sr_number,
      so_no: req.query.so_no,
      party_name: req.query.party_name
    };

    const pagination = {
      page: req.query.page,
      limit: req.query.limit
    };

    const result = await confirmMaterialReceiptService.getReceiptHistory(filters, pagination);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getReceiptHistory controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Submit receipt details
async function submitReceipt(req, res) {
  try {
    const { id } = req.params;
    const data = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Record ID is required' });
    }

    const result = await confirmMaterialReceiptService.submitReceipt(id, data);

    // Trigger WhatsApp notification for the next stage
    try {
      if (result.success && result.data && result.data.so_no) {
        const docDetails = {
          stage: `📦 *Material Receipt Confirmed*\n📍 *Pending in Damage Adjustment*`,
          do_number: result.data.so_no
        };
        if (req.pageAccessDetails) {
          await whatsappShareService(docDetails, req.pageAccessDetails, 'Damage Adjustment');
        }
      }
    } catch (notifyError) {
      Logger.warn('Failed to send WhatsApp notifications for Material Receipt', notifyError);
    }

    res.json(result);
  } catch (error) {
    Logger.error('Error in submitReceipt controller', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getPendingReceipts,
  getReceiptHistory,
  submitReceipt
};

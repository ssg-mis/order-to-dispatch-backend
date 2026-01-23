const express = require('express');
const damageAdjustmentService = require('../services/damageAdjustmentService');
const { Logger } = require('../utils');

// Get pending adjustments
async function getPendingAdjustments(req, res) {
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
    
    const result = await damageAdjustmentService.getPendingAdjustments(filters, pagination);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getPendingAdjustments controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Get adjustment history
async function getAdjustmentHistory(req, res) {
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
    
    const result = await damageAdjustmentService.getAdjustmentHistory(filters, pagination);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getAdjustmentHistory controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Submit adjustment
async function submitAdjustment(req, res) {
  try {
    const { id } = req.params;
    const data = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Record ID is required' });
    }
    
    const result = await damageAdjustmentService.submitAdjustment(id, data);
    res.json(result);
  } catch (error) {
    Logger.error('Error in submitAdjustment controller', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getPendingAdjustments,
  getAdjustmentHistory,
  submitAdjustment
};

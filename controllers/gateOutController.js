const express = require('express');
const gateOutService = require('../services/gateOutService');
const { Logger } = require('../utils');

// Get pending gate out records
async function getPendingGateOut(req, res) {
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
    
    const result = await gateOutService.getPendingGateOut(filters, pagination);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getPendingGateOut controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Get gate out history
async function getGateOutHistory(req, res) {
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
    
    const result = await gateOutService.getGateOutHistory(filters, pagination);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getGateOutHistory controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Submit gate out details
async function submitGateOut(req, res) {
  try {
    const { id } = req.params;
    const data = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Record ID is required' });
    }
    
    const result = await gateOutService.submitGateOut(id, data);
    res.json(result);
  } catch (error) {
    Logger.error('Error in submitGateOut controller', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getPendingGateOut,
  getGateOutHistory,
  submitGateOut
};

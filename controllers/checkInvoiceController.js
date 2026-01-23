const express = require('express');
const checkInvoiceService = require('../services/checkInvoiceService');
const { Logger } = require('../utils');

// Get pending invoices for checking
async function getPendingInvoices(req, res) {
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
    
    const result = await checkInvoiceService.getPendingInvoices(filters, pagination);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getPendingInvoices controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Get check invoice history
async function getCheckHistory(req, res) {
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
    
    const result = await checkInvoiceService.getCheckHistory(filters, pagination);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getCheckHistory controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Submit check details
async function submitCheck(req, res) {
  try {
    const { id } = req.params;
    const data = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Record ID is required' });
    }
    
    const result = await checkInvoiceService.submitCheck(id, data);
    res.json(result);
  } catch (error) {
    Logger.error('Error in submitCheck controller', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getPendingInvoices,
  getCheckHistory,
  submitCheck
};

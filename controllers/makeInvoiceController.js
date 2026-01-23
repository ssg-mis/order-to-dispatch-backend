const express = require('express');
const makeInvoiceService = require('../services/makeInvoiceService');
const { Logger } = require('../utils');

// Get pending invoices
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
    
    const result = await makeInvoiceService.getPendingInvoices(filters, pagination);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getPendingInvoices controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Get invoice history
async function getInvoiceHistory(req, res) {
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
    
    const result = await makeInvoiceService.getInvoiceHistory(filters, pagination);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getInvoiceHistory controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Submit invoice details
async function submitInvoice(req, res) {
  try {
    const { id } = req.params;
    const data = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Record ID is required' });
    }
    
    const result = await makeInvoiceService.submitInvoice(id, data);
    res.json(result);
  } catch (error) {
    Logger.error('Error in submitInvoice controller', error);
    res.status(500).json({ error: error.message });
  }
}

// Get invoice by ID
async function getInvoiceById(req, res) {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Record ID is required' });
    }
    
    const result = await makeInvoiceService.getInvoiceById(id);
    res.json(result);
  } catch (error) {
    Logger.error('Error in getInvoiceById controller', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getPendingInvoices,
  getInvoiceHistory,
  submitInvoice,
  getInvoiceById
};

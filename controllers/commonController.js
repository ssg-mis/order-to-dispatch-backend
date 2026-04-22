const { query } = require('../config/db');
const { Logger } = require('../utils');

/**
 * Get Next ID for a given type (customer, depot, broker, sku)
 */
const getNextId = async (req, res, next) => {
  try {
    const { type } = req.query;
    
    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Type parameter is required'
      });
    }

    let tableName = '';
    let idColumn = '';
    let prefix = '';
    let minDigits = 3;

    switch (type) {
      case 'customer':
        tableName = 'customer_details';
        idColumn = 'customer_id';
        prefix = 'CUS';
        minDigits = 4; // CUS1001
        break;
      case 'depot':
        tableName = 'depot_details';
        idColumn = 'depot_id';
        prefix = 'DPT';
        minDigits = 3; // DPT101
        break;
      case 'broker':
        tableName = 'broker_details';
        idColumn = 'broker_id';
        prefix = 'BRK';
        minDigits = 3; // BRK101
        break;
      case 'sku':
        tableName = 'sku_details';
        idColumn = 'sku_code';
        prefix = 'SKU';
        minDigits = 4; // SKU1001
        break;
      case 'salesperson':
        tableName = 'salesperson_details';
        idColumn = 'broker_id';
        prefix = 'SLM';
        minDigits = 3; // SLM101
        break;
      case 'vehicle':
        tableName = 'vehicle_master';
        idColumn = 'vehicle_master_id';
        prefix = 'VICL';
        minDigits = 3; // VICL001
        break;
      case 'driver':
        tableName = 'driver_master';
        idColumn = 'driver_master_id';
        prefix = 'DRIV';
        minDigits = 3; // DRIV001
        break;
      case 'transport':
        tableName = 'transport_master';
        idColumn = 'transport_master_id';
        prefix = 'TRSP';
        minDigits = 3; // TRSP001
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid type. Allowed: customer, depot, broker, sku, salesperson, vehicle, driver, transport'
        });
    }

    // Query to find the max ID
    // We use a regex to extract the numeric part and find the max
    // Note: This assumes IDs are always formatted as Prefix + Number
    // If the table is empty, we start with a default (e.g., 1001 or 101)
    
    // Improved query to handle alphanumeric sorting correctly
    const sql = `
      SELECT ${idColumn} as id 
      FROM ${tableName} 
      WHERE ${idColumn} LIKE $1
      ORDER BY CAST(SUBSTRING(${idColumn} FROM LENGTH($2) + 1) AS INTEGER) DESC 
      LIMIT 1
    `;
    
    const result = await query(sql, [`${prefix}%`, prefix]);
    
    let nextNum = 1;
    let startNum = minDigits === 4 ? 1001 : 101; 

    if (result.rowCount > 0) {
      const currentId = result.rows[0].id;
      const numPart = parseInt(currentId.replace(prefix, ''), 10);
      if (!isNaN(numPart)) {
        nextNum = numPart + 1;
      } else {
        nextNum = startNum;
      }
    } else {
      nextNum = startNum;
    }

    // Handle padding for cases like VICL001
    let nextId;
    if (type === 'vehicle' || type === 'driver' || type === 'transport') {
      nextId = `${prefix}${String(nextNum).padStart(3, '0')}`;
    } else {
      nextId = `${prefix}${nextNum}`;
    }

    res.json({
      success: true,
      data: {
        nextId,
        type,
        prefix
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNextId
};

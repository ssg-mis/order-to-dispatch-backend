
const { query } = require('../config/db');
const { Logger } = require('../utils');

/**
 * Get all SKU Details
 */
const getAllSkuDetails = async (req, res, next) => {
  try {
    const { all } = req.query;
    let sql = 'SELECT * FROM sku_details ';
    const params = [];

    if (all !== 'true') {
      sql += 'WHERE status = $1 ';
      params.push('Active');
    }

    sql += 'ORDER BY id DESC';

    const result = await query(sql, params);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get SKU Detail by ID
 */
const getSkuDetailById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM sku_details WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'SKU Detail not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new SKU Detail
 */
const createSkuDetail = async (req, res, next) => {
  try {
    const {
      status,
      sku_code,
      sku_name,
      main_uom,
      alternate_uom,
      nos_per_main_uom,
      units,
      oil_filling_per_unit,
      filling_units,
      converted_kg,
      packing_weight_per_main_unit,
      weight_difference,
      sku_weight,
      packing_weight,
      gross_weight
    } = req.body;

    // Validation
    if (!sku_code || !sku_name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide SKU Code and SKU Name'
      });
    }

    // Check if SKU Code already exists
    const existingSku = await query('SELECT id FROM sku_details WHERE sku_code = $1', [sku_code]);
    if (existingSku.rowCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'SKU Code already exists'
      });
    }

    const sql = `
      INSERT INTO sku_details (
        status,
        sku_code,
        sku_name,
        main_uom,
        alternate_uom,
        nos_per_main_uom,
        units,
        oil_filling_per_unit,
        filling_units,
        converted_kg,
        packing_weight_per_main_unit,
        weight_difference,
        sku_weight,
        packing_weight,
        gross_weight
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const values = [
      status || 'Active',
      sku_code,
      sku_name,
      main_uom,
      alternate_uom,
      nos_per_main_uom,
      units,
      oil_filling_per_unit,
      filling_units,
      converted_kg,
      packing_weight_per_main_unit,
      weight_difference,
      sku_weight,
      packing_weight,
      gross_weight
    ];

    const result = await query(sql, values);

    res.status(201).json({
      success: true,
      message: 'SKU Detail created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update SKU Detail
 */
const updateSkuDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      status,
      sku_code,
      sku_name,
      main_uom,
      alternate_uom,
      nos_per_main_uom,
      units,
      oil_filling_per_unit,
      filling_units,
      converted_kg,
      packing_weight_per_main_unit,
      weight_difference,
      sku_weight,
      packing_weight,
      gross_weight
    } = req.body;

    // Check if record exists
    const checkRecord = await query('SELECT id FROM sku_details WHERE id = $1', [id]);
    if (checkRecord.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'SKU Detail not found'
      });
    }

    // Check availability of sku_code if changed
    if (sku_code) {
      const existingSku = await query('SELECT id FROM sku_details WHERE sku_code = $1 AND id != $2', [sku_code, id]);
      if (existingSku.rowCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'SKU Code already exists'
        });
      }
    }

    const sql = `
      UPDATE sku_details SET
        status = COALESCE($1, status),
        sku_code = COALESCE($2, sku_code),
        sku_name = COALESCE($3, sku_name),
        main_uom = COALESCE($4, main_uom),
        alternate_uom = COALESCE($5, alternate_uom),
        nos_per_main_uom = COALESCE($6, nos_per_main_uom),
        units = COALESCE($7, units),
        oil_filling_per_unit = COALESCE($8, oil_filling_per_unit),
        filling_units = COALESCE($9, filling_units),
        converted_kg = COALESCE($10, converted_kg),
        packing_weight_per_main_unit = COALESCE($11, packing_weight_per_main_unit),
        weight_difference = COALESCE($12, weight_difference),
        sku_weight = COALESCE($13, sku_weight),
        packing_weight = COALESCE($14, packing_weight),
        gross_weight = COALESCE($15, gross_weight),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16
      RETURNING *
    `;

    const values = [
      status,
      sku_code,
      sku_name,
      main_uom,
      alternate_uom,
      nos_per_main_uom,
      units,
      oil_filling_per_unit,
      filling_units,
      converted_kg,
      packing_weight_per_main_unit,
      weight_difference,
      sku_weight,
      packing_weight,
      gross_weight,
      id
    ];

    const result = await query(sql, values);

    res.json({
      success: true,
      message: 'SKU Detail updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete SKU Detail (Soft Delete)
 */
const deleteSkuDetail = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query('UPDATE sku_details SET status = $1 WHERE id = $2 RETURNING id', ['Inactive', id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'SKU Detail not found'
      });
    }

    res.json({
      success: true,
      message: 'SKU Detail deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllSkuDetails,
  getSkuDetailById,
  createSkuDetail,
  updateSkuDetail,
  deleteSkuDetail
};

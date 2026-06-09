
const { query } = require('../config/db');
const { Logger } = require('../utils');
const { buildSearchCondition } = require('../utils/searchUtils');

/**
 * Get all SKU Details
 */
const getAllSkuDetails = async (req, res, next) => {
  try {
    const { all, page = 1, limit = 20, search = "" } = req.query;
    const offset = (page - 1) * limit;
    const values = [];
    let whereClause = "";

    const conditions = ["approval_status = 'approved'"];
    if (all !== 'true') conditions.push("status = 'Active'");
    whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") + " " : "";

    if (search) {
      const { clause, params } = buildSearchCondition(['sku_name', 'sku_code'], search, values.length + 1);
      values.push(...params);
      whereClause += whereClause ? "AND " : "WHERE ";
      whereClause += clause + " ";
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM sku_details ${whereClause}`;
    const countResult = await query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    let dataQuery;
    if (all === 'true') {
      dataQuery = `
        SELECT sd.*, t.name AS tag_name
        FROM sku_details sd
        LEFT JOIN tag t ON t.sku_id = sd.id
        ${whereClause}
        ORDER BY sd.id DESC
      `;
    } else {
      dataQuery = `
        SELECT sd.*, t.name AS tag_name
        FROM sku_details sd
        LEFT JOIN tag t ON t.sku_id = sd.id
        ${whereClause}
        ORDER BY sd.id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;
      values.push(limit, offset);
    }

    const result = await query(dataQuery, values);

    res.json({
      success: true,
      data: {
        skuDetails: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      }
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
    const result = await query(
      `SELECT sd.*, t.name AS tag_name
       FROM sku_details sd
       LEFT JOIN tag t ON t.sku_id = sd.id
       WHERE sd.id = $1`,
      [id]
    );

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
      tag_name,
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

    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const approvalStatus = isAdmin ? 'approved' : 'pending';

    const sql = `
      INSERT INTO sku_details (
        status, sku_code, sku_name, main_uom, alternate_uom, nos_per_main_uom,
        units, oil_filling_per_unit, filling_units, converted_kg, packing_weight_per_main_unit,
        weight_difference, sku_weight, packing_weight, gross_weight, approval_status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `;

    const values = [
      status || 'Active', sku_code, sku_name, main_uom, alternate_uom, nos_per_main_uom,
      units, oil_filling_per_unit, filling_units, converted_kg, packing_weight_per_main_unit,
      weight_difference, sku_weight, packing_weight, gross_weight, approvalStatus, req.user?.id || null
    ];

    const result = await query(sql, values);
    const skuId = result.rows[0].id;

    if (tag_name) {
      await query(
        `INSERT INTO tag (sku_id, name)
         VALUES ($1, $2)
         ON CONFLICT (sku_id) DO UPDATE SET name = $2`,
        [skuId, tag_name]
      );
    }

    res.status(201).json({
      success: true,
      message: isAdmin ? 'SKU Detail created successfully' : 'SKU Detail submitted for approval',
      data: { ...result.rows[0], tag_name: tag_name || null }
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
      tag_name,
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

    if (tag_name !== undefined && tag_name !== null) {
      await query(
        `INSERT INTO tag (sku_id, name)
         VALUES ($1, $2)
         ON CONFLICT (sku_id) DO UPDATE SET name = $2`,
        [id, tag_name]
      );
    }

    res.json({
      success: true,
      message: 'SKU Detail updated successfully',
      data: { ...result.rows[0], tag_name: tag_name ?? result.rows[0].tag_name ?? null }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete SKU Detail (Hard Delete)
 */
const deleteSkuDetail = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Delete corresponding tag first to avoid orphan rows
    await query('DELETE FROM tag WHERE sku_id = $1', [id]);

    const result = await query('DELETE FROM sku_details WHERE id = $1 RETURNING id', [id]);

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

const getPendingSkuDetails = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const result = await query(`
      SELECT sd.*, l.username AS created_by_name
      FROM sku_details sd LEFT JOIN login l ON l.id = sd.created_by
      WHERE sd.approval_status = 'pending' ORDER BY sd.created_at ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

const reviewSkuDetail = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const { id } = req.params;
    const { action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }
    const approvalStatus = action === 'approve' ? 'approved' : 'rejected';
    const result = await query(
      `UPDATE sku_details SET approval_status=$1, reviewed_by=$2, rejection_reason=$3
       WHERE id=$4 AND approval_status='pending' RETURNING *`,
      [approvalStatus, req.user.id, reason || null, id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Pending SKU not found' });
    res.json({ success: true, message: `SKU Detail ${action}d successfully`, data: result.rows[0] });
  } catch (error) { next(error); }
};

module.exports = {
  getAllSkuDetails,
  getSkuDetailById,
  createSkuDetail,
  updateSkuDetail,
  deleteSkuDetail,
  getPendingSkuDetails,
  reviewSkuDetail
};

const db = require("../config/db.js")

const skuSellingPriceService = async (params = {}) => {
    const { page = 1, limit = 20, search = "" } = params;
    const offset = (page - 1) * limit;
    const values = [];
    let whereClause = "";

    if (search) {
        const searchPattern = `%${search}%`;
        const searchIndex = values.length + 1;
        values.push(searchPattern);
        whereClause = ` WHERE packing_material ILIKE $${searchIndex} OR sku_unit ILIKE $${searchIndex} OR conversion_formula ILIKE $${searchIndex}`;
    }

    // Get count
    const countQuery = `SELECT COUNT(*) FROM sku_selling_price ${whereClause}`;
    const countResult = await db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated data
    const query = `
        SELECT * FROM sku_selling_price 
        ${whereClause}
        ORDER BY id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    
    values.push(limit, offset);
    const result = await db.query(query, values);
    
    return {
        skus: result.rows,
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        }
    };
};

const updateSkuSellingPriceService = async (id, data) => {
    // Re-calculate the net oil in grams
    const skuWeightGm = parseFloat(data.sku_weight_in_gm || 0);
    const packingWeightGm = parseFloat(data.packing_material_weight_in_gm || 0);
    const packingCost = parseFloat(data.packing_cost || 0);
    const netOilInGm = skuWeightGm - packingWeightGm;

    // Fetch the latest GT from var_calc for landing cost recalculation
    const latestVarRes = await db.query(`SELECT gt FROM var_calc ORDER BY calculation_date DESC LIMIT 1`);
    const latestGt = (latestVarRes.rows.length > 0) ? parseFloat(latestVarRes.rows[0].gt) || 0 : 0;

    // Formula: landing_cost = (gt / 1000) * net_oil_in_gm + packing_cost
    const landingCost = (latestGt / 1000) * netOilInGm + packingCost;

    const query = `
        UPDATE sku_selling_price 
        SET 
            packing_material = $1,
            sku_weight = $2,
            sku_unit = $3,
            conversion_formula = $4,
            sku_weight_in_gm = $5,
            packing_material_weight_in_gm = $6,
            net_oil_in_gm = $7,
            packing_cost = $8,
            var = $9,
            margin = $10,
            landing_cost = $11
        WHERE id = $12
        RETURNING *;
    `;
    const values = [
        data.packing_material,
        data.sku_weight,
        data.sku_unit,
        data.conversion_formula,
        skuWeightGm,
        packingWeightGm,
        netOilInGm,
        packingCost,
        data.var,
        data.margin,
        landingCost.toFixed(2),
        id
    ];

    const result = await db.query(query, values);
    
    if (!result.rows.length) {
        throw new Error("Record not found or update failed");
    }

    return result.rows[0];
};

module.exports = { skuSellingPriceService, updateSkuSellingPriceService };

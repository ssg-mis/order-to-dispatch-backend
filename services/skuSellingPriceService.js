const db = require("../config/db.js")

const skuSellingPriceService = async () => {
    const result = await db.query(`SELECT * FROM sku_selling_price`);
    if (!result.rows.length) {
        return [];
    }

    return result.rows;
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

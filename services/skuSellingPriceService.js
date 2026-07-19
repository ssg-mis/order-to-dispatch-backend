/**
 * SKU Selling Price service — v2 schema.
 *
 * Powers the sku_selling_price list + inline edit surface
 * (GET/PUT /api/v1/skus/sku-selling-price). Both sku_selling_price and var_calc
 * live in v2, so this is a straight swap off the old RDS pool onto dbV2. The
 * landing_cost recompute (gt/1000 * net_oil_in_gm + packing_cost) is unchanged
 * and matches varCalcService's per-SKU recompute.
 */

const { dbV2 } = require("../config/db-v2.ts");
const { sql } = require("drizzle-orm");

const skuSellingPriceService = async (params = {}) => {
    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 20;
    const offset = (page - 1) * limit;
    const search = params.search || "";

    // conversion_formula is numeric in the v2 schema (was text in the old table),
    // so cast all search targets to text for the ILIKE.
    const where = search
        ? sql`WHERE packing_material::text ILIKE ${'%' + search + '%'} OR sku_unit::text ILIKE ${'%' + search + '%'} OR conversion_formula::text ILIKE ${'%' + search + '%'}`
        : sql``;

    const countResult = await dbV2.execute(sql`SELECT COUNT(*)::int AS count FROM sku_selling_price ${where}`);
    const total = parseInt(countResult.rows[0].count);

    const result = await dbV2.execute(sql`
        SELECT * FROM sku_selling_price
        ${where}
        ORDER BY id DESC
        LIMIT ${limit} OFFSET ${offset}
    `);

    return {
        skus: result.rows,
        pagination: {
            total,
            page,
            limit,
        },
    };
};

const updateSkuSellingPriceService = async (id, data) => {
    // Re-calculate the net oil in grams
    const skuWeightGm = parseFloat(data.sku_weight_in_gm || 0);
    const packingWeightGm = parseFloat(data.packing_material_weight_in_gm || 0);
    const packingCost = parseFloat(data.packing_cost || 0);
    const netOilInGm = skuWeightGm - packingWeightGm;

    // Fetch the latest GT from var_calc for landing cost recalculation
    const latestVarRes = await dbV2.execute(sql`SELECT gt FROM var_calc ORDER BY calculation_date DESC LIMIT 1`);
    const latestGt = (latestVarRes.rows.length > 0) ? parseFloat(latestVarRes.rows[0].gt) || 0 : 0;

    // Formula: landing_cost = (gt / 1000) * net_oil_in_gm + packing_cost
    const landingCost = (latestGt / 1000) * netOilInGm + packingCost;

    const result = await dbV2.execute(sql`
        UPDATE sku_selling_price
        SET
            packing_material = ${data.packing_material},
            sku_weight = ${data.sku_weight},
            sku_unit = ${data.sku_unit},
            conversion_formula = ${data.conversion_formula},
            sku_weight_in_gm = ${skuWeightGm},
            packing_material_weight_in_gm = ${packingWeightGm},
            net_oil_in_gm = ${netOilInGm},
            packing_cost = ${packingCost},
            var = ${data.var},
            margin = ${data.margin},
            landing_cost = ${landingCost.toFixed(2)}
        WHERE id = ${id}
        RETURNING *;
    `);

    if (!result.rows.length) {
        throw new Error("Record not found or update failed");
    }

    return result.rows[0];
};

module.exports = { skuSellingPriceService, updateSkuSellingPriceService };

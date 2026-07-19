/**
 * Var Calc Service
 * Handles operations for the var_calc table (Input Parameters sidebar).
 *
 * Migrated to the v2 schema (order-to-dispatch-db-v2): `var_calc` was pulled
 * into v2 verbatim (see src/schema/var_calc.ts) and `sku_selling_price` was
 * already there. Reads run as raw SQL so the response keeps the exact snake_case
 * column shape (loose_1_kg_oil_rate / five_percent_gst / gt) the frontend reads.
 */

const { dbV2 } = require('../config/db-v2.ts');
const { sql } = require('drizzle-orm');
const { Logger } = require('../utils');

class VarCalcService {
    /**
     * Get latest calculation variables
     */
    async getLatest() {
        try {
            const result = await dbV2.execute(sql`
                SELECT * FROM var_calc
                ORDER BY calculation_date DESC
                LIMIT 1
            `);
            return result.rows[0] || null;
        } catch (error) {
            Logger.error('Error in VarCalcService.getLatest:', error);
            throw error;
        }
    }

    /**
     * Get all calculation variables (history)
     */
    async getAll() {
        try {
            const result = await dbV2.execute(sql`
                SELECT * FROM var_calc
                ORDER BY calculation_date DESC
            `);
            return result.rows;
        } catch (error) {
            Logger.error('Error in VarCalcService.getAll:', error);
            throw error;
        }
    }

    /**
     * Save calculation variables
     */
    async save(data) {
        try {
            const { oil_rate, freight_rate, total, gst, gt, calculation_date, oil_type } = data;

            const isExists = await dbV2.execute(sql`
                SELECT oil_type, calculation_date
                FROM var_calc
                WHERE calculation_date = ${calculation_date} AND oil_type = ${oil_type}
            `);

            if (isExists.rows.length) {
                throw new Error("Variable parameter calculation already exists");
            }

            let result;
            try {
                result = await dbV2.execute(sql`
                    INSERT INTO var_calc (
                        loose_1_kg_oil_rate, freight_rate, total, five_percent_gst, gt, calculation_date, oil_type
                    ) VALUES (
                        ${oil_rate}, ${freight_rate}, ${total}, ${gst}, ${gt}, ${calculation_date}, ${oil_type}
                    ) RETURNING *
                `);
            } catch (e) {
                // Unique-violation backstop (var_calc_calculation_date_oil_type_key):
                // if two saves race past the app-level check above, translate the raw
                // 23505 into the same friendly message instead of leaking a DB error.
                const code = e?.code || e?.cause?.code;
                if (code === '23505') {
                    throw new Error('Variable parameter calculation already exists');
                }
                throw e;
            }

            // After saving var_calc, update landing_cost in sku_selling_price
            // Formula: landing_cost = (R / 1000) * net_oil_in_gm + packing_cost
            // where R = gt (Grand Total)
            try {
                const gtValue = parseFloat(gt) || 0;
                const skus = await dbV2.execute(sql`SELECT id, net_oil_in_gm, packing_cost FROM sku_selling_price`);

                for (const sku of skus.rows) {
                    const netOilInGm = parseFloat(sku.net_oil_in_gm) || 0;
                    const packingCost = parseFloat(sku.packing_cost) || 0;
                    const landingCost = (gtValue / 1000) * netOilInGm + packingCost;

                    await dbV2.execute(sql`
                        UPDATE sku_selling_price SET landing_cost = ${landingCost.toFixed(2)} WHERE id = ${sku.id}
                    `);
                }

                Logger.info(`[VarCalc] Updated landing_cost for ${skus.rows.length} SKUs using GT=${gtValue}`);
            } catch (lcError) {
                Logger.error('[VarCalc] Failed to update landing_cost in sku_selling_price:', lcError);
                // Don't throw — var_calc save was successful, landing_cost update is secondary
            }

            return result.rows[0];
        } catch (error) {
            Logger.error('Error in VarCalcService.save:', error);
            throw error;
        }
    }
}

module.exports = new VarCalcService();

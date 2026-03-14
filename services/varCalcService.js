/**
 * Var Calc Service
 * Handles operations for var_calc table (Input Parameters Sidebar)
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class VarCalcService {
    /**
     * Get latest calculation variables
     */
    async getLatest() {
        try {
            const query = `
        SELECT * FROM var_calc 
        ORDER BY calculation_date DESC 
        LIMIT 1
      `;
            const result = await db.query(query);
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
            const query = `
        SELECT * FROM var_calc 
        ORDER BY calculation_date DESC
      `;
            const result = await db.query(query);
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

            const isExists = await db.query(`
                SELECT oil_type, calculation_date
                FROM var_calc
                WHERE calculation_date = $1 AND oil_type = $2`,
            [calculation_date, oil_type]);

            if(isExists.rows.length) {
                const error = new Error("Variable parameter calculation already exists");
                throw error;
            }

            const query = `
        INSERT INTO var_calc (
          loose_1_kg_oil_rate, freight_rate, total, five_percent_gst, gt, calculation_date, oil_type
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        ) RETURNING *
      `;
            const values = [oil_rate, freight_rate, total, gst, gt, calculation_date, oil_type];
            const result = await db.query(query, values);

            // After saving var_calc, update landing_cost in sku_selling_price
            // Formula: landing_cost = (R / 1000) * net_oil_in_gm + packing_cost
            // where R = gt (Grand Total)
            try {
                const gtValue = parseFloat(gt) || 0;
                const skus = await db.query(`SELECT id, net_oil_in_gm, packing_cost FROM sku_selling_price`);

                for (const sku of skus.rows) {
                    const netOilInGm = parseFloat(sku.net_oil_in_gm) || 0;
                    const packingCost = parseFloat(sku.packing_cost) || 0;
                    const landingCost = (gtValue / 1000) * netOilInGm + packingCost;

                    await db.query(
                        `UPDATE sku_selling_price SET landing_cost = $1 WHERE id = $2`,
                        [landingCost.toFixed(2), sku.id] 
                    );
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

/**
 * Reports Service
 * Aggregates data for the comprehensive reports page
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class ReportsService {
  /**
   * Get comprehensive report data with filters
   */
  async getReport(filters = {}) {
    try {
      const client = await db.getClient();
      try {
        // Build WHERE clause for filters
        let conditions = [];
        let params = [];
        let p = 1;

        if (filters.order_no) {
          // Match base order number (DO-416 matches DO-416A, DO-416B)
          conditions.push(`order_no ILIKE $${p}`);
          params.push(`${filters.order_no}%`);
          p++;
        }

        if (filters.customer_name) {
          conditions.push(`customer_name ILIKE $${p}`);
          params.push(`%${filters.customer_name}%`);
          p++;
        }

        if (filters.oil_type) {
          conditions.push(`oil_type ILIKE $${p}`);
          params.push(`%${filters.oil_type}%`);
          p++;
        }

        if (filters.sku_name) {
          conditions.push(`sku_name ILIKE $${p}`);
          params.push(`%${filters.sku_name}%`);
          p++;
        }

        if (filters.from_date) {
          conditions.push(`created_at >= $${p}`);
          params.push(filters.from_date);
          p++;
        }

        if (filters.to_date) {
          conditions.push(`created_at <= $${p}`);
          params.push(filters.to_date + ' 23:59:59');
          p++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Helper: derive oil type from SKU name when DB column is null
        const deriveOilType = (oilType, skuName) => {
          if (oilType && oilType.trim() && oilType.trim().toLowerCase() !== 'unknown') return oilType.trim();
          const s = (skuName || '').toUpperCase();
          if (s.includes(' SBO') || s.startsWith('SBO')) return 'Soya Oil';
          if (s.includes(' RBO') || s.startsWith('RBO')) return 'Rice Bran Oil';
          if (s.includes('PALM OIL') || s.includes(' PALM') || s.startsWith('PALM')) return 'Palm Oil';
          if (s.includes('SOYA')) return 'Soya Oil';
          if (s.includes('RICE') || s.includes('RBO')) return 'Rice Bran Oil';
          return oilType || null;
        };

        // All matching orders
        const ordersResult = await client.query(
          `SELECT * FROM order_dispatch ${whereClause} ORDER BY created_at DESC`,
          params
        );
        const all = ordersResult.rows;

        // Summary KPIs
        const totalReceived = all.length;

        // Dispatched = actual_4 (Actual Dispatch) filled
        const dispatched = all.filter(o => o.actual_4);
        const totalDispatchedCount = dispatched.length;
        const totalDispatchedKg = dispatched.reduce((sum, o) => sum + (parseFloat(o.order_quantity) || 0), 0);

        // Pending = NOT completed (no actual_10/Gate Out)
        const pending = all.filter(o => !o.actual_10);
        const totalPendingCount = pending.length;
        const totalPendingKg = pending.reduce((sum, o) => sum + (parseFloat(o.order_quantity) || 0), 0);

        // Remaining = total qty - dispatched qty
        const totalReceivedKg = all.reduce((sum, o) => sum + (parseFloat(o.order_quantity) || 0), 0);
        const totalRemainingKg = totalReceivedKg - totalDispatchedKg;

        // Completed (Gate Out done)
        const completed = all.filter(o => o.actual_10);
        const totalCompletedCount = completed.length;
        const totalCompletedKg = completed.reduce((sum, o) => sum + (parseFloat(o.order_quantity) || 0), 0);

        // ── Load SKU details for weight lookup ──
        let skuDetailsMap = new Map();
        try {
          const skuResult = await client.query(`SELECT sku_name, sku_weight, nos_per_main_uom, main_uom, alternate_uom FROM sku_details`);
          skuResult.rows.forEach(sku => {
            skuDetailsMap.set((sku.sku_name || '').toUpperCase().trim(), sku);
          });
        } catch (e) {
          // sku_details may not exist or have different schema — gracefully skip
        }

        // ── Top Selling SKUs by oil type ──
        const skuMap = new Map();
        all.forEach(o => {
          const rawOil = deriveOilType(o.oil_type, o.sku_name || o.product_name);
          const key = `${rawOil || 'Unknown'}__${o.sku_name || o.product_name || 'Unknown'}`;
          if (!skuMap.has(key)) {
            const skuName = (o.sku_name || o.product_name || '').toUpperCase().trim();
            const skuDetail = skuDetailsMap.get(skuName);
            skuMap.set(key, { 
              oil_type: rawOil || 'Unknown', 
              sku: o.sku_name || o.product_name || 'Unknown',
              total_kg: 0, 
              total_qty: 0,      // box / nos count (from alternate_qty_kg field)
              total_qty_kg: 0,   // qty × sku_weight in KG
              sku_weight: skuDetail ? parseFloat(skuDetail.sku_weight) || 0 : 0,
              nos_per_main_uom: skuDetail ? parseFloat(skuDetail.nos_per_main_uom) || 0 : 0,
              main_uom: skuDetail ? skuDetail.main_uom : null,
              alternate_uom: skuDetail ? skuDetail.alternate_uom : null,
              count: 0
            });
          }
          const entry = skuMap.get(key);
          const altQty = parseFloat(o.alternate_qty_kg) || 0;
          entry.total_kg += parseFloat(o.order_quantity) || 0;
          entry.total_qty += altQty;
          entry.total_qty_kg += altQty * entry.sku_weight;
          entry.count += 1;
        });
        const topSkus = Array.from(skuMap.values())
          .sort((a, b) => b.total_kg - a.total_kg)
          .slice(0, 20);

        // ── Stage timing report (planned vs actual per stage) ──
        const stageMap = [
          { key: 'stage_1', label: 'Pre Approval', planned: 'planned_1', actual: 'actual_1' },
          { key: 'stage_2', label: 'Approval of Order', planned: 'planned_2', actual: 'actual_2' },
          { key: 'stage_3', label: 'Dispatch Planning', planned: 'planned_3', actual: 'actual_3' },
          { key: 'stage_4', label: 'Actual Dispatch', planned: 'planned_4', actual: 'actual_4' },
          { key: 'stage_5', label: 'Vehicle Details', planned: 'planned_5', actual: 'actual_5' },
          { key: 'stage_6', label: 'Material Load', planned: 'planned_6', actual: 'actual_6' },
          { key: 'stage_7', label: 'Security Approval', planned: 'planned_7', actual: 'actual_7' },
          { key: 'stage_8', label: 'Make Invoice', planned: 'planned_8', actual: 'actual_8' },
          { key: 'stage_9', label: 'Check Invoice', planned: 'planned_9', actual: 'actual_9' },
          { key: 'stage_10', label: 'Gate Out', planned: 'planned_10', actual: 'actual_10' },
          { key: 'stage_11', label: 'Material Receipt', planned: 'planned_11', actual: 'actual_11' },
          { key: 'stage_12', label: 'Damage Adjustment', planned: 'planned_12', actual: 'actual_12' },
          { key: 'stage_13', label: 'Final Delivery', planned: 'planned_13', actual: 'actual_13' },
        ];

        // ── Per-order timeline report ──
        const orderTimeline = all.map(o => {
          const stages = stageMap.map(s => {
            const planned = o[s.planned] ? new Date(o[s.planned]) : null;
            const actual = o[s.actual] ? new Date(o[s.actual]) : null;
            let delayDays = null;
            let delayHours = null;
            if (planned && actual) {
              const diffMs = actual - planned;
              delayDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              delayHours = Math.round(diffMs / (1000 * 60 * 60));
            }
            return {
              stage: s.label,
              planned: planned ? o[s.planned] : null,
              actual: actual ? o[s.actual] : null,
              delayDays,
              delayHours,
              onTime: planned && actual ? actual <= planned : null
            };
          }).filter(s => s.planned || s.actual); // only show stages with data

          const skuName = o.sku_name || o.product_name;
          const derivedOilType = deriveOilType(o.oil_type, skuName);
          const skuKey = (skuName || '').toUpperCase().trim();
          const skuDetail = skuDetailsMap.get(skuKey);
          const skuWeight = skuDetail ? parseFloat(skuDetail.sku_weight) || 0 : 0;
          const rawQty = parseFloat(o.order_quantity) || 0;
          const order_quantity_kg = skuWeight > 0 ? rawQty * skuWeight : rawQty;

          return {
            id: o.id,
            order_no: o.order_no,
            customer_name: o.customer_name,
            oil_type: derivedOilType,
            sku_name: skuName,
            order_quantity: rawQty,
            order_quantity_kg,
            sku_weight: skuWeight,
            alternate_qty_kg: o.alternate_qty_kg,
            uom: o.uom,
            created_at: o.created_at,
            delivery_date: o.delivery_date,
            stages
          };
        });

        return {
          summary: {
            totalReceived,
            totalReceivedKg,
            totalPendingCount,
            totalPendingKg,
            totalDispatchedCount,
            totalDispatchedKg,
            totalCompletedCount,
            totalCompletedKg,
            totalRemainingKg: Math.max(0, totalRemainingKg)
          },
          topSkus,
          orderTimeline,
          orders: all
        };
      } finally {
        client.release();
      }
    } catch (error) {
      Logger.error('Error generating report', error);
      throw error;
    }
  }
}

module.exports = new ReportsService();

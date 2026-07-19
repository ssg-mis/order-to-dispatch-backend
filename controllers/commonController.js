const { dbV2 } = require('../config/db-v2.ts');
const { sql } = require('drizzle-orm');

/**
 * Get Next business-code ID for a given master type (used by the Master page's
 * "add" dialog to pre-fill the next code, e.g. CUS1002, DPT102).
 *
 * Migrated to the v2 schema: the old RDS master tables (customer_details,
 * depot_details, …) became customers/depots/…, and their text business-code
 * columns (customer_id, depot_id, …) became *_code columns. This scans the v2
 * table for the highest existing numeric code under the prefix and returns +1.
 * Table/column names come from the fixed whitelist below (never user input),
 * so sql.raw here is not an injection surface.
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
        tableName = 'customers';
        idColumn = 'customer_code';
        prefix = 'CUS';
        minDigits = 4; // CUS1001
        break;
      case 'depot':
        tableName = 'depots';
        idColumn = 'depot_code';
        prefix = 'DPT';
        minDigits = 3; // DPT101
        break;
      case 'broker':
        tableName = 'brokers';
        idColumn = 'broker_code';
        prefix = 'BRK';
        minDigits = 3; // BRK101
        break;
      case 'sku':
        tableName = 'skus';
        idColumn = 'sku_code';
        prefix = 'SKU';
        minDigits = 4; // SKU1001
        break;
      case 'salesperson':
        tableName = 'salespersons';
        idColumn = 'salesperson_code';
        prefix = 'SLM';
        minDigits = 3; // SLM101
        break;
      case 'vehicle':
        tableName = 'vehicles';
        idColumn = 'vehicle_code';
        prefix = 'VICL';
        minDigits = 3; // VICL001
        break;
      case 'driver':
        tableName = 'drivers';
        idColumn = 'driver_code';
        prefix = 'DRIV';
        minDigits = 3; // DRIV001
        break;
      case 'transport':
        tableName = 'transporters';
        idColumn = 'transporter_code';
        prefix = 'TRSP';
        minDigits = 3; // TRSP001
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid type. Allowed: customer, depot, broker, sku, salesperson, vehicle, driver, transport'
        });
    }

    // Find the max numeric code under the prefix. The `~ '^PREFIX[0-9]+$'`
    // guard ensures only pure numeric-suffixed codes are considered, so the
    // CAST to INTEGER can never choke on a hand-entered non-numeric code.
    const result = await dbV2.execute(sql`
      SELECT ${sql.raw(idColumn)} AS id
      FROM ${sql.raw(tableName)}
      WHERE ${sql.raw(idColumn)} LIKE ${prefix + '%'}
        AND ${sql.raw(idColumn)} ~ ${'^' + prefix + '[0-9]+$'}
      ORDER BY CAST(SUBSTRING(${sql.raw(idColumn)} FROM ${prefix.length + 1}) AS INTEGER) DESC
      LIMIT 1
    `);

    let startNum = minDigits === 4 ? 1001 : 101;
    let nextNum;

    if (result.rows.length > 0) {
      const currentId = String(result.rows[0].id);
      const numPart = parseInt(currentId.replace(prefix, ''), 10);
      nextNum = !isNaN(numPart) ? numPart + 1 : startNum;
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

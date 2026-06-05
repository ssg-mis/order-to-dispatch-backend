const db = require('../config/db');

class ProductionService {
  async ensureTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS production (
        id SERIAL PRIMARY KEY,
        sku_name TEXT NOT NULL,
        date DATE NOT NULL,
        qty INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sku_name, date)
      )
    `);
  }

  async getByDate(date) {
    await this.ensureTable();
    const result = await db.query(
      `SELECT id, sku_name, date, qty FROM production WHERE date = $1 ORDER BY sku_name`,
      [date]
    );
    return result.rows;
  }

  async bulkUpsert(date, items) {
    await this.ensureTable();
    if (!items || items.length === 0) return [];
    const results = await Promise.all(
      items.map(({ sku_name, qty }) =>
        db.query(
          `INSERT INTO production (sku_name, date, qty, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (sku_name, date)
           DO UPDATE SET qty = $3, updated_at = CURRENT_TIMESTAMP
           RETURNING *`,
          [sku_name, date, qty]
        )
      )
    );
    return results.map(r => r.rows[0]);
  }
}

module.exports = new ProductionService();

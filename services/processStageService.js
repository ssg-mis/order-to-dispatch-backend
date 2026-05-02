const db = require('../config/db');
const { Logger } = require('../utils');

const ALLOWED_STAGES = [
  'Commitment Punch',
  'Order Punch',
  'Pre Approval',
  'Approval of Order',
  'Dispatch Planning',
  'Actual Dispatch',
  'Security Guard Approval',
  'Make Invoice (Proforma)',
  'Check Invoice',
  'Gate Out',
  'Confirm Material Receipt',
  'Damage Adjustment',
  'Gate In'
];

class ProcessStageService {
  async ensureTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS process_stages (
        id SERIAL PRIMARY KEY,
        stage_name VARCHAR(100) NOT NULL,
        stage_time INTERVAL NOT NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getAll() {
    try {
      await this.ensureTable();
      const result = await db.query(`
        SELECT
          id,
          stage_name,
          stage_time::text AS stage_time,
          EXTRACT(EPOCH FROM stage_time)::integer AS stage_time_seconds,
          submitted_at
        FROM process_stages
        ORDER BY submitted_at DESC, id DESC
      `);

      return result.rows;
    } catch (error) {
      Logger.error('Error fetching process stages', error);
      throw error;
    }
  }

  async save(data) {
    try {
      await this.ensureTable();

      const stageName = String(data.stage_name || '').trim();
      const totalMinutes = Number(data.total_minutes);

      if (!ALLOWED_STAGES.includes(stageName)) {
        throw new Error('Invalid stage name');
      }

      if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
        throw new Error('Stage time must be greater than zero');
      }

      const existing = await db.query(
        'SELECT id FROM process_stages WHERE stage_name = $1 ORDER BY id ASC LIMIT 1',
        [stageName]
      );

      const params = [stageName, totalMinutes];
      const query = existing.rows.length
        ? `
          UPDATE process_stages
          SET stage_time = ($2::int * INTERVAL '1 minute'),
              submitted_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING id, stage_name, stage_time::text AS stage_time,
            EXTRACT(EPOCH FROM stage_time)::integer AS stage_time_seconds,
            submitted_at
        `
        : `
          INSERT INTO process_stages (stage_name, stage_time)
          VALUES ($1, $2::int * INTERVAL '1 minute')
          RETURNING id, stage_name, stage_time::text AS stage_time,
            EXTRACT(EPOCH FROM stage_time)::integer AS stage_time_seconds,
            submitted_at
        `;

      const result = await db.query(
        query,
        existing.rows.length ? [...params, existing.rows[0].id] : params
      );

      return result.rows[0];
    } catch (error) {
      Logger.error('Error saving process stage', error);
      throw error;
    }
  }

  async update(id, data) {
    try {
      await this.ensureTable();

      const stageName = String(data.stage_name || '').trim();
      const totalMinutes = Number(data.total_minutes);

      if (!ALLOWED_STAGES.includes(stageName)) {
        throw new Error('Invalid stage name');
      }

      if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
        throw new Error('Stage time must be greater than zero');
      }

      const result = await db.query(
        `
          UPDATE process_stages
          SET stage_name = $1,
              stage_time = ($2::int * INTERVAL '1 minute'),
              submitted_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING id, stage_name, stage_time::text AS stage_time,
            EXTRACT(EPOCH FROM stage_time)::integer AS stage_time_seconds,
            submitted_at
        `,
        [stageName, totalMinutes, id]
      );

      if (result.rows.length === 0) {
        throw new Error('Process stage not found');
      }

      return result.rows[0];
    } catch (error) {
      Logger.error('Error updating process stage', error);
      throw error;
    }
  }

  async delete(id) {
    try {
      await this.ensureTable();
      const result = await db.query(
        'DELETE FROM process_stages WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Process stage not found');
      }
      return result.rows[0];
    } catch (error) {
      Logger.error('Error deleting process stage', error);
      throw error;
    }
  }
}

module.exports = new ProcessStageService();

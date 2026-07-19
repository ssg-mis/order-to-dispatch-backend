/**
 * Process Stage Service — TAT (turn-around-time) config per workflow stage
 * (set-turn-around-time page). Each stage's stage_time is added to NOW() when
 * the previous gate completes to seed the next gate's planned_at.
 *
 * Migrated to the v2 schema (order-to-dispatch-db-v2). The `process_stages`
 * table already lives in v2 (src/schema/process_stages.ts) and is what every
 * stage service reads via stageUtils.getPlannedAt — so this CRUD just needed
 * repointing off the old RDS. No ensureTable() needed anymore (the table is
 * part of the fixed v2 schema); stage_name carries a UNIQUE constraint in v2.
 * Reads keep the exact response shape (stage_time text + seconds + submitted_at).
 */

const { dbV2 } = require('../config/db-v2.ts');
const { sql } = require('drizzle-orm');
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
  async getAll() {
    try {
      const result = await dbV2.execute(sql`
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
      const stageName = String(data.stage_name || '').trim();
      const totalMinutes = Number(data.total_minutes);

      if (!ALLOWED_STAGES.includes(stageName)) {
        throw new Error('Invalid stage name');
      }

      if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
        throw new Error('Stage time must be greater than zero');
      }

      const existing = await dbV2.execute(sql`
        SELECT id FROM process_stages WHERE stage_name = ${stageName} ORDER BY id ASC LIMIT 1
      `);

      let result;
      if (existing.rows.length) {
        result = await dbV2.execute(sql`
          UPDATE process_stages
          SET stage_time = (${totalMinutes}::int * INTERVAL '1 minute'),
              submitted_at = CURRENT_TIMESTAMP
          WHERE id = ${existing.rows[0].id}
          RETURNING id, stage_name, stage_time::text AS stage_time,
            EXTRACT(EPOCH FROM stage_time)::integer AS stage_time_seconds,
            submitted_at
        `);
      } else {
        result = await dbV2.execute(sql`
          INSERT INTO process_stages (stage_name, stage_time)
          VALUES (${stageName}, ${totalMinutes}::int * INTERVAL '1 minute')
          RETURNING id, stage_name, stage_time::text AS stage_time,
            EXTRACT(EPOCH FROM stage_time)::integer AS stage_time_seconds,
            submitted_at
        `);
      }

      return result.rows[0];
    } catch (error) {
      Logger.error('Error saving process stage', error);
      throw error;
    }
  }

  async update(id, data) {
    try {
      const stageName = String(data.stage_name || '').trim();
      const totalMinutes = Number(data.total_minutes);

      if (!ALLOWED_STAGES.includes(stageName)) {
        throw new Error('Invalid stage name');
      }

      if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
        throw new Error('Stage time must be greater than zero');
      }

      const result = await dbV2.execute(sql`
        UPDATE process_stages
        SET stage_name = ${stageName},
            stage_time = (${totalMinutes}::int * INTERVAL '1 minute'),
            submitted_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id, stage_name, stage_time::text AS stage_time,
          EXTRACT(EPOCH FROM stage_time)::integer AS stage_time_seconds,
          submitted_at
      `);

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
      const result = await dbV2.execute(sql`
        DELETE FROM process_stages WHERE id = ${id} RETURNING id
      `);
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

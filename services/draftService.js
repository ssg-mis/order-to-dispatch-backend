/**
 * Draft Service
 * Business logic for saving/retrieving/deleting Actual Dispatch form drafts
 * Uses dispatch_drafts table
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class DraftService {
  /**
   * Save or update a draft (upsert by username + order_key)
   * @param {string} username
   * @param {string} orderKey
   * @param {Object} draftData
   * @returns {Promise<Object>}
   */
  async saveDraft(username, orderKey, draftData) {
    try {
      const query = `
        INSERT INTO dispatch_drafts (username, order_key, draft_data, saved_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (username, order_key)
        DO UPDATE SET draft_data = EXCLUDED.draft_data, saved_at = NOW()
        RETURNING id, saved_at
      `;
      const result = await db.query(query, [username, orderKey, JSON.stringify(draftData)]);
      Logger.info(`[DRAFT] Saved draft for user=${username}, order_key=${orderKey}`);
      return { success: true, data: result.rows[0] };
    } catch (error) {
      Logger.error('[DRAFT] Error saving draft', error);
      throw new Error('Failed to save draft');
    }
  }

  /**
   * Retrieve a draft by username + order_key
   * @param {string} username
   * @param {string} orderKey
   * @returns {Promise<Object>}
   */
  async getDraft(username, orderKey) {
    try {
      const query = `
        SELECT id, username, order_key, draft_data, saved_at
        FROM dispatch_drafts
        WHERE username = $1 AND order_key = $2
      `;
      const result = await db.query(query, [username, orderKey]);
      if (result.rows.length === 0) {
        return { success: true, data: null };
      }
      return { success: true, data: result.rows[0] };
    } catch (error) {
      Logger.error('[DRAFT] Error fetching draft', error);
      throw new Error('Failed to fetch draft');
    }
  }

  /**
   * Delete a draft after successful submission
   * @param {string} username
   * @param {string} orderKey
   * @returns {Promise<Object>}
   */
  async deleteDraft(username, orderKey) {
    try {
      const query = `
        DELETE FROM dispatch_drafts
        WHERE username = $1 AND order_key = $2
      `;
      await db.query(query, [username, orderKey]);
      Logger.info(`[DRAFT] Deleted draft for user=${username}, order_key=${orderKey}`);
      return { success: true };
    } catch (error) {
      Logger.error('[DRAFT] Error deleting draft', error);
      throw new Error('Failed to delete draft');
    }
  }
}

module.exports = new DraftService();

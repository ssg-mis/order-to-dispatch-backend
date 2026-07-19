/**
 * Draft Service — v2 schema.
 * Save/retrieve/delete Actual-Dispatch form drafts in `dispatch_drafts`
 * (shared per order_key — any user can continue another's draft; `username`
 * is just "last saved by"). Was raw SQL against old RDS; the table is now a
 * real v2 table (schema.dispatchDrafts, backfilled). Shares that table with
 * gateInService, so both must live on the same DB — hence migrated together.
 */
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq } = require('drizzle-orm');
const { Logger } = require('../utils');

class DraftService {
  async saveDraft(username, orderKey, draftData) {
    try {
      const [row] = await dbV2
        .insert(schema.dispatchDrafts)
        .values({ username, orderKey, draftData, savedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.dispatchDrafts.orderKey,
          set: { username, draftData, savedAt: new Date() },
        })
        .returning({ id: schema.dispatchDrafts.id, saved_at: schema.dispatchDrafts.savedAt });
      Logger.info(`[DRAFT] Saved draft for user=${username}, order_key=${orderKey}`);
      return { success: true, data: row };
    } catch (error) {
      Logger.error('[DRAFT] Error saving draft', error);
      throw new Error('Failed to save draft');
    }
  }

  async getDraft(orderKey) {
    try {
      const [row] = await dbV2
        .select({
          id: schema.dispatchDrafts.id,
          username: schema.dispatchDrafts.username,
          order_key: schema.dispatchDrafts.orderKey,
          draft_data: schema.dispatchDrafts.draftData,
          saved_at: schema.dispatchDrafts.savedAt,
        })
        .from(schema.dispatchDrafts)
        .where(eq(schema.dispatchDrafts.orderKey, orderKey));
      return { success: true, data: row || null };
    } catch (error) {
      Logger.error('[DRAFT] Error fetching draft', error);
      throw new Error('Failed to fetch draft');
    }
  }

  async deleteDraft(orderKey) {
    try {
      await dbV2.delete(schema.dispatchDrafts).where(eq(schema.dispatchDrafts.orderKey, orderKey));
      Logger.info(`[DRAFT] Deleted draft for order_key=${orderKey}`);
      return { success: true };
    } catch (error) {
      Logger.error('[DRAFT] Error deleting draft', error);
      throw new Error('Failed to delete draft');
    }
  }
}

module.exports = new DraftService();

/**
 * Stage Notifier — the v2 next-stage WhatsApp nudge (recipient logic).
 *
 * Fire-and-forget: called WITHOUT await from a controller; resolves everything
 * itself and never throws (a notify problem must not fail the stage action).
 *
 * Recipient rule (per business spec):
 *   notify users who have `page_access[nextStage] == 'modify'` AND — when that
 *   stage is DEPOT-SCOPED (i.e. some user carries a depo_access[nextStage]
 *   list) — whose depo_access[nextStage] contains THIS DO's depot. Only the
 *   depot-operational stages (Dispatch Planning, Actual Dispatch) are depot-
 *   scoped in the data; the rest fall back to modify-only.
 *
 * One message per DO: the stage pages loop submits per SKU/shipment, so a
 * multi-line DO fires a burst of notifies — they're collapsed to a single
 * message per (order_no, nextStage) within a short window.
 */

const { dbV2 } = require('../config/db-v2.ts');
const { sql } = require('drizzle-orm');
const { Logger } = require('../utils');
const { whatsappShareService } = require('./whatsappShareService');

const isOff = () =>
  String(process.env.WHATSAPP_ENABLED).toLowerCase() === 'false' &&
  String(process.env.WHATSAPP_DRY_RUN).toLowerCase() !== 'true';

// ---- one-message-per-DO dedup (collapses the per-SKU submit burst) ----
const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const recentlyNotified = new Map(); // `${orderNo}::${stage}` -> lastSentMs
function isDuplicate(orderNo, targetStage) {
  const key = `${orderNo}::${targetStage}`;
  const now = Date.now();
  if (recentlyNotified.size > 2000) {
    for (const [k, t] of recentlyNotified) if (now - t > DEDUP_WINDOW_MS) recentlyNotified.delete(k);
  }
  const last = recentlyNotified.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentlyNotified.set(key, now);
  return false;
}

function fmtDate(v) {
  if (!v) return '-';
  try {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getUTCFullYear()}`;
  } catch { return String(v); }
}

// Resolve orderId + representative order_item id from any single locator.
async function resolveLocator({ orderId, orderItemId, dispatchId }) {
  if (orderId) return { orderId: Number(orderId), itemId: null };
  if (orderItemId) {
    const r = await dbV2.execute(sql`SELECT order_id FROM order_items WHERE id = ${Number(orderItemId)}`);
    return r.rows[0] ? { orderId: r.rows[0].order_id, itemId: Number(orderItemId) } : null;
  }
  if (dispatchId) {
    const r = await dbV2.execute(sql`
      SELECT oi.order_id, oi.id AS item_id
      FROM dispatches d JOIN order_items oi ON oi.id = d.order_item_id
      WHERE d.id = ${Number(dispatchId)}
    `);
    return r.rows[0] ? { orderId: r.rows[0].order_id, itemId: r.rows[0].item_id } : null;
  }
  return null;
}

// The stage a shipment is currently pending at, from its live gate rows
// (earliest open gate wins). Handles BANARI skip / security reject / issue
// revert / damage branch with no hardcoding.
async function resolveDispatchStage(dispatchId) {
  const r = await dbV2.execute(sql`
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM dispatches d WHERE d.id = ${Number(dispatchId)} AND d.actual_at IS NULL) THEN 'Actual Dispatch'
      WHEN EXISTS (SELECT 1 FROM security_guard_checks s WHERE s.dispatch_id = ${Number(dispatchId)} AND s.planned_at IS NOT NULL AND s.actual_at IS NULL) THEN 'Security Guard Approval'
      WHEN EXISTS (SELECT 1 FROM invoices inv WHERE inv.dispatch_id = ${Number(dispatchId)} AND inv.planned_made_at IS NOT NULL AND inv.made_at IS NULL) THEN 'Make Invoice'
      WHEN EXISTS (SELECT 1 FROM invoices inv WHERE inv.dispatch_id = ${Number(dispatchId)} AND inv.made_at IS NOT NULL AND inv.checked_at IS NULL) THEN 'Check Invoice'
      WHEN EXISTS (SELECT 1 FROM gate_outs g WHERE g.dispatch_id = ${Number(dispatchId)} AND g.planned_at IS NOT NULL AND g.actual_at IS NULL) THEN 'Gate Out'
      WHEN EXISTS (SELECT 1 FROM material_receipts mr WHERE mr.dispatch_id = ${Number(dispatchId)} AND mr.planned_at IS NOT NULL AND mr.actual_at IS NULL) THEN 'Confirm Material Receipt'
      WHEN EXISTS (SELECT 1 FROM damage_adjustments da WHERE da.dispatch_id = ${Number(dispatchId)} AND da.planned_at IS NOT NULL AND da.actual_at IS NULL) THEN 'Damage Adjustment'
      ELSE NULL
    END AS stage
  `);
  return r.rows[0]?.stage || null;
}

// Order header context: DO no. + date + customer + depot (for message + depot filter).
async function loadOrderContext(orderId) {
  const r = await dbV2.execute(sql`
    SELECT o.order_no, o.party_so_date, o.delivery_date, o.start_date,
           c.customer_name, d.depot_name
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN depots d ON d.id = o.depot_id
    WHERE o.id = ${Number(orderId)}
  `);
  return r.rows[0] || null;
}

async function resolveUserName(userId) {
  if (!userId) return null;
  const r = await dbV2.execute(sql`SELECT username FROM users WHERE id = ${Number(userId)}`);
  return r.rows[0]?.username || null;
}

// Eligible recipients: modify on the target stage, plus the depot filter when
// the stage is depot-scoped. `?` tests array-element existence for depo_access.
async function loadRecipients(targetStage, depotName) {
  const r = await dbV2.execute(sql`
    WITH scoped AS (
      SELECT EXISTS (
        SELECT 1 FROM users
        WHERE jsonb_typeof(depo_access -> ${targetStage}) = 'array'
          AND jsonb_array_length(depo_access -> ${targetStage}) > 0
      ) AS is_scoped
    )
    SELECT u.id, u.username, u.phone_no
    FROM users u, scoped
    WHERE u.phone_no IS NOT NULL AND u.phone_no <> ''
      AND (u.page_access ->> ${targetStage}) = 'modify'
      AND (NOT scoped.is_scoped OR (u.depo_access -> ${targetStage}) ? ${depotName || ''})
  `);
  return r.rows;
}

/**
 * @param {{orderId?, orderItemId?, dispatchId?}} locator
 * @param {{headline?, targetPage?, userId?}} opts
 *   - targetPage: explicit next stage for pre-dispatch stages. Omit with a
 *     dispatchId and the shipment's current pending gate is derived.
 *   - userId: the acting user (previous-stage doer) — shown as "Processed By".
 */
async function notifyNextStage(locator = {}, opts = {}) {
  try {
    if (isOff()) return;

    const resolved = await resolveLocator(locator);
    if (!resolved || !resolved.orderId) {
      Logger.warn('[WHATSAPP] notifyNextStage: could not resolve order from locator', locator);
      return;
    }

    let targetPage = opts.targetPage;
    if (!targetPage && locator.dispatchId) targetPage = await resolveDispatchStage(locator.dispatchId);
    if (!targetPage) { Logger.info('[WHATSAPP] notifyNextStage: no pending next stage, skipping'); return; }

    const ctx = await loadOrderContext(resolved.orderId);
    if (!ctx) return;

    // One message per DO per stage — collapse the per-SKU submit burst.
    if (isDuplicate(ctx.order_no, targetPage)) {
      Logger.info(`[WHATSAPP] dedup: ${ctx.order_no} -> ${targetPage} already notified recently, skipping`);
      return;
    }

    const processedBy = (await resolveUserName(opts.userId)) || 'System';
    const recipients = await loadRecipients(targetPage, ctx.depot_name);
    Logger.info(`[WHATSAPP] ${ctx.order_no} -> ${targetPage} (depot ${ctx.depot_name || '-'}): ${recipients.length} recipient(s)`);
    if (recipients.length === 0) return;

    const docDetails = {
      customer_name: ctx.customer_name,
      do_number: ctx.order_no,
      // "DO Date" is the SO date (order-punch's soDate = party_so_date, set on
      // every order); delivery/start are only fallbacks if it were ever null.
      do_date: fmtDate(ctx.party_so_date || ctx.delivery_date || ctx.start_date),
      next_stage: targetPage,
      processed_by: processedBy,
    };
    await whatsappShareService(docDetails, recipients, targetPage);
  } catch (err) {
    Logger.warn('[WHATSAPP] notifyNextStage failed (non-fatal)', err);
  }
}

module.exports = { notifyNextStage };

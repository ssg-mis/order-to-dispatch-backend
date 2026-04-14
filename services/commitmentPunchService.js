/**
 * Commitment Punch Service
 * Handles business logic for commitment_main and commitment_details tables.
 * When a commitment is processed, a matching row is also created in order_dispatch.
 *
 * Order numbering logic:
 *   - First process of a commitment → increment order_number_sequence → DO-520, insert DO-520A
 *   - Second process same commitment → reuse DO-520 (read from order_dispatch via commitment_details) → DO-520B
 *   - New commitment → new base number DO-521
 *
 * No extra columns needed in commitment_main.
 * commitment_details.po_no stores the order_no for traceability.
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class CommitmentPunchService {
  /**
   * Generate financial year string (e.g., "26-27") based on current date.
   * Financial year: April to March.
   */
  getFinancialYear() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const fyStart = month >= 3 ? year : year - 1;
    const fyEnd = fyStart + 1;
    return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
  }

  /**
   * Generate next commitment number: CN/YY-YY/001
   */
  async generateCommitmentNo(client) {
    const fy = this.getFinancialYear();
    const prefix = `COMM/${fy}/`;

    const result = await client.query(
      `SELECT commitment_no FROM commitment_main
       WHERE commitment_no LIKE $1
       ORDER BY commitment_no DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let nextSeq = 1;
    if (result.rows.length > 0) {
      const last = result.rows[0].commitment_no;
      const seqPart = last.replace(prefix, '').replace(/[A-Z]+$/, '');
      nextSeq = parseInt(seqPart, 10) + 1;
    }
    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  }

  /**
   * Generate the next DO order number for a commitment.
   *
   * Strategy:
   *   - Look for existing order_dispatch rows linked to this commitment
   *     via commitment_details (we store the generated order_no in commitment_details.po_no
   *     separately via a dedicated column — but since we don't want new migrations, we
   *     instead look up order_dispatch rows where commitment_details links them).
   *
   * Actually cleaner: we store the base_order_no by querying commitment_details for
   * any prior order_dispatch entries. We use a simple naming convention:
   *   - Find the order_no from the FIRST commitment_detail for this commitment_id
   *     from order_dispatch (via po_no tracking column in commitment_details).
   *
   * Since we do NOT want new columns, we use a different lookup:
   *   - Query order_dispatch WHERE commitment_ref = id ... but that doesn't exist.
   *
   * SIMPLEST approach without any schema change:
   *   - In commitment_details, the field we control is: we store the generated order_no
   *     into the 'po_no' field is not right either.
   *
   * FINAL DECISION: Use a temp lookup column approach:
   *   - When we insert into commitment_details, we need to know the order_no.
   *   - We store the base_order_no in a separate lookup: query order_dispatch for
   *     rows whose order_no matches a pattern we derive from commitment_details.
   *
   * Actually the CLEANEST solution with zero schema changes:
   *   We store the generated order_no in commitment_details.po_no is wrong because po_no
   *   is a real PO field.
   *
   * => We will use commitment_main.base_order_no BUT handle it gracefully if the
   *    column doesn't exist yet (catch the error and add it dynamically).
   *
   * => Better: Add the column in the service itself on first use.
   *
   * We will attempt to ensure the column exists by running ALTER TABLE IF NOT EXISTS
   * at the start of the first processCommitment call.
   */

  /**
   * Ensure base_order_no column exists on commitment_main.
   * Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS (safe / idempotent).
   */
  async ensureBaseOrderNoColumn(client) {
    await client.query(
      `ALTER TABLE commitment_main ADD COLUMN IF NOT EXISTS base_order_no VARCHAR(50)`
    );
  }

  /**
   * Generate DO order number.
   * @param {object} client - DB client (within transaction)
   * @param {string|null} existingBase - If already assigned, reuse it; otherwise generate new
   * @returns {{ orderNo: string, baseOrderNo: string }}
   */
  async generateOrderNo(client, existingBase) {
    let base = existingBase;

    if (!base) {
      const fy = this.getFinancialYear(); // e.g. "26-27"
      const prefix = `DO/${fy}/`;

      // Find the latest order_no in order_dispatch matching DO/YY-YY/NNNN format
      const latestRes = await client.query(
        `SELECT order_no FROM order_dispatch
         WHERE order_no LIKE $1
         ORDER BY order_no DESC
         LIMIT 1`,
        [`${prefix}%`]
      );

      let nextNum = 1;
      if (latestRes.rows.length > 0) {
        // Extract numeric part: DO/26-27/0033A → "0033" → 33
        const latestNo = latestRes.rows[0].order_no;
        const numPart = latestNo.replace(prefix, '').replace(/[A-Z]+$/i, '');
        const parsed = parseInt(numPart, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }

      // Format: DO/26-27/0034 (4-digit zero-padded)
      base = `${prefix}${String(nextNum).padStart(4, '0')}`;
    }

    // Count how many order_dispatch rows already use this base prefix
    const countRes = await client.query(
      `SELECT COUNT(*) FROM order_dispatch WHERE order_no LIKE $1`,
      [`${base}%`]
    );
    const existingCount = parseInt(countRes.rows[0].count) || 0;

    // A=0, B=1, C=2 ...
    const letter = String.fromCharCode(65 + existingCount);
    const orderNo = `${base}${letter}`;

    return { orderNo, baseOrderNo: base };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE COMMITMENT
  // ─────────────────────────────────────────────────────────────────────────

  async createCommitment(data, rows = []) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const baseNo = await this.generateCommitmentNo(client);
      const inserted = [];
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const items = rows.length > 0 ? rows : [data];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const suffix = items.length > 1 ? letters[i] : '';
        const commitmentNo = `${baseNo}${suffix}`;

        const res = await client.query(
          `INSERT INTO commitment_main
            (commitment_no, commitment_date, party_name, oil_type, quantity, unit, rate, planned1)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [
            commitmentNo,
            data.commitment_date || null,
            data.party_name || null,
            item.oil_type || null,
            item.quantity || null,
            item.unit || null,
            item.rate || null,
            data.commitment_date || null,
          ]
        );
        inserted.push(res.rows[0]);
      }

      await client.query('COMMIT');
      Logger.info(`Created ${inserted.length} commitment row(s). Base: ${baseNo}`);

      return {
        success: true,
        message: 'Commitment created successfully',
        data: { commitment_no: baseNo, commitments: inserted },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error creating commitment', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET ALL
  // ─────────────────────────────────────────────────────────────────────────

  async getAll(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 20;
      const offset = (page - 1) * limit;

      let where = [];
      let params = [];
      let idx = 1;

      if (filters.party_name) {
        where.push(`party_name ILIKE $${idx}`);
        params.push(`%${filters.party_name}%`);
        idx++;
      }
      if (filters.search) {
        where.push(`(commitment_no ILIKE $${idx} OR party_name ILIKE $${idx})`);
        params.push(`%${filters.search}%`);
        idx++;
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const countRes = await db.query(
        `SELECT COUNT(*) FROM commitment_main ${whereClause}`,
        params
      );
      const total = parseInt(countRes.rows[0].count);

      const dataRes = await db.query(
        `SELECT * FROM commitment_main ${whereClause}
         ORDER BY timestamp DESC, commitment_no ASC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      );

      return {
        success: true,
        data: dataRes.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      Logger.error('Error fetching commitments', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET PENDING
  // ─────────────────────────────────────────────────────────────────────────

  async getPending(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 50;
      const offset = (page - 1) * limit;

      let where = [`cm.planned1 IS NOT NULL`];
      let params = [];
      let idx = 1;

      if (filters.search) {
        where.push(`(cm.commitment_no ILIKE $${idx} OR cm.party_name ILIKE $${idx})`);
        params.push(`%${filters.search}%`);
        idx++;
      }

      // Add remaining-qty filter directly into WHERE — avoids GROUP BY requirement
      where.push(`cm.quantity > COALESCE((
        SELECT SUM(cd.sku_quantity) FROM commitment_details cd
        WHERE cd.commitment_id = cm.id
      ), 0)`);

      const whereClause = `WHERE ${where.join(' AND ')}`;

      const fullQuery = `
        SELECT
          cm.id,
          cm.commitment_no,
          cm.commitment_date,
          cm.party_name,
          cm.oil_type,
          cm.quantity,
          cm.unit,
          cm.rate,
          cm.planned1,
          cm.timestamp,
          COALESCE((
            SELECT SUM(cd.sku_quantity)
            FROM commitment_details cd
            WHERE cd.commitment_id = cm.id
          ), 0) AS processed_qty,
          cm.quantity - COALESCE((
            SELECT SUM(cd.sku_quantity)
            FROM commitment_details cd
            WHERE cd.commitment_id = cm.id
          ), 0) AS remaining_qty
        FROM commitment_main cm
        ${whereClause}
        ORDER BY cm.timestamp DESC, cm.commitment_no ASC
      `;

      // Count pending rows
      const countQuery = `SELECT COUNT(*) FROM commitment_main cm ${whereClause}`;
      const countRes = await db.query(countQuery, params);
      const total = parseInt(countRes.rows[0]?.count || '0');

      const dataRes = await db.query(
        `${fullQuery} LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      );


      return {
        success: true,
        data: dataRes.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      Logger.error('Error fetching pending commitments', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROCESS COMMITMENT
  // ─────────────────────────────────────────────────────────────────────────

  async processCommitment(id, data = {}) {
    // ── Step 0: Ensure base_order_no column exists BEFORE starting the transaction.
    // ALTER TABLE inside a transaction invalidates PostgreSQL's column plan for
    // subsequent DML on the same connection, causing "column id does not exist".
    // Running it with the pool (auto-committed) avoids this entirely.
    try {
      await db.query(`ALTER TABLE commitment_main ADD COLUMN IF NOT EXISTS base_order_no VARCHAR(50)`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS broker_name VARCHAR(255)`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS salesperson_name VARCHAR(255)`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS salesperson_name VARCHAR(255)`);
    } catch (alterErr) {
      Logger.warn('Could not ensure columns (may already exist):', alterErr.message);
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // ── Step 1: Fetch commitment_main row ─────────────────────────
      const cmRes = await client.query(
        `SELECT * FROM commitment_main WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (cmRes.rows.length === 0) throw new Error('Commitment not found');
      const cm = cmRes.rows[0];


      // ── Step 2: Validate quantity ──────────────────────────────────
      const processedRes = await client.query(
        `SELECT COALESCE(SUM(sku_quantity), 0) AS processed_qty
         FROM commitment_details WHERE commitment_id = $1`,
        [id]
      );
      const processedQty = parseFloat(processedRes.rows[0].processed_qty) || 0;
      const remainingQty = parseFloat(cm.quantity) - processedQty;

      const skuQty = parseFloat(data.sku_quantity) || 0;
      if (skuQty <= 0) throw new Error('SKU quantity must be greater than 0');
      if (skuQty > remainingQty + 0.001) {
        throw new Error(
          `SKU quantity (${skuQty}) exceeds remaining commitment quantity (${remainingQty.toFixed(2)})`
        );
      }

      // ── Step 3: Calculate delay ────────────────────────────────────
      const today = new Date().toISOString().split('T')[0];
      let delay = null;
      if (cm.planned1) {
        const planned = new Date(cm.planned1);
        const actual = new Date(today);
        delay = Math.round((actual - planned) / (1000 * 60 * 60 * 24));
      }

      // ── Step 4: Generate DO order number ──────────────────────────
      // base_order_no on commitment_main tracks the base DO for all partial processes
      const { orderNo, baseOrderNo } = await this.generateOrderNo(
        client,
        cm.base_order_no || null
      );

      // Save base_order_no to commitment_main if this is the first process
      if (!cm.base_order_no) {
        await client.query(
          `UPDATE commitment_main SET base_order_no = $1 WHERE id = $2`,
          [baseOrderNo, id]
        );
      }

      const orderTitleCase = data.order_type ? (data.order_type.charAt(0).toUpperCase() + data.order_type.slice(1)) : 'Regular';
      const transportTitleCase = data.transport_type ? (data.transport_type.charAt(0).toUpperCase() + data.transport_type.slice(1)) : (cm.transport_type || 'Ex-Depot');

      // ── Step 5: Insert into commitment_details ─────────────────────
      const detailRes = await client.query(
        `INSERT INTO commitment_details
          (commitment_id, actual1, delay1, po_no, po_date, sku, sku_quantity, sku_rate, order_type, transport_type, broker_name, salesperson_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          id,
          today,
          delay,
          data.po_no || null,
          data.po_date || null,
          data.sku || null,
          skuQty,
          data.sku_rate || null,
          orderTitleCase,
          transportTitleCase,
          data.broker_name || null,
          data.salesperson_name || null,
        ]
      );

      // ── Step 6: Insert into order_dispatch ────────────────────────
      const nowIso = new Date().toISOString();
      await client.query(
        `INSERT INTO order_dispatch
          (order_no, order_type, customer_name, product_name, oil_type,
           order_quantity, rate_of_material, uom, type_of_transporting,
           party_so_date,
           planned_2, remaining_dispatch_qty,
           timestamp_created, created_at,
           broker_name, salesperson_name, is_order_through_broker)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          orderNo,
          orderTitleCase,
          cm.party_name || null,
          data.sku || null,
          cm.oil_type || null,
          skuQty,
          parseFloat(data.sku_rate) || parseFloat(cm.rate) || null,
          cm.unit || null,
          transportTitleCase,
          cm.commitment_date || null,
          nowIso,
          skuQty,
          nowIso,
          nowIso,
          data.broker_name || null,
          data.salesperson_name || null,
          !!data.broker_name
        ]
      );


      await client.query('COMMIT');

      Logger.info(
        `Commitment ID ${id} processed. Order ${orderNo} created in order_dispatch.`
      );

      return {
        success: true,
        message: `Commitment processed successfully. Order No: ${orderNo}`,
        data: {
          detail: detailRes.rows[0],
          order_no: orderNo,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error processing commitment', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new CommitmentPunchService();

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
  /**
   * Ensure necessary columns exist. (Idempotent)
   */
  async ensureColumns() {
    try {
      await db.query(`ALTER TABLE commitment_main ADD COLUMN IF NOT EXISTS base_order_no VARCHAR(50)`);
      // Customer contact info on commitment_main
      await db.query(`ALTER TABLE commitment_main ADD COLUMN IF NOT EXISTS customer_contact_person_name TEXT`);
      await db.query(`ALTER TABLE commitment_main ADD COLUMN IF NOT EXISTS whatsapp_no VARCHAR(15)`);
      await db.query(`ALTER TABLE commitment_main ADD COLUMN IF NOT EXISTS address TEXT`);
      // commitment_details columns
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS broker_name VARCHAR(255)`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS salesperson_name VARCHAR(255)`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS sku_weight_mt NUMERIC(15,4)`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS order_type_delivery_purpose TEXT`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS depo_name TEXT`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS advance_payment TEXT`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS advance_ammount_to_be_taken TEXT`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS payment_terms TEXT`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS is_order_through TEXT`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS order_type_regular_preapproval TEXT`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS start_date DATE`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS end_date DATE`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS actual_delivery_date DATE`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS upload_copy TEXT`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS remarks TEXT`);
      // order_dispatch columns
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS salesperson_name VARCHAR(255)`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS order_type_delivery_purpose TEXT`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS depo_name TEXT`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS payment_terms TEXT`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(15,2)`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS advance_payment_to_be_taken TEXT`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS start_date DATE`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS end_date DATE`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS delivery_date DATE`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS is_order_through TEXT`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS order_type_regular_preapproval TEXT`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS remarks TEXT`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS order_punch_remarks TEXT`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS upload_copy TEXT`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS future_period_date DATE`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS future_period_date DATE`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS order_no VARCHAR(50)`);
      await db.query(`ALTER TABLE commitment_details ADD COLUMN IF NOT EXISTS ordercategory VARCHAR(50)`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS preclose_qty NUMERIC(15,4) DEFAULT 0`);
      await db.query(`ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS preclose_user VARCHAR(255)`);
    } catch (err) {
      Logger.warn('Error in ensureColumns (safe to ignore if columns exist):', err.message);
    }
  }

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
  async generateOrderNo(client) {
    const fy = this.getFinancialYear(); // e.g. "26-27"
    const prefix = `DO/${fy}/`;

    // Find the latest order_no — includes old letter-suffixed ones like DO/26-27/0063A
    const latestRes = await client.query(
      `SELECT order_no FROM order_dispatch
       WHERE order_no LIKE $1
       ORDER BY order_no DESC
       LIMIT 1`,
      [`${prefix}%`]
    );

    let nextNum = 1;
    if (latestRes.rows.length > 0) {
      // Strip any trailing letters: DO/26-27/0063A → "0063" → 63
      const latestNo = latestRes.rows[0].order_no;
      const numPart = latestNo.replace(prefix, '').replace(/[A-Za-z]+$/, '');
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }

    // Format: DO/26-27/0064 (4-digit zero-padded) — no letter suffix
    const orderNo = `${prefix}${String(nextNum).padStart(4, '0')}`;
    return { orderNo };
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
            (commitment_no, commitment_date, party_name, oil_type, quantity, unit, rate, planned1,
             customer_contact_person_name, whatsapp_no, address)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
            data.customer_contact_person_name || null,
            data.whatsapp_no || null,
            data.address || null,
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
      await this.ensureColumns();
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

      // Add remaining-qty filter directly into WHERE
      where.push(`cm.quantity > COALESCE((
        SELECT SUM(sku_weight_mt) FROM commitment_details
        WHERE commitment_id = cm.id
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
            SELECT SUM(cd.sku_weight_mt)
            FROM commitment_details cd
            WHERE cd.commitment_id = cm.id
          ), 0) AS processed_qty,
          cm.quantity - COALESCE((
            SELECT SUM(cd.sku_weight_mt)
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
    await this.ensureColumns();
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


      // ── Step 2: Fetch SKU factor and calculate MT ──────────────────
      const skuQty = parseFloat(data.sku_quantity) || 0;
      if (skuQty <= 0) throw new Error('SKU quantity must be greater than 0');

      const skuRes = await client.query(
        `SELECT sku_weight
         FROM sku_details
         WHERE sku_name = $1`,
        [data.sku]
      );
      if (skuRes.rows.length === 0) throw new Error(`SKU "${data.sku}" not found in master`);
      
      const skuWeightKg = parseFloat(skuRes.rows[0].sku_weight) || 0;
      
      // Formula: (Weight in KG per box / 1000) * quantity = Metric Tons
      const requestedMt = (skuWeightKg / 1000) * skuQty;

      // Calculate already processed MT for this commitment
      const processedRes = await client.query(
        `SELECT COALESCE(SUM(sku_weight_mt), 0) AS processed_mt
         FROM commitment_details WHERE commitment_id = $1`,
        [id]
      );
      const processedMt = parseFloat(processedRes.rows[0].processed_mt) || 0;
      const remainingMt = parseFloat(cm.quantity) - processedMt;

      if (requestedMt > remainingMt + 0.0001) {
        throw new Error(
          `Requested SKU weight (${requestedMt.toFixed(4)} MT) exceeds remaining commitment balance (${remainingMt.toFixed(4)} MT)`
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
      // Always generate a fresh sequential number for each process submission
      const { orderNo } = await this.generateOrderNo(client);

      const orderTitleCase = data.order_type ? (data.order_type.charAt(0).toUpperCase() + data.order_type.slice(1)) : 'Regular';
      const transportTitleCase = data.transport_type ? (data.transport_type.charAt(0).toUpperCase() + data.transport_type.slice(1)) : (cm.transport_type || 'Ex-Depot');

      // ── Step 5: Insert into commitment_details ─────────────────────
      const detailRes = await client.query(
        `INSERT INTO commitment_details
          (commitment_id, actual1, delay1, po_no, po_date, sku, sku_quantity, sku_rate, order_type, transport_type, broker_name, salesperson_name, sku_weight_mt, order_type_delivery_purpose, depo_name, advance_payment, advance_ammount_to_be_taken, payment_terms, is_order_through, order_type_regular_preapproval, start_date, end_date, actual_delivery_date, upload_copy, remarks, future_period_date, order_no, ordercategory)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
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
          requestedMt,
          data.order_type_delivery_purpose || null,
          data.depo_name || null,
          data.advance_payment || null,
          data.advance_payment_taken || null,
          data.payment_terms || null,
          data.is_order_through || null,
          data.order_type_regular_preapproval || null,
          data.start_date || null,
          data.end_date || null,
          data.actual_delivery_date || null,
          data.upload_copy || null,
          data.remarks || null,
          data.future_period_date || null,
          orderNo,
          data.order_category || 'Sales',
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
           broker_name, salesperson_name, is_order_through_broker,
           order_type_delivery_purpose, depo_name, payment_terms, advance_amount, advance_payment_to_be_taken,
           start_date, end_date, delivery_date,
           is_order_through, order_type_regular_preapproval,
           order_punch_remarks, upload_copy, future_period_date, order_category,
           customer_contact_person_name, customer_contact_person_whatsapp_no, customer_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)`,
        [
          orderNo,
          orderTitleCase,
          cm.party_name || null,
          data.sku || null,
          cm.oil_type || null,
          skuQty,
          parseFloat(data.sku_rate) || parseFloat(cm.rate) || null,
          cm.unit || 'Metric Ton',
          transportTitleCase,
          cm.commitment_date || null,
          nowIso,
          skuQty,
          nowIso,
          nowIso,
          data.broker_name || null,
          data.salesperson_name || null,
          !!data.broker_name,
          data.order_type_delivery_purpose || null,
          data.depo_name || null,
          data.payment_terms || null,
          data.advance_payment ? parseFloat(data.advance_payment) : null,
          data.advance_payment_taken || null,
          data.start_date || null,
          data.end_date || null,
          data.actual_delivery_date || null,
          data.is_order_through || null,
          data.order_type_regular_preapproval || null,
          data.remarks || null,
          data.upload_copy || null,
          data.future_period_date || null,
          data.order_category || 'Sales',
          cm.customer_contact_person_name || null,
          cm.whatsapp_no || null,
          cm.address || null,
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

  // ─────────────────────────────────────────────────────────────────────────
  // GET DETAILS FOR A COMMITMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fetch all commitment_details rows for a given commitment ID.
   * Also returns the parent commitment_main row for context.
   */
  async getDetails(id) {
    try {
      await this.ensureColumns();

      // Parent commitment info
      const cmRes = await db.query(
        `SELECT commitment_no, commitment_date, party_name, oil_type, quantity, unit, rate
         FROM commitment_main WHERE id = $1`,
        [id]
      );
      if (cmRes.rows.length === 0) throw new Error('Commitment not found');
      const commitment = cmRes.rows[0];

      // All processed detail rows for this commitment
      const detailRes = await db.query(
        `SELECT
           cd.id,
           cd.actual1,
           cd.po_no,
           cd.po_date,
           cd.sku,
           cd.sku_quantity,
           cd.sku_rate,
           cd.sku_weight_mt,
           cd.order_type,
           cd.transport_type,
           cd.broker_name,
           cd.salesperson_name,
           cd.order_type_delivery_purpose,
           cd.depo_name,
           cd.advance_payment,
           cd.advance_ammount_to_be_taken,
           cd.payment_terms,
           cd.is_order_through,
           cd.actual_delivery_date,
           cd.remarks,
           cd.upload_copy,
           cd.ordercategory as order_category,
           COALESCE(cd.order_no, (
             SELECT order_no FROM order_dispatch 
             WHERE customer_name = $2
             AND product_name = cd.sku 
             AND order_quantity = cd.sku_quantity
             AND party_so_date = (SELECT commitment_date FROM commitment_main WHERE id = $1)
             LIMIT 1
           )) as order_no
         FROM commitment_details cd
         WHERE cd.commitment_id = $1
         ORDER BY cd.id ASC`,
        [id, commitment.party_name]
      );

      // Total processed
      const totalProcessed = detailRes.rows.reduce(
        (sum, r) => sum + (parseFloat(r.sku_weight_mt) || 0), 0
      );

      return {
        success: true,
        message: 'Commitment details fetched',
        data: {
          commitment,
          details: detailRes.rows,
          total_processed_mt: totalProcessed,
          raise_count: detailRes.rows.length,
        },
      };
    } catch (error) {
      Logger.error('Error fetching commitment details', error);
      throw error;
    }
  }
}

module.exports = new CommitmentPunchService();

/**
 * User Service — v2 schema.
 *
 * Handles CRUD + auth for user management. Ported from raw-SQL-against-`login`
 * (production RDS) to Drizzle against the local v2 `users` table (see
 * order-to-dispatch-db-v2/src/schema/users.ts). Response shape kept snake_case
 * (phone_no/page_access/depo_access/created_at/updated_at) so the existing
 * frontend keeps working unchanged.
 */

const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, desc, sql } = require('drizzle-orm');
const { toSnakeCase } = require('./masterLookupHelper');
const { Logger } = require('../utils');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const appConfig = require('../config/app');

const SALT_ROUNDS = 10;

// Never select the real password hash for list/detail/create/update responses.
const PUBLIC_COLUMNS = {
  id: schema.users.id,
  username: schema.users.username,
  email: schema.users.email,
  phoneNo: schema.users.phoneNo,
  status: schema.users.status,
  role: schema.users.role,
  pageAccess: schema.users.pageAccess,
  depoAccess: schema.users.depoAccess,
  features: schema.users.features,
  createdAt: schema.users.createdAt,
  updatedAt: schema.users.updatedAt,
};

function uniqueViolationMessage(error) {
  if (error.code !== '23505') return null;
  if (error.constraint === 'users_username_unique') return 'Username already exists';
  if (error.constraint === 'users_email_unique') return 'Email already exists';
  return null;
}

class UserService {
  /**
   * Get all users
   */
  async getAllUsers(params = {}) {
    try {
      const { page = 1, limit = 100, role, status, search } = params;
      const p = parseInt(page) || 1;
      const l = parseInt(limit) || 100;

      const conditions = [];
      if (search) {
        const term = `%${search}%`;
        conditions.push(sql`(
          ${schema.users.username} ILIKE ${term} OR
          COALESCE(${schema.users.email}, '') ILIKE ${term} OR
          COALESCE(${schema.users.phoneNo}, '') ILIKE ${term} OR
          ${schema.users.role} ILIKE ${term} OR
          ${schema.users.status} ILIKE ${term} OR
          CAST(${schema.users.id} AS TEXT) LIKE ${term}
        )`);
      }
      if (role) conditions.push(eq(schema.users.role, role));
      if (status) conditions.push(eq(schema.users.status, status));
      const where = conditions.length ? and(...conditions) : undefined;

      let countQuery = dbV2.select({ count: sql`count(*)::int` }).from(schema.users);
      if (where) countQuery = countQuery.where(where);
      const [{ count: total }] = await countQuery;

      let query = dbV2.select(PUBLIC_COLUMNS).from(schema.users).orderBy(desc(schema.users.createdAt));
      if (where) query = query.where(where);
      query = query.limit(l).offset((p - 1) * l);
      const rows = await query;

      return {
        users: rows.map(toSnakeCase).map((u) => ({ ...u, password: '••••••••' })),
        pagination: {
          page: p,
          limit: l,
          total,
          totalPages: Math.ceil(total / l),
        },
      };
    } catch (error) {
      Logger.error('Error fetching users', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id) {
    try {
      const [row] = await dbV2.select(PUBLIC_COLUMNS).from(schema.users).where(eq(schema.users.id, id));
      if (!row) return null;
      return { ...toSnakeCase(row), password: '••••••••' };
    } catch (error) {
      Logger.error('Error fetching user by ID', error);
      throw error;
    }
  }

  /**
   * Create new user
   */
  async createUser(userData) {
    try {
      const { username, password, email, phone_no, status = 'active', role, page_access = [], depo_access = {}, features = {} } = userData;
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      const [row] = await dbV2
        .insert(schema.users)
        .values({
          username,
          password: hashedPassword,
          email: email || null,
          phoneNo: phone_no,
          status,
          role,
          pageAccess: page_access ?? [],
          depoAccess: depo_access ?? {},
          features: features ?? {},
        })
        .returning(PUBLIC_COLUMNS);

      return { ...toSnakeCase(row), password: '••••••••' };
    } catch (error) {
      Logger.error('Error creating user', error);
      const message = uniqueViolationMessage(error);
      if (message) throw new Error(message);
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(id, userData) {
    try {
      const { username, password, email, phone_no, status, role, page_access, depo_access, features } = userData;

      const patch = {};
      if (username !== undefined) patch.username = username;
      if (password !== undefined && password !== '••••••••' && password.trim() !== '') {
        patch.password = await bcrypt.hash(password, SALT_ROUNDS);
      }
      if (email !== undefined) patch.email = email === '' ? null : email;
      if (phone_no !== undefined) patch.phoneNo = phone_no;
      if (status !== undefined) patch.status = status;
      if (role !== undefined) patch.role = role;
      if (page_access !== undefined) patch.pageAccess = page_access;
      if (depo_access !== undefined) patch.depoAccess = depo_access;
      if (features !== undefined) patch.features = features;

      if (Object.keys(patch).length === 0) {
        return this.getUserById(id);
      }

      const [row] = await dbV2
        .update(schema.users)
        .set(patch)
        .where(eq(schema.users.id, id))
        .returning(PUBLIC_COLUMNS);

      if (!row) return null;
      return { ...toSnakeCase(row), password: '••••••••' };
    } catch (error) {
      Logger.error('Error updating user', error);
      const message = uniqueViolationMessage(error);
      if (message) throw new Error(message);
      throw error;
    }
  }

  /**
   * Delete user
   */
  async deleteUser(id) {
    try {
      const rows = await dbV2.delete(schema.users).where(eq(schema.users.id, id)).returning({ id: schema.users.id });
      return rows.length > 0;
    } catch (error) {
      Logger.error('Error deleting user', error);
      throw error;
    }
  }

  /**
   * Authenticate user
   */
  async authenticateUser(username, password) {
    try {
      const [user] = await dbV2
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.username, username), eq(schema.users.status, 'active')));
      if (!user) return null;

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return null;

      const { password: _pw, ...userWithoutPassword } = toSnakeCase(user);
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        appConfig.jwt.secret,
        { expiresIn: appConfig.jwt.expiresIn }
      );
      return { ...userWithoutPassword, token };
    } catch (error) {
      Logger.error('Error authenticating user', error);
      throw error;
    }
  }

  /**
   * Get CSV export formats for a user
   */
  async getCsvFormats(userId) {
    try {
      const [row] = await dbV2.select({ features: schema.users.features }).from(schema.users).where(eq(schema.users.id, userId));
      if (!row) return null;
      return row.features?.csv_formats || {};
    } catch (error) {
      Logger.error('Error fetching csv formats', error);
      throw error;
    }
  }

  /**
   * Save CSV export formats for a user (merges into features JSONB)
   */
  async saveCsvFormats(userId, formats) {
    try {
      const [row] = await dbV2
        .update(schema.users)
        .set({
          features: sql`COALESCE(${schema.users.features}, '{}'::jsonb) || jsonb_build_object('csv_formats', ${JSON.stringify(formats)}::jsonb)`,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId))
        .returning({ features: schema.users.features });
      if (!row) return null;
      return row.features?.csv_formats || {};
    } catch (error) {
      Logger.error('Error saving csv formats', error);
      throw error;
    }
  }

  /**
   * Get all column preferences for a user.
   * Shape: { [stageKey]: { visible?: string[], order?: string[] } }
   */
  async getColumnPrefs(userId) {
    try {
      const [row] = await dbV2.select({ features: schema.users.features }).from(schema.users).where(eq(schema.users.id, userId));
      if (!row) return null;
      return row.features?.column_prefs || {};
    } catch (error) {
      Logger.error('Error fetching column prefs', error);
      throw error;
    }
  }

  /**
   * Save (deep-merge) one stage's column preferences for a user.
   * Only the provided keys of `partial` ({ visible?, order? }) are updated; the
   * other key and every other stage are preserved.
   */
  async saveColumnPrefs(userId, stageKey, partial) {
    try {
      const [row] = await dbV2
        .update(schema.users)
        .set({
          features: sql`COALESCE(${schema.users.features}, '{}'::jsonb) || jsonb_build_object(
            'column_prefs',
            COALESCE(${schema.users.features}->'column_prefs', '{}'::jsonb) || jsonb_build_object(
              ${stageKey}::text,
              COALESCE(${schema.users.features} #> ARRAY['column_prefs', ${stageKey}], '{}'::jsonb) || ${JSON.stringify(partial)}::jsonb
            )
          )`,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId))
        .returning({ features: schema.users.features });
      if (!row) return null;
      return row.features?.column_prefs || {};
    } catch (error) {
      Logger.error('Error saving column prefs', error);
      throw error;
    }
  }

  /**
   * Get available page access options
   */
  getPageAccessOptions() {
    return [
      'Dashboard',
      'Owner Dashboard',
      'Commitment Punch',
      'Order Punch',
      'Pre Approval',
      'Approval of Order',
      'Dispatch Planning',
      'Actual Dispatch',
      'Vehicle Details',
      'Material Load',
      'Security Guard Approval',
      'Make Invoice',
      'Check Invoice',
      'Gate Out',
      'Confirm Material Receipt',
      'Damage Adjustment',
      'Gate In',
      'Variable Parameters',
      'Set Turn Around Time',
      'Master',
      'Inventory',
      'Reports',
      'Settings'
    ];
  }
}

module.exports = new UserService();

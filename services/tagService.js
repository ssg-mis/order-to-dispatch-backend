const pool = require('../config/db');
const Logger = require('../utils/logger');

class TagService {
  async getAllTags(params = {}) {
    try {
      const { page = 1, limit = 20, search = '' } = params;
      const offset = (page - 1) * limit;
      const values = [];
      let whereClause = '';

      if (search) {
        values.push(`%${search}%`);
        whereClause = `WHERE name ILIKE $1`;
      }

      const countResult = await pool.query(`SELECT COUNT(*) FROM tag ${whereClause}`, values);
      const total = parseInt(countResult.rows[0].count);

      const query = `
        SELECT *
        FROM tag
        ${whereClause}
        ORDER BY name ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;
      values.push(limit, offset);
      const result = await pool.query(query, values);

      return {
        tags: result.rows,
        pagination: { total, page: parseInt(page), limit: parseInt(limit) }
      };
    } catch (error) {
      Logger.error('Error fetching tags:', error);
      throw error;
    }
  }

  async getTagById(id) {
    try {
      const result = await pool.query('SELECT * FROM tag WHERE id = $1', [id]);
      return result.rows[0] || null;
    } catch (error) {
      Logger.error(`Error fetching tag ${id}:`, error);
      throw error;
    }
  }

  async createTag(data) {
    try {
      const { name } = data;
      const result = await pool.query(
        'INSERT INTO tag (name) VALUES ($1) RETURNING *',
        [name]
      );
      Logger.info(`Created tag: ${result.rows[0].name}`);
      return result.rows[0];
    } catch (error) {
      Logger.error('Error creating tag:', error);
      throw error;
    }
  }

  async updateTag(id, data) {
    try {
      const { name } = data;
      const result = await pool.query(
        'UPDATE tag SET name = $1 WHERE id = $2 RETURNING *',
        [name, id]
      );
      if (result.rows.length === 0) throw new Error(`Tag with ID ${id} not found`);
      Logger.info(`Updated tag ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error updating tag ${id}:`, error);
      throw error;
    }
  }

  async deleteTag(id) {
    try {
      const result = await pool.query('DELETE FROM tag WHERE id = $1 RETURNING *', [id]);
      if (result.rows.length === 0) throw new Error(`Tag with ID ${id} not found`);
      Logger.info(`Deleted tag ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      Logger.error(`Error deleting tag ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new TagService();

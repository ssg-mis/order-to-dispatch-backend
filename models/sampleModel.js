/**
 * Sample Model
 * Database model/schema definition
 * Add your ORM/database logic here (Sequelize, TypeORM, etc.)
 */

class SampleModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.description = data.description || '';
    this.status = data.status || 'active';
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Validate model data
   * @returns {boolean}
   */
  isValid() {
    return this.name && this.name.length >= 3;
  }

  /**
   * Convert to JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Create from database row
   * @param {Object} row - Database row
   * @returns {SampleModel}
   */
  static fromRow(row) {
    return new SampleModel(row);
  }
}

module.exports = SampleModel;

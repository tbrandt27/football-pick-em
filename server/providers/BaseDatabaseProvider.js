/**
 * Base Database Provider Interface
 * Defines the contract that all database providers must implement
 */
export default class BaseDatabaseProvider {
  /**
   * Initialize the database connection and tables
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Close the database connection
   */
  async close() {
    throw new Error('close() must be implemented by subclass');
  }

  /**
   * Run a query that doesn't return results (INSERT, UPDATE, DELETE)
   * @param {string} sql - SQL query or operation identifier
   * @param {Array} params - Query parameters
   * @returns {Promise<{id: string|number, changes: number}>}
   */
  async run(sql, params = []) {
    throw new Error('run() must be implemented by subclass');
  }

  /**
   * Get a single row from a query
   * @param {string} sql - SQL query or operation identifier
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|undefined>}
   */
  async get(sql, params = []) {
    throw new Error('get() must be implemented by subclass');
  }

  /**
   * Get all rows from a query
   * @param {string} sql - SQL query or operation identifier
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>}
   */
  async all(sql, params = []) {
    throw new Error('all() must be implemented by subclass');
  }

  /**
   * Execute a transaction
   * @param {Function} callback - Function containing operations to execute in transaction
   * @returns {Promise<any>}
   */
  async transaction(callback) {
    throw new Error('transaction() must be implemented by subclass');
  }

  /**
   * Get database type identifier
   * @returns {string}
   */
  getType() {
    throw new Error('getType() must be implemented by subclass');
  }
}
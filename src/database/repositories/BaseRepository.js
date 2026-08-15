/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Base Repository
 *
 * Abstract repository that provides common database helpers
 * for all child repositories.
 *
 * Responsibilities:
 *  • Query execution
 *  • Transactions
 *  • Common CRUD helpers
 *  • Timestamp generation
 * ============================================================
 */

class BaseRepository {

    /**
     * @param {Database} database
     */
    constructor(database) {

        /**
         * Database wrapper (Database.js)
         */
        this.database = database;

    }

    /**
     * --------------------------------------------------------
     * Execute a statement
     * --------------------------------------------------------
     *
     * @param {string} sql
     * @param {Array} params
     * @returns {*}
     */
    run(sql, params = []) {

        return this.database.run(sql, params);

    }

    /**
     * --------------------------------------------------------
     * Get one row
     * --------------------------------------------------------
     *
     * @param {string} sql
     * @param {Array} params
     * @returns {*}
     */
    get(sql, params = []) {

        return this.database.get(sql, params);

    }

    /**
     * --------------------------------------------------------
     * Get multiple rows
     * --------------------------------------------------------
     *
     * @param {string} sql
     * @param {Array} params
     * @returns {Array}
     */
    all(sql, params = []) {

        return this.database.all(sql, params);

    }

    /**
     * --------------------------------------------------------
     * Execute inside a transaction
     * --------------------------------------------------------
     *
     * @param {Function} callback
     * @returns {*}
     */
    transaction(callback) {

        return this.database.transaction(callback);

    }

    /**
     * --------------------------------------------------------
     * Current Unix Timestamp (seconds)
     * --------------------------------------------------------
     *
     * @returns {number}
     */
    now() {

        return Math.floor(Date.now() / 1000);

    }

    /**
     * --------------------------------------------------------
     * Current Unix Timestamp (milliseconds)
     * --------------------------------------------------------
     *
     * @returns {number}
     */
    nowMs() {

        return Date.now();

    }

    /**
     * --------------------------------------------------------
     * Check if a query returns a row
     * --------------------------------------------------------
     *
     * @param {string} sql
     * @param {Array} params
     * @returns {boolean}
     */
    exists(sql, params = []) {

        return this.get(sql, params) !== undefined;

    }

    /**
     * --------------------------------------------------------
     * Count helper
     * --------------------------------------------------------
     *
     * Expects SQL similar to:
     *
     * SELECT COUNT(*) AS count FROM table
     *
     * @param {string} sql
     * @param {Array} params
     * @returns {number}
     */
    count(sql, params = []) {

        const result = this.get(sql, params);

        if (!result) {

            return 0;

        }

        return Number(result.count) || 0;

    }

    /**
     * --------------------------------------------------------
     * Return first row or null
     * --------------------------------------------------------
     *
     * @param {string} sql
     * @param {Array} params
     * @returns {*}
     */
    first(sql, params = []) {

        return this.get(sql, params) ?? null;

    }

    /**
     * --------------------------------------------------------
     * Return rows or empty array
     * --------------------------------------------------------
     *
     * @param {string} sql
     * @param {Array} params
     * @returns {Array}
     */
    list(sql, params = []) {

        return this.all(sql, params) ?? [];

    }

    /**
     * --------------------------------------------------------
     * Throw if database is unavailable
     * --------------------------------------------------------
     */
    ensureConnected() {

        if (!this.database.isConnected()) {

            throw new Error(
                "Database connection is not available."
            );

        }

    }

}

module.exports = BaseRepository;
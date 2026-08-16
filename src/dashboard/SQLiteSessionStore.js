const session = require("express-session");

class SQLiteSessionStore extends session.Store {
    constructor(database) {
        super();
        this.database = database;
        this.cleanupTimer = setInterval(() => this.clearExpired(), 15 * 60 * 1000);
        this.cleanupTimer.unref();
    }

    expiration(sessionData) {
        const expires = sessionData.cookie?.expires;
        if (expires) return new Date(expires).getTime();
        return Date.now() + (sessionData.cookie?.maxAge || 86400000);
    }

    async get(sessionId, callback) {
        try {
            const row = await this.database.get(
                "SELECT session_data, expires_at FROM dashboard_sessions WHERE session_id = ?",
                [sessionId]
            );
            if (!row || row.expires_at <= Date.now()) {
                if (row) this.destroy(sessionId, () => {});
                return callback(null, null);
            }
            callback(null, JSON.parse(row.session_data));
        } catch (error) {
            callback(error);
        }
    }

    async set(sessionId, sessionData, callback = () => {}) {
        try {
            await this.database.run(`
                INSERT INTO dashboard_sessions (session_id, session_data, expires_at)
                VALUES (?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    session_data = excluded.session_data,
                    expires_at = excluded.expires_at
            `, [sessionId, JSON.stringify(sessionData), this.expiration(sessionData)]);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    async destroy(sessionId, callback = () => {}) {
        try {
            await this.database.run("DELETE FROM dashboard_sessions WHERE session_id = ?", [sessionId]);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    async touch(sessionId, sessionData, callback = () => {}) {
        try {
            await this.database.run(
                "UPDATE dashboard_sessions SET expires_at = ? WHERE session_id = ?",
                [this.expiration(sessionData), sessionId]
            );
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    async clearExpired() {
        try {
            await this.database.run("DELETE FROM dashboard_sessions WHERE expires_at <= ?", [Date.now()]);
        } catch (error) {
            console.error("Unable to clean expired dashboard sessions", error);
        }
    }
}

module.exports = SQLiteSessionStore;

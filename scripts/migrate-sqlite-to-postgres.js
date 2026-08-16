require("dotenv").config();
const path = require("node:path");
const Database = require("../src/database/Database");

async function main() {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
    const sourcePath = path.resolve(process.env.DATABASE_PATH || "./data/verification.sqlite");
    const source = new Database({ path: sourcePath, url: "", logRetentionDays: 36500 });
    const target = new Database({
        path: sourcePath,
        url: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL !== "false",
        logRetentionDays: Number(process.env.LOG_RETENTION_DAYS) || 0
    });

    await source.initialize();
    await target.initialize();
    try {
        const guilds = await source.all("SELECT * FROM guild_settings ORDER BY guild_id");
        const logs = await source.all("SELECT * FROM verification_logs ORDER BY id");
        for (const row of guilds) {
            const columns = Object.keys(row);
            const values = columns.map(column => row[column]);
            await target.run(`INSERT INTO guild_settings (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(guild_id) DO UPDATE SET ${columns.filter(column => column !== "guild_id").map(column => `${column}=excluded.${column}`).join(",")}`, values);
        }
        for (const row of logs) {
            const columns = Object.keys(row);
            await target.run(`INSERT INTO verification_logs (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(id) DO NOTHING`, columns.map(column => row[column]));
        }
        await target.run("SELECT setval(pg_get_serial_sequence('verification_logs', 'id'), COALESCE((SELECT MAX(id) FROM verification_logs), 1))");
        console.log(`Migrated ${guilds.length} guild configurations and ${logs.length} verification logs.`);
        console.log("Active CAPTCHA challenges and dashboard sessions were intentionally not migrated.");
    } finally {
        await source.close();
        await target.close();
    }
}

main().catch(error => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
});

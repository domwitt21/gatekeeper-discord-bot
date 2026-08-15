const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function findJavaScript(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? findJavaScript(target) : target.endsWith(".js") ? [target] : [];
    });
}

const files = [...findJavaScript(path.join(__dirname, "..", "src")), __filename];
for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Checked ${files.length} JavaScript files.`);

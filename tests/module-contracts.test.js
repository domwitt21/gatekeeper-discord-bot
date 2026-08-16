const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function javascriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? javascriptFiles(target) : target.endsWith(".js") ? [target] : [];
    });
}

test("every command exports valid data and execute contracts", () => {
    const directory = path.join(__dirname, "..", "src", "commands");
    for (const file of javascriptFiles(directory)) {
        const command = require(file);
        assert.ok(command.data, `${file} is missing data`);
        assert.equal(typeof command.data.toJSON, "function", `${file} data is not serializable`);
        assert.equal(typeof command.execute, "function", `${file} is missing execute`);
    }
});

test("every event exports valid name and execute contracts", () => {
    const directory = path.join(__dirname, "..", "src", "events");
    for (const file of javascriptFiles(directory)) {
        const event = require(file);
        assert.equal(typeof event.name, "string", `${file} is missing name`);
        assert.ok(event.name.length > 0, `${file} has an empty name`);
        assert.equal(typeof event.execute, "function", `${file} is missing execute`);
    }
});

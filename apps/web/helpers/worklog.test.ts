// Run: node apps/web/helpers/worklog.test.ts  (apps/web has no unit-test runner; Node strips the types)
import assert from "node:assert/strict";
import { formatDuration, parseDuration } from "./worklog.ts";

assert.equal(parseDuration("1h 30m"), 90);
assert.equal(parseDuration("1h30m"), 90);
assert.equal(parseDuration("1.5h"), 90);
assert.equal(parseDuration("2H"), 120);
assert.equal(parseDuration("45m"), 45);
assert.equal(parseDuration("45"), 45);
assert.equal(parseDuration("  15 m "), 15);
for (const bad of ["", "0", "0h", "abc", "1x", "h", "m", "-5", "1h -5m"]) assert.equal(parseDuration(bad), null, bad);

assert.equal(formatDuration(90), "1h 30m");
assert.equal(formatDuration(120), "2h");
assert.equal(formatDuration(45), "45m");
assert.equal(formatDuration(0), "0m");
console.log("worklog helpers: all checks passed");

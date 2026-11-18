/*
 * Unit tests for matcher.js. Run with: node --test tests/
 * These cover the PRD's acceptance criteria for US-02 and US-04 and the
 * "zero false negatives on dictionary variations" catalog metric.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

require("../synonyms.js");
const M = require("../matcher.js");

test("abbreviations and variants resolve to canonical skills", () => {
  assert.equal(M.canonicalize("JS"), "javascript");
  assert.equal(M.canonicalize("React.js"), "react");
  assert.equal(M.canonicalize("k8s"), "kubernetes");
  assert.equal(M.canonicalize("Amazon Web Services"), "aws");
  assert.equal(M.canonicalize("  Vue  "), "vue");
});

test("unknown skills are kept as normalized text", () => {
  assert.equal(M.canonicalize("Figma!"), "figma");
});

test("java does not match inside javascript", () => {
  const result = M.evaluate("We build JavaScript services.", ["java"]);
  assert.equal(result.total, 1);
  assert.equal(result.matched, 0);
  assert.deepEqual(result.missingSet, ["javascript"]);
});

test("'js' inside react.js is not read as JavaScript", () => {
  const result = M.evaluate("Frontend work in React.js.", []);
  assert.deepEqual(result.matchedSet, []);
  assert.deepEqual(result.missingSet, ["react"]);
});

test("scores matched over total identified, as in the PRD example", () => {
  const jobText =
    "Requirements: React.js, Node.js, TypeScript, Docker, AWS, SQL, JavaScript.";
  const result = M.evaluate(jobText, ["React", "node", "SQL", "AWS"]);

  assert.equal(result.total, 7);
  assert.equal(result.matched, 4);
  assert.equal(result.percent, 57);
  assert.deepEqual(result.missingSet, ["docker", "javascript", "typescript"]);
  assert.deepEqual(
    result.missingSet.map(M.displayName),
    ["Docker", "JavaScript", "TypeScript"]
  );
});

test("matching is case-insensitive", () => {
  const result = M.evaluate("PYTHON and sql", ["python", "SQL"]);
  assert.equal(result.percent, 100);
});

test("symbol-bearing skills match with word boundaries", () => {
  const result = M.evaluate("Experience with C++ and C# required", ["c++"]);
  assert.equal(result.total, 2);
  assert.equal(result.matched, 1);
  assert.equal(result.percent, 50);
});

test("custom skills count only when the posting mentions them", () => {
  const hit = M.evaluate("Design systems in Figma", ["figma", "sketch"]);
  assert.equal(hit.percent, 100);

  const miss = M.evaluate("No tools mentioned here", ["figma"]);
  assert.equal(miss.total, 0);
  assert.equal(miss.percent, null);
});

test("percent is null when the posting names no tracked skills", () => {
  const result = M.evaluate("We value curiosity and teamwork.", ["react"]);
  assert.equal(result.percent, null);
  assert.equal(M.scoreLevel(result.percent), "gray");
});

test("color bands follow US-02: red < 50, yellow 50 to 80, green > 80", () => {
  assert.equal(M.scoreLevel(49), "red");
  assert.equal(M.scoreLevel(50), "yellow");
  assert.equal(M.scoreLevel(75), "yellow");
  assert.equal(M.scoreLevel(80), "yellow");
  assert.equal(M.scoreLevel(81), "green");
  assert.equal(M.scoreLevel(100), "green");
});

test("validation rejects duplicates, including synonyms of an existing skill", () => {
  const check = M.validateSkill("JS", ["javascript"]);
  assert.equal(check.ok, false);
  assert.match(check.error, /JavaScript/);
});

test("validation rejects empty input, overlong names, and symbol-only names", () => {
  assert.equal(M.validateSkill("   ", []).ok, false);
  assert.equal(M.validateSkill("+++", []).ok, false);
  assert.equal(M.validateSkill("x".repeat(41), []).ok, false);
  assert.equal(M.validateSkill("Docker", []).ok, true);
});

test("validation enforces the profile size cap", () => {
  const full = Array.from({ length: M.MAX_SKILLS }, (_, i) => `skill${i}`);
  assert.equal(M.validateSkill("docker", full).ok, false);
});

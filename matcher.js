/*
 * matcher.js: pure matching logic (PRD sections 12 and 16).
 *
 * No DOM or chrome.* calls, so the same file runs in the popup, the content
 * script, and under Node for tests. Requires synonyms.js to load first.
 *
 * Exposes globalThis.JMR_Matcher:
 *   normalizeText, canonicalize, displayName, evaluate, scoreLevel,
 *   validateSkill, MAX_SKILL_LENGTH, MAX_SKILLS
 */
(function (root) {
  "use strict";

  const DICT = root.JMR_SYNONYMS;
  if (!DICT) {
    throw new Error("JobMatch Radar: synonyms.js must load before matcher.js");
  }

  const MAX_SKILL_LENGTH = 40;
  const MAX_SKILLS = 100;

  // Word-boundary rules. A skill must not sit inside a longer token.
  // "." is excluded before a match so the "js" in "react.js" is not read as
  // JavaScript. A trailing "." is allowed, so "We use React." still matches.
  const BEFORE = "(?<![a-z0-9+#.])";
  const AFTER = "(?!\\.?[a-z0-9+#])";

  // Step 2 of the algorithm: lowercase, strip punctuation except the
  // characters that appear inside skill names (".", "+", "#").
  function normalizeText(input) {
    return String(input ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9.+#\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildPattern(aliases) {
    // Longest alias first so "amazon web services" wins over a shorter overlap.
    const body = [...aliases]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex)
      .join("|");
    return new RegExp(BEFORE + "(?:" + body + ")" + AFTER);
  }

  const ALIAS_TO_ID = new Map();
  const LABELS = new Map();
  const MASTER = [];

  for (const [id, entry] of Object.entries(DICT)) {
    const aliases = entry.aliases.map(normalizeText);
    LABELS.set(id, entry.label);
    for (const alias of aliases) ALIAS_TO_ID.set(alias, id);
    MASTER.push({ id, pattern: buildPattern(aliases) });
  }

  // Maps whatever the user typed to a canonical id. Unknown input is kept as
  // its normalized text, so custom skills like "figma" still work.
  function canonicalize(input) {
    const key = normalizeText(input);
    return ALIAS_TO_ID.get(key) || key;
  }

  function displayName(id) {
    return LABELS.get(id) || id;
  }

  // Color bands from US-02: red < 50, yellow 50 to 80, green > 80.
  function scoreLevel(percent) {
    if (percent === null || percent === undefined) return "gray";
    if (percent < 50) return "red";
    if (percent <= 80) return "yellow";
    return "green";
  }

  function validateSkill(raw, existingIds) {
    const id = canonicalize(raw);
    if (!id || !/[a-z0-9]/.test(id)) {
      return { ok: false, error: "Use letters or numbers for a skill name." };
    }
    if (id.length > MAX_SKILL_LENGTH) {
      return { ok: false, error: `Skill names must be ${MAX_SKILL_LENGTH} characters or fewer.` };
    }
    if (existingIds.length >= MAX_SKILLS) {
      return { ok: false, error: `Your profile holds ${MAX_SKILLS} skills. Remove one to add more.` };
    }
    if (existingIds.includes(id)) {
      return { ok: false, error: `"${displayName(id)}" is already in your profile.` };
    }
    return { ok: true, id };
  }

  const byLabel = (a, b) => displayName(a).localeCompare(displayName(b));

  // Step 4 of the algorithm: set intersection.
  //   required = skills the posting asks for (dictionary hits, plus custom
  //              skills the user typed that the posting mentions)
  //   matched  = required ∩ user
  //   missing  = required \ user
  function evaluate(jobText, userSkills) {
    const haystack = normalizeText(jobText);
    const userSet = new Set(userSkills.map(canonicalize).filter(Boolean));
    const required = new Set();

    for (const skill of MASTER) {
      if (skill.pattern.test(haystack)) required.add(skill.id);
    }
    for (const id of userSet) {
      if (LABELS.has(id) || required.has(id)) continue;
      const custom = new RegExp(BEFORE + escapeRegex(id) + AFTER);
      if (custom.test(haystack)) required.add(id);
    }

    const matchedSet = [...required].filter((id) => userSet.has(id)).sort(byLabel);
    const missingSet = [...required].filter((id) => !userSet.has(id)).sort(byLabel);
    const total = required.size;
    const matched = matchedSet.length;

    return {
      total,
      matched,
      percent: total === 0 ? null : Math.round((matched / total) * 100),
      matchedSet,
      missingSet,
    };
  }

  const api = {
    normalizeText,
    canonicalize,
    displayName,
    evaluate,
    scoreLevel,
    validateSkill,
    MAX_SKILL_LENGTH,
    MAX_SKILLS,
  };

  root.JMR_Matcher = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);

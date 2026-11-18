/*
 * popup.js: profile editor (PRD sections 6, 11, 14).
 *
 * Saves skills to chrome.storage.local in the schema from section 14, then
 * asks the active tab to re-run matching so the badge updates at once.
 */
(() => {
  "use strict";

  const M = globalThis.JMR_Matcher;
  const KEY = "user_profile";

  const els = {
    input: document.getElementById("skill-input"),
    chips: document.getElementById("chips"),
    empty: document.getElementById("empty"),
    error: document.getElementById("error"),
    status: document.getElementById("status"),
    clear: document.getElementById("clear"),
  };

  let skills = [];

  init();

  async function init() {
    try {
      const data = await chrome.storage.local.get(KEY);
      const saved = data[KEY]?.skills;
      skills = Array.isArray(saved) ? saved : [];
    } catch {
      showError("Could not read your saved skills. Close and reopen the popup.");
    }
    render();
  }

  els.input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit(els.input.value.split(","), "");
  });

  // Typing a comma commits everything before it. The text after the last
  // comma stays in the field for the next skill.
  els.input.addEventListener("input", (event) => {
    if (event.isComposing) return;
    const value = els.input.value;
    const cut = value.lastIndexOf(",");
    if (cut === -1) return;
    commit(value.slice(0, cut).split(","), value.slice(cut + 1));
  });

  els.clear.addEventListener("click", async () => {
    if (skills.length === 0) return;
    if (!window.confirm("Remove all skills from your profile?")) return;
    await replaceSkills([]);
  });

  async function commit(rawParts, leftover) {
    const parts = rawParts.map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0 && leftover.trim() === "") {
      showError("Enter a skill name first.");
      return;
    }

    const next = [...skills];
    const rejected = [];
    let error = "";

    for (const raw of parts) {
      const check = M.validateSkill(raw, next);
      if (check.ok) {
        next.push(check.id);
      } else {
        rejected.push(raw);
        error ||= check.error;
      }
    }

    if (next.length !== skills.length) {
      const saved = await replaceSkills(next, { keepInputOnFailure: parts, leftover });
      if (!saved) return;
    }

    // Rejected entries stay in the field so the user can correct them.
    els.input.value = [...rejected, leftover.trim()].filter(Boolean).join(", ");
    showError(error);
  }

  async function removeSkill(id) {
    await replaceSkills(skills.filter((skill) => skill !== id));
  }

  // Writes the list and refreshes the UI. Returns false on a storage error.
  async function replaceSkills(next, options = null) {
    try {
      await chrome.storage.local.set({
        [KEY]: { last_updated: new Date().toISOString(), skills: next },
      });
      skills = next;
      render();
      showError("");
      pingActiveTab();
      return true;
    } catch (err) {
      if (options) {
        els.input.value = [...options.keepInputOnFailure, options.leftover]
          .filter(Boolean)
          .join(", ");
      }
      showError(storageMessage(err));
      return false;
    }
  }

  function storageMessage(err) {
    return /quota/i.test(err?.message ?? "")
      ? "Storage is full. Remove a skill to make room."
      : "Could not save. Try again.";
  }

  function render() {
    els.chips.replaceChildren(...skills.map(makeChip));
    els.empty.hidden = skills.length > 0;
    els.clear.disabled = skills.length === 0;
    els.status.textContent = skills.length
      ? `${skills.length} ${skills.length === 1 ? "skill" : "skills"} saved.`
      : "";
  }

  function makeChip(id) {
    const label = M.displayName(id);
    const item = document.createElement("li");
    item.className = "chip";

    const name = document.createElement("span");
    name.textContent = label;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-x";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${label}`);
    remove.addEventListener("click", () => removeSkill(id));

    item.append(name, remove);
    return item;
  }

  // Asks the current tab to re-run matching. Errors are expected on pages
  // that are not LinkedIn job pages, so they are ignored on purpose.
  async function pingActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) {
        await chrome.tabs.sendMessage(tab.id, { action: "ANALYZE_PAGE" });
      }
    } catch {
      /* No content script on this tab. Nothing to refresh. */
    }
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = !message;
  }
})();

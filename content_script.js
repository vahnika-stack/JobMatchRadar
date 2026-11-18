/*
 * content_script.js: runs on LinkedIn pages (PRD sections 11, 13, 17).
 *
 * Reads the job description, compares it with the stored profile, and injects
 * a score badge with a breakdown flyout. Everything lives inside a Shadow DOM
 * root, so LinkedIn's CSS cannot restyle the badge and the badge cannot leak
 * styles into the page.
 */
(() => {
  "use strict";

  if (window.__jobMatchRadarLoaded) return;
  window.__jobMatchRadarLoaded = true;

  const M = globalThis.JMR_Matcher;
  const HOST_ID = "jmr-root";
  const SETTLE_MS = 300; // lets LinkedIn swap in a new posting after navigation
  const WAIT_MS = 5000; // how long to wait for the description before giving up

  // Keep every LinkedIn selector here. When the site renames a class, edit
  // these lists and nothing else. Each list is tried in order.
  const TITLE_SELECTORS = [
    ".job-details-jobs-unified-top-card__job-title",
    ".jobs-unified-top-card__job-title",
    "h1",
  ];
  const DESCRIPTION_SELECTORS = [
    ".jobs-description__content",
    ".jobs-description-content__text",
    ".jobs-box__html-content",
    "#job-details",
  ];

  const STYLE = `
    :host { all: initial; display: block; margin: 8px 0 12px; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #14202e; }
    * { box-sizing: border-box; }
    .wrap { position: relative; display: inline-flex; align-items: center; }
    .badge { width: 32px; height: 32px; margin: 0; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; font: 700 10.5px/1 system-ui, sans-serif; font-variant-numeric: tabular-nums; color: #fff; cursor: pointer; }
    .badge.red { background: #a4262c; box-shadow: 0 0 0 2px #fff, 0 0 0 3px #a4262c; }
    .badge.yellow { background: #f2c14e; color: #14202e; box-shadow: 0 0 0 2px #fff, 0 0 0 3px #9a7412; }
    .badge.green { background: #2e7d4f; box-shadow: 0 0 0 2px #fff, 0 0 0 3px #2e7d4f; }
    .badge.gray { background: #5b6470; box-shadow: 0 0 0 2px #fff, 0 0 0 3px #5b6470; }
    .badge:focus-visible { outline: 2px solid #2d4a8a; outline-offset: 4px; }
    .hint { position: absolute; left: 42px; top: 50%; transform: translateY(-50%); white-space: nowrap; background: #14202e; color: #fff; font-size: 12px; padding: 4px 8px; border-radius: 4px; opacity: 0; pointer-events: none; transition: opacity 0.15s ease; }
    .wrap:hover .hint, .badge:focus-visible ~ .hint { opacity: 1; }
    .wrap.open .hint { display: none; }
    .flyout { position: absolute; top: calc(100% + 8px); left: 0; z-index: 2147483000; width: 300px; max-width: calc(100vw - 32px); background: #fbfcfd; border: 1px solid #c3ccd8; border-radius: 8px; box-shadow: 0 10px 28px rgba(20, 32, 46, 0.16); padding: 14px 16px 12px; font-size: 13px; line-height: 1.45; text-align: left; animation: reveal 0.16s ease-out; }
    .flyout[hidden] { display: none; }
    @keyframes reveal { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .flyout { animation: none; } .hint { transition: none; } }
    .head { margin: 0 26px 0 0; font: 600 15px/1.35 Georgia, "Times New Roman", serif; color: #14202e; }
    .close { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; margin: 0; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #14202e; font-size: 18px; line-height: 1; cursor: pointer; }
    .close:hover { background: #e4e9ef; }
    .close:focus-visible, .copy:focus-visible { outline: 2px solid #2d4a8a; outline-offset: 2px; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
    .col h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #4a5566; }
    .list { margin: 0; padding: 0; list-style: none; max-height: 200px; overflow-y: auto; }
    .list li { display: flex; gap: 6px; padding: 2px 0; }
    .list li.none { color: #4a5566; font-style: italic; }
    .mark { flex: none; width: 12px; font-weight: 700; }
    .have .mark { color: #2e7d4f; }
    .need .mark { color: #a4262c; }
    .copy { margin-top: 12px; padding: 6px 10px; border: 1px solid #2d4a8a; border-radius: 4px; background: transparent; color: #2d4a8a; font: inherit; font-size: 12.5px; cursor: pointer; }
    .copy:hover { background: #2d4a8a; color: #fff; }
    .copy-status { margin-left: 8px; font-size: 12px; color: #4a5566; }
  `;

  // View models. The UI states come from the PRD's state matrix (section 10).
  const EMPTY_VIEW = {
    tone: "gray",
    label: "+",
    hint: "Profile empty",
    aria: "Profile empty. Open for details.",
    head: "Profile empty. Add skills to enable matching.",
    columns: false,
  };

  // The PRD asks for a gray "Cannot Parse" badge here (NFR section 8). The
  // state matrix mentions a red badge, but the NFR is the more specific rule.
  const ERROR_VIEW = {
    tone: "gray",
    label: "!",
    hint: "Cannot parse this page",
    aria: "Cannot parse this page. Open for details.",
    head: "Could not extract text from this post.",
    columns: false,
  };

  let runId = 0;
  let teardown = () => {};

  function isJobPage(loc = window.location) {
    return (
      loc.pathname.startsWith("/jobs/view/") ||
      new URLSearchParams(loc.search).has("currentJobId")
    );
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function findFirst(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node && node.textContent.trim()) return node;
    }
    return null;
  }

  // Resolves with the description node, or null after WAIT_MS. Uses a
  // MutationObserver, so it reacts as soon as LinkedIn renders the posting.
  function waitForDescription(token) {
    const ready = findFirst(DESCRIPTION_SELECTORS);
    if (ready) return Promise.resolve(ready);

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const node = findFirst(DESCRIPTION_SELECTORS);
        if (node || token !== runId) finish(node);
      });
      const timer = setTimeout(() => finish(null), WAIT_MS);

      function finish(node) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(node);
      }

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  async function loadSkills() {
    const data = await chrome.storage.local.get("user_profile");
    const skills = data.user_profile?.skills;
    return Array.isArray(skills) ? skills : [];
  }

  function scoreView(result) {
    if (result.total === 0) {
      return {
        tone: "gray",
        label: "N/A",
        hint: "No tracked skills found",
        aria: "No tracked skills found in this posting.",
        head: "No tracked skills appear in this posting.",
        columns: false,
      };
    }
    return {
      tone: M.scoreLevel(result.percent),
      label: `${result.percent}%`,
      hint: "Click for breakdown",
      aria: `Skill match ${result.percent} percent. Open breakdown.`,
      head: `You meet ${result.matched} of the ${result.total} technical requirements.`,
      columns: true,
      have: result.matchedSet.map(M.displayName),
      need: result.missingSet.map(M.displayName),
    };
  }

  function column(title, items, cls, mark, emptyText) {
    const col = el("div", "col");
    col.append(el("h3", "", title));
    const list = el("ul", `list ${cls}`);
    if (items.length === 0) {
      list.append(el("li", "none", emptyText));
    } else {
      for (const item of items) {
        const li = el("li");
        li.append(el("span", "mark", mark), document.createTextNode(item));
        list.append(li);
      }
    }
    col.append(list);
    return col;
  }

  // Places the badge after the job title, or before the description if the
  // title cannot be found. Removes any earlier badge first.
  function mountBadge(view, descEl) {
    const titleEl = findFirst(TITLE_SELECTORS);
    if (!titleEl && !descEl) return;

    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${STYLE}</style>`;

    const wrap = el("div", "wrap");
    const badge = el("button", `badge ${view.tone}`, view.label);
    badge.type = "button";
    badge.setAttribute("aria-label", view.aria ?? view.hint);
    badge.setAttribute("aria-expanded", "false");
    const hint = el("span", "hint", view.hint);
    wrap.append(badge, hint);

    const flyout = el("div", "flyout");
    flyout.hidden = true;
    flyout.setAttribute("role", "dialog");
    flyout.setAttribute("aria-label", "Skill breakdown");
    const close = el("button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close breakdown");
    flyout.append(close, el("h2", "head", view.head));

    let copyBtn = null;
    let copyStatus = null;
    if (view.columns) {
      const cols = el("div", "cols");
      cols.append(
        column("You have", view.have, "have", "✓", "None of the tracked skills yet."),
        column("You need", view.need, "need", "✕", "No gaps. You cover every requirement.")
      );
      flyout.append(cols);

      if (view.need.length > 0) {
        copyBtn = el("button", "copy", "Copy missing skills");
        copyBtn.type = "button";
        copyStatus = el("span", "copy-status");
        flyout.append(copyBtn, copyStatus);
      }
    }
    wrap.append(flyout);
    shadow.append(wrap);

    const setOpen = (open) => {
      flyout.hidden = !open;
      wrap.classList.toggle("open", open);
      badge.setAttribute("aria-expanded", String(open));
    };

    badge.addEventListener("click", () => setOpen(flyout.hidden));
    close.addEventListener("click", () => {
      setOpen(false);
      badge.focus();
    });
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(view.need.join(", "));
          copyStatus.textContent = "Copied.";
        } catch {
          copyStatus.textContent = "Copy failed. Try again.";
        }
      });
    }

    // Dismiss on an outside click or Escape (US-03).
    const onPointerDown = (event) => {
      if (!flyout.hidden && !event.composedPath().includes(host)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !flyout.hidden) {
        setOpen(false);
        badge.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);

    teardown = () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      host.remove();
    };

    if (titleEl) {
      titleEl.insertAdjacentElement("afterend", host);
    } else {
      descEl.before(host);
    }
  }

  async function analyzePage() {
    const token = ++runId;
    teardown();
    teardown = () => {};
    if (!isJobPage()) return;

    let descEl = null;
    try {
      await sleep(SETTLE_MS);
      if (token !== runId) return;

      descEl = await waitForDescription(token);
      if (token !== runId) return;

      if (!descEl) {
        mountBadge(ERROR_VIEW, null);
        return;
      }

      const skills = await loadSkills();
      if (token !== runId) return;

      if (skills.length === 0) {
        mountBadge(EMPTY_VIEW, descEl);
        return;
      }

      const result = M.evaluate(descEl.textContent, skills);
      mountBadge(scoreView(result), descEl);
    } catch (err) {
      // Never throw into the host page. Degrade to the gray error badge.
      console.debug("[JobMatch Radar] analysis skipped:", err);
      if (token === runId) mountBadge(ERROR_VIEW, descEl);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action === "ANALYZE_PAGE") analyzePage();
  });

  analyzePage();
})();

# JobMatch Radar

A Manifest V3 Chrome extension. It reads a LinkedIn job posting, compares the
requirements with your skill list, and shows a match badge on the page. Click
the badge to see which requirements you have and which you are missing. All
data stays on your machine.

## Install (developer mode)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Click the JobMatch Radar icon, add your skills (for example `React, Node, SQL, AWS`), and press Enter.
4. Open any LinkedIn job posting. The badge appears next to the job title.

## Run the tests

The matching logic has no browser dependencies, so it can be tested with Node 18 or later:

```
node --test tests/matcher.test.js
```

## How the match is calculated

1. **Ingestion.** The content script reads `textContent` from the job description node. It does not use `innerText`, which would force a layout pass.
2. **Normalization.** The text is lowercased, and punctuation is stripped except for `.`, `+`, and `#`, so `Vue.js`, `C++`, and `C#` survive.
3. **Synonyms.** Each skill in `synonyms.js` has a canonical id and a list of accepted spellings. `JS`, `ecmascript`, and `javascript` all resolve to one skill.
4. **Boundaries.** A skill matches only as a whole token. `java` does not match inside `javascript`, and `js` does not match inside `react.js`.
5. **Set intersection.** `required` is the set of skills the posting mentions. `matched` is `required ∩ profile`, and `missing` is `required \ profile`. The score is `matched / required`, rounded.

A custom skill you type that is not in the dictionary (for example `figma`) counts only when the posting mentions it.

Badge colors: red below 50%, yellow from 50% to 80%, green above 80%. A posting that names no tracked skills shows a gray `N/A`.

## Project layout

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3 configuration and permissions |
| `synonyms.js` | Static skill dictionary. Add a skill here, and nothing else needs to change. |
| `matcher.js` | Pure matching logic: normalization, synonym resolution, set math, validation |
| `background.js` | Service worker. Signals the content script on LinkedIn URL changes (SPA navigation) and page loads. |
| `content_script.js` | Reads the posting, runs matching, injects the Shadow DOM badge and flyout |
| `popup.html`, `popup.css`, `popup.js` | Profile editor. Saves to `chrome.storage.local` and asks the active tab to re-run. |
| `tests/matcher.test.js` | Unit tests for the matcher |

## Privacy and permissions

- Permissions: `storage`, plus host access to `https://www.linkedin.com/*`.
- Nothing is sent to any server. There is no telemetry and no account.
- The badge lives in a Shadow DOM root, so LinkedIn's CSS cannot restyle it.

## Maintenance: when LinkedIn changes its markup

LinkedIn renames its CSS classes from time to time. Every selector is in two arrays at the top of `content_script.js`: `TITLE_SELECTORS` and `DESCRIPTION_SELECTORS`. If the badge shows a gray `!` ("Cannot parse this page"), open a job posting, inspect the description container, and add its class to `DESCRIPTION_SELECTORS`. Nothing else needs to change.

## Known limitations

- Only LinkedIn is supported. The PRD asks for at least one portal. Indeed would need its own selectors and a `host_permissions` entry.
- The synonym dictionary is short. Add entries to `synonyms.js` as you find gaps.
- The badge is placed inside the page's DOM. A host container with `overflow: hidden` can clip the flyout.
- In-text highlighting of matched keywords (PRD "Good to have") is not implemented. It would mutate LinkedIn's description DOM, which is risky to do safely.
- No toolbar icon files are included. Chrome shows a default icon until you add PNGs and an `icons` entry to the manifest.

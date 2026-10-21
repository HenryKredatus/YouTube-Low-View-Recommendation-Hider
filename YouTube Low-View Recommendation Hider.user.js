// ==UserScript==
// @name         YouTube - Hide Low-View Recommendations
// @namespace    https://github.com/HenryKredatus/YouTube-Low-View-Recommendation-Hider
// @version      1.7
// @description  Automatically hides YouTube recommended videos with under 1,000 views (including end-screen "up next" overlay tiles, both classic and modern formats) and collapses the space so other recs shift up.
// @author       HenryKredatus
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @run-at       document-idle
// @grant        none
// @supportURL   https://github.com/HenryKredatus/YouTube-Low-View-Recommendation-Hider/issues
// @updateURL    https://raw.githubusercontent.com/HenryKredatus/YouTube-Low-View-Recommendation-Hider/main/YouTube%20Low-View%20Recommendation%20Hider.user.js
// @downloadURL  https://raw.githubusercontent.com/HenryKredatus/YouTube-Low-View-Recommendation-Hider/main/YouTube%20Low-View%20Recommendation%20Hider.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ---- Config ----------------------------------------------------------
  const VIEW_THRESHOLD = 1000;
  const DEBOUNCE_MS = 250;
  const VERBOSE = true; // logs every hidden video individually

  // This ALWAYS prints, regardless of any debug flag, so you can confirm
  // this exact script version is actually the one running.
  console.log(
    "%c[hide-low-views] v1.7 loaded on " + location.href,
    "color: #0a0; font-weight: bold;",
  );

  const CARD_TAGS = new Set([
    "YTD-RICH-ITEM-RENDERER",
    "YTD-GRID-VIDEO-RENDERER",
    "YTD-COMPACT-VIDEO-RENDERER",
    "YTD-VIDEO-RENDERER",
    "YT-LOCKUP-VIEW-MODEL",
    "YTD-RICH-GRID-MEDIA",
    "YTD-PLAYLIST-PANEL-VIDEO-RENDERER",
    "YTD-REEL-ITEM-RENDERER",
  ]);

  const EXCLUDE_TAGS = new Set([
    "YTD-WATCH-METADATA",
    "YTD-VIDEO-PRIMARY-INFO-RENDERER",
    "YTD-WATCH-INFO-TEXT",
  ]);

  function parseViewCount(rawText) {
    const text = rawText.trim();
    if (!text) return null;
    if (/^no views?\b/i.test(text)) return 0;
    const m = text.match(
      /(?:^|[•·]\s*)([\d,]+(?:\.\d+)?)\s*([KMB])?\+?\s*views?\.?$/i,
    );
    if (!m) return null;
    let num = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(num)) return null;
    const suffix = m[2] ? m[2].toUpperCase() : "";
    if (suffix === "K") num *= 1e3;
    else if (suffix === "M") num *= 1e6;
    else if (suffix === "B") num *= 1e9;
    return num;
  }

  function getViewCandidateText(el) {
    const aria = el.getAttribute && el.getAttribute("aria-label");
    if (aria && /views?\.?$/i.test(aria.trim())) return aria.trim();
    const text = el.textContent;
    if (text && /views?\.?$/i.test(text.trim())) return text.trim();
    return null;
  }

  // The end-screen "videowall" overlay (suggestion tiles shown when a video
  // is paused or ends) formats its view count differently: a bare number
  // like "9 • 11h ago" with no "views" word at all, so it needs its own
  // parser and its own way of finding the enclosing tile to hide.
  function parseVideowallCount(rawText) {
    const text = rawText.trim();
    const m = text.match(/^([\d,]+(?:\.\d+)?)\s*([KMB])?\s*[•·]/i);
    if (!m) return null;
    let num = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(num)) return null;
    const suffix = m[2] ? m[2].toUpperCase() : "";
    if (suffix === "K") num *= 1e3;
    else if (suffix === "M") num *= 1e6;
    else if (suffix === "B") num *= 1e9;
    return num;
  }

  function findCardAncestor(el) {
    let node = el;
    let card = null;
    while (node && node !== document.documentElement) {
      if (node.tagName) {
        if (EXCLUDE_TAGS.has(node.tagName)) return null;
        if (CARD_TAGS.has(node.tagName)) card = node;
      }
      node = node.parentElement;
    }
    return card;
  }

  let totalHiddenEver = 0;

  // End-screen videowall tiles come in two formats:
  //  - modern: a dedicated "9 • 11h ago" field (no "views" word)
  //  - classic: "Some Channel • 109 views" in the author field
  // YouTube repositions these tiles and can rewrite their inline styles,
  // which would silently undo a display:none we set earlier. So instead of
  // a one-time "already checked" flag, this always reasserts the hide. It is
  // cheap (about a dozen tiles) and also runs on a short timer, because
  // style rewrites don't trigger the childList MutationObserver.
  function enforceVideowallTiles() {
    let matches = 0;
    let hidden = 0;
    const tiles = document.querySelectorAll(
      "a.ytp-videowall-still, a.ytp-modern-videowall-still",
    );
    for (const tile of tiles) {
      let count = null;
      let shown = "";

      const modern = tile.querySelector('[class*="view-count-and-date-info"]');
      if (modern) {
        shown = modern.textContent.trim();
        count = parseVideowallCount(shown);
      } else {
        const author = tile.querySelector('[class*="still-info-author"]');
        if (author) {
          shown = author.textContent.trim();
          if (/views?\.?$/i.test(shown)) count = parseViewCount(shown);
        }
      }
      if (count === null) continue;
      matches++;

      if (count < VIEW_THRESHOLD) {
        const alreadyHidden = tile.style.getPropertyValue("display") === "none";
        tile.style.setProperty("display", "none", "important");
        if (!alreadyHidden) {
          hidden++;
          totalHiddenEver++;
          if (VERBOSE)
            console.log("[hide-low-views] HID (videowall):", shown, "|", tile);
        }
      }
    }
    return { matches, hidden };
  }

  function scan() {
    let hiddenThisPass = 0;
    let matchesThisPass = 0;
    const nodes = document.querySelectorAll("span, yt-formatted-string");

    for (const el of nodes) {
      const candidate = getViewCandidateText(el);
      if (!candidate) continue;

      const count = parseViewCount(candidate);
      if (count === null) continue;
      matchesThisPass++;

      const tagCard = findCardAncestor(el);
      if (tagCard) {
        // Sidebar / grid cards are static once rendered, so a one-time
        // "already checked" flag is safe and avoids reprocessing them on
        // every mutation.
        if (tagCard.dataset.ytLowViewChecked === "1") continue;
        tagCard.dataset.ytLowViewChecked = "1";

        if (count < VIEW_THRESHOLD) {
          tagCard.style.setProperty("display", "none", "important");
          hiddenThisPass++;
          totalHiddenEver++;
          if (VERBOSE) {
            console.log(
              "[hide-low-views] HID:",
              candidate,
              "| card:",
              tagCard.tagName,
              tagCard,
            );
          }
        }
        continue;
      }
    }

    // Second pass: end-screen videowall overlay tiles.
    const vw = enforceVideowallTiles();
    matchesThisPass += vw.matches;
    hiddenThisPass += vw.hidden;

    console.log(
      `[hide-low-views] scan complete — ${matchesThisPass} view-count(s) seen this pass, ${hiddenThisPass} newly hidden, ${totalHiddenEver} hidden total so far.`,
    );
  }

  let debounceTimer = null;
  function scheduleScan() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        scan();
      } catch (e) {
        console.error("[hide-low-views] error during scan:", e);
      }
    }, DEBOUNCE_MS);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scheduleScan();
  setTimeout(scan, 1500);
  setTimeout(scan, 4000);

  document.addEventListener("yt-navigate-finish", () => {
    console.log("[hide-low-views] yt-navigate-finish — re-scanning");
    setTimeout(scan, 500);
    setTimeout(scan, 1500);
  });

  // Reassert videowall hides even when no DOM nodes were added or removed.
  setInterval(() => {
    try {
      enforceVideowallTiles();
    } catch (e) {
      console.error("[hide-low-views] videowall enforce error:", e);
    }
  }, 1000);

  // Manual trigger for testing: run window.__hideLowViewsScan() in console
  window.__hideLowViewsScan = scan;
})();

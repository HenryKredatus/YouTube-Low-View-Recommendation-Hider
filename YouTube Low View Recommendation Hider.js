// ==UserScript==
// @name         YouTube - Hide Low-View Recommendations
// @namespace    https://github.com/your-username/youtube-hide-low-views
// @version      1.4
// @description  Automatically hides YouTube recommended videos with under 1,000 views and collapses the space so other recs shift up.
// @author       you
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ---- Config ----------------------------------------------------------
  const VIEW_THRESHOLD = 1000; // ADJUST TO ALTER VIEW THRESHOLD (1,000 by Default)
  const DEBOUNCE_MS = 250;
  const VERBOSE = true; // logs every hidden video individually

  // This ALWAYS prints, regardless of any debug flag, so you can confirm
  // this exact script version is actually the one running.
  console.log(
    "%c[hide-low-views] v1.4 loaded on " + location.href,
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

      const card = findCardAncestor(el);
      if (!card) continue;

      if (card.dataset.ytLowViewChecked === "1") continue;
      card.dataset.ytLowViewChecked = "1";

      if (count < VIEW_THRESHOLD) {
        card.style.setProperty("display", "none", "important");
        hiddenThisPass++;
        totalHiddenEver++;
        if (VERBOSE) {
          console.log(
            "[hide-low-views] HID:",
            candidate,
            "| card:",
            card.tagName,
            card,
          );
        }
      }
    }

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

  // Manual trigger for testing: run window.__hideLowViewsScan() in console
  window.__hideLowViewsScan = scan;
})();

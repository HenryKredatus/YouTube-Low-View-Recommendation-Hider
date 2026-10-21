// ==UserScript==
// @name         YouTube - Hide Low-View Recommendations
// @namespace    https://github.com/HenryKredatus/YouTube-Low-View-Recommendation-Hider
// @version      1.8
// @description  Automatically hides YouTube recommended videos with under 1,000 views (sidebar, homepage, and end-screen overlay tiles) and collapses the space so other recs shift up.
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
  const SCAN_INTERVAL_MS = 500; // every card is re-checked this often
  const THROTTLE_MS = 150; // extra scan shortly after DOM changes
  const VERBOSE = true; // logs every hidden video individually

  // This ALWAYS prints, regardless of any debug flag, so you can confirm
  // this exact script version is actually the one running.
  console.log(
    "%c[hide-low-views] v1.8 loaded on " + location.href,
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
  const CARD_SELECTOR = Array.from(CARD_TAGS)
    .map((t) => t.toLowerCase())
    .join(",");

  // Never touch anything inside the primary video's own info panel.
  const EXCLUDE_TAGS = new Set([
    "YTD-WATCH-METADATA",
    "YTD-VIDEO-PRIMARY-INFO-RENDERER",
    "YTD-WATCH-INFO-TEXT",
  ]);

  const MULTIPLIERS = {
    k: 1e3,
    thousand: 1e3,
    m: 1e6,
    million: 1e6,
    b: 1e9,
    billion: 1e9,
  };

  // Matches "250 views", "1 view", "1,234 views", "1.2K views", and the
  // spelled-out forms YouTube uses in aria-labels ("4.9 thousand views",
  // "1.1 million views"). Also tolerates a leading "Channel • " prefix.
  const VIEW_RE =
    /(?:^|[•·]\s*)([\d,]+(?:\.\d+)?)\s*(thousand|million|billion|[KMB])?\+?\s*views?\.?$/i;

  function parseViewCount(rawText) {
    const text = rawText.trim();
    if (!text) return null;
    if (/^no views?\b/i.test(text)) return 0;
    const m = text.match(VIEW_RE);
    if (!m) return null;
    let num = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(num)) return null;
    if (m[2]) num *= MULTIPLIERS[m[2].toLowerCase()];
    return num;
  }

  // The end-screen "videowall" overlay's modern format comes in two shapes:
  // a bare number ("9 • 11h ago") or with the word ("14 views • 6 hours
  // ago"). Live streams ("8.1K watching • ...") deliberately don't match.
  function parseVideowallCount(rawText) {
    const m = rawText
      .trim()
      .match(
        /^([\d,]+(?:\.\d+)?)\s*(thousand|million|billion|[KMB])?\s*(?:views?)?\s*[•·]/i,
      );
    if (!m) return null;
    let num = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(num)) return null;
    if (m[2]) num *= MULTIPLIERS[m[2].toLowerCase()];
    return num;
  }

  // Reads a card's CURRENT view count straight from the DOM. Nothing is
  // cached: YouTube recycles card elements and swaps new videos into them,
  // so a count read earlier may no longer describe what the card shows.
  function readViewCount(card) {
    const els = card.querySelectorAll(
      "[aria-label], span, yt-formatted-string",
    );
    for (const el of els) {
      if (el.closest("h3, #video-title")) continue; // never read titles
      const aria = el.getAttribute("aria-label");
      const text = el.children.length === 0 ? el.textContent : "";
      for (const s of [aria, text]) {
        if (!s || s.length > 80) continue;
        const count = parseViewCount(s);
        if (count !== null) return count;
      }
    }
    return null;
  }

  // Outermost recommendation card containing el (so the whole grid cell is
  // hidden, not just an inner piece), or null if el is in the excluded
  // primary-video panel.
  function outermostCard(el) {
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

  function isHidden(el) {
    return (
      el.style.getPropertyValue("display") === "none" &&
      el.style.getPropertyPriority("display") === "important"
    );
  }

  let totalHiddenEver = 0;

  // End-screen videowall tiles come in two formats:
  //  - modern: a dedicated "9 • 11h ago" field (no "views" word)
  //  - classic: "Some Channel • 109 views" in the author field
  function enforceVideowallTiles() {
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
      if (count === null || count >= VIEW_THRESHOLD) continue;
      if (!isHidden(tile)) {
        tile.style.setProperty("display", "none", "important");
        hidden++;
        totalHiddenEver++;
        if (VERBOSE)
          console.log("[hide-low-views] HID (videowall):", shown, "|", tile);
      }
    }
    return hidden;
  }

  function scan() {
    let newlyHidden = 0;
    let restored = 0;
    const seen = new Set();

    for (const seed of document.querySelectorAll(CARD_SELECTOR)) {
      const card = outermostCard(seed);
      if (!card || seen.has(card)) continue;
      seen.add(card);

      const count = readViewCount(card);
      if (count === null) continue; // no count visible (yet): leave as-is
      const wasOurs = card.dataset.ylvHidden === "1";

      if (count < VIEW_THRESHOLD) {
        // (Re)assert every scan, in case YouTube wiped the inline style.
        if (!isHidden(card))
          card.style.setProperty("display", "none", "important");
        if (!wasOurs) {
          card.dataset.ylvHidden = "1";
          newlyHidden++;
          totalHiddenEver++;
          if (VERBOSE)
            console.log(
              "[hide-low-views] HID:",
              count,
              "views | card:",
              card.tagName,
              card,
            );
        }
      } else if (wasOurs) {
        // YouTube recycled this card for a popular video: bring it back.
        card.style.removeProperty("display");
        delete card.dataset.ylvHidden;
        restored++;
      }
    }

    newlyHidden += enforceVideowallTiles();

    if (newlyHidden || restored) {
      console.log(
        `[hide-low-views] ${newlyHidden} newly hidden, ${restored} restored, ${totalHiddenEver} hidden total so far.`,
      );
    }
  }

  function safeScan() {
    try {
      scan();
    } catch (e) {
      console.error("[hide-low-views] error during scan:", e);
    }
  }

  // Scan shortly after any DOM change (throttled, not debounced, so a
  // constant stream of page activity can't starve it)...
  let pending = null;
  function scheduleScan() {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      safeScan();
    }, THROTTLE_MS);
  }
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label"], // in-place count updates
  });

  // ...and re-check everything on a timer regardless, which covers style
  // rewrites and in-place text updates the observer can't see.
  setInterval(safeScan, SCAN_INTERVAL_MS);

  document.addEventListener("yt-navigate-finish", () => {
    safeScan();
    setTimeout(safeScan, 300);
    setTimeout(safeScan, 1000);
  });

  safeScan();

  // Manual trigger for testing: run window.__hideLowViewsScan() in console
  window.__hideLowViewsScan = scan;
})();

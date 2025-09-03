/* ============================
   Configuration
   ============================ */
const RUN_INDEX_PATH = "data/runs/index.json";
const RUNS_BASE_PATH = "data/runs/";
const SPRITES_PATH = "sprites/";
const BADGES_PATH = `${SPRITES_PATH}badges/`;
const DEFAULT_RUN_ID = "run-02"; // fallback run id if none selected
const SCROLL_OFFSET = 110; // offset for anchored scrolling (adjust for header height)

/* ============================
   Global runtime state
   ============================ */
let CURRENT_RUN_ID = null;
const COLLAPSED_KEY_PREFIX = "nuz_timeline_collapsed:"; // localStorage prefix

/* ============================
   Small helpers
   ============================ */
function speciesToFilename(name) {
  if (!name) return null;
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

function spriteUrlFor(species) {
  const filename = speciesToFilename(species);
  if (!filename) return null;
  return `${SPRITES_PATH}${filename}.png`;
}

function badgeUrlFor(name) {
  const filename = speciesToFilename(name);
  if (!filename) return null;
  return `${BADGES_PATH}${filename}.png`;
}

function capitalize(s) {
  if (s === null || s === undefined) return "";
  s = String(s);
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function setSvgPlaceholder(imgEl, label) {
  const short = (label || "").slice(0, 3).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
    <rect width='100%' height='100%' fill='#f3f4ff'/>
    <text x='50%' y='50%' font-size='28' text-anchor='middle' fill='#6b6b7a' dy='.35em' font-family='Arial,Helvetica,sans-serif'>${short}</text>
  </svg>`;
  imgEl.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function attachPlaceholderOnErrorOrNull(imgEl, label, url) {
  if (!imgEl) return;
  if (!url) {
    setSvgPlaceholder(imgEl, label);
    return;
  }
  imgEl.onerror = function () {
    this.onerror = null;
    setSvgPlaceholder(this, label);
  };
}

async function fetchJson(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      console.warn(`fetchJson: ${path} -> ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`fetchJson error: ${path}`, err);
    return null;
  }
}

/**
 * Parse location.hash and location.search and return:
 * { anchor: "episode-12" | null, params: URLSearchParams }
 * - supports hashes like "#episode-12?spoiler=0"
 * - merges any query params in location.search with the hash params (hash params win)
 */
function parseHashAnchorAndParams() {
  const params = new URLSearchParams(window.location.search || "");
  const rawHash = (window.location.hash || "").replace(/^#/, ""); // remove leading '#'
  if (!rawHash) return { anchor: null, params };

  const qIdx = rawHash.indexOf("?");
  let anchor = rawHash;
  if (qIdx !== -1) {
    anchor = rawHash.substring(0, qIdx);
    const hashQuery = rawHash.substring(qIdx + 1);
    const hashParams = new URLSearchParams(hashQuery);
    // merge hashParams into params (hash params override search params)
    for (const [k, v] of hashParams.entries()) params.set(k, v);
  }
  return { anchor, params };
}

/* ============================
   LocalStorage: collapsed episodes per-run
   ============================ */
function loadCollapsedMap(runId) {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY_PREFIX + runId);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(x => Number(x)));
  } catch (e) {
    console.warn("Failed to load collapsed map:", e);
    return new Set();
  }
}
function saveCollapsedMap(runId, set) {
  try {
    const arr = Array.from(set.values());
    localStorage.setItem(COLLAPSED_KEY_PREFIX + runId, JSON.stringify(arr));
  } catch (e) {
    console.warn("Failed to save collapsed map:", e);
  }
}
function clearCollapsedMap(runId) {
  try {
    localStorage.removeItem(COLLAPSED_KEY_PREFIX + runId);
  } catch (e) {
    console.warn("Failed to clear collapsed map:", e);
  }
}

/* ============================
   Runs list
   ============================ */
async function loadRunsList() {
  const idx = await fetchJson(RUN_INDEX_PATH);
  if (!idx || !Array.isArray(idx.runs) || idx.runs.length === 0) {
    return [{ id: DEFAULT_RUN_ID, title: "Run 1" }];
  }
  return idx.runs;
}
function populateRunSelector(runs) {
  const sel = document.getElementById("run-selector");
  if (!sel) return;
  sel.innerHTML = "";
  for (const r of runs) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.title || r.id;
    sel.appendChild(opt);
  }
}

/* ============================
   Fetch run files
   ============================ */
async function fetchRunEvents(runId) {
  const path = `${RUNS_BASE_PATH}${runId}/events.json`;
  const data = await fetchJson(path);
  if (!data) {
    console.warn("No events found for", runId, path);
    return [];
  }
  if (!Array.isArray(data)) {
    console.warn("events.json is not an array:", path);
    return [];
  }
  return data;
}
async function fetchRunMeta(runId) {
  const path = `${RUNS_BASE_PATH}${runId}/meta.json`;
  const meta = await fetchJson(path);
  return meta || null;
}

/* ============================
   Event element builder
   ============================ */
function createEventElement(ev) {
  const wrapper = document.createElement("article");
  const side = (ev.side === "right") ? "right" : "left";
  wrapper.className = `event ${side}`;

  const type = (ev.type || "").toLowerCase();
  if (type) wrapper.classList.add(`type-${type}`);
  if (type === "fainted") wrapper.classList.add("fainted");

  // Header (top)
  const header = document.createElement("div");
  header.className = "event-header";
  const level = ev.pokemon?.level ?? ev.level;
  if (type === "caught") {
    header.textContent = level ? `Caught at Level ${level}` : "Caught";
  } else if (type === "fainted") {
    header.textContent = "Fainted";
  } else if (type === "evolved" || type === "evolution") {
    header.textContent = level ? `Evolved at Level ${level}` : "Evolved";
  } else if (type === "badge") {
    header.textContent = "Badge earned";
  } else {
    header.textContent = (ev.type ? capitalize(ev.type) : "Event");
  }
  wrapper.appendChild(header);

  // Body (visual + text)
  const bodyWrapper = document.createElement("div");
  bodyWrapper.className = "event-body";

  const visual = document.createElement("div");
  visual.className = "visual";

  // Visual content
  if (type === "evolved" || type === "evolution") {
    const fromName = ev.from || ev.pokemon?.from || ev.pokemon?.before || "";
    const toName = ev.to || ev.pokemon?.to || ev.pokemon?.after || "";

    const leftImg = document.createElement("img");
    leftImg.className = "sprite";
    leftImg.alt = fromName || "before";
    const leftUrl = spriteUrlFor(fromName);
    if (leftUrl) leftImg.src = leftUrl;
    attachPlaceholderOnErrorOrNull(leftImg, fromName, leftUrl);

    const rightImg = document.createElement("img");
    rightImg.className = "sprite";
    rightImg.alt = toName || "after";
    const rightUrl = spriteUrlFor(toName);
    if (rightUrl) rightImg.src = rightUrl;
    attachPlaceholderOnErrorOrNull(rightImg, toName, rightUrl);

    const evoRow = document.createElement("div");
    evoRow.className = "evolution-row";
    evoRow.appendChild(leftImg);
    const arrow = document.createElement("div");
    arrow.className = "evolve-arrow";
    arrow.textContent = "➡";
    evoRow.appendChild(arrow);
    evoRow.appendChild(rightImg);
    visual.appendChild(evoRow);

  } else if (type === "badge") {
    const badgeName = ev.badge || ev.badgeName || ev.name || ev.notes || "badge";
    const badgeImg = document.createElement("img");
    badgeImg.className = "badge-icon";
    badgeImg.alt = badgeName;
    const bUrl = badgeUrlFor(badgeName);
    if (bUrl) badgeImg.src = bUrl;
    attachPlaceholderOnErrorOrNull(badgeImg, badgeName, bUrl);
    visual.appendChild(badgeImg);

  } else {
    const speciesName = ev.pokemon?.species || ev.species || ev.speciesName || "";
    const spriteImg = document.createElement("img");
    spriteImg.className = "sprite";
    spriteImg.alt = speciesName || "pokemon";
    const sUrl = spriteUrlFor(speciesName);
    if (sUrl) spriteImg.src = sUrl;
    attachPlaceholderOnErrorOrNull(spriteImg, speciesName, sUrl);
    visual.appendChild(spriteImg);
  }

  // Text section
  const text = document.createElement("div");
  text.className = "item-body";

  // species + nickname or evolution text
  const speciesNick = document.createElement("div");
  speciesNick.className = "species-nick";
  if (type === "evolved" || type === "evolution") {
    const fromName = ev.from || ev.pokemon?.from || ev.pokemon?.before || "";
    const toName = ev.to || ev.pokemon?.to || ev.pokemon?.after || "";
    const nick = ev.pokemon?.nickname || ev.nickname;
    if (fromName && toName) {
      speciesNick.textContent = nick ? `${fromName} → ${toName} • Named after ${nick}` : `${fromName} → ${toName}`;
    } else {
      speciesNick.textContent = ev.pokemon?.species ? (ev.pokemon?.nickname ? `${ev.pokemon.species} • Named after ${ev.pokemon.nickname}` : ev.pokemon.species) : "";
    }
  } else {
    const species = ev.pokemon?.species || ev.species || "";
    const nickname = ev.pokemon?.nickname;
    if (species && nickname) speciesNick.textContent = `${species} → Named after ${nickname}`;
    else if (species) speciesNick.textContent = species;
    else speciesNick.textContent = "";
  }
  if (speciesNick.textContent) text.appendChild(speciesNick);

  // Obtained / Died / timecode
  const obtainedLine = document.createElement("div");
  obtainedLine.className = "obtained-line";
  const location = ev.location || ev.obtained || ev.obtainedVia || ev.method || ev.fromLocation || "";
  // label depends on event type
  let locLabel = "Obtained via:";
  if (type === "fainted") locLabel = "Died at:";
  else if (type === "end") locLabel = "Final location:";
  if (location) obtainedLine.appendChild(document.createTextNode(`${locLabel} ${location}`));
  if (ev.timestamp && ev.video?.url) {
    if (location) obtainedLine.appendChild(document.createTextNode(" at "));
    const a = document.createElement("a");
    a.href = ev.video.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = ev.timestamp;
    obtainedLine.appendChild(a);
  } else if (ev.timestamp && !location) {
    obtainedLine.appendChild(document.createTextNode(ev.timestamp));
  }
  if (obtainedLine.textContent || obtainedLine.children.length) text.appendChild(obtainedLine);

  // notes
  if (ev.notes) {
    const notes = document.createElement("div");
    notes.className = "item-notes";
    notes.textContent = ev.notes;
    text.appendChild(notes);
  }

  // assemble body
  bodyWrapper.appendChild(visual);
  bodyWrapper.appendChild(text);
  wrapper.appendChild(bodyWrapper);
  return wrapper;
}

/* ============================
   Episode section toggle helpers
   ============================ */
function toggleEpisodeSection(runId, episode, expand) {
  const section = document.querySelector(`.episode-section[data-episode="${episode}"]`);
  if (!section) return;
  const banner = section.querySelector(".episode-banner");
  const contents = section.querySelector(".episode-contents");
  if (!banner || !contents) return;

  const isExpanded = banner.getAttribute("aria-expanded") === "true";
  let willExpand = (typeof expand === "boolean") ? expand : !isExpanded;

  // update attributes/classes
  banner.setAttribute("aria-expanded", willExpand ? "true" : "false");
  if (willExpand) {
    contents.classList.remove("collapsed");
    contents.setAttribute("aria-hidden", "false");
    // measure and set max-height for smooth transition
    const full = contents.scrollHeight;
    contents.style.maxHeight = (full > 0 ? full + "px" : "2000px");
  } else {
    contents.style.maxHeight = "0px";
    contents.classList.add("collapsed");
    contents.setAttribute("aria-hidden", "true");
  }

  // persist collapsed state
  const map = loadCollapsedMap(runId);
  if (!willExpand) map.add(Number(episode));
  else map.delete(Number(episode));
  saveCollapsedMap(runId, map);
}

function setAllCollapsed(runId, collapsed) {
  const sections = document.querySelectorAll(`.episode-section`);
  const map = loadCollapsedMap(runId);
  if (collapsed) {
    // collapse all: add every episode number to map
    sections.forEach(sec => {
      const ep = Number(sec.dataset.episode);
      toggleEpisodeSection(runId, ep, false);
      map.add(ep);
    });
  } else {
    // expand all: remove map and expand each
    sections.forEach(sec => {
      const ep = Number(sec.dataset.episode);
      toggleEpisodeSection(runId, ep, true);
      map.delete(ep);
    });
  }
  saveCollapsedMap(runId, map);
}

/* ============================
   renderTimeline (collapsible episodes)
   ============================ */
function renderTimeline(events) {
  const container = document.getElementById("timeline");
  const messageEl = document.getElementById("message");
  if (!container) {
    console.warn("No #timeline element found.");
    return;
  }
  container.innerHTML = "";
  if (messageEl) messageEl.hidden = true;

  if (!events || events.length === 0) {
    if (messageEl) {
      messageEl.hidden = false;
      messageEl.textContent = "No events found for this run.";
    }
    populateEpisodeSelector([]); // clear episodes
    return;
  }

  // sort & group by episode
  events.sort((a, b) => {
    const ea = a.episode ?? 0;
    const eb = b.episode ?? 0;
    if (ea !== eb) return ea - eb;
    const ta = a.timestamp || "";
    const tb = b.timestamp || "";
    return ta.localeCompare(tb, undefined, {numeric:true});
  });

  const episodesOrder = [];
  const episodesMap = new Map();
  for (const ev of events) {
    const ep = ev.episode ?? 0;
    if (!episodesMap.has(ep)) {
      episodesMap.set(ep, []);
      episodesOrder.push(ep);
    }
    episodesMap.get(ep).push(ev);
  }

  // persisted collapsed map for current run
  const runKey = CURRENT_RUN_ID || DEFAULT_RUN_ID;
  const persisted = loadCollapsedMap(runKey);
  const hasPersisted = (localStorage.getItem(COLLAPSED_KEY_PREFIX + runKey) !== null);

  // if user hasn't set preference, collapse the last episode by default (avoid spoilers)
  if (!hasPersisted && episodesOrder.length > 0) {
    const lastEp = episodesOrder[episodesOrder.length - 1];
    persisted.add(Number(lastEp));
    saveCollapsedMap(runKey, persisted);
  }

  const episodesArr = [];
  for (const ep of episodesOrder) {
    const section = document.createElement("section");
    section.className = "episode-section";
    section.dataset.episode = String(ep);

    // banner
    const banner = document.createElement("div");
    banner.className = "episode-banner";
    banner.tabIndex = 0;
    banner.setAttribute("role", "button");
    const isExpanded = !persisted.has(Number(ep));
    banner.setAttribute("aria-expanded", isExpanded ? "true" : "false");

    const epDate = episodesMap.get(ep)[0]?.date;
    const titleSpan = document.createElement("span");
    titleSpan.className = "episode-title";
    titleSpan.textContent = `Episode ${ep}` + (epDate ? ` • ${epDate}` : "");
    banner.appendChild(titleSpan);

    // controls: permalink + chevron
    const controls = document.createElement("div");
    controls.className = "controls";

    const permBtn = document.createElement("button");
    permBtn.className = "permalink";
    permBtn.title = "Copy permalink to this episode";
    permBtn.innerHTML = "🔗";
    permBtn.title = "Click: copy expanded link — Shift+Click: copy spoiler-safe (collapsed) link";
    permBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const anchor = `episode-${ep}`;
    const base = location.origin + location.pathname + location.search; // keep existing search (if any)
    // Expanded link (default): #episode-<n>
    const expandedUrl = base + `#${anchor}`;

    // Safe (collapsed) link: #episode-<n>?spoiler=0
    // NOTE: we put the spoiler param inside the hash so it's portable when copying anchors only.
    const safeUrl = base + `#${anchor}?spoiler=0`;

    const toCopy = e.shiftKey ? safeUrl : expandedUrl;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(toCopy).then(() => {
        const prev = permBtn.textContent;
        permBtn.textContent = "✓";
        setTimeout(() => permBtn.textContent = prev, 1200);
      }).catch(() => {
        alert("Copy this link: " + toCopy);
      });
    } else {
      // fallback
      try {
        window.prompt("Copy link (Ctrl+C / Cmd+C):", toCopy);
      } catch (err) {
        alert("Copy this link: " + toCopy);
      }
    }
  });
    controls.appendChild(permBtn);

    const chev = document.createElement("span");
    chev.className = "chev";
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = "▾";
    controls.appendChild(chev);

    banner.appendChild(controls);

    // toggle events
    banner.addEventListener("click", () => toggleEpisodeSection(runKey, ep));
    banner.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggleEpisodeSection(runKey, ep);
      }
    });

    section.appendChild(banner);

    // contents container
    const contents = document.createElement("div");
    contents.className = "episode-contents";
    contents.id = `episode-contents-${ep}`;
    if (!isExpanded) {
      contents.classList.add("collapsed");
      contents.setAttribute("aria-hidden", "true");
      contents.style.maxHeight = "0px";
    } else {
      contents.setAttribute("aria-hidden", "false");
      // will set measured maxHeight after append
    }

    // append events
    const epEvents = episodesMap.get(ep) || [];
    for (const ev of epEvents) {
      const evType = (ev.type || "").toLowerCase();
      if (evType === "run_end" || evType === "runended" || evType === "run_ended" || evType === "end") {
        const endBanner = document.createElement("div");
        endBanner.className = "run-end-banner";
        const parts = [];
        if (ev.episode !== undefined) parts.push(`Episode ${ev.episode}`);
        if (ev.date) parts.push(ev.date);
        const note = ev.notes ? ` — ${ev.notes}` : "";
        endBanner.textContent = `Run Ended${parts.length ? " — " + parts.join(" • ") : ""}${note}`;
        contents.appendChild(endBanner);
        continue;
      }
      const el = createEventElement(ev);
      contents.appendChild(el);
    }

    section.appendChild(contents);
    container.appendChild(section);
    episodesArr.push({ episode: ep, date: epDate || "" });

    // set measured maxHeight for expanded content for smoother transitions
    if (isExpanded) {
      requestAnimationFrame(() => {
        const h = contents.scrollHeight;
        contents.style.maxHeight = (h > 0 ? h + "px" : "2000px");
      });
    }
  }

  populateEpisodeSelector(episodesArr);
  // ensure Expand/Collapse All controls exist (dynamically create if missing)
  ensureExpandCollapseControls();
  // handle permalink if present
  handlePermalinkOnLoad();
}

/* ============================
   Episode selector & Jump (ensure expand before scroll)
   ============================ */
function populateEpisodeSelector(episodes) {
  const sel = document.getElementById("episode-selector");
  if (!sel) return;
  sel.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select…";
  sel.appendChild(placeholder);
  for (const e of episodes) {
    const opt = document.createElement("option");
    opt.value = String(e.episode);
    opt.textContent = e.date ? `Episode ${e.episode} — ${e.date}` : `Episode ${e.episode}`;
    sel.appendChild(opt);
  }

  const jumpBtn = document.getElementById("jump-episode");
  if (!jumpBtn) return;
  jumpBtn.onclick = () => {
    const val = sel.value;
    if (!val) return;
    const anchor = `episode-${val}`;
    // expand episode first
    toggleEpisodeSection(CURRENT_RUN_ID || DEFAULT_RUN_ID, Number(val), true);
    // set hash and scroll a fraction later
    history.replaceState(null, "", `#${anchor}`);
    setTimeout(() => {
      const target = document.getElementById(anchor);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
    }, 90);
  };
}

/* ============================
   Permalink handling on load
   ============================ */
function handlePermalinkOnLoad() {
  // first parse hash anchor and merged params
  const { anchor, params } = parseHashAnchorAndParams();

  // helper to expand or not, and then scroll
  const expandAndScroll = (episodeNum, shouldExpand) => {
    // make sure the right run is set in CURRENT_RUN_ID before using toggle function
    toggleEpisodeSection(CURRENT_RUN_ID || DEFAULT_RUN_ID, episodeNum, Boolean(shouldExpand));
    setTimeout(() => {
      const target = document.getElementById(`episode-${episodeNum}`);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
    }, 120);
  };

  // If hash anchor exists and looks like "episode-<n>"
  if (anchor && anchor.startsWith("episode-")) {
    const m = /^episode-(\d+)$/.exec(anchor);
    if (m) {
      const ep = Number(m[1]);
      const spoilerParam = params.get("spoiler");
      // spoiler=0 means keep collapsed / safe; anything else or null => expand
      const shouldExpand = (spoilerParam === "0") ? false : true;
      expandAndScroll(ep, shouldExpand);
      return;
    }
  }

  // fallback: check query string ?episode=#
  const q = new URLSearchParams(window.location.search || "");
  const epi = q.get("episode");
  const spoilerQ = q.get("spoiler");
  if (epi) {
    const ep = Number(epi);
    if (!Number.isNaN(ep)) {
      const shouldExpand = (spoilerQ === "0") ? false : true;
      expandAndScroll(ep, shouldExpand);
    }
  }
}

/* ============================
   Run details meta population
   ============================ */
function populateRunDetails(meta) {
  const container = document.getElementById("run-details");
  if (!container) return;
  if (!meta) {
    container.hidden = true;
    return;
  }

  const playerSpriteEl = document.getElementById("player-sprite");
  const rivalSpriteEl = document.getElementById("rival-sprite");
  const playerNameEl = document.getElementById("player-name");
  const rivalNameEl = document.getElementById("rival-name");
  const playerSub = document.getElementById("player-sub");
  const rivalSub = document.getElementById("rival-sub");

  if (meta.player?.name) {
    playerNameEl.textContent = meta.player.name;
    playerSub.textContent = meta.player.subtitle || "";
  } else {
    playerNameEl.textContent = "";
    playerSub.textContent = "";
  }
  const playerSpriteUrl = spriteUrlFor(meta.player?.species);
  if (playerSpriteUrl) playerSpriteEl.src = playerSpriteUrl;
  attachPlaceholderOnErrorOrNull(playerSpriteEl, meta.player?.species, playerSpriteUrl);

  if (meta.rival?.name) {
    rivalNameEl.textContent = meta.rival.name;
    rivalSub.textContent = meta.rival.subtitle || "";
  } else {
    rivalNameEl.textContent = "";
    rivalSub.textContent = "";
  }
  const rivalSpriteUrl = spriteUrlFor(meta.rival?.species);
  if (rivalSpriteUrl) rivalSpriteEl.src = rivalSpriteUrl;
  attachPlaceholderOnErrorOrNull(rivalSpriteEl, meta.rival?.species, rivalSpriteUrl);

  // run-ended top badge
  if (meta.ended) {
    const existing = container.querySelector(".run-ended-top");
    const text = `Run ended: Episode ${meta.ended.episode}` + (meta.ended.date ? ` • ${meta.ended.date}` : "") + (meta.ended.note ? ` — ${meta.ended.note}` : "");
    if (existing) existing.textContent = text;
    else {
      const el = document.createElement("div");
      el.className = "run-ended-top";
      el.textContent = text;
      container.appendChild(el);
    }
  } else {
    const existing = container.querySelector(".run-ended-top");
    if (existing) existing.remove();
  }

  // run-specific rules note (optional)
  if (meta.rules && Array.isArray(meta.rules) && meta.rules.length) {
    const rulesPanel = document.getElementById("rules-panel");
    if (rulesPanel) {
      const existing = rulesPanel.querySelector(".rules-note.dynamic");
      const text = `Run-specific rules: ${meta.rules.join("; ")}`;
      if (existing) existing.textContent = text;
      else {
        const note = document.createElement("div");
        note.className = "rules-note dynamic";
        note.textContent = text;
        rulesPanel.appendChild(note);
      }
    }
  }

  container.hidden = false;
}

/* ============================
   Rules panel toggle & Back-to-top
   ============================ */
function initRulesToggle() {
  const toggle = document.getElementById("rules-toggle");
  const panel = document.getElementById("rules-panel");
  const closeBtn = document.getElementById("rules-close");
  if (!toggle || !panel) return;
  function openPanel() { panel.hidden = false; toggle.setAttribute("aria-expanded", "true"); }
  function closePanel() { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
  toggle.addEventListener("click", () => { if (panel.hidden) openPanel(); else closePanel(); });
  closeBtn?.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) closePanel();
  });
}
function initBackToTop() {
  const btn = document.getElementById("back-to-top");
  if (!btn) return;
  function check() { btn.style.display = (window.scrollY > 480) ? "flex" : "none"; }
  window.addEventListener("scroll", check);
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  check();
}

/* ============================
   Expand/Collapse all control insertion
   ============================ */
function ensureExpandCollapseControls() {
  // find controls container in your page (the one containing run-selector etc.)
  const controlsSection = document.querySelector(".controls") || document.querySelector("section.controls");
  if (!controlsSection) return;

  // create container for the new buttons (right-aligned)
  let extras = document.getElementById("expand-collapse-controls");
  if (!extras) {
    extras = document.createElement("div");
    extras.id = "expand-collapse-controls";
    extras.style.display = "flex";
    extras.style.gap = "8px";
    extras.style.marginLeft = "8px";
    // append to controlsSection (it will appear after existing controls)
    controlsSection.appendChild(extras);
  } else {
    extras.innerHTML = ""; // refresh
  }

  // Expand All button
  const expandAll = document.createElement("button");
  expandAll.id = "expand-all";
  expandAll.textContent = "Expand all";
  expandAll.title = "Expand all episodes";
  expandAll.className = "small-control";
  expandAll.addEventListener("click", () => {
    setAllCollapsed(CURRENT_RUN_ID || DEFAULT_RUN_ID, false);
  });

  // Collapse All button
  const collapseAll = document.createElement("button");
  collapseAll.id = "collapse-all";
  collapseAll.textContent = "Collapse all";
  collapseAll.title = "Collapse all episodes";
  collapseAll.className = "small-control";
  collapseAll.addEventListener("click", () => {
    setAllCollapsed(CURRENT_RUN_ID || DEFAULT_RUN_ID, true);
  });

  extras.appendChild(expandAll);
  extras.appendChild(collapseAll);
}

/* ============================
   Load and display run (w/ filtering)
   ============================ */
async function loadAndDisplayRun(runId) {
  if (!runId) runId = DEFAULT_RUN_ID;
  CURRENT_RUN_ID = runId;

  const allEvents = await fetchRunEvents(runId);
  const filterType = document.getElementById("filter-type")?.value || "all";
  const q = (document.getElementById("search")?.value || "").trim().toLowerCase();

  let events = allEvents.slice();
  if (filterType && filterType !== "all") {
    events = events.filter(e => (e.type || "").toLowerCase() === filterType.toLowerCase());
  }
  if (q) {
    events = events.filter(e => {
      const species = (e.pokemon?.species || "").toLowerCase();
      const nick = (e.pokemon?.nickname || "").toLowerCase();
      const notes = (e.notes || "").toLowerCase();
      const type = (e.type || "").toLowerCase();
      const location = (e.location || e.obtained || e.obtainedVia || "").toLowerCase();
      const badge = (e.badge || "").toLowerCase();
      return species.includes(q) || nick.includes(q) || notes.includes(q) || type.includes(q) || location.includes(q) || badge.includes(q);
    });
  }

  renderTimeline(events);
  const meta = await fetchRunMeta(runId);
  populateRunDetails(meta);
}

/* ============================
   Startup wiring (init)
   ============================ */
async function init() {
  initRulesToggle();
  initBackToTop();

  const runs = await loadRunsList();
  populateRunSelector(runs);

  const runSel = document.getElementById("run-selector");
  runSel?.addEventListener("change", () => {
    const runId = runSel.value;
    const url = new URL(location);
    url.searchParams.set("run", runId);
    history.replaceState(null, "", url.toString());
    loadAndDisplayRun(runId);
  });

  document.getElementById("filter-type")?.addEventListener("change", () => loadAndDisplayRun(runSel.value));
  document.getElementById("search")?.addEventListener("input", () => loadAndDisplayRun(runSel.value));

  // choose initial run: ?run=run-X OR DEFAULT_RUN_ID OR first in index
  const params = new URLSearchParams(location.search);
  const runParam = params.get("run");
  const initial = (runParam && runs.find(r => r.id === runParam)?.id) || DEFAULT_RUN_ID || runs[0]?.id || DEFAULT_RUN_ID;
  if (runSel) runSel.value = initial;
  await loadAndDisplayRun(initial);
}

/* ============================
   Start
   ============================ */
document.addEventListener("DOMContentLoaded", init);
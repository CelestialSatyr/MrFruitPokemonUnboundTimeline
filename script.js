/* ============================
   Configuration
   ============================ */
const RUN_INDEX_PATH = "data/runs/index.json";
const RUNS_BASE_PATH = "data/runs/";
const SPRITES_PATH = "sprites/";
const BADGES_PATH = `${SPRITES_PATH}badges/`;
const DEFAULT_RUN_ID = "run-02";
const SCROLL_OFFSET = 110; // offset for anchored scrolling (adjust if header size changes)

/* ============================
   Small helpers
   ============================ */

/** Normalize species/badge names to filename-friendly strings */
function speciesToFilename(name) {
  if (!name) return null;
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")      // remove apostrophes
    .replace(/\s+/g, "-")      // spaces -> dashes
    .replace(/[^a-z0-9\-]/g, ""); // remove non-alphanumeric except dash
}

/** Build sprite URL for a species (returns null if species falsy) */
function spriteUrlFor(species) {
  const filename = speciesToFilename(species);
  if (!filename) return null;
  return `${SPRITES_PATH}${filename}.png`;
}

/** Build badge URL */
function badgeUrlFor(name) {
  const filename = speciesToFilename(name);
  if (!filename) return null;
  return `${BADGES_PATH}${filename}.png`;
}

/** Small helper: safe-capitalize a string */
function capitalize(s) {
  if (s === null || s === undefined) return "";
  s = String(s);
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

/** Attach placeholder behavior: set placeholder only if url missing or load fails */
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

/** Generate a small SVG placeholder (data URL) with a short 3-letter label */
function setSvgPlaceholder(imgEl, label) {
  const short = (label || "").slice(0, 3).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
    <rect width='100%' height='100%' fill='#f3f4ff'/>
    <text x='50%' y='50%' font-size='28' text-anchor='middle' fill='#6b6b7a' dy='.35em' font-family='Arial,Helvetica,sans-serif'>${short}</text>
  </svg>`;
  imgEl.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/** Fetch JSON with safe handling, returns null on failure */
async function fetchJson(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      console.warn(`fetchJson: ${path} returned ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`fetchJson error: ${path}`, err);
    return null;
  }
}

/* ============================
   Load runs list and selector
   ============================ */

async function loadRunsList() {
  const idx = await fetchJson(RUN_INDEX_PATH);
  if (!idx || !Array.isArray(idx.runs) || idx.runs.length === 0) {
    // fallback default
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
   Fetch per-run files
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
   Create event element (header above body)
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

  // Obtained line (location + timecode link)
  const obtainedLine = document.createElement("div");
  obtainedLine.className = "obtained-line";
  const location = ev.location || ev.obtained || ev.obtainedVia || ev.method || ev.fromLocation || "";
  if (location) obtainedLine.appendChild(document.createTextNode(`Obtained via: ${location}`));
  if (ev.timestamp && ev.video?.url) {
    if (location) obtainedLine.appendChild(document.createTextNode(" at "));
    const a = document.createElement("a");
    a.href = ev.video.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = ev.timestamp;
    obtainedLine.appendChild(a);
  } else if (ev.timestamp) {
    if (location) obtainedLine.appendChild(document.createTextNode(" at "));
    obtainedLine.appendChild(document.createTextNode(ev.timestamp));
  }
  if (obtainedLine.textContent || obtainedLine.children.length) text.appendChild(obtainedLine);

  // Notes
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
   Render timeline (with episode banners & run-end)
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

  // sort events by episode then timestamp
  events.sort((a, b) => {
    const ea = a.episode ?? 0;
    const eb = b.episode ?? 0;
    if (ea !== eb) return ea - eb;
    const ta = a.timestamp || "";
    const tb = b.timestamp || "";
    return ta.localeCompare(tb, undefined, {numeric:true});
  });

  let lastEpisode = null;
  const episodes = [];

  for (const ev of events) {
    const evType = (ev.type || "").toLowerCase();

    // render run-end markers as full-width banners
    if (evType === "run_end" || evType === "runended" || evType === "run_ended" || evType === "end") {
      const endBanner = document.createElement("div");
      endBanner.className = "run-end-banner";
      const parts = [];
      if (ev.episode !== undefined) parts.push(`Episode ${ev.episode}`);
      if (ev.date) parts.push(ev.date);
      const note = ev.notes ? ` — ${ev.notes}` : "";
      endBanner.textContent = `Run Ended${parts.length ? " — " + parts.join(" • ") : ""}${note}`;
      container.appendChild(endBanner);
      lastEpisode = ev.episode;
      continue;
    }

    // episode banner
    if (ev.episode !== lastEpisode) {
      const banner = document.createElement("div");
      banner.className = "episode-banner";
      banner.textContent = `Episode ${ev.episode}` + (ev.date ? ` • ${ev.date}` : "");
      banner.id = `episode-${ev.episode}`;

      // permalink button (copies url with hash and briefly indicates success)
      const permBtn = document.createElement("button");
      permBtn.className = "permalink";
      permBtn.title = "Copy permalink to this episode";
      permBtn.innerHTML = "🔗";
      permBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const anchor = `episode-${ev.episode}`;
        // update hash without jumping
        history.replaceState(null, "", `#${anchor}`);
        const url = location.href;
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(url).then(() => {
            const prev = permBtn.textContent;
            permBtn.textContent = "✓";
            setTimeout(() => permBtn.textContent = prev, 1200);
          }).catch(() => {
            alert("Copy this link: " + url);
          });
        } else {
          alert("Copy this link: " + url);
        }
      });

      banner.appendChild(permBtn);
      container.appendChild(banner);

      episodes.push({ episode: ev.episode, date: ev.date || "" });
      lastEpisode = ev.episode;
    }

    const el = createEventElement(ev);
    container.appendChild(el);
  }

  populateEpisodeSelector(episodes);

  // After render, handle permalink from URL if any
  handlePermalinkOnLoad();
}

/* ============================
   Episode selector & Jump
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
    // set hash for shareability
    location.hash = `#${anchor}`;
    const target = document.getElementById(anchor);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top, behavior: "smooth" });
  };
}

/* ============================
   Permalink handling on load
   ============================ */

function handlePermalinkOnLoad() {
  // Prefer hash (#episode-3), fallback to query param ?episode=3
  const h = location.hash;
  if (h && h.startsWith("#episode-")) {
    const anchor = h.substring(1);
    const target = document.getElementById(anchor);
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
      return;
    }
  }
  const params = new URLSearchParams(location.search);
  const epi = params.get("episode");
  if (epi) {
    const anchor = `episode-${epi}`;
    const target = document.getElementById(anchor);
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }
}

/* ============================
   Run details / meta rendering
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

  // show run-ended top badge if meta.ended present
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
    // remove any existing run-ended-top if meta changed
    const existing = container.querySelector(".run-ended-top");
    if (existing) existing.remove();
  }

  // optionally add run-specific rules note
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
   Rules panel toggle
   ============================ */

function initRulesToggle() {
  const toggle = document.getElementById("rules-toggle");
  const panel = document.getElementById("rules-panel");
  const closeBtn = document.getElementById("rules-close");
  if (!toggle || !panel) return;

  function openPanel() {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  }
  function closePanel() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", () => {
    if (panel.hidden) openPanel(); else closePanel();
  });
  closeBtn?.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) closePanel();
  });
}

/* ============================
   Back to top button
   ============================ */

function initBackToTop() {
  const btn = document.getElementById("back-to-top");
  if (!btn) return;
  function check() {
    btn.style.display = (window.scrollY > 480) ? "flex" : "none";
  }
  window.addEventListener("scroll", check);
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  check();
}

/* ============================
   Load + display run (filter/search)
   ============================ */

async function loadAndDisplayRun(runId) {
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
   Startup wiring
   ============================ */

async function init() {
  initRulesToggle();
  initBackToTop();

  const runs = await loadRunsList();
  populateRunSelector(runs);

  const runSel = document.getElementById("run-selector");
  runSel?.addEventListener("change", () => {
    // when user switches run, update URL query param for shareability
    const runId = runSel.value;
    const url = new URL(location);
    url.searchParams.set("run", runId);
    history.replaceState(null, "", url.toString());
    loadAndDisplayRun(runId);
  });

  document.getElementById("filter-type")?.addEventListener("change", () => loadAndDisplayRun(runSel.value));
  document.getElementById("search")?.addEventListener("input", () => loadAndDisplayRun(runSel.value));

  // choose initial run: ?run=run-02 or first in index
  const params = new URLSearchParams(location.search);
  const runParam = params.get("run");
  const initial = (runParam && runs.find(r => r.id === runParam)?.id) || runs[0]?.id || DEFAULT_RUN_ID;
  if (runSel) runSel.value = initial;
  await loadAndDisplayRun(initial);
}

/* ============================
   Run the init on DOMContentLoaded
   ============================ */
document.addEventListener("DOMContentLoaded", init);
// script.js - timeline renderer with permalinks, jump, back-to-top, and rules panel

// ---------- Configuration ----------
const RUN_INDEX_PATH = "data/runs/index.json";
const RUNS_BASE_PATH = "data/runs/";
const SPRITES_PATH = "sprites/";
const BADGES_PATH = `${SPRITES_PATH}badges/`;
const DEFAULT_RUN_ID = "run-01";
// -----------------------------------

/* ---------------- utility functions ---------------- */
function speciesToFilename(species) {
  if (!species) return null;
  return String(species).toLowerCase().trim()
    .replace(/['’]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}
function spriteUrlFor(species) {
  const filename = speciesToFilename(species);
  if (!filename) return null;
  return `${SPRITES_PATH}${filename}.png`;
}
function badgeUrlFor(badgeName) {
  if (!badgeName) return null;
  const filename = speciesToFilename(badgeName);
  return `${BADGES_PATH}${filename}.png`;
}
function attachPlaceholderOnErrorOrNull(imgEl, species, url) {
  if (!url) {
    setSvgPlaceholder(imgEl, species);
    return;
  }
  imgEl.onerror = function () {
    this.onerror = null;
    setSvgPlaceholder(this, species);
  };
}
function setSvgPlaceholder(imgEl, species) {
  const label = (species || "").slice(0, 3).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
    <rect width='100%' height='100%' fill='#f3f4ff'/>
    <text x='50%' y='50%' font-size='28' text-anchor='middle' fill='#6b6b7a' dy='.35em' font-family='Arial,Helvetica,sans-serif'>${label}</text>
  </svg>`;
  imgEl.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
async function fetchJson(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn("fetchJson error:", path, err);
    return null;
  }
}

/* ---------------- data loading / selector population ---------------- */
async function loadRunsList() {
  const idx = await fetchJson(RUN_INDEX_PATH);
  if (!idx || !Array.isArray(idx.runs) || idx.runs.length === 0) {
    return [{ id: DEFAULT_RUN_ID, title: "Run 1" }];
  }
  return idx.runs;
}
function populateRunSelector(runs) {
  const sel = document.getElementById("run-selector");
  sel.innerHTML = "";
  for (const r of runs) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.title || r.id;
    sel.appendChild(opt);
  }
}

/* ---------------- fetch run content ---------------- */
async function fetchRunEvents(runId) {
  const path = `${RUNS_BASE_PATH}${runId}/events.json`;
  const data = await fetchJson(path);
  if (!data) return [];
  if (!Array.isArray(data)) return [];
  return data;
}
async function fetchRunMeta(runId) {
  const path = `${RUNS_BASE_PATH}${runId}/meta.json`;
  const meta = await fetchJson(path);
  return meta || null;
}

/* ---------------- render events / timeline ---------------- */
function createEventElement(ev) {
  // wrapper (left/right placement)
  const wrapper = document.createElement("article");
  wrapper.className = "event " + ((ev.side === "right") ? "right" : "left");

  /* -------------------------
     Header (top)
     ------------------------- */
  const header = document.createElement("div");
  header.className = "event-header";

  // (small safe fallback if CSS not loaded yet)
  header.style.minHeight = "1.5em";

  const level = ev.pokemon?.level ?? ev.level;
  const type = (ev.type || "").toLowerCase();

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

  // append header first (so it's above the body)
  wrapper.appendChild(header);

  /* -------------------------
     Body (below header)
     ------------------------- */
  const bodyWrapper = document.createElement("div");
  bodyWrapper.className = "event-body";

  // Left visual section: sprite / evolution / badge
  const visual = document.createElement("div");
  visual.className = "visual";

  if (type === "evolved" || type === "evolution") {
    const fromName = ev.from || ev.pokemon?.from || ev.pokemon?.before || "";
    const toName   = ev.to   || ev.pokemon?.to   || ev.pokemon?.after || "";

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

  /* -------------------------
     Text area (right side of body)
     ------------------------- */
  const text = document.createElement("div");
  text.className = "item-body";

  // Species + nickname line
  const speciesNick = document.createElement("div");
  speciesNick.className = "species-nick";
  if (type === "evolved" || type === "evolution") {
    const fromName = ev.from || ev.pokemon?.from || ev.pokemon?.before || "";
    const toName   = ev.to   || ev.pokemon?.to   || ev.pokemon?.after || "";
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

  // Obtained / location + timecode link line
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

  // assemble body: visual left, text right
  bodyWrapper.appendChild(visual);
  bodyWrapper.appendChild(text);

  // append body AFTER header (so header is on top)
  wrapper.appendChild(bodyWrapper);

  return wrapper;
}


function renderTimeline(events) {
  const container = document.getElementById("timeline");
  const messageEl = document.getElementById("message");
  container.innerHTML = "";
  messageEl.hidden = true;

  if (!events || events.length === 0) {
    messageEl.hidden = false;
    messageEl.textContent = "No events found for this run.";
    populateEpisodeSelector([]);
    return;
  }

  events.sort((a, b) => {
    const ea = a.episode ?? 0;
    const eb = b.episode ?? 0;
    if (ea !== eb) return ea - eb;
    const ta = a.timestamp || "";
    const tb = b.timestamp || "";
    return ta.localeCompare(tb, undefined, {numeric:true});
  });

  const episodes = [];
  let lastEpisode = null;
  for (const ev of events) {
    if (ev.episode !== lastEpisode) {
      const banner = document.createElement("div");
      banner.className = "episode-banner";
      const dateText = ev.date ? ` • ${ev.date}` : "";
      banner.textContent = `Episode ${ev.episode}${dateText}`;

      // add permalink button
      const permBtn = document.createElement("button");
      permBtn.className = "permalink";
      permBtn.title = "Copy permalink to this episode";
      permBtn.innerHTML = "🔗";
      permBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const anchor = `episode-${ev.episode}`;
        // update hash in URL without page jump (use history API)
        history.replaceState(null, "", `#${anchor}`);
        // copy full URL to clipboard
        const url = location.href;
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(url).then(() => {
            permBtn.textContent = "✓";
            setTimeout(() => permBtn.textContent = "🔗", 1200);
          }).catch(() => {
            // fallback: select and copy
            alert("Copy this link: " + url);
          });
        } else {
          alert("Copy this link: " + url);
        }
      });

      banner.appendChild(permBtn);

      // set id for anchor navigation
      banner.id = `episode-${ev.episode}`;
      container.appendChild(banner);

      episodes.push({episode: ev.episode, date: ev.date || ""});
      lastEpisode = ev.episode;
    }
    const el = createEventElement(ev);
    container.appendChild(el);
  }
  populateEpisodeSelector(episodes);

  // if there's a hash or ?episode= param, scroll to it after render
  handlePermalinkOnLoad();
}

/* ---------------- episode selector & jump ---------------- */
function populateEpisodeSelector(episodes) {
  const sel = document.getElementById("episode-selector");
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
  jumpBtn.onclick = () => {
    const val = sel.value;
    if (!val) return;
    const anchor = `episode-${val}`;
    // update the hash (so users can copy URL from address bar or share)
    location.hash = `#${anchor}`;
    // scroll to anchor smoothly (offset for header)
    const target = document.getElementById(anchor);
    if (!target) return;
    const offset = 110;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };
}

/* ---------------- permalink handling on page load ---------------- */
function handlePermalinkOnLoad() {
  // prefer hash (#episode-3) else query param ?episode=3
  const h = location.hash;
  if (h && h.startsWith("#episode-")) {
    const anchor = h.substring(1);
    const target = document.getElementById(anchor);
    if (target) {
      const offset = 110;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
      return;
    }
  }
  // fallback: ?episode=3
  const params = new URLSearchParams(location.search);
  const epi = params.get("episode");
  if (epi) {
    const anchor = `episode-${epi}`;
    const target = document.getElementById(anchor);
    if (target) {
      const offset = 110;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }
}

/* ---------------- run details banner population ---------------- */
function populateRunDetails(meta) {
  const container = document.getElementById("run-details");
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

  // Optionally show custom rules snippet if present in meta
  // e.g. meta.rules = ["No items in battle", "Dupes clause enabled"]
  const rulesPanel = document.getElementById("rules-panel");
  if (meta.rules && Array.isArray(meta.rules) && meta.rules.length) {
    const note = document.createElement("div");
    note.className = "rules-note";
    note.textContent = `Run-specific rules: ${meta.rules.join("; ")}`;
    // append to the rules panel if not already present
    if (!rulesPanel.querySelector(".rules-note.dynamic")) {
      note.classList.add("dynamic");
      rulesPanel.appendChild(note);
    } else {
      const existing = rulesPanel.querySelector(".rules-note.dynamic");
      existing.textContent = `Run-specific rules: ${meta.rules.join("; ")}`;
    }
  }

  container.hidden = false;
}

/* ---------------- rules panel toggle ---------------- */
function initRulesToggle() {
  const toggle = document.getElementById("rules-toggle");
  const panel = document.getElementById("rules-panel");
  const closeBtn = document.getElementById("rules-close");

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

  // close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });
  // click outside to close
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !document.getElementById("rules-toggle").contains(e.target)) {
      closePanel();
    }
  });
}

/* ---------------- back-to-top ---------------- */
function initBackToTop() {
  const btn = document.getElementById("back-to-top");
  function check() {
    if (window.scrollY > 480) btn.style.display = "flex";
    else btn.style.display = "none";
  }
  window.addEventListener("scroll", check);
  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  check();
}

/* ---------------- main UI wiring ---------------- */
async function loadAndDisplayRun(runId) {
  const allEvents = await fetchRunEvents(runId);
  const filterType = document.getElementById("filter-type").value;
  const q = (document.getElementById("search").value || "").trim().toLowerCase();

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

  // load meta and populate run details (and optionally rules)
  const meta = await fetchRunMeta(runId);
  populateRunDetails(meta);
}

async function init() {
  initRulesToggle();
  initBackToTop();

  const runs = await loadRunsList();
  populateRunSelector(runs);

  const runSel = document.getElementById("run-selector");
  runSel.addEventListener("change", () => loadAndDisplayRun(runSel.value));
  document.getElementById("filter-type").addEventListener("change", () => loadAndDisplayRun(runSel.value));
  document.getElementById("search").addEventListener("input", () => loadAndDisplayRun(runSel.value));

  // On load: if URL has ?run=run-02, select it
  const params = new URLSearchParams(location.search);
  const runParam = params.get("run");
  const initial = (runParam && runs.find(r=>r.id===runParam)?.id) || runs[0]?.id || DEFAULT_RUN_ID;
  runSel.value = initial;
  await loadAndDisplayRun(initial);
}

document.addEventListener("DOMContentLoaded", init);
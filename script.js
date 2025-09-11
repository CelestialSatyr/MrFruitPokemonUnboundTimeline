/* ============================
   Configuration
   ============================ */
const RUN_INDEX_PATH = "data/runs/index.json";
const RUNS_BASE_PATH = "data/runs/";
const SPRITES_PATH = "sprites/";
const BADGES_PATH = `${SPRITES_PATH}badges/`;
const DEFAULT_RUN_ID = "run-02";
const SCROLL_OFFSET = 110; // adjust if header height changes

/* ============================
   State
   ============================ */
let CURRENT_RUN_ID = null;
const COLLAPSED_KEY_PREFIX = "nuz_timeline_collapsed:";

/* ============================
   Helpers
   ============================ */
function capitalize(s) {
  if (s === null || s === undefined) return "";
  s = String(s);
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function speciesToFilename(name) {
  if (!name) return null;
  return String(name).toLowerCase().trim().replace(/['’]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
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
function setSvgPlaceholder(imgEl, label) {
  const short = (label || "").slice(0, 3).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='100%' height='100%' fill='#f3f4ff'/><text x='50%' y='50%' font-size='28' text-anchor='middle' fill='#6b6b7a' dy='.35em' font-family='Arial,Helvetica,sans-serif'>${short}</text></svg>`;
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

/* fetch helper */
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

/* ============================
   Collapsed localStorage map
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
   Runs list & fetching run files
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
async function fetchRunEvents(runId) {
  const path = `${RUNS_BASE_PATH}${runId}/events.json`;
  const data = await fetchJson(path);
  if (!data) {
    console.warn("No events found for", runId, path);
    return [];
  }
  return Array.isArray(data) ? data : [];
}
async function fetchRunMeta(runId) {
  const path = `${RUNS_BASE_PATH}${runId}/meta.json`;
  const meta = await fetchJson(path);
  return meta || null;
}

/* ============================
   Create DOM for an event
   ============================ */
function createEventElement(ev) {
  const wrapper = document.createElement("article");
  wrapper.className = "event " + ((ev.side === "right") ? "right" : "left");
  if (ev.id) wrapper.dataset.id = ev.id;

  const type = (ev.type || "").toLowerCase();
  if (type) wrapper.classList.add(`type-${type}`);
  if (type === "fainted") wrapper.classList.add("fainted");

 // Determine failed / illegal flags (flexible checks, backwards-compatible)
  const isFailed = Boolean(
    ev.failed === true ||
    (ev.flags && ev.flags.failed === true) ||
    (type === "failed") ||
    ev.failedEncounter === true ||
    (ev.pokemon && ev.pokemon.failed === true)
  );

  const isIllegal = Boolean(
    ev.illegal === true ||
    (ev.flags && ev.flags.illegal === true) ||
    (type === "illegal") ||
    ev.illegalEncounter === true ||
    (ev.pokemon && ev.pokemon.illegal === true)
  );

  // Priority: failed wins over illegal (change if you want opposite)
  if (isFailed) {
    wrapper.classList.add("failed");
  } else if (isIllegal) {
    wrapper.classList.add("illegal");
  }

  // Header
  const header = document.createElement("div");
  header.className = "event-header";
  const level = ev.pokemon?.level ?? ev.level;
  if (type === "caught") {
    if (isFailed) {
      header.textContent = level ? `Failed to catch (Level ${level})` : "Failed to catch";
  }   else {
        header.textContent = level ? `Caught at Level ${level}` : "Caught";
      }
  }
  else if (type === "fainted") header.textContent = "Fainted";
  else if (type === "evolved" || type === "evolution") header.textContent = level ? `Evolved at Level ${level}` : "Evolved";
  else if (type === "badge") header.textContent = "Badge earned";
  else header.textContent = ev.type ? capitalize(ev.type) : "Event";

  // If illegal and no special ribbon/special label planned, set the illegal ribbon now.
  // (We check ev.special — if markSpecialEvent runs later it may override. This preserves
  // illegal ribbon only when there's no other special label.)
    // If failed (highest priority) -> show Failed ribbon unless event has explicit special label
  if (isFailed && !ev.special) {
    header.setAttribute("data-ribbon", "Failed Encounter");
  }
  // Otherwise if illegal (and no special) -> show Illegal ribbon
  else if (isIllegal && !ev.special) {
    header.setAttribute("data-ribbon", "Illegal Encounter");
  }
  wrapper.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "event-body";

  const visual = document.createElement("div");
  visual.className = "visual";

  // Visual content (sprite / badge / evolution preview)
  if (type === "evolved" || type === "evolution") {
    const fromName = ev.from || ev.pokemon?.from || ev.pokemon?.before || ev.pokemon?.species || "";
    const toName = ev.to || ev.pokemon?.to || ev.pokemon?.after || ev.pokemon?.species || "";
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
    const speciesName = ev.pokemon?.species || ev.species || "";
    const spriteImg = document.createElement("img");
    spriteImg.className = "sprite";
    spriteImg.alt = speciesName || "pokemon";
    const sUrl = spriteUrlFor(speciesName);
    if (sUrl) spriteImg.src = sUrl;
    attachPlaceholderOnErrorOrNull(spriteImg, speciesName, sUrl);
    visual.appendChild(spriteImg);
  }

  // Text column
  const text = document.createElement("div");
  text.className = "item-body";

  // small helper: species + gender icon fragment (icon placed BEFORE species)
  function makeSpeciesFragment(speciesText, genderRaw) {
    const frag = document.createDocumentFragment();
    if (speciesText == null) speciesText = "";

    const g = (typeof genderRaw === "string") ? genderRaw.trim().toLowerCase() : "";
    const isFemale = (g === "f" || g === "female");
    const isMale = (g === "m" || g === "male");

    if (isFemale || isMale) {
      const icon = document.createElement("span");
      icon.className = "gender-icon " + (isFemale ? "female" : "male");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = isFemale ? "♀" : "♂";
      icon.title = isFemale ? "Female" : "Male";
      frag.appendChild(icon);
      frag.appendChild(document.createTextNode(" "));
    }
    frag.appendChild(document.createTextNode(speciesText));
    return frag;
  }

  const speciesNick = document.createElement("div");
  speciesNick.className = "species-nick";

  if (type === "evolved" || type === "evolution") {
    const fromName = ev.from || ev.pokemon?.from || ev.pokemon?.before || ev.pokemon?.species || "";
    const toName = ev.to || ev.pokemon?.to || ev.pokemon?.after || ev.pokemon?.species || "";
    const nick = ev.pokemon?.nickname || ev.nickname;

    if (fromName && toName) {
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode(fromName));
      frag.appendChild(document.createTextNode(" → "));
      frag.appendChild(makeSpeciesFragment(toName, ev.pokemon?.gender));
      if (nick) frag.appendChild(document.createTextNode(" • Named after " + nick));
      speciesNick.appendChild(frag);
    } else {
      if (ev.pokemon?.species) {
        const frag = makeSpeciesFragment(ev.pokemon.species, ev.pokemon?.gender);
        speciesNick.appendChild(frag);
        if (ev.pokemon?.nickname) speciesNick.appendChild(document.createTextNode(" • Named after " + ev.pokemon.nickname));
      } else {
        speciesNick.textContent = "";
      }
    }
  } else {
    const species = ev.pokemon?.species || ev.species || "";
    const nickname = ev.pokemon?.nickname;
    if (species) {
      const frag = makeSpeciesFragment(species, ev.pokemon?.gender);
      speciesNick.appendChild(frag);
      if (nickname) speciesNick.appendChild(document.createTextNode(" → Named after " + nickname));
    } else {
      speciesNick.textContent = "";
    }
  }

  if (speciesNick.textContent || speciesNick.childNodes.length) text.appendChild(speciesNick);

  // Obtained / died / location + timecode link
  const obtainedLine = document.createElement("div");
  obtainedLine.className = "obtained-line";
  const location = ev.location || ev.obtained || ev.obtainedVia || ev.method || ev.fromLocation || "";
  let locLabel = "Obtained via:";
  if (type === "fainted") locLabel = "Died at:";
  else if (type === "badge") locLabel = "Obtained at:";
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

  if (ev.notes) {
    const notes = document.createElement("div");
    notes.className = "item-notes";
    notes.textContent = ev.notes;
    text.appendChild(notes);
  }

  body.appendChild(visual);
  body.appendChild(text);
  wrapper.appendChild(body);
  return wrapper;
}

/* ============================
   markSpecialEvent - ribbon placed on header (data-ribbon)
   simple: sets .special class and header data-ribbon; no floating DOMs
   ============================ */
function markSpecialEvent(ev, el, opts = {}) {
  if (!ev || !el) return;
  const highlightName = opts.highlightName || "Luc";

  // Determine label
  let specialLabel = null;
  if (typeof ev.special === "string") specialLabel = ev.special;
  else if (typeof ev.special === "object" && ev.special !== null) {
    if (ev.special.label) specialLabel = ev.special.label;
  } else if (ev.special === true) {
    specialLabel = ev.pokemon?.nickname || `Named after ${highlightName}`;
  } else {
    return;
  }
  if (!specialLabel) specialLabel = ev.pokemon?.nickname || `Named after ${highlightName}`;

  // Add class
  el.classList.add("special");

  // Put ribbon text on the header element via data-ribbon
  const headerEl = el.querySelector(".event-header");
  if (headerEl) {
    headerEl.setAttribute("data-ribbon", specialLabel);
    headerEl.style.position = headerEl.style.position || "relative";
  }

  // Accessibility: a short aria label
  el.setAttribute("aria-label", `${specialLabel} — special event`);
}

/* ============================
   Episode expand/collapse helpers
   ============================ */
function toggleEpisodeSection(runId, episode, expand) {
  const section = document.querySelector(`.episode-section[data-episode="${episode}"]`);
  if (!section) return;
  const banner = section.querySelector(".episode-banner");
  const contents = section.querySelector(".episode-contents");
  if (!banner || !contents) return;

  const isExpanded = banner.getAttribute("aria-expanded") === "true";
  let willExpand = (typeof expand === "boolean") ? expand : !isExpanded;

  banner.setAttribute("aria-expanded", willExpand ? "true" : "false");
  if (willExpand) {
    contents.classList.remove("collapsed");
    contents.setAttribute("aria-hidden", "false");
    const full = contents.scrollHeight;
    contents.style.maxHeight = (full > 0 ? full + "px" : "2000px");
    // ensure overflow visible so ribbon visible
    contents.style.overflow = "visible";
  } else {
    contents.style.maxHeight = "0px";
    contents.classList.add("collapsed");
    contents.setAttribute("aria-hidden", "true");
    // while collapsed, hide overflow to be spoiler-safe
    contents.style.overflow = "hidden";
  }

  const map = loadCollapsedMap(runId);
  if (!willExpand) map.add(Number(episode));
  else map.delete(Number(episode));
  saveCollapsedMap(runId, map);
}

/* Expand/Collapse all */
function setAllCollapsed(runId, collapsed) {
  const sections = document.querySelectorAll(`.episode-section`);
  const map = loadCollapsedMap(runId);
  if (collapsed) {
    sections.forEach(sec => {
      const ep = Number(sec.dataset.episode);
      toggleEpisodeSection(runId, ep, false);
      map.add(ep);
    });
  } else {
    sections.forEach(sec => {
      const ep = Number(sec.dataset.episode);
      toggleEpisodeSection(runId, ep, true);
      map.delete(ep);
    });
  }
  saveCollapsedMap(runId, map);
}

/* ============================
   Episode selector helpers
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
  if (jumpBtn) {
    jumpBtn.onclick = () => {
      const val = sel.value;
      if (!val) return;
      const anchor = `episode-${val}`;
      toggleEpisodeSection(CURRENT_RUN_ID || DEFAULT_RUN_ID, Number(val), true);
      history.replaceState(null, "", `#${anchor}`);
      setTimeout(() => {
        const target = document.getElementById(`episode-contents-${val}`);
        if (!target) return;
        const top = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
        window.scrollTo({ top, behavior: "smooth" });
      }, 90);
    };
  }
}

/* ============================
   Permalink parsing & handling
   ============================ */
function parseHashAnchorAndParams() {
  const params = new URLSearchParams(window.location.search || "");
  const rawHash = (window.location.hash || "").replace(/^#/, "");
  if (!rawHash) return { anchor: null, params };
  const qIdx = rawHash.indexOf("?");
  let anchor = rawHash;
  if (qIdx !== -1) {
    anchor = rawHash.substring(0, qIdx);
    const hashQuery = rawHash.substring(qIdx + 1);
    const hashParams = new URLSearchParams(hashQuery);
    for (const [k, v] of hashParams.entries()) params.set(k, v);
  }
  return { anchor, params };
}
function handlePermalinkOnLoad() {
  const { anchor, params } = parseHashAnchorAndParams();
  const expandAndScroll = (episodeNum, shouldExpand) => {
    toggleEpisodeSection(CURRENT_RUN_ID || DEFAULT_RUN_ID, episodeNum, Boolean(shouldExpand));
    setTimeout(() => {
      // scroll to banner position
      const banner = document.querySelector(`.episode-section[data-episode="${episodeNum}"] .episode-banner`);
      const target = banner || document.getElementById(`episode-contents-${episodeNum}`);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
    }, 120);
  };

  if (anchor && anchor.startsWith("episode-")) {
    const m = /^episode-(\d+)$/.exec(anchor);
    if (m) {
      const ep = Number(m[1]);
      const spoilerParam = params.get("spoiler");
      const shouldExpand = (spoilerParam === "0") ? false : true;
      expandAndScroll(ep, shouldExpand);
      return;
    }
  }

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
   Render timeline (full)
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
    populateEpisodeSelector([]);
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

  // persisted collapsed map
  const runKey = CURRENT_RUN_ID || DEFAULT_RUN_ID;
  const persisted = loadCollapsedMap(runKey);
  const hasPersisted = (localStorage.getItem(COLLAPSED_KEY_PREFIX + runKey) !== null);

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

    // Banner
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

    const controls = document.createElement("div");
    controls.className = "controls";

    const permBtn = document.createElement("button");
    permBtn.className = "permalink";
    permBtn.title = "Click: copy expanded link — Shift+Click: copy spoiler-safe (collapsed) link";
    permBtn.innerHTML = "🔗";
    permBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const anchor = `episode-${ep}`;
      const base = location.origin + location.pathname + location.search;
      const expandedUrl = base + `#${anchor}`;
      const safeUrl = base + `#${anchor}?spoiler=0`;
      const toCopy = e.shiftKey ? safeUrl : expandedUrl;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(toCopy).then(() => {
          const prev = permBtn.textContent;
          permBtn.textContent = "✓";
          setTimeout(() => permBtn.textContent = prev, 1200);
        }).catch(() => alert("Copy this link: " + toCopy));
      } else {
        try { window.prompt("Copy link (Ctrl+C / Cmd+C):", toCopy); } catch (err) { alert("Copy this link: " + toCopy); }
      }
    });
    controls.appendChild(permBtn);

    const chev = document.createElement("span");
    chev.className = "chev";
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = "▾";
    controls.appendChild(chev);

    banner.appendChild(controls);
    banner.addEventListener("click", () => toggleEpisodeSection(runKey, ep));
    banner.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggleEpisodeSection(runKey, ep); } });

    section.appendChild(banner);

    // contents
    const contents = document.createElement("div");
    contents.className = "episode-contents";
    contents.id = `episode-contents-${ep}`;
    if (!isExpanded) {
      contents.classList.add("collapsed");
      contents.setAttribute("aria-hidden", "true");
      contents.style.maxHeight = "0px";
      contents.style.overflow = "hidden";
    } else {
      contents.setAttribute("aria-hidden", "false");
      contents.style.overflow = "visible";
    }

    const epEvents = episodesMap.get(ep) || [];
    for (const ev of epEvents) {
      const evType = (ev.type || "").toLowerCase();
      if (["run_end","runended","run_ended","end"].includes(evType)) {
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
      if (typeof markSpecialEvent === "function") markSpecialEvent(ev, el, { highlightName: "Luc" });
      contents.appendChild(el);
    }

    section.appendChild(contents);
    container.appendChild(section);
    episodesArr.push({ episode: ep, date: epDate || "" });

    if (isExpanded) {
      requestAnimationFrame(() => {
        const h = contents.scrollHeight;
        contents.style.maxHeight = (h > 0 ? h + "px" : "2000px");
      });
    }
  }

  populateEpisodeSelector(episodesArr);
  ensureExpandCollapseControls();
  handlePermalinkOnLoad();
}

/* ============================
   Expand/Collapse controls creation (only if not present)
   ============================ */
function ensureExpandCollapseControls() {
  // If manual controls exist in HTML, just attach listeners
  const expandBtnManual = document.getElementById("expand-all");
  const collapseBtnManual = document.getElementById("collapse-all");
  if (expandBtnManual && collapseBtnManual) {
    expandBtnManual.onclick = () => setAllCollapsed(CURRENT_RUN_ID || DEFAULT_RUN_ID, false);
    collapseBtnManual.onclick = () => setAllCollapsed(CURRENT_RUN_ID || DEFAULT_RUN_ID, true);
    return;
  }

  // Otherwise inject into .controls container (last position)
  const controlsSection = document.querySelector(".controls") || document.querySelector("section.controls");
  if (!controlsSection) return;
  // don't duplicate
  if (document.getElementById("expand-all") || document.getElementById("collapse-all")) return;

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.gap = "8px";
  wrapper.style.marginLeft = "8px";

  const expandAll = document.createElement("button");
  expandAll.id = "expand-all";
  expandAll.textContent = "Expand all";
  expandAll.className = "small-control";
  expandAll.addEventListener("click", () => setAllCollapsed(CURRENT_RUN_ID || DEFAULT_RUN_ID, false));

  const collapseAll = document.createElement("button");
  collapseAll.id = "collapse-all";
  collapseAll.textContent = "Collapse all";
  collapseAll.className = "small-control";
  collapseAll.addEventListener("click", () => setAllCollapsed(CURRENT_RUN_ID || DEFAULT_RUN_ID, true));

  wrapper.appendChild(expandAll);
  wrapper.appendChild(collapseAll);
  controlsSection.appendChild(wrapper);
}

/* ============================
   Run details population
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

  // run ended meta indicator (optional)
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
  container.hidden = false;
}

/* ============================
   Rules panel & Back-to-top
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
  document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) closePanel(); });
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
   Load and display run
   ============================ */
async function loadAndDisplayRun(runId) {
  if (!runId) runId = DEFAULT_RUN_ID;
  CURRENT_RUN_ID = runId;

  const allEvents = await fetchRunEvents(runId);
  const filterType = document.getElementById("filter-type")?.value || "all";
  const q = (document.getElementById("search")?.value || "").trim().toLowerCase();

  let events = allEvents.slice();
  if (filterType && filterType !== "all") events = events.filter(e => (e.type || "").toLowerCase() === filterType.toLowerCase());
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
   Init (wiring)
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
  // debounce search input to reduce re-renders
  let searchTimer = null;
  document.getElementById("search")?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadAndDisplayRun(runSel.value), 240);
  });

  // choose initial run: ?run=run-X OR DEFAULT_RUN_ID OR first in index
  const params = new URLSearchParams(location.search);
  const runParam = params.get("run");
  const initial = (runParam && runs.find(r => r.id === runParam)?.id) || DEFAULT_RUN_ID || runs[0]?.id || DEFAULT_RUN_ID;
  if (runSel) runSel.value = initial;
  await loadAndDisplayRun(initial);

  // reposition ribbons on resize (data-ribbon is pseudo-element so no reposition function needed)
  window.addEventListener("resize", () => requestAnimationFrame(() => {}));
}

/* ============================
   Start
   ============================ */
document.addEventListener("DOMContentLoaded", init);
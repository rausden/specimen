/* SPECIMEN — the index. Vanilla JS, no build step.
   Reads data/atlas.json (the Atlas), data/cards.json (what the robot found) and
   /api/shortlist (Ryan's stars). Everything on screen is a filter over one list;
   the grid is windowed so eleven thousand cards scroll like a hundred. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("en-GB");
  const icon = (name, fill) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="1.5"'}>${(window.ICONS || {})[name] || ""}</svg>`;
  const ATLAS = "https://type-atlas.xyz";
  // Published copy: no server behind it. Stars live in this browser, and there is no
  // robot to wait for, so the 20-second poll would just re-download the index forever.
  const STATIC = !!window.SPECIMEN_STATIC;
  const STORE = "specimen.shortlist";

  const S = { tab: "typefaces", letter: "", sort: "az", view: "grid", size: "m", q: "", hasCard: false, trial: false, free: false, variable: false,
    years: new Set(), dist: new Set(), regions: new Set(), tags: new Set(), foundry: "", designer: "", short: false, sel: "", hover: "" };
  let A = null, C = {}, SL = { slugs: [], notes: {} }, starred = new Set();
  const F = new Map(), D = new Map(), T = new Map(), TAG = new Map();
  let list = [], px = 1, robotDone = false;
  const stage = $("#scroll"), canvas = $("#canvas"), head = $("#head"), side = $("#side"), insp = $("#insp"), foot = $("#foot");

  const LETTERS = ["0-9", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
  const letterOf = (name) => { const c = (name || "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "")[0] || "#"; if (/[0-9]/.test(c)) return "0-9"; const u = c.toUpperCase(); return /[A-Z]/.test(u) ? u : "#"; };
  const card = (slug) => C[slug];
  const hasCard = (slug) => !!(C[slug] && C[slug].s === "ok");
  // variable: what the foundry's own page says (the word, or real axis tags).
  // A stylesheet clue alone is not trusted — most foundry sites set their OWN interface in a variable font.
  const isVar = (slug) => { const c = C[slug]; return !!(c && /says|axes/.test(c.v || "")); };
  const varKnown = () => Object.values(C).some((r) => r.v !== undefined);
  const src = (slug) => `data/cards/${slug}.webp?${C[slug].at || 0}`;
  const stateLabel = (c) => !c ? "queued" : ({ blocked: "site blocks robots", blank: "no picture found", gone: "page gone", timeout: "didn't load", error: "didn't load" })[c.s] || "queued";
  const inUse = (name) => "https://fontsinuse.com/search?terms=" + encodeURIComponent(name);

  const readLocal = () => { try { return JSON.parse(localStorage.getItem(STORE)) || { slugs: [], notes: {} }; } catch { return { slugs: [], notes: {} }; } };
  const writeLocal = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} };

  // ---- load --------------------------------------------------------------
  async function load() {
    const [atlas, cards, short] = await Promise.all([
      fetch("data/atlas.json").then((r) => r.json()),
      fetch("data/cards.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      STATIC ? Promise.resolve(readLocal()) : fetch("/api/shortlist").then((r) => r.json()).catch(() => ({ slugs: [], notes: {} })),
    ]);
    A = atlas; C = cards || {}; SL = short || { slugs: [], notes: {} }; starred = new Set(SL.slugs || []);
    for (const f of A.foundries) { f.letter = letterOf(f.name); F.set(f.slug, f); }
    for (const d of A.designers) { d.letter = letterOf(d.name); D.set(d.slug, d); }
    for (const t of A.tags) TAG.set(t.slug, t);
    for (const t of A.typefaces) {
      t.letter = letterOf(t.name);
      // a typeface can belong to several foundries; the first is the one the card names
      if (!t.foundries || !t.foundries.length) t.foundries = t.foundry ? [t.foundry] : [];
      t.fnames = t.foundries.map((s) => F.get(s)?.name || s);
      t.fname = F.get(t.foundry)?.name || t.foundryName || t.fnames[0] || "";
      t.dnames = (t.designers || []).map((d) => D.get(d)?.name || d);
      t.regions = [...new Set(t.foundries.map((s) => F.get(s)?.region || ""))];
      t.key = (t.name + " " + t.fnames.join(" ") + " " + t.dnames.join(" ")).toLowerCase();
      T.set(t.slug, t);
    }
    readHash();
    renderSide(); wire(); compute(); renderFoot(); renderInsp();
    poll();
  }

  // ---- the one list -----------------------------------------------------
  const byName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  const SORTS = {
    az: byName,
    year: (a, b) => (b.year || 0) - (a.year || 0) || byName(a, b),
    foundry: (a, b) => a.fname.localeCompare(b.fname, "en", { sensitivity: "base" }) || byName(a, b),
    cards: (a, b) => (hasCard(b.slug) - hasCard(a.slug)) || byName(a, b),
    count: (a, b) => (b.count || 0) - (a.count || 0) || byName(a, b),
  };
  function compute() {
    const q = S.q.trim().toLowerCase();
    if (S.tab === "typefaces") {
      list = A.typefaces.filter((t) => (!S.letter || t.letter === S.letter) && (!q || t.key.includes(q))
        && (!S.hasCard || hasCard(t.slug)) && (!S.trial || (C[t.slug] && C[t.slug].t)) && (!S.free || (C[t.slug] && C[t.slug].f)) && (!S.variable || isVar(t.slug))
        && (!S.years.size || S.years.has(t.year)) && (!S.dist.size || t.dist.some((d) => S.dist.has(d)))
        && (!S.regions.size || t.regions.some((r) => S.regions.has(r))) && (!S.tags.size || t.tags.some((x) => S.tags.has(x)))
        && (!S.foundry || t.foundries.includes(S.foundry)) && (!S.designer || t.designers.includes(S.designer)) && (!S.short || starred.has(t.slug)));
      list.sort(SORTS[S.sort] || byName);
    } else if (S.tab === "foundries") {
      list = A.foundries.filter((f) => (!S.letter || f.letter === S.letter) && (!q || (f.name + " " + f.location).toLowerCase().includes(q)) && (!S.regions.size || S.regions.has(f.region || "")));
      list.sort(S.sort === "count" ? SORTS.count : S.sort === "year" ? (a, b) => (b.founded || 0) - (a.founded || 0) || byName(a, b) : byName);
    } else {
      list = A.designers.filter((d) => (!S.letter || d.letter === S.letter) && (!q || d.name.toLowerCase().includes(q)));
      list.sort(S.sort === "count" ? SORTS.count : byName);
    }
    writeHash(); renderHead(); syncSide(); relayout();
  }

  // ---- windowed stage ---------------------------------------------------
  const GAP = 12, CARD = { s: 170, m: 230, l: 340 };   // min card width at 1×; 4 / 3 / 2 columns at 1280, 5 / 3 / 2 at 1920
  let L = { cols: 1, rowH: 100, gap: 12 };
  const rendered = new Map();
  function relayout() {
    px = ($("#probe").offsetWidth / 100) || 1;
    const w = stage.clientWidth, gap = GAP * px;
    if (S.tab !== "typefaces") L = { cols: 1, rowH: 64 * px + 1, gap: 0, lines: true };
    else if (S.view === "list") L = { cols: 1, rowH: 40 * px + 1, gap: 0, lines: true };
    else { const cols = Math.max(1, Math.floor((w - gap) / (CARD[S.size] * px + gap))); const cw = (w - gap * (cols + 1)) / cols; L = { cols, rowH: cw * 10 / 16 + 47 * px + gap, gap, lines: false }; }
    canvas.style.height = Math.max(1, Math.ceil(list.length / L.cols) * L.rowH + L.gap + 24 * px) + "px";
    for (const el of rendered.values()) el.remove(); rendered.clear();
    stage.scrollTop = 0;
    paint(true);
  }
  function paint(measureRow) {
    const { cols, rowH, gap } = L;
    const top = stage.scrollTop, h = stage.clientHeight;
    const last = Math.ceil(list.length / cols) - 1;
    const r0 = Math.max(0, Math.floor(top / rowH) - 1), r1 = Math.min(last, Math.ceil((top + h) / rowH) + 1);
    for (const [r, el] of rendered) if (r < r0 || r > r1) { el.remove(); rendered.delete(r); }
    canvas.querySelector(".sp-empty")?.remove();
    if (!list.length) { canvas.insertAdjacentHTML("beforeend", `<div class="sp-empty">Nothing here.<br>Clear a filter or two.</div>`); return; }
    for (let r = r0; r <= r1; r++) {
      if (rendered.has(r)) continue;
      const el = document.createElement("div");
      el.className = "sp-row" + (L.lines ? " lines" : "");
      el.style.top = gap + r * rowH + "px";
      el.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      if (L.lines) { el.style.gap = "0"; el.style.padding = `0 ${12 * px}px`; }
      el.innerHTML = list.slice(r * cols, r * cols + cols).map(renderItem).join("");
      canvas.appendChild(el); rendered.set(r, el);
    }
    if (measureRow && !L.lines) { // cards self-correct their row height after the first paint
      const c = canvas.querySelector(".sp-card");
      if (c) { const want = c.offsetHeight + gap; if (Math.abs(want - L.rowH) > 1) { L.rowH = want; canvas.style.height = Math.ceil(list.length / cols) * L.rowH + gap + 24 * px + "px"; for (const el of rendered.values()) el.remove(); rendered.clear(); paint(false); } }
    }
  }
  function repaint() { for (const el of rendered.values()) el.remove(); rendered.clear(); paint(false); }
  function renderItem(x) {
    if (S.tab === "foundries") return renderFoundry(x);
    if (S.tab === "designers") return renderDesigner(x);
    const t = x, c = C[t.slug], ok = hasCard(t.slug), on = S.sel === t.slug ? " on" : "", st = starred.has(t.slug) ? " starred" : "";
    const badges = `${t.year ? `<span>${t.year}</span>` : ""}${c && c.t ? `<span class="tr">Trial</span>` : ""}${c && c.f ? `<span class="fr">Free</span>` : ""}${isVar(t.slug) ? `<span class="vr">Var</span>` : ""}`;
    if (S.view === "list") return `<div class="sp-line${on}${st}" data-slug="${t.slug}">
      <div class="th${ok ? "" : " none"}">${ok ? `<img src="${src(t.slug)}" loading="lazy" decoding="async" alt="">` : ""}</div>
      <span class="n">${esc(t.name)}</span><span class="c">${esc(t.fname)}</span><span class="c">${esc(t.dnames.join(", "))}</span>
      <span class="y">${t.year || ""}</span><span class="e">${c && c.t ? `<span class="tr">Trial</span>` : ""}${c && c.f ? " Free" : ""}</span>
      <button class="star" data-star="${t.slug}" title="Shortlist">${icon("star.fill", true)}</button></div>`;
    return `<figure class="sp-card${on}${st}" data-slug="${t.slug}" data-size="${S.size}">
      ${ok ? `<div class="sp-img"><img src="${src(t.slug)}" loading="lazy" decoding="async" alt=""></div>` : `<div class="sp-img none"><b>${esc(t.name)}</b><i>${stateLabel(c)}</i></div>`}
      <button class="star" data-star="${t.slug}" title="Shortlist">${icon("star.fill", true)}</button>
      <figcaption><span class="n">${esc(t.name)}</span><span class="f">${esc(t.fname)}</span><span class="e">${badges}</span></figcaption></figure>`;
  }
  const stripOf = (faces) => faces.filter((t) => hasCard(t.slug)).slice(0, 4).map((t) => `<i><img src="${src(t.slug)}" loading="lazy" decoding="async" alt=""></i>`).join("");
  function renderFoundry(f) {
    const faces = A.typefaces.filter((t) => t.foundries.includes(f.slug));
    return `<div class="sp-frow" data-foundry="${f.slug}"><span class="n">${esc(f.name)}<small>${esc(f.domain || "")}</small></span>
      <span class="c">${esc(f.location || "")}</span><span class="y">${f.founded || ""}</span><span class="k">${f.count || 0}</span><span class="strip">${stripOf(faces)}</span></div>`;
  }
  function renderDesigner(d) {
    const faces = A.typefaces.filter((t) => t.designers.includes(d.slug));
    const foundries = [...new Set(faces.map((t) => t.fname))].slice(0, 3).join(", ");
    return `<div class="sp-frow" data-designer="${d.slug}"><span class="n">${esc(d.name)}<small>${esc(foundries)}</small></span>
      <span class="c"></span><span class="y"></span><span class="k">${d.count || 0}</span><span class="strip">${stripOf(faces)}</span></div>`;
  }

  // ---- head: the readout and the chips -----------------------------------
  function renderHead() {
    const what = S.tab === "typefaces" ? "typefaces" : S.tab;
    const chips = [];
    const chip = (label, val, undo) => chips.push({ label, val, undo });
    if (S.letter) chip("", S.letter, () => (S.letter = ""));
    if (S.q.trim()) chip("search", S.q.trim(), () => { S.q = ""; $("#q").value = ""; });
    if (S.foundry) chip("foundry", F.get(S.foundry)?.name || S.foundry, () => (S.foundry = ""));
    if (S.designer) chip("designer", D.get(S.designer)?.name || S.designer, () => (S.designer = ""));
    for (const y of S.years) chip("year", y, () => S.years.delete(y));
    for (const d of S.dist) chip("via", d, () => S.dist.delete(d));
    for (const r of S.regions) chip("region", r || "Unspecified", () => S.regions.delete(r));
    for (const t of S.tags) chip("tag", TAG.get(t)?.name || t, () => S.tags.delete(t));
    if (S.hasCard) chip("", "Has a card", () => (S.hasCard = false));
    if (S.trial) chip("", "Trial available", () => (S.trial = false));
    if (S.free) chip("", "Free / open", () => (S.free = false));
    if (S.variable) chip("", "Variable", () => (S.variable = false));
    if (S.short) chip("", "Shortlist", () => (S.short = false));
    head.innerHTML = `<span class="n"><b>${fmt(list.length)}</b> ${what}</span><div class="sp-chips">${chips.map((c, i) => `<button class="sp-chip" data-chip="${i}">${c.label ? `<small>${esc(c.label)}</small>` : ""}${esc(c.val)}${icon("xmark")}</button>`).join("")}</div>${chips.length ? `<button class="sp-clear" data-clear>Clear all</button>` : ""}`;
    head.querySelectorAll("[data-chip]").forEach((b) => b.addEventListener("click", () => { chips[+b.dataset.chip].undo(); compute(); }));
    head.querySelector("[data-clear]")?.addEventListener("click", () => { clearFilters(); compute(); });
  }
  function clearFilters() { Object.assign(S, { letter: "", q: "", foundry: "", designer: "", hasCard: false, trial: false, free: false, variable: false, short: false }); S.years.clear(); S.dist.clear(); S.regions.clear(); S.tags.clear(); $("#q").value = ""; }

  // ---- side rail ---------------------------------------------------------
  const sec = (id, title, glyph, body, cls = "") => `<section class="pr-sec ${cls}" data-sec="${id}"><div class="pr-head" data-toggle><span class="g">${icon(glyph)}</span><span class="t">${title}</span><span class="disc">–</span></div>${body}</section>`;
  const item = (kind, key, name, count, sub = "") => `<div class="pr-item" data-${kind}="${esc(key)}"><span></span><span class="t">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ""}</span><span class="meta">${fmt(count)}</span></div>`;
  const check = (key, label) => `<label class="pr-check" data-check="${key}"><i></i><span>${label}</span></label>`;
  function renderSide() {
    const years = new Map(); for (const t of A.typefaces) if (t.year) years.set(t.year, (years.get(t.year) || 0) + 1);
    const yearRows = [...years].sort((a, b) => b[0] - a[0]).map(([y, n]) => item("year", y, y, n)).join("");
    const regions = new Map(); for (const t of A.typefaces) { const r = F.get(t.foundry)?.region || ""; regions.set(r, (regions.get(r) || 0) + 1); }
    const regionRows = [...regions].sort((a, b) => b[1] - a[1]).map(([r, n]) => item("region", r, r || "Unspecified", n)).join("");
    const distRows = A.distributors.filter((d) => d.count).sort((a, b) => b.count - a.count).map((d) => item("dist", d.name, d.name, d.count)).join("");
    const tagRows = A.tags.map((t) => item("tag", t.slug, t.name, t.count)).join("");
    side.innerHTML =
      sec("index", "Index", "list.bullet", `<div class="pr-rows"><div class="sp-letters"><button class="all" data-letter="">All</button>${LETTERS.map((l) => `<button data-letter="${l}">${l}</button>`).join("")}</div></div>`) +
      sec("sort", "Sort", "rectangle.split.1x3", `<div class="pr-rows"><div class="pr-seg full" id="sort"><button data-sort="az">A–Z</button><button data-sort="year">Year</button><button data-sort="foundry">Foundry</button><button data-sort="cards">Cards</button></div><div class="pr-seg full" id="sortF"><button data-sort="az">A–Z</button><button data-sort="count">Most faces</button><button data-sort="year">Founded</button></div></div>`) +
      sec("show", "Show", "eye", `<div class="pr-rows">${check("hasCard", "Has a card")}${check("trial", "Trial available")}${check("free", "Free / open")}${check("variable", "Variable")}${check("short", "Shortlist only")}</div>`) +
      sec("year", "Year", "circle.circle", `<div class="pr-list sp-scrolls">${yearRows}</div>`, "closed") +
      sec("dist", "Distributor", "square.3.layers.3d", `<div class="pr-list">${distRows}</div>`) +
      sec("region", "Region", "camera.aperture", `<div class="pr-list sp-scrolls tall">${regionRows}</div>`, "closed") +
      sec("tags", "Tags", "square.grid.2x2", `<div class="pr-list sp-scrolls tall">${tagRows}</div>`, "closed") +
      sec("short", "Shortlist", "star.fill", `<div class="pr-rows"><div class="pr-row nolabel"><span class="k"></span><span class="w start" id="shortCount"></span></div></div><div class="pr-actions"><button class="pr-btn" data-act="copy">Copy list</button><button class="pr-btn" data-act="showShort">Show only</button></div>`);
    side.querySelectorAll("[data-toggle]").forEach((h) => h.addEventListener("click", () => { const s = h.parentElement; s.classList.toggle("closed"); h.querySelector(".disc").textContent = s.classList.contains("closed") ? "+" : "–"; }));
    side.querySelectorAll(".pr-sec.closed .disc").forEach((d) => (d.textContent = "+"));
    side.addEventListener("click", (e) => {
      const b = e.target.closest("[data-letter],[data-sort],[data-check],[data-year],[data-dist],[data-region],[data-tag],[data-act]"); if (!b) return;
      const toggle = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
      if (b.dataset.letter !== undefined) S.letter = b.dataset.letter;
      else if (b.dataset.sort) S.sort = b.dataset.sort;
      else if (b.dataset.check) S[b.dataset.check] = !S[b.dataset.check];
      else if (b.dataset.year) toggle(S.years, +b.dataset.year);
      else if (b.dataset.dist) toggle(S.dist, b.dataset.dist);
      else if (b.dataset.region !== undefined) toggle(S.regions, b.dataset.region);
      else if (b.dataset.tag) toggle(S.tags, b.dataset.tag);
      else if (b.dataset.act === "copy") return copyShortlist();
      else if (b.dataset.act === "showShort") S.short = !S.short;
      compute();
    });
  }
  function syncSide() {
    const tf = S.tab === "typefaces", fo = S.tab === "foundries";
    side.querySelectorAll("[data-letter]").forEach((b) => b.classList.toggle("on", b.dataset.letter === S.letter));
    $("#sort").hidden = !tf; $("#sortF").hidden = tf;
    side.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("on", b.dataset.sort === S.sort));
    side.querySelectorAll("[data-check]").forEach((b) => b.classList.toggle("on", !!S[b.dataset.check]));
    side.querySelectorAll("[data-year]").forEach((b) => b.classList.toggle("on", S.years.has(+b.dataset.year)));
    side.querySelectorAll("[data-dist]").forEach((b) => b.classList.toggle("on", S.dist.has(b.dataset.dist)));
    side.querySelectorAll("[data-region]").forEach((b) => b.classList.toggle("on", S.regions.has(b.dataset.region)));
    side.querySelectorAll("[data-tag]").forEach((b) => b.classList.toggle("on", S.tags.has(b.dataset.tag)));
    for (const id of ["show", "year", "dist", "tags", "short"]) side.querySelector(`[data-sec="${id}"]`).hidden = !tf;
    side.querySelector('[data-sec="region"]').hidden = !(tf || fo);
    $("#shortCount").innerHTML = `<span class="num">${fmt(starred.size)}</span>&nbsp; starred`;
    side.querySelector('[data-act="showShort"]').classList.toggle("primary", S.short);
    $("#view").hidden = !tf; $("#size").hidden = !(tf && S.view === "grid");
  }

  // ---- inspector ---------------------------------------------------------
  function renderInsp() {
    const slug = S.sel || S.hover, t = slug && T.get(slug);
    if (!t) return renderIdle();
    const c = C[t.slug], f = F.get(t.foundry), ok = hasCard(t.slug);
    const fact = (k, v) => v ? `<span class="k">${k}</span><span class="v">${v}</span>` : "";
    const link = (kind, key, label) => `<a href="#" data-pick-${kind}="${esc(key)}">${esc(label)}</a>`;
    const fams = (t.families || []).map((x) => esc(x.name) + (x.year ? ` <span class="num">${x.year}</span>` : "")).join("<br>");
    const related = (t.related || []).map((s) => T.get(s)).filter(Boolean);
    insp.innerHTML = `
      ${ok ? `<div class="sp-hero"><img src="${src(t.slug)}" alt=""><span class="mode">${c.m}${c.fs ? ` · ${c.fs}px` : ""}</span></div>` : `<div class="sp-hero none"><b>${esc(t.name)}</b><span class="mode">${stateLabel(c)}</span></div>`}
      <div class="sp-title"><b>${esc(t.name)}</b><span>${t.foundries.length ? t.foundries.map((s, i) => link("foundry", s, t.fnames[i])).join(" · ") : esc(t.fname)}${f && f.location ? ` · ${esc(f.location)}` : ""}</span></div>
      <div class="sp-facts">
        ${fact("Designer", t.designers.map((d, i) => link("designer", d, t.dnames[i])).join(", "))}
        ${fact("Year", t.year ? `<span class="num">${t.year}</span>` : "")}
        ${fact("Also via", t.dist.map((d) => esc(d)).join(", "))}
        ${fact("Region", t.regions.filter(Boolean).map(esc).join(", "))}
        ${fact("Tags", t.tags.map((x) => link("tag", x, TAG.get(x)?.name || x)).join(", "))}
        ${fact("Families", fams)}
        ${fact("Trial", c && c.t ? `<a href="${esc(c.t)}" target="_blank" rel="noopener">${esc(c.tt || "Trial fonts")}</a>` : "")}
        ${fact("Variable", isVar(t.slug) ? `Yes${c && c.vq ? ` <small title="${esc(c.vq)}">— the page says so</small>` : ""}` : "")}
      </div>
      ${t.desc ? `<p class="sp-desc">${esc(t.desc)}</p>` : ""}
      <div class="sp-actions">
        ${t.buy ? `<a class="pr-btn primary wide" href="${esc(t.buy)}" target="_blank" rel="noopener">Get fonts · ${esc(host(t.buy))}</a>` : ""}
        ${c && c.t ? `<a class="pr-btn" href="${esc(c.t)}" target="_blank" rel="noopener">Trial</a>` : ""}
        <a class="pr-btn" href="${ATLAS}/typeface/${t.slug}/" target="_blank" rel="noopener">Atlas page</a>
        <a class="pr-btn${c && c.t ? " wide" : ""}" href="${inUse(t.name)}" target="_blank" rel="noopener">Fonts in Use</a>
      </div>
      <div class="sp-note">
        <button class="pr-btn${starred.has(t.slug) ? " starred" : ""}" data-star="${t.slug}">${icon("star.fill", true)}${starred.has(t.slug) ? "On the shortlist" : "Add to shortlist"}</button>
        <textarea class="pr-field" id="note" placeholder="A note to yourself" spellcheck="false">${esc(SL.notes[t.slug] || "")}</textarea>
      </div>
      ${related.length ? `<section class="pr-sec sp-related"><div class="pr-head"><span class="t">Related</span></div><div class="pr-list">${related.map((r) => `<div class="pr-item" data-pick="${r.slug}"><span class="thumb${hasCard(r.slug) ? "" : " none"}">${hasCard(r.slug) ? `<img src="${src(r.slug)}" alt="">` : ""}</span><span class="t">${esc(r.name)}<small>${esc(r.fname)}</small></span><span class="meta">${r.year || ""}</span></div>`).join("")}</div></section>` : ""}`;
    insp.querySelectorAll("[data-pick-foundry]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); S.foundry = a.dataset.pickFoundry; S.tab = "typefaces"; setTab(); compute(); }));
    insp.querySelectorAll("[data-pick-designer]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); S.designer = a.dataset.pickDesigner; S.tab = "typefaces"; setTab(); compute(); }));
    insp.querySelectorAll("[data-pick-tag]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); S.tags.add(a.dataset.pickTag); compute(); }));
    insp.querySelectorAll("[data-pick]").forEach((a) => a.addEventListener("click", () => select(a.dataset.pick, true)));
    const note = $("#note"); let tm;
    note.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => { if (note.value.trim()) SL.notes[t.slug] = note.value.trim(); else delete SL.notes[t.slug]; saveShortlist(); }, 500); });
  }
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  function renderIdle() {
    const vals = Object.values(C), ok = vals.filter((r) => r.s === "ok").length, total = A.typefaces.filter((t) => t.buy).length;
    const pct = total ? Math.round(ok / total * 100) : 0;
    insp.innerHTML = `<div class="sp-idle">
      <div class="big">${fmt(ok)}<small>cards of ${fmt(total)} typefaces · ${pct}%</small></div>
      <div class="sp-meter"><i style="width:${pct}%"></i></div>
      <p>${robotDone ? "The robot has been through the whole Atlas." : vals.length ? "The robot is working through the Atlas. Cards appear as they land; grey cards are still queued." : "No cards yet. Run SPECIMEN-ROBOT.cmd once and leave it; this fills in by itself."}</p>
      <div class="sp-keys">
        <kbd>/</kbd><span>Search</span><kbd>↑↓←→</kbd><span>Move through the index</span><kbd>Enter</kbd><span>Open the foundry page</span><kbd>S</kbd><span>Star / unstar</span><kbd>Esc</kbd><span>Let go of the selection</span>
      </div>
      <p>Hover a card to see it here. Click to hold it. Pictures come from each foundry's own page; typing your own words needs the real file, which is GALLEY's tester once you've grabbed the trial.</p>
    </div>`;
  }
  function select(slug, pin) {
    const prev = S.sel; if (pin) S.sel = slug === S.sel ? "" : slug; else S.hover = slug;
    for (const s of [prev, slug]) canvas.querySelectorAll(`[data-slug="${s}"]`).forEach((el) => el.classList.toggle("on", s === S.sel));
    renderInsp();
  }

  // ---- shortlist ---------------------------------------------------------
  let saveT;
  function saveShortlist() {
    SL.slugs = [...starred]; clearTimeout(saveT);
    if (STATIC) { writeLocal(SL); $("#shortCount").innerHTML = `<span class="num">${fmt(starred.size)}</span>&nbsp; starred`; return; }
    saveT = setTimeout(() => fetch("/api/shortlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(SL) }).catch(() => {}), 300);
    $("#shortCount").innerHTML = `<span class="num">${fmt(starred.size)}</span>&nbsp; starred`;
  }
  function star(slug) {
    starred.has(slug) ? starred.delete(slug) : starred.add(slug); saveShortlist();
    canvas.querySelectorAll(`[data-slug="${slug}"]`).forEach((el) => el.classList.toggle("starred", starred.has(slug)));
    if ((S.sel || S.hover) === slug) renderInsp();
    if (S.short) compute();
  }
  function copyShortlist() {
    const lines = [...starred].map((s) => T.get(s)).filter(Boolean).sort(byName).map((t) => `${t.name} — ${t.fname}${t.year ? " (" + t.year + ")" : ""} — ${t.buy}${SL.notes[t.slug] ? "\n    " + SL.notes[t.slug] : ""}`);
    navigator.clipboard?.writeText(lines.join("\n")).then(() => { const b = side.querySelector('[data-act="copy"]'); b.textContent = `Copied ${lines.length}`; setTimeout(() => (b.textContent = "Copy list"), 1400); });
  }

  // ---- foot + polling ----------------------------------------------------
  function renderFoot() {
    const vals = Object.values(C), ok = vals.filter((r) => r.s === "ok").length, tr = vals.filter((r) => r.t).length, total = A.typefaces.filter((t) => t.buy).length;
    robotDone = STATIC || vals.length >= total;   // a published copy is a finished one
    const when = A.generated ? new Date(A.generated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
    foot.innerHTML = `<span><b>${fmt(A.typefaces.length)}</b> typefaces</span><span><b>${fmt(A.foundries.length)}</b> foundries</span><span><b>${fmt(ok)}</b> cards</span><span><b>${fmt(tr)}</b> trials</span>${robotDone ? "" : `<span>${vals.length ? '<i class="live"></i>robot ' + Math.round(vals.length / total * 100) + "%" : "robot not started"}</span>`}
      <span class="r"><span class="warn">${STATIC ? "Pictures are each foundry’s own page · every card links back to it" : "Cards live on this machine · the index travels by git"}</span><a href="${ATLAS}" target="_blank" rel="noopener">type-atlas.xyz</a><span>harvested ${when}</span></span>`;
  }
  async function poll() {
    if (STATIC || robotDone) return;
    setTimeout(async () => {
      try {
        const cards = await fetch("data/cards.json").then((r) => (r.ok ? r.json() : null));
        if (cards && Object.keys(cards).length !== Object.keys(C).length) { C = cards; renderFoot(); repaint(); if (!S.sel && !S.hover) renderInsp(); }
      } catch {}
      poll();
    }, 20000);
  }

  // ---- wiring --------------------------------------------------------------
  function setTab() { $("#tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab)); S.sel = ""; S.hover = ""; if (S.tab !== "typefaces" && !["az", "count", "year"].includes(S.sort)) S.sort = "az"; if (S.tab === "typefaces" && S.sort === "count") S.sort = "az"; renderInsp(); }
  function wire() {
    $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; S.tab = b.dataset.tab; S.letter = ""; setTab(); compute(); });
    $("#view").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (!b) return; S.view = b.dataset.view; $("#view").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); compute(); });
    $("#size").addEventListener("click", (e) => { const b = e.target.closest("[data-size]"); if (!b) return; S.size = b.dataset.size; $("#size").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); compute(); });
    let qt; $("#q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { S.q = $("#q").value; compute(); }, 120); });
    $("#q").addEventListener("keydown", (e) => { if (e.key === "Escape") { $("#q").value = ""; S.q = ""; compute(); $("#q").blur(); } });
    stage.addEventListener("scroll", () => requestAnimationFrame(() => paint(false)), { passive: true });
    new ResizeObserver(() => { if (A) { const cols = L.cols; relayoutKeep(); } }).observe(stage);
    canvas.addEventListener("click", (e) => {
      const st = e.target.closest("[data-star]"); if (st) { e.stopPropagation(); return star(st.dataset.star); }
      const fr = e.target.closest("[data-foundry]"); if (fr) { S.foundry = fr.dataset.foundry; S.tab = "typefaces"; S.letter = ""; setTab(); return compute(); }
      const de = e.target.closest("[data-designer]"); if (de) { S.designer = de.dataset.designer; S.tab = "typefaces"; S.letter = ""; setTab(); return compute(); }
      const el = e.target.closest("[data-slug]"); if (el) select(el.dataset.slug, true);
    });
    canvas.addEventListener("dblclick", (e) => { const el = e.target.closest("[data-slug]"); const t = el && T.get(el.dataset.slug); if (t && t.buy) window.open(t.buy, "_blank", "noopener"); });
    let ht; canvas.addEventListener("mouseover", (e) => { const el = e.target.closest("[data-slug]"); if (!el || S.sel) return; clearTimeout(ht); ht = setTimeout(() => select(el.dataset.slug, false), 60); });
    canvas.addEventListener("mouseleave", () => { if (!S.sel && S.hover) { S.hover = ""; renderInsp(); } });
    insp.addEventListener("click", (e) => { const st = e.target.closest("[data-star]"); if (st) star(st.dataset.star); });
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea")) return;
      if (e.key === "/") { e.preventDefault(); $("#q").focus(); $("#q").select(); return; }
      if (S.tab !== "typefaces") return;
      const i = list.findIndex((t) => t.slug === S.sel);
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: L.cols, ArrowUp: -L.cols }[e.key];
      if (step !== undefined) { e.preventDefault(); const j = Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + step)); if (list[j]) { select(list[j].slug, true); if (S.sel !== list[j].slug) select(list[j].slug, true); scrollToIndex(j); } return; }
      if (e.key === "Enter" && S.sel) { const t = T.get(S.sel); if (t && t.buy) window.open(t.buy, "_blank", "noopener"); }
      if ((e.key === "s" || e.key === "S") && (S.sel || S.hover)) star(S.sel || S.hover);
      if (e.key === "Escape" && S.sel) select(S.sel, true);
    });
  }
  let lastW = 0;
  function relayoutKeep() { const w = stage.clientWidth; if (w === lastW) return; lastW = w; const first = Math.floor(stage.scrollTop / L.rowH) * L.cols; relayout(); scrollToIndex(first, true); }
  function scrollToIndex(i, top) { const r = Math.floor(i / L.cols), y = L.gap + r * L.rowH; const view = stage.clientHeight; if (top) stage.scrollTop = y; else if (y < stage.scrollTop || y + L.rowH > stage.scrollTop + view) stage.scrollTop = y - (top ? 0 : Math.max(0, (view - L.rowH) / 2)); paint(false); }

  // ---- url state -----------------------------------------------------------
  function writeHash() {
    const p = new URLSearchParams();
    if (S.tab !== "typefaces") p.set("tab", S.tab); if (S.letter) p.set("l", S.letter); if (S.q.trim()) p.set("q", S.q.trim()); if (S.foundry) p.set("f", S.foundry); if (S.designer) p.set("d", S.designer);
    if (S.sort !== "az") p.set("sort", S.sort); if (S.view !== "grid") p.set("view", S.view); if (S.size !== "m") p.set("size", S.size);
    if (S.years.size) p.set("y", [...S.years].join(",")); if (S.dist.size) p.set("via", [...S.dist].join("|")); if (S.regions.size) p.set("r", [...S.regions].join("|")); if (S.tags.size) p.set("t", [...S.tags].join(","));
    for (const k of ["hasCard", "trial", "free", "variable", "short"]) if (S[k]) p.set(k, "1");
    history.replaceState(null, "", p.toString() ? "#" + p.toString() : location.pathname);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1)); if (![...p.keys()].length) return;
    S.tab = p.get("tab") || "typefaces"; S.letter = p.get("l") || ""; S.q = p.get("q") || ""; $("#q").value = S.q; S.foundry = p.get("f") || ""; S.designer = p.get("d") || "";
    S.sort = p.get("sort") || "az"; S.view = p.get("view") || "grid"; S.size = p.get("size") || "m";
    for (const y of (p.get("y") || "").split(",").filter(Boolean)) S.years.add(+y); for (const v of (p.get("via") || "").split("|").filter(Boolean)) S.dist.add(v);
    for (const r of (p.get("r") || "").split("|").filter(Boolean)) S.regions.add(r); for (const t of (p.get("t") || "").split(",").filter(Boolean)) S.tags.add(t);
    for (const k of ["hasCard", "trial", "free", "variable", "short"]) S[k] = p.get(k) === "1";
    $("#tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    $("#view").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.view === S.view));
    $("#size").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.size === S.size));
  }

  load().catch((e) => { insp.innerHTML = `<div class="sp-idle"><p>SPECIMEN could not load its index: ${esc(e.message)}. Run SPECIMEN-ROBOT.cmd once to harvest the Atlas.</p></div>`; console.error(e); });
})();

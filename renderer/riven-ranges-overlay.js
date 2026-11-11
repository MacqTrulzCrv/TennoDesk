// Center "stat ranges" overlay: shows the detected weapon's min-max roll ranges,
// fed by the main process (RIVEN_STAT_RANGES). Reuses the riven preload bridge.

const el = (id) => document.getElementById(id);

let _interactive = false;
let _last = null;
let _cfg = { numBuffs: 3, numCurses: 1 };

const CHROME = {
  tr: {
    title: "Stat Aralıkları",
    buff: "Olumlu",
    curse: "Lanet",
    buffLabel: "Buff",
    curseLabel: "Lanet",
    empty: "Riven taranınca silahın gelebilecek stat aralıkları burada görünür.",
    stat: "Stat",
    none: "yok",
  },
  en: {
    title: "Stat Ranges",
    buff: "Positive",
    curse: "Curse",
    buffLabel: "Buff",
    curseLabel: "Curse",
    empty: "Scan a riven to see this weapon's possible stat ranges.",
    stat: "Stat",
    none: "—",
  },
};
function chrome() {
  return CHROME[_last?.locale] || CHROME.en;
}

function setInteractive(on) {
  _interactive = !!on;
  document.documentElement.classList.toggle("is-interactive", _interactive);
  if (!_interactive) document.documentElement.classList.remove("is-overlay-dragging");
}

function decimals(unit) {
  return unit === "multiplier" ? 2 : 1;
}
function fmtNum(n, unit) {
  const s = Math.abs(n).toFixed(decimals(unit));
  return _last?.locale === "tr" ? s.replace(".", ",") : s;
}
/** One endpoint -> display string. `tail` appends the unit on the high end only. */
function fmtEndpoint(unit, v, tail) {
  if (unit === "multiplier") return `x${fmtNum(v, unit)}`;
  const sign = v < 0 ? "−" : "+";
  const suffix = tail ? (unit === "meters" ? " m" : "%") : "";
  return `${sign}${fmtNum(v, unit)}${suffix}`;
}
function rangeCell(side, unit, ep) {
  if (!ep) return `<div class="rng none">${chrome().none}</div>`;
  return (
    `<div class="rng ${side}">` +
    `<span class="lo">${fmtEndpoint(unit, ep.atMin, false)}</span>` +
    `<span class="arw">→</span>` +
    `<span class="hi">${fmtEndpoint(unit, ep.atMax, true)}</span>` +
    `</div>`
  );
}

/** Round endpoints so stats that land on the same range collapse into one row. */
function groupKey(s) {
  const r = (ep, u) => (ep ? `${ep.atMin.toFixed(decimals(u))}/${ep.atMax.toFixed(decimals(u))}` : "-");
  return `${s.unit}|${r(s.buff, s.unit)}|${r(s.curse, s.unit)}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function groupStats(stats) {
  const byKey = new Map();
  for (const s of stats) {
    const key = groupKey(s);
    if (!byKey.has(key)) byKey.set(key, { ...s, names: [] });
    byKey.get(key).names.push(s.displayName);
  }
  return [...byKey.values()];
}

function render() {
  const data = _last;
  const hasData = data && Array.isArray(data.stats) && data.stats.length > 0;
  const c = chrome();

  el("panel-label").textContent = c.title;
  el("lbl-buffs").textContent = c.buffLabel;
  el("lbl-curses").textContent = c.curseLabel;
  el("col-stat").textContent = c.stat;
  el("col-buff").textContent = c.buff;
  el("col-curse").textContent = c.curse;
  el("empty-state").textContent = c.empty;

  el("empty-state").classList.toggle("is-hidden", hasData);
  el("ranges").classList.toggle("is-hidden", !hasData);
  el("col-head").classList.toggle("is-hidden", !hasData);

  // Config button state follows the payload (authoritative) or the local guess.
  const nb = data?.numBuffs ?? _cfg.numBuffs;
  const nc = data?.numCurses ?? _cfg.numCurses;
  for (const b of el("seg-buffs").querySelectorAll("button")) {
    b.classList.toggle("on", Number(b.dataset.buffs) === nb);
  }
  for (const b of el("seg-curses").querySelectorAll("button")) {
    b.classList.toggle("on", Number(b.dataset.curses) === nc);
  }

  if (!hasData) {
    el("weapon-name").textContent = "—";
    el("dispo").textContent = "";
    el("ranges").innerHTML = "";
    return;
  }

  el("weapon-name").textContent = data.weapon;
  el("dispo").textContent = `Disp ${data.disposition.toFixed(2)}`;

  const groups = groupStats(data.stats);
  const rows = groups
    .map((g) => {
      const first = escapeHtml(g.names[0]);
      const rest = g.names.length > 1 ? ` <span class="grp">· ${escapeHtml(g.names.slice(1).join(" · "))}</span>` : "";
      return (
        `<div class="row">` +
        `<div class="st-name">${first}${rest}</div>` +
        rangeCell("buff", g.unit, g.buff) +
        rangeCell("curse", g.unit, g.curse) +
        `</div>`
      );
    })
    .join("");
  el("ranges").innerHTML = rows;
}

function applyConfig(nb, nc) {
  _cfg = { numBuffs: nb, numCurses: nc };
  if (_last) {
    _last = { ..._last, numBuffs: nb, numCurses: nc };
  }
  render();
  window.rivenOverlay.setRangesConfig(nb, nc);
}

function wireConfig() {
  el("seg-buffs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-buffs]");
    if (!btn || !_interactive) return;
    applyConfig(Number(btn.dataset.buffs), _last?.numCurses ?? _cfg.numCurses);
  });
  el("seg-curses").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-curses]");
    if (!btn || !_interactive) return;
    applyConfig(_last?.numBuffs ?? _cfg.numBuffs, Number(btn.dataset.curses));
  });
}

function boot() {
  wireConfig();

  el("btn-close").addEventListener("click", () => window.rivenOverlay.closeRanges());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") window.rivenOverlay.closeRanges();
  });

  window.installOverlayDrag({
    isInteractive: () => _interactive,
    moveBy: (dx, dy) => window.rivenOverlay.moveBy(dx, dy),
  });

  window.rivenOverlay.onThemeVars((vars) => window.overlayTheme.applyThemeVars(vars));
  window.rivenOverlay.onInteractionMode((payload) => setInteractive(Boolean(payload?.interactive)));
  window.rivenOverlay.onStatRanges((payload) => {
    _last = payload || null;
    if (payload && typeof payload.numBuffs === "number") {
      _cfg = { numBuffs: payload.numBuffs, numCurses: payload.numCurses };
    }
    render();
  });

  render();
  window.rivenOverlay.ready();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

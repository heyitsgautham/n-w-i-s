/** The overlays the film script injects into the page: cursor, ring, lower third, title and end cards. */

/** Title-card text. Neutral by default; FILM_BRAND, FILM_TAGLINE and FILM_LABEL put the submission's own on the cards. */
const BRAND = process.env.FILM_BRAND || "N-W-I-S";
const TAGLINE = process.env.FILM_TAGLINE || "Offset-well memory";
const LABEL = (process.env.FILM_LABEL || "Oil India Limited").toUpperCase();

/** What OVERLAYS and the arrival put on `window` for the film script to call. */
export type FilmApi = {
  __film: Record<string, (...a: number[]) => void>;
  __stepAnimations: (ms: number) => void;
  __arrival?: { at: (t: number) => void; steady: () => boolean; ready: () => boolean };
};

/** Everything the film draws over the app. Nothing here ships in the product. */
export const OVERLAYS = `
(() => {
  const el = (id, css, html = "") => {
    let e = document.getElementById(id);
    if (!e) {
      e = document.createElement("div");
      e.id = id;
      e.style.cssText = "position:fixed;pointer-events:none;" + css;
      e.innerHTML = html;
      document.documentElement.append(e);
    }
    return e;
  };
  const font = "font-family:var(--font-barlow),sans-serif;";
  const mark = '<svg width="76" height="76" viewBox="0 0 26 26"><rect x="1" y="4" width="24" height="5" fill="#eadb8c" opacity=".85"/><rect x="1" y="10.5" width="24" height="5" fill="#8ea894" opacity=".85"/><rect x="1" y="17" width="24" height="5" fill="#a8cbe6" opacity=".85"/><path d="M13 1V21" stroke="#020617" stroke-width="3"/><path d="M13 1V20" stroke="#f8fafc" stroke-width="1.4"/><path d="M10.5 19.5H15.5L13 23.5Z" fill="#f8fafc"/></svg>';
  window.__film = {
    cursor(x, y) {
      el("film-cursor", "left:0;top:0;z-index:2147483646;",
        '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 23 L8.5 18 L12.5 27 L16 25.5 L12 16.8 L19.5 16.8 Z" fill="#f8fafc" stroke="#020617" stroke-width="1.6" stroke-linejoin="round"/></svg>'
      ).style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)";
    },
    ripple(x, y, t) {
      const r = el("film-ripple", "left:0;top:0;z-index:2147483645;border:2px solid #f8fafc;border-radius:999px;");
      const size = 10 + 34 * t;
      r.style.width = r.style.height = size + "px";
      r.style.transform = "translate(" + (x - size / 2) + "px," + (y - size / 2) + "px)";
      r.style.opacity = t >= 1 ? "0" : String(0.85 * (1 - t));
    },
    ring(x, y, w, h, o) {
      const r = el("film-ring", "left:0;top:0;z-index:2147483640;border:2px solid rgba(248,250,252,.95);border-radius:7px;box-shadow:0 0 0 4px rgba(2,6,23,.55),0 0 26px rgba(248,250,252,.28);");
      r.style.transform = "translate(" + x + "px," + y + "px)";
      r.style.width = w + "px";
      r.style.height = h + "px";
      r.style.opacity = String(o);
    },
    lower(o) {
      el("film-lower", "left:92px;bottom:52px;z-index:2147483641;padding:14px 22px 15px 18px;background:rgba(2,6,23,.92);border-left:3px solid #f8fafc;box-shadow:0 12px 32px rgba(0,0,0,.5);color:#e2e8f0;" + font,
        '<div style="display:flex;align-items:baseline;gap:12px"><span style="font-weight:700;font-size:30px;letter-spacing:.14em;color:#f8fafc">${BRAND}</span><span style="font-size:18px;color:#cbd5e1">${TAGLINE}</span></div>' +
        '<div style="margin-top:7px;font-size:13.5px;font-weight:600;letter-spacing:.12em;color:#94a3b8">${LABEL} · TEAM 1, SAVEETHA ENGINEERING COLLEGE</div>'
      ).style.opacity = String(o);
    },
    card(o) {
      el("film-card", "inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;" + font,
        '<div style="display:flex;align-items:center;gap:46px">' + mark +
        '<div><div style="font-size:20px;font-weight:600;letter-spacing:.16em;color:#94a3b8">${LABEL}</div>' +
        '<div style="margin-top:12px;font-size:128px;line-height:.9;font-weight:700;letter-spacing:.05em;color:#f8fafc">${BRAND}</div>' +
        '<div style="margin-top:12px;font-size:40px;color:#e2e8f0">${TAGLINE}</div>' +
        '<div style="margin-top:34px;font-size:27px;color:#cbd5e1">Team 1 · Saveetha Engineering College</div>' +
        '<div style="margin-top:24px;display:inline-flex;align-items:center;gap:12px;padding:11px 20px;border:1px solid rgba(148,163,184,.5);border-radius:5px;font-size:22px;font-weight:600;color:#f8fafc"><span style="width:10px;height:10px;border-radius:9px;background:#fbbf24"></span>Working prototype on synthetic data</div>' +
        '</div></div>'
      ).style.opacity = String(o);
    },
    view(z, tx, ty) {
      const b = document.body;
      b.style.transformOrigin = "0 0";
      b.style.transform = z === 1 && tx === 0 && ty === 0 ? "" : "translate(" + tx + "px," + ty + "px) scale(" + z + ")";
    },
  };
  const vt = new WeakMap();
  window.__stepAnimations = (ms) => {
    for (const a of document.getAnimations()) {
      const t = (vt.get(a) ?? 0) + ms;
      vt.set(a, t);
      a.pause();
      a.currentTime = t;
    }
  };
})();
`;

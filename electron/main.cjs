/**
 * AutoResume desktop shell.
 * - Serves the built UI + /api on the LAN (port 4242) so a tablet can open it too.
 * - Opens ReadyTalent in an in-memory session (fresh sign-in every launch) and scrapes from it.
 * - Saves jobs.json / state.json in the user data folder.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const scrapeInPage = require("./scrape.cjs");
const { searchBoards, stopBoards, showBoardWindow, scrapePosting } = require("./boards.cjs");

const PORT = 4242;
const PORTAL = "https://readytalent2.singaporetech.edu.sg/";
const DIST = path.join(__dirname, "..", "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };

const file = (n) => path.join(app.getPath("userData"), n);
const readJson = (n, d) => { try { return JSON.parse(fs.readFileSync(file(n), "utf8")); } catch { return d; } };
const writeJson = (n, v) => fs.writeFileSync(file(n), JSON.stringify(v, null, 2));

let mainWin = null;
let rtWin = null;

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === "IPv4" && !i.internal) out.push(`http://${i.address}:${PORT}`);
  }
  return out;
}

function json(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function serve() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/api/jobs") return json(res, readJson("jobs.json", []));
      if (url.pathname === "/api/meta") return json(res, readJson("meta.json", { employmentTypes: [], programmes: [] }));
      if (url.pathname === "/api/board-jobs") return json(res, readJson("board-jobs.json", []));
      if (url.pathname === "/api/geocode" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 1e5) req.destroy(); });
        req.on("end", async () => {
          try {
            const { queries = [], region = "" } = JSON.parse(body || "{}");
            json(res, { results: await geocodeMany(queries.slice(0, 25).map(String), String(region)) });
          } catch (e) { json(res, { error: String(e.message || e) }, 400); }
        });
        return;
      }
      if (url.pathname === "/api/posting" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 1e4) req.destroy(); });
        req.on("end", async () => {
          try { json(res, { job: await scrapePosting(JSON.parse(body || "{}").url, skillDictionary()) }); }
          catch (e) { json(res, { error: String(e.message || e) }, 400); }
        });
        return;
      }
      if (url.pathname === "/api/info") return json(res, { lan: lanUrls() });
      if (url.pathname === "/api/state") {
        if (req.method === "GET") return json(res, readJson("state.json", null));
        if (req.method === "PUT") {
          let body = "";
          req.on("data", (c) => { body += c; if (body.length > 5e6) req.destroy(); });
          req.on("end", () => {
            try { writeJson("state.json", JSON.parse(body)); json(res, { ok: true }); }
            catch { json(res, { error: "bad json" }, 400); }
          });
          return;
        }
      }
      let p = path.normalize(path.join(DIST, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
      if (!p.startsWith(DIST)) return json(res, { error: "forbidden" }, 403);
      if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, "index.html");
      res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
      fs.createReadStream(p).pipe(res);
    });
    srv.on("error", reject);
    srv.listen(PORT, "0.0.0.0", resolve);
  });
}

/* ---- Address lookup for the "Near … within N km" filter ----
 * OneMap (Singapore's free map service) first: it answers specific places and postcodes without an account.
 * Broad places ("Geylang") fall back to OpenStreetMap Nominatim, which allows about one request a second and
 * asks for an identifying User-Agent. Every answer, including "not found", is cached in geocache.json. */
const NOMINATIM_UA = "AutoResume/1.x (https://github.com/nyx-ulrix/readytalent-scraper)";
let lastNominatim = 0;
async function oneMap(q) {
  const r = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=N&pageNum=1`);
  const d = r.ok ? await r.json() : {};
  const hit = (d.results || [])[0];
  return hit ? { lat: Number(hit.LATITUDE), lon: Number(hit.LONGITUDE), label: hit.SEARCHVAL } : null;
}
async function nominatim(q) {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastNominatim = Date.now();
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": NOMINATIM_UA } });
  const d = r.ok ? await r.json() : [];
  return d[0] ? { lat: Number(d[0].lat), lon: Number(d[0].lon), label: d[0].display_name } : null;
}
async function geocodeMany(queries, region) {
  const cache = readJson("geocache.json", {});
  const out = {};
  let changed = false;
  for (const q of [...new Set(queries.map((x) => x.trim()).filter(Boolean))]) {
    const key = `${q.toLowerCase()}|${region.toLowerCase()}`;
    if (!(key in cache)) {
      let hit = null;
      try {
        hit = await oneMap(q);
        const withRegion = region && !q.toLowerCase().includes(region.toLowerCase()) ? `${q}, ${region}` : q;
        if (!hit) hit = await nominatim(withRegion);
        if (!hit && withRegion !== q) hit = await nominatim(q);
      } catch { continue; } // network trouble: don't cache, try again next time
      cache[key] = hit;
      changed = true;
      await sleep(250); // be gentle with OneMap
    }
    out[q] = cache[key];
  }
  if (changed) writeJson("geocache.json", cache);
  return out;
}

/* ---- ReadyTalent sign-in credentials: encrypted with the Windows user account (DPAPI), never sent to the LAN ---- */
const CREDS = () => file("creds.bin");
function readCreds() {
  try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(CREDS()))); } catch { return null; }
}
ipcMain.handle("creds:set", (_e, { user, pass }) => {
  if (!user || !pass) { try { fs.unlinkSync(CREDS()); } catch { /* none */ } return { user: "" }; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows credential encryption is unavailable on this machine.");
  fs.writeFileSync(CREDS(), safeStorage.encryptString(JSON.stringify({ user, pass })));
  return { user };
});
ipcMain.handle("creds:get", () => ({ user: readCreds()?.user || "" }));

function portalWindow(show) {
  if (rtWin && !rtWin.isDestroyed()) { if (show) rtWin.show(); return rtWin; }
  rtWin = new BrowserWindow({
    width: 1100, height: 820, show, title: "ReadyTalent",
    // No "persist:" prefix => in-memory cookies => fresh sign-in every launch.
    webPreferences: { partition: "readytalent", contextIsolation: true, nodeIntegration: false },
  });
  rtWin.loadURL(PORTAL);
  rtWin.on("closed", () => { rtWin = null; });
  return rtWin;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Poll `fn` (may throw while the page is navigating) until truthy. */
async function waitUntil(fn, timeoutMs, what) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch { /* navigating */ }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function isSignedIn() {
  if (!rtWin || rtWin.isDestroyed()) return false;
  const wc = rtWin.webContents;
  if (!wc.getURL().startsWith(PORTAL)) return false;
  return wc.executeJavaScript("!!sessionStorage.getItem('StudentId')", true).catch(() => false);
}

/** Drive the portal's own "Staff / Student / Alumni" button and the SIT ADFS form with the saved credentials. */
async function autoLogin(creds) {
  const win = portalWindow(false);
  const wc = win.webContents;
  await wc.loadURL(PORTAL);
  await wc.executeJavaScript("typeof checkAuth === 'function' ? checkAuth() : document.querySelector(\"button[title*='ADFS']\").click()", true);
  await waitUntil(() => wc.getURL().includes("fs.singaporetech.edu.sg") && wc.executeJavaScript("!!(document.getElementById('passwordInput') || document.querySelector('input[name=Password]'))", true), 30000, "the SIT sign-in page");
  await wc.executeJavaScript(`((u, p) => {
    const q = (id, name) => document.getElementById(id) || document.querySelector('input[name=' + name + ']');
    const a = q('userNameInput', 'UserName'), b = q('passwordInput', 'Password');
    a.value = u; b.value = p;
    for (const el of [a, b]) el.dispatchEvent(new Event('input', { bubbles: true }));
    (document.getElementById('submitButton') || b.form.querySelector('[type=submit]')).click();
  })(${JSON.stringify(creds.user)}, ${JSON.stringify(creds.pass)})`, true);
  await waitUntil(async () => {
    if (await isSignedIn()) return true;
    if (wc.getURL().includes("fs.singaporetech.edu.sg")) {
      const err = await wc.executeJavaScript("(document.getElementById('errorText') || {}).textContent || ''", true);
      if (err.trim()) throw new Error("SIT sign-in failed: " + err.trim());
    }
    return false;
  }, 60000, "ReadyTalent to finish signing in").catch((err) => {
    win.show(); // MFA prompt or unexpected page: let the user finish by hand
    throw new Error(`${err.message}. The ReadyTalent window is open - finish signing in there, then click Scrape again.`);
  });
}

ipcMain.handle("rt:open", () => { portalWindow(true); });

ipcMain.handle("rt:scrape", async (e) => {
  if (!(await isSignedIn())) {
    const creds = readCreds();
    if (!creds) {
      portalWindow(true);
      throw new Error("Save your ReadyTalent sign-in in Settings for automatic sign-in, or sign in in the window that opened and click Scrape again.");
    }
    e.sender.send("rt:progress", { i: 0, n: 0, msg: `Signing in to ReadyTalent as ${creds.user}…` });
    await autoLogin(creds);
  }
  const wc = rtWin.webContents;
  const jobs = readJson("jobs.json", []);
  const onMsg = (ev, ...rest) => {
    const text = ev && typeof ev.message === "string" ? ev.message : String(rest[1] ?? "");
    if (!text.startsWith("AP_PROGRESS")) return;
    const [, i, n] = text.split(" ");
    e.sender.send("rt:progress", { i: Number(i), n: Number(n) });
  };
  wc.on("console-message", onMsg);
  try {
    const r = await wc.executeJavaScript(`(${scrapeInPage.toString()})(${JSON.stringify(jobs.map((j) => j.id))})`, true);
    const active = new Set(r.activeIds);
    const merged = [...r.jobs, ...jobs].map((j) => ({ ...j, expired: !active.has(j.id) }));
    writeJson("jobs.json", merged);
    if (r.meta.employmentTypes.length || r.meta.programmes.length) writeJson("meta.json", r.meta);
    return { added: r.jobs.length, total: merged.length };
  } finally {
    wc.off("console-message", onMsg);
  }
});

/** Skill names to look for in board / pasted postings: ReadyTalent skill names + the user's own skills. */
function skillDictionary() {
  const dict = new Set();
  for (const j of readJson("jobs.json", [])) for (const s of j.skills || []) if (s.length >= 2 && s.length <= 40) dict.add(s.trim());
  for (const s of readJson("state.json", {})?.profile?.skills || []) if (s && s.length <= 40) dict.add(s.trim());
  return [...dict];
}

/* ---- LinkedIn / Indeed: runs only when the user presses Search ---- */
const pick = (v, allowed) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : []);
let boardsBusy = false;
ipcMain.handle("boards:search", async (e, opts) => {
  if (boardsBusy) throw new Error("A search is already running.");
  const terms = [...new Set((opts?.terms || []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 30);
  if (!terms.length) throw new Error("Tick at least one search term.");
  if (!opts.linkedin && !opts.indeed) throw new Error("Pick LinkedIn and/or Indeed.");
  boardsBusy = true;
  try {
    const stored = readJson("board-jobs.json", []);
    const known = new Map(stored.map((j) => [j.id, j]));
    const dict = skillDictionary();
    const say = (msg) => e.sender.send("boards:progress", { msg });
    const clean = {
      terms, location: String(opts.location || "Singapore").trim() || "Singapore", linkedin: !!opts.linkedin, indeed: !!opts.indeed,
      perTerm: Math.min(50, Math.max(5, Number(opts.perTerm) || 10)), days: [1, 3, 7, 14, 30].includes(Number(opts.days)) ? Number(opts.days) : 14,
      jobTypes: pick(opts.jobTypes, ["fulltime", "parttime", "contract", "temporary", "internship"]),
      workplace: pick(opts.workplace, ["onsite", "remote", "hybrid"]),
      levels: pick(opts.levels, ["internship", "entry", "associate", "mid", "director", "executive"]),
      companyInclude: String(opts.companyInclude || "").slice(0, 500), companyExclude: String(opts.companyExclude || "").slice(0, 500),
    };
    const { jobs, errors } = await searchBoards(clean, known, dict, say);
    let added = 0;
    for (const [id, j] of jobs) { if (!known.has(id)) added++; known.set(id, j); }
    const merged = [...known.values()].sort((a, b) => String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")));
    writeJson("board-jobs.json", merged);
    return { found: jobs.size, added, total: merged.length, errors };
  } finally { boardsBusy = false; }
});
ipcMain.handle("boards:stop", () => { stopBoards(); });
ipcMain.handle("boards:window", () => { showBoardWindow(); });
ipcMain.handle("boards:remove", (_e, ids) => {
  const keep = ids === "all" ? [] : readJson("board-jobs.json", []).filter((j) => !(ids || []).includes(j.id));
  writeJson("board-jobs.json", keep);
  return keep.length;
});

ipcMain.handle("pdf:save", async (e, name) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { filePath } = await dialog.showSaveDialog(win, { defaultPath: `${name || "resume"}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!filePath) return false;
  const pdf = await e.sender.printToPDF({ pageSize: "A4", printBackground: true, margins: { marginType: "none" } });
  fs.writeFileSync(filePath, pdf);
  shell.showItemInFolder(filePath);
  return true;
});

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1240, height: 840, minWidth: 800, title: "AutoResume", backgroundColor: "#ffffff",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  mainWin.setMenuBarVisibility(false); // Windows/Linux; macOS keeps its app menu (needed for Cmd+C / Cmd+V)
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  mainWin.on("closed", () => { mainWin = null; });
  return mainWin.loadURL(`http://127.0.0.1:${PORT}/`);
}

async function boot() {
  try { await serve(); } catch (err) {
    dialog.showErrorBox("AutoResume", `Port ${PORT} is busy: ${err.message}`);
    app.quit();
    return;
  }
  await createMainWindow();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });
  app.whenReady().then(boot);
  // macOS convention: closing the window keeps the app (and the tablet server) running; the dock icon reopens it.
  app.on("activate", () => { if (app.isReady() && !mainWin) void createMainWindow(); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}

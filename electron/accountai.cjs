/**
 * "Use your own account" AI: runs the official command-line tool the user signed into on this laptop
 * (Gemini CLI with a Google account, Claude Code with a Claude Pro/Max account) instead of calling an API
 * with a key. One prompt in (piped on stdin, so long prompts are fine), one answer out.
 *
 * Every call runs in a fresh empty temp folder; Claude Code gets no tools (or only Read, for an uploaded
 * resume file) and --safe-mode, so the user's CLAUDE.md, skills, plugins and MCP servers stay out of it.
 */
const { spawn } = require("child_process");
const { shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const isWin = process.platform === "win32";
const GEMINI_MODELS = ["auto", "pro", "flash", "flash-lite"];
const CLAUDE_MODELS = ["default", "sonnet", "opus", "haiku"];
const EXT = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "text/markdown": "md", "text/plain": "txt" };

/** Run a command, feeding `input` on stdin. Windows .cmd shims (gemini) need a shell; claude.exe doesn't. */
function run(cmd, args, { input = "", cwd, timeoutMs = 6 * 60 * 1000, useShell = false } = {}) {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    const child = spawn(cmd, args, { cwd, shell: useShell, windowsHide: true, env: process.env });
    const finish = (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ code, out, err }); } };
    const timer = setTimeout(() => { child.kill(); err += "\nTimed out."; finish(124); }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { err += e.message; finish(127); });
    child.on("close", (code) => finish(code ?? 1));
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

function parseJson(text) {
  const t = String(text || "").trim();
  try { return JSON.parse(t); } catch { /* some versions print a banner first */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ }
  return null;
}

/**
 * Ask the signed-in tool, retrying briefly when several requests run at once and trip over each other (Claude Code's
 * shared sign-in token refresh, or a short rate limit). Returns the answer text or throws with the tool's message.
 */
async function ask(req) {
  for (let attempt = 1; ; attempt++) {
    try { return await askOnce(req); }
    catch (e) {
      const busy = /refresh(ing)? (the )?OAuth token|another Claude Code process|rate.?limit|429|overloaded|RESOURCE_EXHAUSTED|try again/i.test(e.message);
      if (!busy || attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2500 * attempt + Math.random() * 1500));
    }
  }
}

async function askOnce({ tool, model = "", prompt = "", system = "", json = false, file }) {
  if (tool !== "gemini-cli" && tool !== "claude-code") throw new Error("Unknown AI tool.");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autoresume-ai-"));
  try {
    let fileName = "";
    if (file && file.data) {
      fileName = `resume.${EXT[file.mimeType] || "bin"}`;
      fs.writeFileSync(path.join(dir, fileName), Buffer.from(file.data, "base64"));
    }
    const answerLine = json ? " Reply with the JSON only, no other text." : "";
    if (tool === "gemini-cli") {
      const m = GEMINI_MODELS.includes(model) && model !== "auto" ? ["-m", model] : [];
      const instruction = `Follow the instructions above.${fileName ? ` The resume file is @${fileName}` : ""}${answerLine}`;
      const r = await run("gemini", [...m, "-o", "json", "-p", `"${instruction}"`], { input: `${system}\n\n${prompt}\n`, cwd: dir, useShell: true });
      const d = parseJson(r.out);
      if (d && typeof d.response === "string" && !d.error) return d.response;
      throw new Error(friendly(tool, (d && d.error && (d.error.message || JSON.stringify(d.error))) || r.err || r.out || `exit ${r.code}`));
    }
    fs.writeFileSync(path.join(dir, "system.txt"), system || "You are a helpful assistant.");
    const m = CLAUDE_MODELS.includes(model) && model !== "default" ? ["--model", model] : [];
    const tools = fileName ? ["--tools", "Read", "--allowedTools", "Read"] : ["--tools", ""];
    const instruction = `Follow the request above.${fileName ? ` The resume file is ./${fileName} (read it with the Read tool).` : ""}${answerLine}`;
    const r = await run("claude", ["-p", instruction, "--output-format", "json", "--system-prompt-file", "system.txt", ...tools, ...m,
      "--safe-mode", "--no-session-persistence", "--max-turns", fileName ? "4" : "1"], { input: prompt, cwd: dir });
    const d = parseJson(r.out);
    if (d && !d.is_error && typeof d.result === "string") return d.result;
    throw new Error(friendly(tool, (d && d.result) || r.err || r.out || `exit ${r.code}`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Turn tool errors into what the user should do. */
function friendly(tool, msg) {
  const m = String(msg).trim().slice(0, 400);
  const name = tool === "gemini-cli" ? "Gemini CLI" : "Claude Code";
  if (/not recognized|ENOENT|not found|command not found/i.test(m)) return `${name} isn't installed on this laptop. Settings → AI → Install ${name}.`;
  if (/not logged in|please run \/login|auth|login|credential|sign in/i.test(m) && !/refresh/i.test(m)) return `${name} isn't signed in. Settings → AI → Sign in. (${m})`;
  return `${name}: ${m}`;
}

/** Installed? Version? Signed in (Claude: `claude auth status`; Gemini: saved Google sign-in)? With test, one tiny request. */
async function status(tool, test, model) {
  const isGemini = tool === "gemini-cli";
  const v = await run(isGemini ? "gemini" : "claude", ["--version"], { useShell: isGemini, timeoutMs: 30000 });
  if (v.code !== 0) return { installed: false };
  const version = (v.out.match(/\d+\.\d+\.\d+/) || [""])[0];
  let signedIn;
  if (isGemini) signedIn = fs.existsSync(path.join(os.homedir(), ".gemini", "oauth_creds.json")) || undefined;
  else {
    const a = parseJson((await run("claude", ["auth", "status"], { timeoutMs: 30000 })).out);
    signedIn = a ? !!a.loggedIn : undefined;
  }
  if (!test) return { installed: true, version, signedIn };
  try {
    await ask({ tool, model, prompt: "Reply with the single word OK.", system: "Reply with the single word OK." });
    return { installed: true, version, signedIn: true, note: "test request answered" };
  } catch (e) {
    return { installed: true, version, signedIn: /signed in|logged in/i.test(e.message) ? false : signedIn, note: e.message };
  }
}

/** Open a terminal window on the laptop to install the tool or sign in (the user follows the prompts there). */
function openTerminal(tool, action) {
  if (tool === "claude-code" && action === "install") return shell.openExternal("https://docs.claude.com/en/docs/claude-code/setup");
  const cmd = { "gemini-cli": { install: "npm install -g @google/gemini-cli", login: "gemini" }, "claude-code": { login: "claude auth login" } }[tool]?.[action];
  if (!cmd) return;
  const title = `${tool === "gemini-cli" ? "Gemini CLI" : "Claude Code"} ${action === "install" ? "install" : "sign-in"}`;
  if (isWin) spawn("cmd.exe", ["/c", "start", `"${title}"`, "cmd", "/k", cmd], { shell: true, detached: true, windowsHide: false }).unref();
  else if (process.platform === "darwin") spawn("osascript", ["-e", `tell application "Terminal" to do script "${cmd}"`, "-e", 'tell application "Terminal" to activate'], { detached: true }).unref();
  else spawn("x-terminal-emulator", ["-e", cmd], { detached: true }).unref();
}

module.exports = { ask, status, openTerminal };

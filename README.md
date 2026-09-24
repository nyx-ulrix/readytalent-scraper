# AutoResume

Scrapes every job from SIT's ReadyTalent portal (title, company, salary, skills needed, description) and turns your details into a tailored, ATS-keyword-optimised A4 resume and cover letter with Gemini. Everything is stored locally.

## Laptop (Windows)

Install `release/AutoResume-Setup-*.exe` (or `pnpm install && pnpm start` to run from source).

1. **Settings** → paste your Gemini API key (free at aistudio.google.com/apikey), save your ReadyTalent sign-in (SIT username + password, encrypted with Windows DPAPI in `%APPDATA%\autoresume\creds.bin`, never sent to the tablet) and fill in your details.
2. **Jobs → Scrape ReadyTalent**. The app opens the portal in a hidden in-memory window, signs in through SIT's ADFS page with your saved login (fresh session every launch), calls the portal's own job API and saves to `%APPDATA%\autoresume\jobs.json`. Re-scraping only fetches new jobs. If sign-in needs your attention (wrong password, MFA), the window is shown so you can finish it, then click Scrape again. **Open portal** shows the window at any time.
3. Filter with the **Employment Types** and **Programmes** dropdowns, copied from the portal's own search page during scraping.
4. Open a job → **ATS keywords** / **Tailor resume** / **Cover letter**. Results open in the Resume tab; **Save PDF (A4)**.

**Resume import and templates.** Settings → **Upload resume** accepts PDF, images and Markdown (`.md`); the chosen AI provider reads and OCRs them. **Download .md template** exports your details in AutoResume's Markdown format; edit it in any text editor and upload it back, and it imports exactly with no AI key. The default A4 template is **Standard** (Times New Roman, ruled section headings, location and dates on the right); Classic, Modern and Compact are also available. Besides Education, Work Experience and Projects you can add any number of custom sections (Competition, Leadership…) and labelled skill lines (Soft Skills, Interests…).

Windows Firewall will ask to allow AutoResume on the first launch; allow it so the tablet can connect.

## Tablet (Android / iPad)

Keep the laptop app running on the same Wi-Fi. Settings shows the laptop's address (for example `http://192.168.1.20:4242`). Open it in the tablet browser and use **Add to Home Screen**. The tablet sees the scraped jobs, shares your details with the laptop, and can generate resumes and cover letters itself. Use **Print / Save PDF** for A4 output. Scraping stays on the laptop.

## Dev

```bash
pnpm install
pnpm dev                       # browser-only UI on :5173 (proxies /api to a running desktop app)
pnpm start                     # build + run Electron
node electron/scrape.test.cjs  # scraper self-check against a fake portal API
node test/markdown.test.ts     # Markdown template round-trip self-check (Node 22.6+)
pnpm dist                      # Windows installer -> release/
```

Files: `electron/scrape.cjs` (runs inside the signed-in portal page), `electron/main.cjs` (LAN server on :4242, portal window, PDF), `src/gemini.ts` (keywords, tailoring, cover letter), `src/Resume.tsx` + `src/styles.css` (A4 templates: classic, modern, compact).

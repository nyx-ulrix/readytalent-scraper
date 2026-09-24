# AutoResume

Scrapes every job from SIT's ReadyTalent portal (title, company, salary, skills needed, description) and turns your details into a tailored, ATS-keyword-optimised A4 resume and cover letter with Gemini. Everything is stored locally.

## Laptop (Windows)

Install `release/AutoResume-Setup-*.exe` (or `pnpm install && pnpm start` to run from source).

1. **Settings** → paste your Gemini API key (free at aistudio.google.com/apikey), save your ReadyTalent sign-in (SIT username + password, encrypted with Windows DPAPI in `%APPDATA%\autoresume\creds.bin`, never sent to the tablet) and fill in your details.
2. **Jobs → Scrape ReadyTalent**. The app opens the portal in a hidden in-memory window, signs in through SIT's ADFS page with your saved login (fresh session every launch), calls the portal's own job API and saves to `%APPDATA%\autoresume\jobs.json`. Re-scraping only fetches new jobs. If sign-in needs your attention (wrong password, MFA), the window is shown so you can finish it, then click Scrape again. **Open portal** shows the window at any time.
3. Filter with the **Employment Types** and **Programmes** dropdowns, copied from the portal's own search page during scraping.
4. Open a job → **ATS keywords** / **Tailor resume** / **Cover letter**. Results open in the Resume tab; **Save PDF (A4)**.

**Resume import and templates.** Settings → **Upload resume** accepts PDF, images and Markdown (`.md`); the chosen AI provider reads and OCRs them. **Download .md template** exports your details in AutoResume's Markdown format; edit it in any text editor and upload it back, and it imports exactly with no AI key. The default A4 template is **Standard** (Times New Roman, ruled section headings, location and dates on the right); Classic, Modern and Compact are also available. Besides Education, Work Experience and Projects you can add any number of custom sections (Competition, Leadership…) and labelled skill lines (Soft Skills, Interests…).

**Grounded AI.** Keywords, tailored resumes and cover letters get your resume as Markdown plus the "More about you" notes in Settings (languages such as Mandarin, soft skills...). The AI works soft skills and languages into ATS keywords and bullets where your text supports them. Each result then goes through a fact-check pass and a deterministic guard. The guard keeps employers, schools, titles, locations and dates unchanged and reverts any bullet that introduces a number you never wrote. It also drops skills or labelled items that don't appear in your text.

**Models.** Settings → AI lists every model your key can see, grouped into text models and other models, with list prices per 1M tokens (from OpenRouter's public price list) and an on-demand online check. OpenAI Responses-only models (Codex, "-pro") are routed to the Responses API automatically.

**Tabs.** ReadyTalent (portal jobs), Search (LinkedIn and Indeed), Saved, Applied, Resume and Settings. "Mark applied" records the date; Saved and Applied gather jobs from every source. Tailoring and cover letters stay on the job page and show when they were made; open them with View resume / View letter.

**Search tab (LinkedIn and Indeed).** Add the roles you want (each becomes a search term) or type your own terms, e.g. "project manager, technical sales". Optionally ask the AI to suggest roles or write more terms. Set employment type, working mode (on-site, remote, hybrid), experience level, companies to include or skip, location, results per term and posting age. Nothing is fetched until you press Search, and only ticked terms are searched. Results are stored locally; LinkedIn jobs include the full description, Indeed jobs the summary, pay and tags its search page shows (Indeed keeps full descriptions behind a human check). Results can be filtered by source, job type, working mode, level, company and pay (compared per month).

**Editing and links.** Settings has separate Portfolio, LinkedIn and GitHub fields (plus optional other links); the header shows phone, email, portfolio, LinkedIn and GitHub. On the Resume tab, **Edit** / **Edit this version** changes a tailored resume directly, with no AI and no regenerating; cover letters are edited in the text box above the preview. Every email, phone number, website and URL on the resume and cover letter is a real link, so it stays clickable in the saved PDF.

**Your skill choices.** On a job's ATS keywords, click once for "I have this" (tailoring adds it when the job asks for it) or twice for "leave out" (removed from every tailored resume).

**AI only on click.** Every AI action is marked ✦ and asks for confirmation first, naming the provider and model and warning that it consumes API tokens. The warning can be turned off in Settings.

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
node test/ground.test.ts       # grounding guard: AI output may only state facts from your resume/notes
node test/boards.test.cjs      # LinkedIn/Indeed filter rules
node test/pay.test.ts          # pay normalisation (yearly/hourly -> monthly)
node test/linkify.test.ts      # clickable-link detection and link fields
pnpm dist                      # Windows installer -> release/
```

Files: `electron/scrape.cjs` (runs inside the signed-in portal page), `electron/main.cjs` (LAN server on :4242, portal window, PDF), `electron/boards.cjs` (LinkedIn/Indeed search), `src/ai.ts` (providers, model list, keywords, tailoring, cover letter), `src/ground.ts` (fact guard), `src/markdown.ts` (.md template), `src/Resume.tsx` + `src/styles.css` (A4 templates: standard, classic, modern, compact).

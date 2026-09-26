# AutoResume

AutoResume pulls job listings from SIT's ReadyTalent portal, and from LinkedIn and Indeed when you ask. It turns your details into tailored, ATS-optimised A4 resumes and cover letters using Gemini, OpenAI, Qwen or Claude. Everything stays on your own computer. Runs on Windows and macOS.

## Download

Get the latest version from the [releases page](https://github.com/nyx-ulrix/readytalent-scraper/releases/latest).

| Your computer | File |
| --- | --- |
| Windows 10/11 | `AutoResume-Setup-<version>-win-x64.exe` |
| Mac with an Apple chip (M1 or later) | `AutoResume-<version>-mac-arm64.dmg` |
| Mac with an Intel processor | `AutoResume-<version>-mac-x64.dmg` |

Not sure which Mac you have? Click the Apple menu () → **About This Mac**. "Chip: Apple M…" means the arm64 file; "Processor: Intel" means the x64 file. The `.zip` files contain the same Mac apps for anyone who prefers them over a disk image.

## Install on Windows

1. Run the installer.
2. If a blue "Windows protected your PC" box appears, click **More info** → **Run anyway**. It appears because the app is not signed by a paid publisher.
3. If Windows Firewall asks, tick **Private networks** and allow AutoResume if you want to use it from a phone or tablet.

## Install on macOS

1. Open the downloaded `.dmg` and drag **AutoResume** into **Applications**, then eject the disk image.
2. Open Applications and double-click AutoResume.
3. The app is not notarised by Apple, so macOS blocks the first launch. It is safe to allow:
   - **macOS 15 Sequoia or newer:** close the warning, go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to AutoResume, then confirm with your password or Touch ID.
   - **Older macOS:** right-click AutoResume in Applications → **Open** → **Open**.
   - **If it says the app "is damaged and can't be opened":** open Terminal (Cmd + Space, type Terminal), paste this line, press Return, then open the app normally:

     ```bash
     xattr -dr com.apple.quarantine /Applications/AutoResume.app
     ```

4. If macOS asks whether AutoResume may accept incoming network connections, click **Allow** if you want to use it from a tablet. Otherwise either choice is fine.

On a Mac, closing the window does not quit AutoResume, so a tablet can still connect. Click its Dock icon to reopen it, or press Cmd + Q to quit.

## First-time setup (Settings tab)

1. **AI key.** Choose a provider and paste its API key. Gemini has a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey); OpenAI, Qwen and Claude also work. You can pick the exact model, and the list shows each model's price per million tokens.
2. **ReadyTalent sign-in.** Enter your SIT email and password once. They are encrypted on your computer (Windows account protection or the Mac Keychain) and used only to sign in to ReadyTalent for you. On a Mac, click **Always Allow** if it asks about the Keychain.
3. **Your details.** Upload your current resume (PDF, photo or `.md`) or type everything in, then check the fields. Fill in Portfolio, LinkedIn and GitHub separately.
4. **More about you.** Add facts the AI may use that are not on your resume, such as "Fluent in English and Mandarin". The AI may only use facts from your resume and this box.
5. **Job preferences.** Pick your employment type and programme so the ReadyTalent list shows jobs relevant to you.

## Using it

- **ReadyTalent tab:** press **Scrape ReadyTalent**. It signs in and saves every job with title, company, pay, skills needed and description. Filter by type, programme, pay and skills.
- **Location and distance (every job list):** the search box also matches locations. Type a place in **Near** (postcode, street or MRT station), set **within [number] km**, and press Go to see only jobs within that distance, with the distance on each job and a **Nearest first** sort. Addresses are looked up with Singapore's OneMap, then OpenStreetMap, once each and cached; the first lookup of a long list can take a few minutes. Jobs listed only as "Singapore" or "Remote" have no address to measure and are hidden while a distance is set. Pay is filtered by typing a minimum monthly amount (yearly and hourly pay are converted).
- **Find jobs tab (all the scraping tools):** scrape ReadyTalent, search LinkedIn and Indeed, target a job title, or paste a posting. Browse and filter everything you've scraped on the **Jobs** tab.
- **LinkedIn / Indeed search:** add the roles you want or type terms like "project manager, technical sales", set filters (job type, remote/hybrid, experience level, companies, pay) and press **Search**. Nothing is fetched until you press Search.
- **Target a specific job title (Find jobs tab):** type a title such as "Forward Deployed Engineer" and press **✦ Generate posting**. The AI writes a typical posting for that role (an example, not a real job), the search terms that find it and the jobs that are really the same work under other titles, and its key skills. **Search jobs like this** searches just those terms, and the sort option **Most like: <title>** ranks every result by how closely it matches.
- **Targets tab:** jobs found with **Search jobs like this** are kept under that job title, with their full details, in the Targets tab (pick the title from the dropdown). It appears once a target search has found jobs.
- **Your ranking (Settings):** order projects, experience and other entries with ↑ ↓ (#1 is what you most want to showcase); tailored resumes prefer your higher-ranked ones when they're relevant enough. Tick **Only if very relevant** on entries you don't find impressive: they're left out unless they closely match the job, and never appear on your base resume.
- **Update your details (Settings):** add what's new from a newer resume, your portfolio or LinkedIn page, or pasted text. Nothing you already have is removed or reworded; new jobs, projects, bullet points and skills are added below yours, and **Undo** puts everything back.
- **Filters are remembered:** each job list keeps its filters, search text and sort between sessions.
- **Paste a job posting (Find jobs tab):** paste a link to a posting (LinkedIn, MyCareersFuture, company career pages and most job sites) and it is read and saved straight away, no AI: title, company, pay, location, job type, deadline, description and skills. Or paste a posting's text and press **✦ Add with AI**, or **Add without AI** with a title you type. Pasted jobs sit with your Search results and work like any other job. Links are read by the laptop app (also when you paste on the tablet); sites behind a bot check are not worked around, so copy the text instead.
- **On any job:**
  - ✦ **ATS keywords** lists what the job asks for. Tap a keyword once for "I have this" or twice for "leave out".
  - ✦ **Tailor resume** and ✦ **Cover letter** write versions for that job; you stay on the job page.
  - Anything marked ✦ uses the AI. It asks first because it uses API tokens, which may cost money on paid keys.
- **Resume tab:** pick a version and a template (Standard is the default), press **Edit** to change wording by hand without regenerating, then **Save PDF (A4)**. Links in the PDF are clickable.
- **One page, always, never below 8 pt:** every resume and cover letter is exactly one A4 page. Longer content is shrunk (never below 8 pt), then spaced more tightly, then shown with fewer bullet points per entry; the Resume tab says how many bullets were left off so you can choose what shows with Edit. Everything you enter stays stored, ranked most relevant first; the page shows the top of each list: at most 3 projects, 2 leadership roles and 18 technical skills. Tailored resumes are ranked by the AI for the job (Edit shows the stored rest, dimmed, and ↑ swaps one in); your base resume uses your order in Settings, which **✦ Rank by relevance** can sort for the roles you want.
- **Save** and **Mark applied** keep track of jobs in the **Saved** and **Applied** tabs.

## Use it from a phone or tablet (optional)

Keep AutoResume open on your laptop with the phone or tablet on the same Wi-Fi. Settings → **Phone and tablet access** shows an address like `http://192.168.1.20:4242`; open it in the phone's browser and use **Add to Home Screen** (Safari: Share → Add to Home Screen). The layout fits phone screens. Phones and tablets share your details and jobs with the laptop and can generate resumes and cover letters; use **Print / Save PDF** for A4 output. Scraping and searching run on the laptop.

If the page won't load on the phone, Windows Firewall is usually blocking it on your home network: open **Windows Security → Firewall & network protection → Allow an app through firewall**, click **Change settings**, and tick **Private** next to **autoresume**. Also make sure the phone is on the same Wi-Fi (not mobile data or a guest network).

Your data stays on your devices. Only the text you choose to send to your AI provider leaves them.

## How it works

**ReadyTalent.** The app opens the portal in a hidden, in-memory window (a fresh session every launch), signs in through SIT's ADFS page with your saved login, calls the portal's own job API and saves the jobs in the app's data folder. Re-scraping only fetches new jobs. If sign-in needs you (wrong password, MFA), the window is shown so you can finish, then press Scrape again. The Employment Types and Programmes filters are copied from the portal's own search page.

**LinkedIn and Indeed.** Only ticked search terms are searched, and only when you press Search, in a hidden browser window with pauses between pages. LinkedIn jobs include the full description; Indeed jobs include the summary, pay and tags from its search page, because Indeed keeps full descriptions behind a human-verification check. Results can be filtered by source, job type, working mode, level, company and pay (compared per month, so yearly and hourly pay line up).

**Resume import and templates.** Upload accepts PDF, images and Markdown; the chosen AI provider reads and OCRs them. **Download .md template** exports your details in AutoResume's Markdown format, which re-imports exactly with no AI key. Templates: Standard (Times New Roman, ruled headings, location and dates on the right), Classic, Modern and Compact. You can add custom sections (Competition, Leadership…) and labelled skill lines (Soft Skills, Interests…).

**Grounded AI.** Keywords, tailored resumes and cover letters get your resume as Markdown plus your "More about you" notes. The AI works soft skills and languages into keywords and bullets where your text supports them. Every result then goes through a fact-check pass and a fixed rule check: employers, schools, titles, locations and dates stay as you wrote them, bullets that add numbers you never wrote are undone, and skills or items that do not appear in your text are dropped.

**Models.** Settings lists every model your key can see, split into text models and others, with list prices per 1M tokens (from OpenRouter's public price list) and an on-demand online check. OpenAI models that only work on the Responses API (Codex, "-pro") are routed there automatically.

**Editing and links.** The resume header always uses your current phone, email, portfolio, LinkedIn and GitHub, even on older tailored versions. Every email, phone number, website and URL on resumes and cover letters is a real link, so it stays clickable in the PDF.

**AI only on click.** Nothing calls the AI automatically. Every AI action is marked ✦ and asks for confirmation, naming the provider and model and warning that it consumes tokens. The warning can be turned off in Settings.

## Development

```bash
pnpm install
pnpm start                     # build + run the desktop app
pnpm dev                       # browser-only UI on :5173 (proxies /api to a running desktop app)
pnpm test                      # all self-checks
pnpm run dist:win              # Windows installer -> release/
pnpm run dist:mac              # macOS dmg + zip (arm64, x64); must run on a Mac
git tag v1.2.3 && git push --tags  # CI builds Windows + macOS and publishes a GitHub release
```

Self-checks: `electron/scrape.test.cjs` (ReadyTalent scraper against a fake portal API), `test/ground.test.ts` (grounding guard), `test/markdown.test.ts` (Markdown template round trip), `test/boards.test.cjs` (LinkedIn/Indeed filters), `test/pay.test.ts` (pay normalisation), `test/linkify.test.ts` (clickable links and link fields). The `.ts` tests need Node 22.6 or newer.

Files: `electron/main.cjs` (LAN server on :4242, ReadyTalent window, PDF), `electron/scrape.cjs` (runs inside the signed-in portal page), `electron/boards.cjs` (LinkedIn/Indeed search), `src/ai.ts` (providers, models, keywords, tailoring, cover letters), `src/ground.ts` (fact guard), `src/markdown.ts` (.md template), `src/Resume.tsx` + `src/styles.css` (A4 templates), `.github/workflows/release.yml` (release builds).

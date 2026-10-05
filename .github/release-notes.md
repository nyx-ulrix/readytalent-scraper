AutoResume scrapes jobs from SIT's ReadyTalent portal and, when you ask, from LinkedIn and Indeed. It turns your details into ATS-tailored A4 resumes and cover letters. Everything is stored on your own computer.

## Downloads

| System | File |
| --- | --- |
| Windows 10/11 (64-bit) | `AutoResume-Setup-1.3.1-win-x64.exe` |
| macOS, Apple Silicon (M1 or later) | `AutoResume-1.3.1-mac-arm64.dmg` |
| macOS, Intel | `AutoResume-1.3.1-mac-x64.dmg` |

The `.zip` files hold the same Mac apps for anyone who prefers them over a disk image.

## Installing on Windows

Run the installer. Windows SmartScreen may say the publisher is unknown, because the app is not code-signed. Choose **More info**, then **Run anyway**. Allow AutoResume through the firewall if you want to use it from a tablet.

## Installing on macOS

1. Open the `.dmg` and drag **AutoResume** into **Applications**.
2. The app is not notarised by Apple, so macOS blocks the first launch. On **macOS 15 Sequoia or newer**, close the warning, go to **System Settings → Privacy & Security**, and click **Open Anyway** next to AutoResume. On older macOS, right-click AutoResume in Applications, choose **Open**, then **Open** again.
3. If macOS says the app "is damaged" or "can't be opened", run this once in Terminal, then open it normally:

```bash
xattr -dr com.apple.quarantine /Applications/AutoResume.app
```

Allow incoming connections when asked if you want to use AutoResume from a tablet. Saved ReadyTalent sign-in details are encrypted with the macOS Keychain on a Mac and with your Windows account on Windows. Full setup steps are in the [README](https://github.com/nyx-ulrix/readytalent-scraper#readme).

## What's new in 1.3.1

- **Resume and cover letter side by side.** The Resume tab now lists each job once; picking it shows that job's tailored resume and cover letter next to each other (stacked on a phone), each with its own **Save PDF**, **Edit** and **Delete**. **← Back to posting** jumps straight to the job.

## What's new in 1.3.0

- **Use your own AI account instead of an API key.** Settings → AI → Provider now offers **Gemini, signed in with Google** and **Claude, signed in with your Claude account**. They run the official tools on your laptop (Gemini CLI, Claude Code) under your account: Gemini's free daily quota, or your Claude Pro/Max plan's limits. The Settings panel installs the tool, opens its sign-in and tests it. Every AI action (keywords, tailoring, cover letters, resume import, target postings) works this way, also from your phone or tablet through the laptop. Each request runs in an empty temporary folder with no file access, and Claude Code runs in safe mode, so your own Claude Code settings and instructions aren't used.
- **Perplexity** added as an API-key provider (Sonar models).
- API keys for Gemini, OpenAI, Qwen, Claude and Perplexity keep working as before.

Perplexity has no official sign-in tool, so it needs an API key; AutoResume does not automate the Gemini, Claude or Perplexity chat websites.

## What's new in 1.2.16

- **Export jobs.** Every job list (Jobs, Targets, Saved, Applied) has an **Export** button that saves exactly the jobs your current filters and sort show, as a CSV spreadsheet for Excel or Google Sheets: title, company, source, location, salary, job type, working mode, level, posted and closing dates, saved / applied / rejected status, distance, link, skills, requirements and description.

## What's new in 1.2.15

- **Rejected flag.** Next to **Mark applied**, mark a job **Rejected** (it records the date and also counts as applied). Job lists show a red ✗ Rejected tag, and the filter can show **Applied, waiting to hear** or **Rejected**, including on the Applied tab. Click again to undo. Clearing results always keeps rejected applications.

## What's new in 1.2.14

- **Drag to reorder.** In the Details tab, drag the ⠿ handle to put your jobs, projects, education and other entries in your preferred order, and drag whole sections (Competition, Leadership…) too. Works with a mouse and on touch screens; the arrow keys on the handle also move an entry. The ↑ ↓ buttons are gone.
- **Your base resume shows everything.** Every entry, bullet point and skill you've entered, at normal size, over as many A4 pages as it needs (page margins repeat on every printed page). Only tailored resumes are fitted to one A4 page.

## What's new in 1.2.13

- **Progress bars for every scraper.** ReadyTalent shows jobs fetched (e.g. "120 of 437 (27%)"); LinkedIn/Indeed and Targets searches show how many term-and-board searches are done, filling within each search as jobs come in; reading a pasted link or a page for your details shows an estimate bar until it finishes.

## What's new in 1.2.12

- **Fixed:** job rows scrolled over the job list's search box and filters instead of underneath them.

## What's new in 1.2.11

- **Not interested.** Remove a job you don't want with the ✕ on its row or **✕ Not interested** on the job. It stays hidden even if it's scraped again; **Filters → Show removed** lists them and ↺ brings one back.
- **Clear results by source.** The Jobs tab's **Clear results…** menu clears all sources, or only ReadyTalent, LinkedIn or Indeed, showing how many jobs each would delete. Jobs you saved, applied to, pasted yourself, or made a resume or cover letter for are always kept. You confirm by typing **delete**.
- **Fixed:** the LinkedIn/Indeed **Clear results** button on Find jobs deleted saved and applied LinkedIn/Indeed jobs too. It now keeps them.

## What's new in 1.2.10

- **Deleting needs the word "delete".** Deleting an entry, a section, a pasted posting, stored search results or a target title, replacing your details from a resume, or importing a backup now asks you to type **delete** first, like GitHub.
- **Trash icon.** In the Details tab, an entry's delete button is a trash icon inside the opened entry, so it can't be hit by accident from the list.

## What's new in 1.2.9

- **Tidier Details tab.** Every job, project, education and other entry shows as one line (rank, title, organisation, dates). Tap it to open and edit its details; ↑ ↓ change your ranking without opening it. New entries open straight away, and deleting asks first.

## What's new in 1.2.8

- **Details tab.** Your resume content (details, update from a resume or link, ranking, "Only if very relevant") now has its own tab; Settings keeps just the app settings.
- **Targets tab, always there.** Type a specific job title, press ✦ Generate posting, then **Search jobs like this**; the jobs found are kept under that title with full details, and you switch titles from a dropdown.
- **Clearer tailoring rules** (you chose these when conflicts were found):
  - entries relevant enough to the job are picked in your ranking order;
  - substantial work still beats coursework and practice projects, and completed roles beat upcoming ones, even over your ranking;
  - jobs and education are always kept ("Only if very relevant" applies to projects and other sections);
  - skills you confirmed lead the skills line within the 18-skill limit;
  - the 380-480 word limit wins over bullet counts;
  - a hackathon and the project built at it are shown once, as the hackathon entry with the project's key tools and bullet merged in, so its ATS keywords stay.

## What's new in 1.2.7

- **"Only if very relevant".** Tick it on any project, job or other entry you don't find impressive (Settings → Your details). Tailored resumes leave it out unless it closely matches the job, and your base resume never shows it. Saved with your details.

## What's new in 1.2.6

- **Less cluttered: two pages.** **Jobs** is for browsing every scraped posting (ReadyTalent, LinkedIn, Indeed, pasted) in one list with filters. **Find jobs** holds the scraping tools: the ReadyTalent scrape, the LinkedIn/Indeed search with target job titles, and pasting a posting.
- **Phone layout.** Open the laptop's address (Settings → Phone and tablet access) on your phone over the same Wi-Fi: one column, a swipeable tab bar, and a resume preview that fits the screen. Settings now lists only the address your phone can actually reach, with a fix for the most common blocker (Windows Firewall on a Private network).
- **Your ranking for showcasing.** Order your projects, experience and other entries with ↑ ↓ (shown as #1, #2…); tailored resumes pick your higher-ranked ones whenever they're relevant enough to the job.
- **Fixed: data from one device overwriting another.** A laptop window, tablet or browser tab holding an old copy could overwrite newer data when it saved. Saves are now revision-checked: a device with an old copy fetches the latest and re-applies only its own change, and devices refresh when you come back to them.

## What's new in 1.2.5

- **Update your details (Settings).** Add what's new from a newer resume, your portfolio or LinkedIn page, or pasted text. Nothing you already have is removed or reworded: new jobs, projects, bullet points and skills are added below yours, rewordings of bullets you already have are skipped, and **Undo** puts everything back.
- **Targets tab.** Jobs found with **Search jobs like this** are kept under that job title, with their full details, and you pick the title from a dropdown.
- **Filters are remembered.** Each job list keeps its filters, search text and sort between sessions.
- **Sort by Recently fetched**: the jobs the app scraped most recently first.
- **Loading bars** while scraping ReadyTalent, searching LinkedIn/Indeed and reading a pasted link.
- **Tidier Search panel.** Search terms sit in fold-away **Ticked** and **Unticked** groups.

## What's new in 1.2.4

- **Target a specific job title.** On the Search tab, type a title (e.g. "Forward Deployed Engineer") and press ✦ Generate posting: the AI writes a typical posting for the role (clearly marked as an example), plus targeted search terms, including other titles employers use for the same work, and the role's key skills. **Search jobs like this** runs just those terms, and the new sort **Most like: <title>** ranks every job by how closely it matches.

## What's new in 1.2.3

- **Paste a link, get the job.** Pasting a job posting's link on the Search tab reads it and saves it straight away, with no AI and no tokens: title, company, pay, location, job type, deadline, description and matching skills. Works with LinkedIn, MyCareersFuture, company career pages and most job sites, and from the tablet too (the laptop reads the link). Pasting a posting's text still offers ✦ Add with AI or Add without AI.

## What's new in 1.2.2

- **Paste a job posting (Search tab).** Paste a posting's text from any site, or on the laptop app just its link, and press **✦ Add with AI** to fill in the title, company, pay and skills, or **Add without AI** and type the title yourself. Pasted jobs sit with your Search results (source "Pasted") and work like any other job: save, mark applied, tailor a resume, write a cover letter. Sites behind a bot check are not worked around; copy the text from your browser instead.

## What's new in 1.2.1

- **Everything you enter stays stored; resumes show the top of each list.** Tailored resumes are ranked by the AI for the job (at most 3 projects, 2 leadership roles, 12-18 technical skills); the rest are kept underneath, dimmed in Edit, and ↑ swaps one onto the page. Tailored resumes made earlier keep what they showed and get the rest of your details stored underneath.
- **✦ Rank by relevance** in Settings sorts your own projects, sections and skills for the roles you want (Search tab). It only reorders; nothing is reworded or removed.
- Your base resume shows at most 18 technical skills.

## What's new in 1.2.0

- **Find jobs near you.** On every job list, type a place (postcode, street or MRT station) in **Near** and a distance in **within N km** to see only jobs that close, with the distance on each job and a **Nearest first** sort. Addresses are looked up with Singapore's OneMap and OpenStreetMap, once each, and cached. Jobs listed only as "Singapore" or "Remote" have no address to measure.
- **Search by location, filter pay by number.** The search box also matches locations, and pay is filtered by typing a minimum monthly amount (yearly and hourly pay are converted), with an optional "pay listed" tick.
- **Tidier job lists.** All filters and sorting fold into one **Filters & sort** panel, collapsed by default; its header shows how many filters are active and how many jobs match.
- **Fix: bullets under the wrong entry.** Tailoring could attach one entry's bullet to another (for example a robot-project bullet under a web app). Entries are now matched by their own title and organisation, and a rewritten bullet is rejected if it names something from a different entry or uses a number that entry never mentioned. **Re-tailor any resume made with an earlier version.**
- **Better resume curation.** Tailored resumes open with a two-sentence profile aimed at the role, keep the three most relevant projects with two or three bullets each, drop hackathon entries that repeat a listed project, list 12-18 relevant skills instead of every skill, never append job-description keyword lists, and use cautious wording for claims your resume doesn't back with evidence. Soft skills and languages are no longer repeated inside the Technical Skills line.

## New in 1.1.0

- **Every resume and cover letter is exactly one A4 page, and text is never smaller than 8 pt.** If the content is too long, the app first shrinks it (never below 8 pt), then tightens the spacing, then shows fewer bullet points per entry until it fits. Your details are never changed; the Resume tab says how many bullets were left off so you can choose what shows with Edit, or tailor to a job.
- **At most 3 projects and 2 leadership roles.** Tailored resumes pick the ones most relevant to the job, most relevant first, and keep bullets short so they fit the page. Your base resume shows the first ones in your list; reorder them with the new ↑ buttons in Settings.
- Tailoring still never invents anything: education and work experience are always kept, and every kept entry keeps your own title, organisation and dates.

## Everything else

- **ReadyTalent:** automatic SIT sign-in, the full job list with the portal's own employment-type and programme filters, pay, skills and descriptions.
- **LinkedIn and Indeed:** search runs only when you press Search, with terms you type or have the AI suggest. You can filter by job type, working mode, level, company and pay.
- **Resumes:** A4 templates, starting with Standard. Links stay clickable in PDFs, and every tailored version can be edited by hand.
- **Grounded AI** with Gemini, OpenAI, Qwen or Claude. Tailoring may only use facts from your resume and notes. Every AI action asks first and warns that it uses API tokens.
- **Tracking:** Saved and Applied tabs.
- **Tablet access:** use the laptop's app from a tablet over Wi-Fi.

AutoResume scrapes jobs from SIT's ReadyTalent portal and, when you ask, from LinkedIn and Indeed. It turns your details into ATS-tailored A4 resumes and cover letters. Everything is stored on your own computer.

## Downloads

| System | File |
| --- | --- |
| Windows 10/11 (64-bit) | `AutoResume-Setup-1.2.7-win-x64.exe` |
| macOS, Apple Silicon (M1 or later) | `AutoResume-1.2.7-mac-arm64.dmg` |
| macOS, Intel | `AutoResume-1.2.7-mac-x64.dmg` |

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

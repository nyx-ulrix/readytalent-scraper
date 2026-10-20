# AutoResume architecture

How AutoResume is put together, how data moves through it, and the logic behind its main features. The diagrams are [Mermaid](https://mermaid.js.org/), which GitHub renders directly.

- [System overview](#system-overview)
- [Code map](#code-map)
- [Data and where it lives](#data-and-where-it-lives)
- [Flow: tailoring a resume](#flow-tailoring-a-resume)
- [Flow: saving changes from several devices](#flow-saving-changes-from-several-devices)
- [Flow: scraping ReadyTalent](#flow-scraping-readytalent)
- [Flow: LinkedIn and Indeed search, pasted links](#flow-linkedin-and-indeed-search-pasted-links)
- [Flow: fitting a resume onto A4 pages](#flow-fitting-a-resume-onto-a4-pages)
- [Flow: AI with an API key or your own account](#flow-ai-with-an-api-key-or-your-own-account)
- [Flow: building and releasing](#flow-building-and-releasing)
- [Tests](#tests)

## System overview

AutoResume is an Electron desktop app. Its main process runs a small HTTP server on port 4242, which serves the React interface and a JSON API. The desktop window, phones and tablets on the same Wi-Fi all use the same interface and API. Scraping and the signed-in AI tools run only on the laptop. API-key AI calls go straight from whichever device you're on to the AI provider.

```mermaid
flowchart LR
  subgraph Devices["Your devices"]
    W["Laptop window<br/>(Electron renderer)"]
    P["Phone / tablet browser<br/>same Wi-Fi"]
  end

  subgraph Laptop["Laptop: Electron main process"]
    S["HTTP server :4242<br/>React UI + JSON API"]
    IPC["IPC bridge<br/>(preload.cjs)"]
    RT["ReadyTalent scraper<br/>(hidden window)"]
    B["LinkedIn / Indeed / link reader<br/>(hidden window)"]
    ACC["Signed-in AI runner<br/>(Gemini CLI / Claude Code)"]
    F[("Data folder<br/>state.json, jobs.json,<br/>board-jobs.json, geocache.json,<br/>creds.bin (encrypted)")]
  end

  subgraph Web["Internet services"]
    SIT["SIT ReadyTalent portal<br/>+ SIT sign-in (ADFS)"]
    LI["LinkedIn guest job pages"]
    IN["Indeed search pages"]
    JS["Any job site<br/>(schema.org JobPosting)"]
    MAP["OneMap / OpenStreetMap<br/>(address lookup)"]
    AI["AI APIs: Gemini, OpenAI,<br/>Qwen, Claude, Perplexity"]
    OR["OpenRouter price list"]
  end

  W -- "HTTP" --> S
  P -- "HTTP over Wi-Fi" --> S
  W -- "IPC: scrape, search, PDF, sign-in" --> IPC
  IPC --> RT & B & ACC
  S --> F
  S --> B
  S --> ACC
  RT --> SIT
  B --> LI & IN & JS
  S --> MAP
  W -- "API key calls" --> AI
  P -- "API key calls" --> AI
  W --> OR
  ACC -- "your Google / Claude account" --> AI
```

## Code map

```mermaid
flowchart TB
  subgraph UI["src/ (React, runs in every device's browser)"]
    App["App.tsx (tab shell) + pages/*.tsx<br/>Jobs, Find jobs, Targets, Resume,<br/>Settings, Details; jobTasks.ts,<br/>appShared.ts, ui/common.tsx"]
    Store["store.ts<br/>state load/save with revision check,<br/>API clients"]
    AIts["ai.ts<br/>prompts, providers, keywords,<br/>tailoring, cover letters, import"]
    Ground["ground.ts<br/>fact grounding, skill prefs,<br/>similarity score"]
    Limits["limits.ts<br/>what a page shows, ranking,<br/>extra projects"]
    Merge["merge.ts<br/>add new details without<br/>overwriting"]
    Resume["Resume.tsx<br/>templates, A4 pagination,<br/>fit and density"]
    Small["markdown.ts, links.ts, linkify.tsx,<br/>geo.ts, pay.ts, csv.ts, types.ts"]
  end

  subgraph Main["electron/ (Node, laptop only)"]
    MainCjs["main.cjs<br/>HTTP server + API, IPC handlers,<br/>sign-in, geocoding, PDF"]
    Boards["boards.cjs<br/>LinkedIn / Indeed search,<br/>link and page reader"]
    Scrape["scrape.cjs<br/>ReadyTalent extraction<br/>(runs inside the portal page)"]
    Acc["accountai.cjs<br/>Gemini CLI / Claude Code runner"]
    Pre["preload.cjs<br/>window.desktop bridge"]
  end

  App --> Store & AIts & Resume & Limits & Merge & Small
  AIts --> Ground & Limits & Small
  Resume --> Limits & Small
  Ground --> Limits
  Store -- "fetch /api/*" --> MainCjs
  App -- "window.desktop.*" --> Pre --> MainCjs
  MainCjs --> Boards & Scrape & Acc
```

## Data and where it lives

| File (laptop data folder) | What's in it | Written by |
|---|---|---|
| `state.json` | Your details, settings, saved/applied/rejected/not-hiring flags, tailored resumes, cover letters, keywords, search terms, targets, filters, and a revision number `_rev` | `PUT /api/state`, revision-checked |
| `jobs.json` | ReadyTalent postings | ReadyTalent scrape |
| `board-jobs.json` | LinkedIn / Indeed results | Search, Clear results |
| `geocache.json` | Address → coordinates lookups | Distance filter |
| `creds.bin` | ReadyTalent sign-in, encrypted with Windows DPAPI or the macOS Keychain | Settings → ReadyTalent sign-in |
| `meta.json` | The portal's employment-type and programme lists | ReadyTalent scrape |

The data folder is `%APPDATA%\autoresume` on Windows and the app's folder under `~/Library/Application Support/` on a Mac. Every device also keeps a copy of `state` in its browser storage so it keeps working if the laptop is briefly unreachable.

## Flow: tailoring a resume

The AI only rewords and selects; everything it writes is checked against your own resume text and notes before it's kept.

```mermaid
sequenceDiagram
  actor You
  participant UI as Job page / Resume tab
  participant Tasks as Per-job task store
  participant AI as AI provider
  participant G as ground.ts
  participant S as State (store.ts)

  You->>UI: ✦ Tailor resume
  UI->>You: Token-cost confirmation
  You->>UI: OK
  UI->>Tasks: mark job "resume" running (other jobs can run too)
  alt no ATS keywords yet
    UI->>AI: extract keywords from the posting and your resume
    AI-->>UI: keyword list
    UI->>S: save keywords for this job
  end
  UI->>AI: curation prompt: rules, your ranking, keywords, job, your resume
  AI-->>UI: draft resume JSON
  UI->>AI: fact-check pass against your source text
  AI-->>UI: corrected JSON
  UI->>G: groundProfile: pin titles, orgs and dates, drop invented entries, reject unsupported numbers and borrowed names, rank and record show counts
  G-->>UI: grounded resume (everything stored, top picks shown)
  UI->>G: applySkillPrefs: confirmed skills first, left-out skills removed
  UI->>S: save tailored resume and timestamp
  S-->>UI: saved (revision-checked)
  UI->>Tasks: done, show "Tailored resume ready"
```

What the grounding step guarantees:

```mermaid
flowchart TD
  A["AI draft entry"] --> B{"Matches one of your entries<br/>by title (and org)?"}
  B -- "no" --> X["Dropped: invented entry"]
  B -- "yes" --> C["Title, org, location and dates<br/>copied from your original"]
  C --> D{"Each rewritten bullet"}
  D --> E{"Uses only numbers found in this entry<br/>or your notes?"}
  E -- "no" --> R["Reverts to your original bullet"]
  E -- "yes" --> F{"Names something that belongs to a different entry?<br/>(a linked hackathon/project pair is allowed)"}
  F -- "yes" --> R
  F -- "no" --> K["Kept"]
  G["AI skills list"] --> H{"Appears in your resume or notes?"}
  H -- "no" --> Y["Dropped"]
  H -- "yes" --> Z["Kept, in the AI's relevance order;<br/>your other skills stored after it"]
```

## Flow: saving changes from several devices

The laptop window, a phone and a tablet can all edit at once without overwriting each other.

```mermaid
flowchart TD
  U["You change something<br/>(any device)"] --> L["Apply locally and save to<br/>this device's browser storage"]
  L --> Q["Queue the change"]
  Q --> P["PUT /api/state<br/>with the revision this copy is based on"]
  P --> C{"Laptop's revision<br/>the same?"}
  C -- "yes" --> OK["Saved: revision + 1"]
  C -- "no, another device saved first" --> F409["409 Conflict"]
  F409 --> G["Fetch the latest state"]
  G --> RP["Re-apply only this device's<br/>queued changes on top"]
  RP --> P
  P -. "laptop unreachable" .-> RT["Keep the changes, retry in 5 s"]
  W["Window focus / every 30 s"] --> RF["Fetch latest if nothing is queued"]
```

## Flow: scraping ReadyTalent

```mermaid
flowchart TD
  A["Scrape ReadyTalent"] --> B["Open the portal in a hidden window<br/>(fresh session every launch)"]
  B --> C{"Signed in?<br/>(portal checkAuth)"}
  C -- "no" --> D{"Saved sign-in?"}
  D -- "yes" --> E["Fill the SIT ADFS form<br/>username, password, submit"]
  D -- "no" --> M["Show the portal window:<br/>sign in yourself"]
  E --> F{"Student ID appears?"}
  F -- "no (MFA / error)" --> M
  F -- "yes" --> G
  M --> G["Signed in"]
  C -- "yes" --> G
  G --> H["Run scrape.cjs inside the page:<br/>call the portal's own API gateway<br/>(rotating apitoken header)"]
  H --> I["Job list, then each job's details<br/>with progress (job i of n)"]
  I --> J["Merge into jobs.json<br/>(delisted jobs flagged), update meta.json"]
```

## Flow: LinkedIn and Indeed search, pasted links

```mermaid
flowchart TD
  T["Ticked search terms<br/>(or a Target's terms)"] --> L1["For each term × board<br/>(progress: searches done)"]
  L1 --> LI["LinkedIn guest search API<br/>job type / workplace / level filters"]
  L1 --> IN["Indeed search page<br/>reads the page's embedded card data"]
  LI --> LD["Open each new job's guest page<br/>for the full description"]
  IN --> IC["Indeed: card summary, pay, tags<br/>(its job pages sit behind a human check,<br/>which AutoResume never bypasses)"]
  LD --> SK["Match skills against your skills<br/>and ReadyTalent skill names"]
  IC --> SK
  SK --> BJ["board-jobs.json"]

  PL["Paste a link"] --> PU{"Public web address?<br/>(no localhost / private IPs)"}
  PU -- "no" --> NO["Refused"]
  PU -- "yes" --> LK{"LinkedIn job?"}
  LK -- "yes" --> GP["LinkedIn guest job page"]
  LK -- "no" --> PG["Load the page"]
  PG --> BC{"Bot check?"}
  BC -- "yes" --> AS["Ask you to paste the text instead"]
  BC -- "no" --> JL["schema.org JobPosting data<br/>(title, company, pay, location, dates)<br/>else page title + text"]
  GP --> SV["Saved as a pasted job, no AI"]
  JL --> SV
```

## Flow: fitting a resume onto A4 pages

```mermaid
flowchart TD
  P["Resume to show"] --> K{"Tailored?"}
  K -- "no: base resume" --> BASE["Show everything you've entered<br/>at full size, as many A4 pages as needed"]
  K -- "yes" --> V["Show the AI's picks<br/>(max 3 projects, 2 leadership, 18 skills)"]
  V --> PG["Paginate like the printer:<br/>entries never split, headings stay<br/>with what follows, measured at the<br/>preview's zoom"]
  PG --> TWO{"Fits 2 pages<br/>at full size?"}
  TWO -- "no" --> SH["Shrink evenly (CSS zoom),<br/>never below 8 pt"]
  SH --> STILL{"Fits now?"}
  STILL -- "no" --> DEN["Tighter spacing, then fewer<br/>bullets per entry"]
  STILL -- "yes" --> OUT
  DEN --> OUT["Show + report:<br/>pages, smallest text, what changed"]
  TWO -- "yes" --> HALF{"Spills onto page 2<br/>but less than half full?"}
  HALF -- "no" --> OUT
  HALF -- "yes" --> MORE{"Another stored project left?<br/>(your ranking, not 'only if very relevant')"}
  MORE -- "no" --> OUT
  MORE -- "yes" --> ADD["Add it and paginate again"]
  ADD --> FIT{"Still 2 pages at full size?"}
  FIT -- "yes" --> HALF
  FIT -- "no" --> BACK["Take it back out"] --> OUT
```

Printing uses the same layout: **Save PDF** prints one document at a time (resume or cover letter) on A4 with the page margins repeated on every page.

## Flow: AI with an API key or your own account

```mermaid
flowchart TD
  A["Any ✦ AI action<br/>(confirmed first)"] --> P{"Provider in Settings"}
  P -- "Gemini / OpenAI / Qwen /<br/>Claude / Perplexity (API key)" --> K["Call the provider's API directly<br/>with your key from this device"]
  P -- "Gemini or Claude<br/>signed in with your account" --> H["POST /api/ai-account<br/>(through the laptop)"]
  H --> T["Fresh empty temp folder"]
  T --> CLI{"Tool"}
  CLI -- "Gemini CLI" --> GE["gemini -p ... -o json<br/>prompt piped in"]
  CLI -- "Claude Code" --> CC["claude -p ... --output-format json<br/>--tools '' --safe-mode<br/>prompt piped in"]
  GE --> R{"Busy / token refresh<br/>/ rate limit?"}
  CC --> R
  R -- "yes" --> W["Wait and retry (up to 3 times)"] --> CLI
  R -- "no" --> OUT["Answer text"]
  K --> OUT
  OUT --> J{"JSON expected?"}
  J -- "yes" --> X["Strip code fences / prose,<br/>parse JSON"]
  J -- "no" --> D["Plain text"]
```

## Flow: building and releasing

```mermaid
flowchart LR
  C["Commit + push to main"] --> T["Push a v* tag"]
  T --> GA["GitHub Actions: release.yml"]
  GA --> WIN["windows-latest<br/>tests, type check,<br/>NSIS installer"]
  GA --> MAC["macos-latest<br/>tests, type check,<br/>dmg + zip, arm64 + x64,<br/>ad-hoc signed"]
  WIN --> REL["GitHub Release<br/>with release-notes.md"]
  MAC --> REL
  C --> LOC["Local build on the laptop<br/>vite build + electron-builder --win nsis"]
  LOC --> INS["Silent install, then open<br/>AutoResume through Explorer"]
```

## Tests

`pnpm test` runs dependency-free self-checks with Node:

| Test | Covers |
|---|---|
| `test/boards.test.cjs` | Search filters, skill matching, Indeed hosts, pasted-link parsing (JSON-LD, pay, LinkedIn ids, blocked addresses) |
| `test/ground.test.ts` | Fact grounding, skill preferences, ranking and show counts, base vs tailored views, filling page 2, hackathon/project linking, similarity score |
| `test/merge.test.ts` | Adding new details without overwriting, reworded and combined bullets |
| `test/markdown.test.ts` | The .md resume template round trip |
| `test/pay.test.ts` | Monthly pay from any salary text |
| `test/linkify.test.ts` | Clickable links in PDFs |
| `test/geo.test.ts` | Distances and place queries |
| `test/csv.test.ts` | Spreadsheet export escaping |
| `electron/scrape.test.cjs` | ReadyTalent extraction on a mocked portal |

CI also runs `tsc --noEmit` before building.

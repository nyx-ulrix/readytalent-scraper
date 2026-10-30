# Graph Report - readytalent-scraper  (2026-10-30)

## Corpus Check
- 46 files · ~48,437 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 1, .webmanifest 1, .icns 1)

## Summary
- 516 nodes · 1179 edges · 26 communities (20 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `45c178da`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- store.ts
- ground.ts
- boards.cjs
- package.json
- ai.ts
- main.cjs
- Resume.tsx
- accountai.cjs
- merge.ts
- build
- Laptop Data Folder (state.json, jobs.json, board-jobs.json, geocache.json, creds.bin, meta.json)
- Details.tsx
- AutoResume README
- compilerOptions
- Jobs.tsx
- with
- Flow: AI With API Key or Own Account
- Flow: LinkedIn/Indeed Search and Pasted Links
- Fill Half-Empty Second Page
- allowBuilds
- API-Key AI Providers (Gemini, OpenAI, Qwen, Claude, Perplexity)
- Release Notes (v1.3.7)
- Unsigned / Un-notarised App Install Workaround
- Flow: Building and Releasing
- Self-Check Test Suite (pnpm test)
- Markdown Resume Template Round Trip

## God Nodes (most connected - your core abstractions)
1. `Jobs()` - 21 edges
2. `Settings()` - 19 edges
3. `ai()` - 18 edges
4. `aiConfirm()` - 16 edges
5. `FindPage()` - 16 edges
6. `aiCfg()` - 15 edges
7. `confirmDelete()` - 15 edges
8. `react` - 14 edges
9. `ProfileBody()` - 14 edges
10. `Profile` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Grounded AI (fact-check + rule check)` --semantically_similar_to--> `Grounding Guarantees (entry match, number check, borrowed names)`  [INFERRED] [semantically similar]
  README.md → docs/ARCHITECTURE.md
- `Revision-Checked Multi-Device Saves` --semantically_similar_to--> `Flow: Saving From Several Devices (409 Conflict + re-apply)`  [INFERRED] [semantically similar]
  .github/release-notes.md → docs/ARCHITECTURE.md
- `ReadyTalent Scraping (SIT ADFS sign-in)` --semantically_similar_to--> `Flow: Scraping ReadyTalent`  [INFERRED] [semantically similar]
  README.md → docs/ARCHITECTURE.md
- `LinkedIn and Indeed Search` --semantically_similar_to--> `Flow: LinkedIn/Indeed Search and Pasted Links`  [INFERRED] [semantically similar]
  README.md → docs/ARCHITECTURE.md
- `Type 'delete' Confirmation` --semantically_similar_to--> `AI Only On Click (token-cost confirmation)`  [INFERRED] [semantically similar]
  .github/release-notes.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Resume tailoring pipeline (curate, ground, fit A4)** — docs_architecture_tailoring_flow, docs_architecture_groundprofile, docs_architecture_applyskillprefs, docs_architecture_a4_fit_flow, docs_architecture_per_job_task_store [EXTRACTED 1.00]
- **Job ingestion sources (ReadyTalent, boards, pasted links)** — docs_architecture_readytalent_scrape_flow, docs_architecture_board_search_flow, docs_architecture_schema_org_jobposting, _github_release_notes_paste_link_job [INFERRED 0.85]

## Communities (26 total, 6 thin omitted)

### Community 0 - "store.ts"
Cohesion: 0.11
Nodes (44): HTTP Server :4242 (React UI + JSON API), index.html (Vite entry, PWA manifest), Phone / Tablet LAN Access (:4242), react, generateSearchTerms(), listFrom(), readPosting(), suggestRoles() (+36 more)

### Community 1 - "ground.ts"
Cohesion: 0.13
Nodes (27): applySkillPrefs(), BulletContext, entryText(), groundEntries(), groundLine(), groundProfile(), inSource(), likeScore() (+19 more)

### Community 2 - "boards.cjs"
Cohesion: 0.10
Nodes (36): boardWindow(), csv(), EMP, empKey(), IN_LEVEL, indeed(), indeedHost(), LD_EMP (+28 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (37): author, description, devDependencies, electron@^37.10.3, electron-builder@^26.15.3, react@^19.0.0, react-dom@^19.0.0, @types/react@^19.0.0 (+29 more)

### Community 4 - "ai.ts"
Cohesion: 0.07
Nodes (57): accountAi(), ai(), AiConfig, anthropic(), ANTHROPIC_HEADERS(), arrOr(), Attachment, coverLetter() (+49 more)

### Community 5 - "main.cjs"
Cohesion: 0.12
Nodes (22): autoLogin(), boot(), createMainWindow(), CREDS(), DIST, file(), geocodeMany(), isSignedIn() (+14 more)

### Community 6 - "Resume.tsx"
Cohesion: 0.14
Nodes (32): stamp(), jobAiQuestion(), Linkify(), headerLinks(), hrefFor(), linkParts(), PATTERN, PHONE (+24 more)

### Community 7 - "accountai.cjs"
Cohesion: 0.20
Nodes (9): ask(), askOnce(), CLAUDE_MODELS, EXT, friendly(), GEMINI_MODELS, parseJson(), run() (+1 more)

### Community 8 - "merge.ts"
Cohesion: 0.24
Nodes (14): isNew(), key(), MergeCount, mergeEntries(), mergeLines(), mergeProfile(), mergeSummary(), newBullet() (+6 more)

### Community 9 - "build"
Cohesion: 0.08
Nodes (26): build, appId, directories, dmg, files, mac, nsis, productName (+18 more)

### Community 10 - "Laptop Data Folder (state.json, jobs.json, board-jobs.json, geocache.json, creds.bin, meta.json)"
Cohesion: 0.18
Nodes (10): Distance Filter (Near / within N km), CSV Job Export, Not Currently Hiring Flag, Revision-Checked Multi-Device Saves, creds.bin (DPAPI / Keychain encrypted), Laptop Data Folder (state.json, jobs.json, board-jobs.json, geocache.json, creds.bin, meta.json), Flow: Saving From Several Devices (409 Conflict + re-apply), Flow: Scraping ReadyTalent (+2 more)

### Community 11 - "Details.tsx"
Cohesion: 0.12
Nodes (31): isLeadership(), MAX_PROJECTS, MAX_SKILLS, sectionKey(), sectionLimit(), shownCount(), spareProjects(), visible() (+23 more)

### Community 12 - "AutoResume README"
Cohesion: 0.67
Nodes (3): AutoResume Architecture, AutoResume README, Code Map (graphify)

### Community 13 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+4 more)

### Community 14 - "Jobs.tsx"
Cohesion: 0.11
Nodes (25): scrapeInPage(), calls, matchKeywords(), sourceOf(), toCsv(), distanceKm(), formatKm(), LatLon (+17 more)

### Community 15 - "with"
Cohesion: 0.06
Nodes (34): runs-on, steps, strategy, GH_TOKEN, dist, os, jobs, build (+26 more)

### Community 16 - "Flow: AI With API Key or Own Account"
Cohesion: 0.14
Nodes (10): Concurrent Per-Job Tailoring, Type 'delete' Confirmation, Flow: AI With API Key or Own Account, POST /api/ai-account, applySkillPrefs, Signed-in CLI Retry (up to 3 times), groundProfile, Per-Job Task Store (+2 more)

### Community 17 - "Flow: LinkedIn/Indeed Search and Pasted Links"
Cohesion: 0.40
Nodes (5): Paste a Link, Get the Job, Targets Tab (Generate Posting), Flow: LinkedIn/Indeed Search and Pasted Links, schema.org JobPosting Extraction, LinkedIn and Indeed Search

### Community 18 - "Fill Half-Empty Second Page"
Cohesion: 0.50
Nodes (4): Only If Very Relevant Flag, Fill Half-Empty Second Page, Printer-Accurate Page Counting, Flow: Fitting a Resume onto A4 Pages

### Community 19 - "allowBuilds"
Cohesion: 0.50
Nodes (3): allowBuilds, electron, electron-winstaller

## Knowledge Gaps
- **24 isolated node(s):** `applySkillPrefs`, `Distance Filter (Near / within N km)`, `CSV Job Export`, `Revision-Checked Multi-Device Saves`, `ReadyTalent Scraping (SIT ADFS sign-in)` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 180 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `store.ts` to `package.json`, `ai.ts`, `Resume.tsx`, `Details.tsx`, `Jobs.tsx`?**
  _High betweenness centrality (0.232) - this node is a cross-community bridge._
- **What connects `applySkillPrefs`, `Distance Filter (Near / within N km)`, `CSV Job Export` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `store.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10901960784313726 - nodes in this community are weakly interconnected._
- **Why does `electron` connect `package.json` to `boards.cjs`, `main.cjs`, `accountai.cjs`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Should `ground.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `build` connect `build` to `package.json`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Should `boards.cjs` be split into smaller, more focused modules?**
  _Cohesion score 0.09581646423751687 - nodes in this community are weakly interconnected._
# Graph Report - AutoResume  (2026-10-20)

## Corpus Check
- 44 files · ~49,068 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 506 nodes · 1113 edges · 16 communities (15 shown, 1 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 52 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e4b4ed0b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Jobs.tsx
- ground.ts
- boards.cjs
- package.json
- ai.ts
- main.cjs
- Resume.tsx
- accountai.cjs
- merge.ts
- build
- scrape.test.cjs
- Details.tsx
- build job (windows/macos matrix)
- compilerOptions
- ref_node_assert

## God Nodes (most connected - your core abstractions)
1. `ai()` - 19 edges
2. `aiConfirm()` - 16 edges
3. `Jobs()` - 16 edges
4. `aiCfg()` - 15 edges
5. `Profile` - 15 edges
6. `confirmDelete()` - 15 edges
7. `groundProfile()` - 13 edges
8. `Settings()` - 13 edges
9. `isDesktop()` - 13 edges
10. `jobAi()` - 12 edges

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
- **Tag-triggered release pipeline** — _github_workflows_release_release_workflow, _github_workflows_release_build, _github_workflows_release_release, _github_release_notes_release_notes, docs_architecture_tests [EXTRACTED 1.00]
- **Resume tailoring pipeline (curate, ground, fit A4)** — docs_architecture_tailoring_flow, docs_architecture_groundprofile, docs_architecture_applyskillprefs, docs_architecture_a4_fit_flow, docs_architecture_per_job_task_store [EXTRACTED 1.00]
- **Job ingestion sources (ReadyTalent, boards, pasted links)** — docs_architecture_readytalent_scrape_flow, docs_architecture_board_search_flow, docs_architecture_schema_org_jobposting, _github_release_notes_paste_link_job [INFERRED 0.85]

## Communities (16 total, 1 thin omitted)

### Community 0 - "Jobs.tsx"
Cohesion: 0.07
Nodes (69): extractKeywords(), readPosting(), sourceText(), App(), Tab, TAB_LABEL, aiCfg(), aiConfirm() (+61 more)

### Community 1 - "ground.ts"
Cohesion: 0.09
Nodes (38): Markdown Resume Template Round Trip, applySkillPrefs(), BulletContext, entryText(), groundEntries(), groundLine(), groundProfile(), inSource() (+30 more)

### Community 2 - "boards.cjs"
Cohesion: 0.07
Nodes (46): Paste a Link, Get the Job, Targets Tab (Generate Posting), Flow: LinkedIn/Indeed Search and Pasted Links, schema.org JobPosting Extraction, boardWindow(), { BrowserWindow }, csv(), EMP (+38 more)

### Community 3 - "package.json"
Cohesion: 0.05
Nodes (38): electron, electron-builder, author, description, devDependencies, electron, electron-builder, react (+30 more)

### Community 4 - "ai.ts"
Cohesion: 0.08
Nodes (50): API-Key AI Providers (Gemini, OpenAI, Qwen, Claude, Perplexity), OpenRouter Model Price List, accountAi(), ai(), AiConfig, anthropic(), ANTHROPIC_HEADERS(), arrOr() (+42 more)

### Community 5 - "main.cjs"
Cohesion: 0.08
Nodes (39): HTTP Server :4242 (React UI + JSON API), electron_boards_showboardwindow, electron_boards_stopboards, accountAi, { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, session }, autoLogin(), boot(), createMainWindow() (+31 more)

### Community 6 - "Resume.tsx"
Cohesion: 0.10
Nodes (28): Only If Very Relevant Flag, Fill Half-Empty Second Page, Printer-Accurate Page Counting, Flow: Fitting a Resume onto A4 Pages, Linkify(), headerLinks(), hrefFor(), linkParts() (+20 more)

### Community 7 - "accountai.cjs"
Cohesion: 0.07
Nodes (32): Concurrent Per-Job Tailoring, Tailoring Conflict Rules, Type 'delete' Confirmation, Flow: AI With API Key or Own Account, POST /api/ai-account, applySkillPrefs, Signed-in CLI Retry (up to 3 times), Grounding Guarantees (entry match, number check, borrowed names) (+24 more)

### Community 8 - "merge.ts"
Cohesion: 0.24
Nodes (16): isNew(), key(), MergeCount, mergeEntries(), mergeLines(), mergeProfile(), mergeSummary(), newBullet() (+8 more)

### Community 9 - "build"
Cohesion: 0.06
Nodes (30): { contextBridge, ipcRenderer }, build, appId, directories, dmg, files, mac, nsis (+22 more)

### Community 10 - "scrape.test.cjs"
Cohesion: 0.10
Nodes (16): Distance Filter (Near / within N km), CSV Job Export, Not Currently Hiring Flag, Revision-Checked Multi-Device Saves, creds.bin (DPAPI / Keychain encrypted), Laptop Data Folder (state.json, jobs.json, board-jobs.json, geocache.json, creds.bin, meta.json), Flow: Saving From Several Devices (409 Conflict + re-apply), Flow: Scraping ReadyTalent (+8 more)

### Community 11 - "Details.tsx"
Cohesion: 0.18
Nodes (22): byRank(), isLeadership(), MAX_PROJECTS, MAX_SKILLS, norm(), sectionKey(), sectionLimit(), shownCount() (+14 more)

### Community 12 - "build job (windows/macos matrix)"
Cohesion: 0.19
Nodes (13): Release Notes (v1.3.7), Unsigned / Un-notarised App Install Workaround, build job (windows/macos matrix), Check every installer was built, Verify macOS ad-hoc signature, release job (gh release create), Release Workflow (GitHub Actions), AutoResume Architecture (+5 more)

### Community 13 - "compilerOptions"
Cohesion: 0.12
Nodes (16): DOM, DOM.Iterable, ES2022, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+8 more)

## Knowledge Gaps
- **155 isolated node(s):** `{ spawn }`, `{ shell }`, `fs`, `os`, `path` (+150 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `e()` connect `boards.cjs` to `merge.ts`?**
  _High betweenness centrality (0.273) - this node is a cross-community bridge._
- **Why does `electron/**/*` connect `build` to `boards.cjs`, `main.cjs`, `accountai.cjs`?**
  _High betweenness centrality (0.232) - this node is a cross-community bridge._
- **What connects `{ spawn }`, `{ shell }`, `fs` to the rest of the system?**
  _155 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Jobs.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07405230678812812 - nodes in this community are weakly interconnected._
- **Should `ground.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08970099667774087 - nodes in this community are weakly interconnected._
- **Should `boards.cjs` be split into smaller, more focused modules?**
  _Cohesion score 0.0700354609929078 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
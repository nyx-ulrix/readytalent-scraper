# Graph Report - AutoResume  (2026-10-20)

## Corpus Check
- Corpus is ~48,285 words - fits in a single context window. You may not need a graph.

## Summary
- 486 nodes · 969 edges · 14 communities
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.86)
- Token cost: 0 input · 114,042 output

## Community Hubs (Navigation)
- App UI and AI Triggers
- Grounding and Tailoring Rules
- Job Boards and Pasted Links
- Server, Entry and Package
- AI Providers and Prompts
- Electron Main Process
- Page Layout and Links
- Concurrent and Signed-in AI
- Markdown Import and Merge
- Installer Build Config
- Data Files and Scraping
- State Sync Store
- Release Pipeline
- TypeScript Config

## God Nodes (most connected - your core abstractions)
1. `ai()` - 19 edges
2. `Jobs()` - 15 edges
3. `groundProfile()` - 13 edges
4. `Detail()` - 12 edges
5. `Settings()` - 12 edges
6. `Profile` - 12 edges
7. `FindPage()` - 11 edges
8. `tailorResume()` - 11 edges
9. `coverLetter()` - 11 edges
10. `compilerOptions` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Revision-Checked Multi-Device Saves` --semantically_similar_to--> `Flow: Saving From Several Devices (409 Conflict + re-apply)`  [INFERRED] [semantically similar]
  .github/release-notes.md → docs/ARCHITECTURE.md
- `Type 'delete' Confirmation` --semantically_similar_to--> `AI Only On Click (token-cost confirmation)`  [INFERRED] [semantically similar]
  .github/release-notes.md → README.md
- `Grounded AI (fact-check + rule check)` --semantically_similar_to--> `Grounding Guarantees (entry match, number check, borrowed names)`  [INFERRED] [semantically similar]
  README.md → docs/ARCHITECTURE.md
- `Signed-in AI (Gemini CLI / Claude Code)` --semantically_similar_to--> `Flow: AI With API Key or Own Account`  [INFERRED] [semantically similar]
  README.md → docs/ARCHITECTURE.md
- `ReadyTalent Scraping (SIT ADFS sign-in)` --semantically_similar_to--> `Flow: Scraping ReadyTalent`  [INFERRED] [semantically similar]
  README.md → docs/ARCHITECTURE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Resume tailoring pipeline (curate, ground, fit A4)** — docs_architecture_tailoring_flow, docs_architecture_groundprofile, docs_architecture_applyskillprefs, docs_architecture_a4_fit_flow, docs_architecture_per_job_task_store [EXTRACTED 1.00]
- **Tag-triggered release pipeline** — _github_workflows_release_release_workflow, _github_workflows_release_build, _github_workflows_release_release, _github_release_notes_release_notes, docs_architecture_tests [EXTRACTED 1.00]
- **Job ingestion sources (ReadyTalent, boards, pasted links)** — docs_architecture_readytalent_scrape_flow, docs_architecture_board_search_flow, docs_architecture_schema_org_jobposting, _github_release_notes_paste_link_job [INFERRED 0.85]

## Communities (14 total, 0 thin omitted)

### Community 0 - "App UI and AI Triggers"
Cohesion: 0.06
Nodes (61): generateSearchTerms(), listFrom(), matchKeywords(), readPosting(), suggestRoles(), AccountSetup(), aiCfg(), aiConfirm() (+53 more)

### Community 1 - "Grounding and Tailoring Rules"
Cohesion: 0.08
Nodes (46): Tailoring Conflict Rules, applySkillPrefs, Grounding Guarantees (entry match, number check, borrowed names), groundProfile, Flow: Tailoring a Resume, Grounded AI (fact-check + rule check), applySkillPrefs(), BulletContext (+38 more)

### Community 2 - "Job Boards and Pasted Links"
Cohesion: 0.07
Nodes (45): Paste a Link, Get the Job, Targets Tab (Generate Posting), Flow: LinkedIn/Indeed Search and Pasted Links, schema.org JobPosting Extraction, boardWindow(), { BrowserWindow }, csv(), EMP (+37 more)

### Community 3 - "Server, Entry and Package"
Cohesion: 0.05
Nodes (41): HTTP Server :4242 (React UI + JSON API), index.html (Vite entry, PWA manifest), author, description, devDependencies, electron, electron-builder, react (+33 more)

### Community 4 - "AI Providers and Prompts"
Cohesion: 0.09
Nodes (42): API-Key AI Providers (Gemini, OpenAI, Qwen, Claude, Perplexity), OpenRouter Model Price List, accountAi(), ai(), AiConfig, anthropic(), ANTHROPIC_HEADERS(), arrOr() (+34 more)

### Community 5 - "Electron Main Process"
Cohesion: 0.09
Nodes (35): electron_boards_showboardwindow, electron_boards_stopboards, accountAi, { app, BrowserWindow, ipcMain, dialog, shell, safeStorage }, autoLogin(), boot(), createMainWindow(), CREDS() (+27 more)

### Community 6 - "Page Layout and Links"
Cohesion: 0.10
Nodes (28): Only If Very Relevant Flag, Fill Half-Empty Second Page, Printer-Accurate Page Counting, Flow: Fitting a Resume onto A4 Pages, Linkify(), headerLinks(), hrefFor(), linkParts() (+20 more)

### Community 7 - "Concurrent and Signed-in AI"
Cohesion: 0.08
Nodes (28): Concurrent Per-Job Tailoring, Type 'delete' Confirmation, Flow: AI With API Key or Own Account, POST /api/ai-account, Signed-in CLI Retry (up to 3 times), Per-Job Task Store, ask(), askOnce() (+20 more)

### Community 8 - "Markdown Import and Merge"
Cohesion: 0.12
Nodes (27): Markdown Resume Template Round Trip, UpdateDetails(), BUILT_IN, entryMd(), MARKER, sectionMd(), toMarkdown(), isNew() (+19 more)

### Community 9 - "Installer Build Config"
Cohesion: 0.08
Nodes (26): build, appId, directories, dmg, files, mac, nsis, productName (+18 more)

### Community 10 - "Data Files and Scraping"
Cohesion: 0.09
Nodes (18): Distance Filter (Near / within N km), CSV Job Export, Not Currently Hiring Flag, Revision-Checked Multi-Device Saves, creds.bin (DPAPI / Keychain encrypted), Laptop Data Folder (state.json, jobs.json, board-jobs.json, geocache.json, creds.bin, meta.json), Flow: Saving From Several Devices (409 Conflict + re-apply), Flow: Scraping ReadyTalent (+10 more)

### Community 11 - "State Sync Store"
Cohesion: 0.18
Nodes (17): apply(), ClearScope, fetchState(), load(), normalize(), Patch, useAppState(), withTimeout() (+9 more)

### Community 12 - "Release Pipeline"
Cohesion: 0.19
Nodes (13): Release Notes (v1.3.7), Unsigned / Un-notarised App Install Workaround, build job (windows/macos matrix), Check every installer was built, Verify macOS ad-hoc signature, release job (gh release create), Release Workflow (GitHub Actions), AutoResume Architecture (+5 more)

### Community 13 - "TypeScript Config"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+4 more)

## Knowledge Gaps
- **162 isolated node(s):** `{ spawn }`, `{ shell }`, `fs`, `os`, `path` (+157 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 192 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Server, Entry and Package` to `App UI and AI Triggers`, `State Sync Store`, `Page Layout and Links`?**
  _High betweenness centrality (0.270) - this node is a cross-community bridge._
- **Why does `electron` connect `Concurrent and Signed-in AI` to `Job Boards and Pasted Links`, `Server, Entry and Package`, `Electron Main Process`?**
  _High betweenness centrality (0.204) - this node is a cross-community bridge._
- **Why does `build` connect `Installer Build Config` to `Server, Entry and Package`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **What connects `{ spawn }`, `{ shell }`, `fs` to the rest of the system?**
  _162 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App UI and AI Triggers` be split into smaller, more focused modules?**
  _Cohesion score 0.06050228310502283 - nodes in this community are weakly interconnected._
- **Should `Grounding and Tailoring Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.07673469387755102 - nodes in this community are weakly interconnected._
- **Should `Job Boards and Pasted Links` be split into smaller, more focused modules?**
  _Cohesion score 0.0730804810360777 - nodes in this community are weakly interconnected._
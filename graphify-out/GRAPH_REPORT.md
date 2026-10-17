# Graph Report - melodia  (2026-10-18)

## Corpus Check
- 300 files · ~1,480,997 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .ico 1, .css 1)

## Summary
- 2499 nodes · 6718 edges · 119 communities (110 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 62 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d557b7b3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- JEV Startup Sweep
- Send Queues & Planning
- Job Assist & Places
- Queue/Account Admin UI
- sendCampaign.ts
- Scheduled Thread Replies
- mailer.ts
- Send/History UI
- Contact Table & Messages
- Contacts Data Access
- Hunter Convert Pipeline
- Mail Account Store
- Job Search Sources Hub
- Job Source Cache
- Email Finder (LLM)
- Seedtable Import
- People Finder
- keyed.ts
- ATS Job Boards
- Email Sweep
- PDF Parsing Script
- CSV Import Schema
- Job API Quota
- Company Enrich
- Recipients & Preflight
- IMAP Inbox
- getContacts
- Debug Logger Stream
- Auth & Login
- Grokbot API
- Mail Store API
- App Shell & Nav
- Job HTTP Client
- Careers Scraper
- Job Dedup Normalize
- Bulk Templates
- People Sweep
- CompanyCheck.tsx
- Seed Import UI
- queueStats.ts
- Lint Config
- lib/types.ts
- Widget Queues
- Dashboard & Follow-ups
- Claude CLI Email Finder
- Reply Draft UI
- TS Config
- Harness Rules & Skills
- XML Job Sources
- JobAssist API
- Agent Glossary & Setup
- Reply Triage
- Widget API Tests
- Send History
- Mail App UI
- Codex Email Finder
- Reply LLM Drafts
- HARNESS.md
- ensureAccounts
- autoSchedule.ts
- warmup.ts
- ContactDoc
- Usage Tracking
- startupFinder.ts
- Usage Panel
- FilterBar.tsx
- Email Sending Plan Docs
- Runtime Dependencies
- Contact Scoring
- Dev Dependencies
- 4DayWeek Source
- Claude Settings Hooks
- NPM Scripts
- JEV Panel
- Harness & ADRs
- Audit Findings
- README Features
- Interview Brief
- getDb
- jobs/types.ts
- countContacts
- Resend Mail
- Bot & Company API Docs
- Mail Sync API
- themuse.ts
- Mail Chart
- lib/env.ts
- Deployment Architecture
- Design System: [Product name]
- Hook Lib
- AGENTS.md
- New feature: $ARGUMENTS
- add-source-segment.js
- listContactIds
- makeJob
- sendWindow.ts
- Gate-Stop Hook
- Guard-Bash Hook
- Protect-Files Hook
- Format Hook
- Session-Context Hook
- Bot & Proxy Notes
- PostCSS Config
- Serena Config
- PRD: [Product name]
- Architecture: [Product name]
- DebugConsole.tsx
- scrapeEmail.ts
- importStream.worker.ts
- toParagraphs
- Security: [Product name]
- HistoryPanel.tsx
- Claude Code guide: [Product name]
- ContactFilters
- Deploy: $ARGUMENTS
- Tasks
- Review changes
- scanMailbox
- README.md

## God Nodes (most connected - your core abstractions)
1. `getContacts()` - 92 edges
2. `credential()` - 73 edges
3. `next` - 68 edges
4. `createLogger()` - 64 edges
5. `formatNumber()` - 61 edges
6. `react` - 49 edges
7. `stripHtml()` - 46 edges
8. `makeJob()` - 45 edges
9. `loadStoredAccounts()` - 42 edges
10. `toISO()` - 41 edges

## Surprising Connections (you probably didn't know these)
- `Code style` --references--> `template()`  [INFERRED]
  HARNESS.md → src/lib/importSchema.ts
- `1. Preconditions (stop on any failure)` --references--> `preview()`  [INFERRED]
  HARNESS.md → src/lib/logger.ts
- `Client component rules (fetch /api only, paginated lists, AbortController)` --semantically_similar_to--> `React pitfalls: no setState in effect, inline function deps`  [INFERRED] [semantically similar]
  src/components/CLAUDE.md → CLAUDE.md
- `Claude Code context layers (CLAUDE.md, subdir CLAUDE.md, skill, subagent, hook, MCP)` --semantically_similar_to--> `Advice vs law (CLAUDE.md vs hook)`  [INFERRED] [semantically similar]
  claudesetup.md → .claude/skills/anchors/SKILL.md
- `API route rules (thin layer, force-dynamic, maxDuration<=300)` --implements--> `No long-running background work on Vercel`  [INFERRED]
  src/app/api/CLAUDE.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Spec -> feature/fix -> handover workflow skills** — _claude_skills_spec_skill_spec, _claude_skills_feature_skill_feature, _claude_skills_fix_skill_fix, _claude_skills_handover_skill_handover, _claude_skills_anchors_skill_anchors [EXTRACTED 1.00]
- **Daily outreach session (reply triage, follow-up, preflight, fit score)** — readme_reply_triage, readme_followup, readme_preflight_check, readme_fit_score [EXTRACTED 1.00]
- **Kiküldő menet védelmei: szünet, napi keret, munkaidő-ablak, címzett-szűrés** — docs_email_kuldes_campaign_runner, docs_email_kuldes_random_pause, docs_email_kuldes_daily_cap_warmup, docs_email_kuldes_send_window, docs_email_kuldes_recipient_guards [EXTRACTED 1.00]
- **Grokbot kutatási ciklus: next -> kutatás -> save** — docs_grokbot_get_bot_next, docs_grokbot_research_procedure, docs_grokbot_post_bot_save [EXTRACTED 1.00]
- **Harness rétegei (CLAUDE.md, alkönyvtári CLAUDE.md, skillek, hookok, subagentek, permissionök, MCP)** — docs_harness_claude_md_contract, docs_harness_subdir_claude_md, docs_harness_skills, docs_harness_hooks, docs_harness_subagents, docs_harness_permissions, docs_harness_no_mcp [EXTRACTED 1.00]
- **Per-layer subdirectory CLAUDE.md rules (api, components, lib)** — src_app_api_claude_route_rules, src_components_claude_component_rules, src_lib_claude_lib_rules [EXTRACTED 1.00]

## Communities (119 total, 9 thin omitted)

### Community 0 - "JEV Startup Sweep"
Cohesion: 0.07
Nodes (55): ai, @ai-sdk/gateway, dynamic, GET(), POST(), dynamic, GET(), POST() (+47 more)

### Community 1 - "Send Queues & Planning"
Cohesion: 0.10
Nodes (53): DELETE(), dynamic, GET(), POST(), dynamic, GET(), LANGUAGE_MISMATCH, dayKey() (+45 more)

### Community 2 - "Job Assist & Places"
Cohesion: 0.05
Nodes (64): DELETE(), dynamic, failed(), GET(), PUT(), classify(), dynamic, GET() (+56 more)

### Community 3 - "Queue/Account Admin UI"
Cohesion: 0.07
Nodes (51): ComposePage(), metadata, metadata, RecentPage(), WarmupEditor(), Account, Attachment, AutoSchedulePanel() (+43 more)

### Community 4 - "sendCampaign.ts"
Cohesion: 0.15
Nodes (27): countriesFor(), attachmentsNow(), CampaignDoc, campaigns(), capOf(), dailyLimitOf(), emptyState(), ensureFirstSend() (+19 more)

### Community 5 - "Scheduled Thread Replies"
Cohesion: 0.10
Nodes (49): dynamic, GET(), POST(), strings(), isReplyLlmReady(), claimSender(), isSender(), senderStatus (+41 more)

### Community 6 - "mailer.ts"
Cohesion: 0.11
Nodes (25): dynamic, GET(), log, POST(), ALLOWED, AttachmentInfo, attachmentsDir(), filesIn() (+17 more)

### Community 7 - "Send/History UI"
Cohesion: 0.10
Nodes (35): nextConfig, next, react, PROVIDER_LABELS, EnrichItem, EnrichPanel(), EnrichState, eta() (+27 more)

### Community 8 - "Contact Table & Messages"
Cohesion: 0.11
Nodes (33): CLOSED, ContactTable(), CopyButton, copyButtons(), CopyKind, copyText(), AiDraft, CopyButton() (+25 more)

### Community 9 - "Contacts Data Access"
Cohesion: 0.08
Nodes (36): findMatches(), main(), normalise(), readInput(), DELETE(), dynamic, PATCH(), POST() (+28 more)

### Community 10 - "Hunter Convert Pipeline"
Cohesion: 0.09
Nodes (43): dynamic, POST(), ConvertResponse, parseCsvTable(), Classification, classify(), detectLanguage(), hits() (+35 more)

### Community 11 - "Mail Account Store"
Cohesion: 0.11
Nodes (44): DELETE(), dynamic, GET(), PATCH(), POST(), startFrom(), accountOverview, getAccount() (+36 more)

### Community 12 - "Job Search Sources Hub"
Cohesion: 0.11
Nodes (22): dynamic, GET(), maxDuration, dynamic, GET(), ALERT_AFTER, Entry, healthOf() (+14 more)

### Community 13 - "Job Source Cache"
Cohesion: 0.11
Nodes (22): Entry, getCached(), getStamp(), setCached(), store, touchCached(), himalayas, HimalayasJob (+14 more)

### Community 14 - "Email Finder (LLM)"
Cohesion: 0.10
Nodes (38): @anthropic-ai/sdk, BATCH_RULES, BatchFinding, buildBatchPrompt(), buildPrompt(), callResponses(), callResponsesRaw(), contactBrief() (+30 more)

### Community 15 - "Seedtable Import"
Cohesion: 0.09
Nodes (33): dynamic, GET(), maxDuration, POST(), call(), cleanFilters(), COMPANY_FILTERS, FilterKind (+25 more)

### Community 16 - "People Finder"
Cohesion: 0.13
Nodes (25): dynamic, maxDuration, POST(), runClaudeApiSearch(), OPENAI_MODEL, buildPeoplePrompt(), findPeople(), log (+17 more)

### Community 17 - "keyed.ts"
Cohesion: 0.19
Nodes (14): looksRemote(), extractEmail(), extractUrl(), HnComment, HnStory, hnWhoIsHiring, isTopLevel(), ParsedHeader (+6 more)

### Community 18 - "ATS Job Boards"
Cohesion: 0.09
Nodes (34): AtsVendor, COMPANIES, num(), stripHtml(), unescapeEntities(), ashby, AshbyAddress, AshbyComponent (+26 more)

### Community 19 - "Email Sweep"
Cohesion: 0.17
Nodes (19): dynamic, POST(), dynamic, GET(), log, POST(), cliBusy(), searchProvider (+11 more)

### Community 20 - "PDF Parsing Script"
Cohesion: 0.13
Nodes (21): pdfjs-dist, baseCompany(), classify(), classifyLinks(), cleanLines(), dedupeKey(), FILES, FOOTER_FRAGMENTS (+13 more)

### Community 21 - "CSV Import Schema"
Cohesion: 0.09
Nodes (40): count(), fixFile(), main(), ALL, APPLY, longer(), main(), score() (+32 more)

### Community 22 - "Job API Quota"
Cohesion: 0.10
Nodes (28): jobsEnv(), eligibleCountries(), collection(), log, QuotaConfig, QuotaDoc, quotaExhausted(), quotaState (+20 more)

### Community 23 - "Company Enrich"
Cohesion: 0.07
Nodes (46): FileMeta, Parsed, dynamic, LANGUAGE_LABEL, POST(), setLanguage(), dynamic, maxDuration (+38 more)

### Community 24 - "Recipients & Preflight"
Cohesion: 0.13
Nodes (27): hasBlocking(), IssueInfo, IssueLevel, ISSUES, issuesFor(), PreflightRow, PreflightSummary, summarize() (+19 more)

### Community 25 - "IMAP Inbox"
Cohesion: 0.14
Nodes (23): addressList(), connect(), ContactHit, domainOf(), download(), findMailbox(), FREEMAIL, isAuto() (+15 more)

### Community 26 - "getContacts"
Cohesion: 0.11
Nodes (34): main(), main(), main(), main(), main(), dynamic, POST(), dynamic (+26 more)

### Community 27 - "Debug Logger Stream"
Cohesion: 0.16
Nodes (16): 1. Preconditions (stop on any failure), dynamic, GET(), maxDuration, buffer, COLOR, emit(), ESC (+8 more)

### Community 28 - "Auth & Login"
Cohesion: 0.18
Nodes (21): dynamic, log, POST(), dynamic, LoginPage(), metadata, authMode, checkLogin() (+13 more)

### Community 29 - "Grokbot API"
Cohesion: 0.15
Nodes (18): mongodb, dynamic, GET(), handle(), POST(), dynamic, POST(), filtersFromParams() (+10 more)

### Community 30 - "Mail Store API"
Cohesion: 0.12
Nodes (22): POST(), applyFilters(), DailyPoint, dayActivity(), DayRow, listThreads(), MailboxState, MailDirection (+14 more)

### Community 31 - "App Shell & Nav"
Cohesion: 0.11
Nodes (21): geistMono, geistSans, metadata, RootLayout(), AppNav(), MAIL_MODES, MenuKey, NavLink (+13 more)

### Community 32 - "Job HTTP Client"
Cohesion: 0.13
Nodes (21): backoffMs(), FetchOpts, getJson(), getJsonWithHeaders(), mapLimit(), postJson(), raw(), sleep() (+13 more)

### Community 33 - "Careers Scraper"
Cohesion: 0.20
Nodes (15): baseDomain(), careerLinks(), CareersResult, CareersRunState, careersState(), checkCareers(), extractPositions(), findCareers() (+7 more)

### Community 34 - "Job Dedup Normalize"
Cohesion: 0.10
Nodes (29): buildDedupKey(), COUNTRY_MAP, deaccent(), DEFAULT_ELIGIBLE_COUNTRIES, isValidJob(), matchesQuery(), missingRequiredFields(), normalizeCompany() (+21 more)

### Community 35 - "Bulk Templates"
Cohesion: 0.16
Nodes (16): PreviewRow, Result, countryName(), DEFAULT_CONNECTION_HU, DEFAULT_LINKEDIN_HU, DEFAULT_SUBJECT_HU, DEFAULT_TEMPLATE_HU, DEFAULT_TEMPLATES (+8 more)

### Community 36 - "People Sweep"
Cohesion: 0.18
Nodes (16): dynamic, GET(), log, POST(), cliConcurrency(), hasFilters(), loadQueue(), log (+8 more)

### Community 37 - "CompanyCheck.tsx"
Cohesion: 0.33
Nodes (7): CheckPage(), metadata, CompanyCheck(), download(), Hit, Result, stamp()

### Community 38 - "Seed Import UI"
Cohesion: 0.08
Nodes (26): metadata, SeedImportPage(), AllProgress, AutoRun, CONTINENTS, EMPTY_RUN, Filters, HU_NAMES (+18 more)

### Community 39 - "queueStats.ts"
Cohesion: 0.17
Nodes (10): bump(), chain, Counters, Fields, log, QueueDailyStats, queueStats(), recordSendFailure() (+2 more)

### Community 40 - "Lint Config"
Cohesion: 0.09
Nodes (21): eslintConfig, name, private, version, dotenv, eslint, eslint-config-next, imapflow (+13 more)

### Community 41 - "lib/types.ts"
Cohesion: 0.10
Nodes (25): dynamic, GET(), log, POST(), ReplyItem, ImportedFile, savePeople(), KnownMatch (+17 more)

### Community 42 - "Widget Queues"
Cohesion: 0.13
Nodes (23): AccountInput, assembleWidget(), CampaignInput, dayRange(), latest(), ORDER, ReplyInput, RESEARCH_NAMES (+15 more)

### Community 43 - "Dashboard & Follow-ups"
Cohesion: 0.15
Nodes (21): BulkTemplate(), Dashboard(), EMPTY_FILTERS, RunKey, RUNS, SHORTCUTS, toQuery(), toSourceKey() (+13 more)

### Community 44 - "Claude CLI Email Finder"
Cohesion: 0.16
Nodes (23): askClaude(), findExecutable(), trackUsage(), baseTimeout(), buildPrompt(), cliCandidates(), CliResult, CliRunStats (+15 more)

### Community 45 - "Reply Draft UI"
Cohesion: 0.19
Nodes (13): Data, Item, MODES, STATUS_STYLE, ThreadReply, APPROVABLE, DraftContext, draftFrom() (+5 more)

### Community 46 - "TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 47 - "Harness Rules & Skills"
Cohesion: 0.13
Nodes (14): test-runner subagent (typecheck, lint, test, build summary), .claude/CLAUDE.md graphify skill pointer, Evidence, not claim, Ports & Adapters (hexagonal), /fix skill (root-cause bug fixing), AGENTS.md: This is NOT the Next.js you know, CLAUDE.md contract (root project instructions), graphify usage rules (+6 more)

### Community 48 - "XML Job Sources"
Cohesion: 0.19
Nodes (17): fast-xml-parser, getText(), asArray(), joinDescriptions(), parseFeed(), parser, personio, PersonioDescription (+9 more)

### Community 49 - "JobAssist API"
Cohesion: 0.19
Nodes (16): demoJobs(), dynamic, forCards(), GET(), maxDuration, PASSTHROUGH, formatSalary(), JobAssistJob (+8 more)

### Community 50 - "Agent Glossary & Setup"
Cohesion: 0.15
Nodes (17): reviewer subagent (read-only diff review), AAA (Arrange-Act-Assert, one Act per test), ADR (Nygard format, docs/adr/), Advice vs law (CLAUDE.md vs hook), /anchors skill (semantic anchor glossary), Chicago School (inside-out, state verification), Irtas teszt (deletion test), London School (outside-in, interaction verification) (+9 more)

### Community 51 - "Reply Triage"
Cohesion: 0.25
Nodes (10): LatestReply, AiTriage, CATEGORIES, classifyByRules(), classifyWithAi(), log, OUTCOME_FOR, triageContacts() (+2 more)

### Community 52 - "Widget API Tests"
Cohesion: 0.14
Nodes (13): dynamic, GET(), NO_STORE, SeedtableCompany, isDayKey(), WidgetInput, check(), healthy (+5 more)

### Community 53 - "Send History"
Cohesion: 0.20
Nodes (14): dynamic, GET(), log, POST(), ChangeDoc, ChangeEntry, changes(), historyFacets() (+6 more)

### Community 54 - "Mail App UI"
Cohesion: 0.09
Nodes (26): MailPage(), metadata, metadata, RejectedPage(), AccountChoice, AttachmentChoice, Bubble(), FILTERS (+18 more)

### Community 55 - "Codex Email Finder"
Cohesion: 0.13
Nodes (22): acquire(), drain(), freeMemoryMb(), log, runExclusive(), setCliConcurrency(), shared, waitForMemory() (+14 more)

### Community 56 - "Reply LLM Drafts"
Cohesion: 0.25
Nodes (15): shortIntro(), assertLlmReachable(), baseUrl(), buildUserPrompt(), chat(), generateReplyDraft(), headers(), humanError() (+7 more)

### Community 57 - "HARNESS.md"
Cohesion: 0.04
Nodes (48): anything else (docs, configs, markdown, small files, ranged reads) -> no opinion, API, server actions and services, ask  -> risky but sometimes legitimate; a human must confirm, Bash cat/bat/less/more/nl/tac of a source file -> same two rules as Read, Claude Code: personal files, not shared, .claude/hooks/format-file.sh, .claude/hooks/graph-first.sh, .claude/hooks/session-context.sh (+40 more)

### Community 58 - "ensureAccounts"
Cohesion: 0.12
Nodes (28): dynamic, GET(), POST(), dynamic, GET(), POST(), dynamic, GET() (+20 more)

### Community 59 - "autoSchedule.ts"
Cohesion: 0.17
Nodes (20): dynamic, GET(), maxDuration, POST(), MailProvider, applyAutoSchedule(), AutoPlan, AutoQueue (+12 more)

### Community 60 - "warmup.ts"
Cohesion: 0.17
Nodes (17): AccountsPage(), metadata, AccountsPanel(), Change, EMPTY, Feed, Provider, PROVIDERS (+9 more)

### Community 61 - "ContactDoc"
Cohesion: 0.09
Nodes (33): ConvertPage(), metadata, ImportPage(), metadata, ConvertPanel(), PRIORITY_STYLE, ExportBar(), FORMATS (+25 more)

### Community 62 - "Usage Tracking"
Cohesion: 0.28
Nodes (11): dynamic, GET(), add(), bounds(), emptyBucket(), listUsage(), log, UsageBucket (+3 more)

### Community 63 - "startupFinder.ts"
Cohesion: 0.11
Nodes (23): dynamic, maxDuration, POST(), dynamic, metadata, QueuesPage(), ScheduledReplies(), availableProviders() (+15 more)

### Community 64 - "Usage Panel"
Cohesion: 0.21
Nodes (13): metadata, UsagePage(), Bucket, cell(), clock(), download(), Entry, isoDay() (+5 more)

### Community 65 - "FilterBar.tsx"
Cohesion: 0.09
Nodes (29): Combobox(), ComboOption, fold(), CONTACT_STATUS, email(), EMAIL_STATUS, Facets, FilterBar() (+21 more)

### Community 66 - "Email Sending Plan Docs"
Cohesion: 0.18
Nodes (14): F2 - Follow-up sor (followup.ts, FollowUpPanel), F4 - Küldés előtti ellenőrzés (preflight.ts), EMAIL-KULDES.md - Ütemezett e-mail kiküldő tervrajz, Fiókok a beállításokból (titkosított jelszó tárolás), Fiókonkénti kiküldő menet (runner ciklus, sendCampaign), Napi keret és felfuttatás (warmup), Telepítés Hetznerre (systemd, Caddy, SMTP-portok), Véletlen szünet levelek között (+6 more)

### Community 67 - "Runtime Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, ai, @ai-sdk/gateway, @anthropic-ai/sdk, dotenv, fast-xml-parser, imapflow, mailparser (+6 more)

### Community 68 - "Contact Scoring"
Cohesion: 0.14
Nodes (5): Doc, SCORE_EXPRESSION, SCORE_RULES, ScoreRule, tags

### Community 69 - "Dev Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, eslint-config-next, pdf-parse, pdfjs-dist, tailwindcss, @tailwindcss/postcss, tsx (+5 more)

### Community 70 - "4DayWeek Source"
Cohesion: 0.20
Nodes (13): companyFromUrl(), FdwCompany, FdwJob, FdwLocation, FdwResponse, fourdayweek, Named, namesOf() (+5 more)

### Community 71 - "Claude Settings Hooks"
Cohesion: 0.18
Nodes (10): hooks, PostToolUse, PreToolUse, SessionStart, Stop, permissions, allow, ask (+2 more)

### Community 72 - "NPM Scripts"
Cohesion: 0.18
Nodes (11): scripts, backfill-aliases, build, dev, emails, lint, parse, seed (+3 more)

### Community 73 - "JEV Panel"
Cohesion: 0.14
Nodes (16): JevPage(), metadata, formatCost(), JevPanel(), ask(), run(), JevRun, PRESETS (+8 more)

### Community 74 - "Harness & ADRs"
Cohesion: 0.24
Nodes (3): ADR sablon (Nygard-formátum), ADR 0001 - A harness a repóban él, nem a felhasználói profilban, HARNESS.md - A harness

### Community 75 - "Audit Findings"
Cohesion: 0.22
Nodes (10): AUDIT.md - Melodia teljes audit és fejlesztési terv, Atlas-kvóta probléma (13b), C1 - Éles példány hitelesítés nélkül, C2 - Ugyanarra a címre/cégre többször megy levél, C3 - Válasz és visszapattanás visszaírása a kontaktra (syncContactReplies), C4 - Automatikus növekményes levelezés-szinkron (MAIL_AUTO_SYNC_MINUTES), Fejlesztési roadmap (Phase 1-4), Címzett-védelmek (recipients: cím és cégdomain szerinti kizárás) (+2 more)

### Community 76 - "README Features"
Cohesion: 0.20
Nodes (10): CLI queue semaphore (src/lib/cliQueue.ts, CLI_CONCURRENCY), Contact status derivation (src/lib/stage.ts), Follow-up in same thread (src/lib/followup.ts), Automatic Gmail sync (syncContactReplies), Interview brief (src/lib/interviewBrief.ts), AI via local Claude CLI, not OpenAI (src/lib/aiText.ts), Melodia outreach dashboard (Next.js + MongoDB Atlas), Pre-send check (src/lib/preflight.ts) (+2 more)

### Community 77 - "Interview Brief"
Cohesion: 0.43
Nodes (5): dynamic, POST(), createInterviewBrief(), InterviewBrief, conversation()

### Community 78 - "getDb"
Cohesion: 0.16
Nodes (17): register(), AttachmentChoice, availableAttachments(), IndexDoc, localAttachments(), log, publishAttachments(), state() (+9 more)

### Community 79 - "jobs/types.ts"
Cohesion: 0.17
Nodes (13): CURRENCIES, extractNumbers(), ParsedSalary, parseHungarianSalary(), PERIODS, toJob(), CatalogSource, RateLimit (+5 more)

### Community 80 - "countContacts"
Cohesion: 0.22
Nodes (11): dynamic, GET(), POST(), countContacts(), ago(), DraftInput, FOLLOW_UP_AFTER_DAYS, followUpDraft() (+3 more)

### Community 81 - "Resend Mail"
Cohesion: 0.29
Nodes (11): firstOutgoingFrom(), invalidateThreadCache(), mailCollection(), MailMessage, saveMessages(), ReplyDraftInput, log, resendMessage() (+3 more)

### Community 82 - "Bot & Company API Docs"
Cohesion: 0.32
Nodes (8): COMPANY_API.md - cégfelvételi API, source mező: gridleads_<üzlettípus>_<országkód>, POST /api/bot/companies, GROKBOT.md - Grokbot és Melodia integráció, GET /api/bot/next - következő cég kiadása foglalással, POST /api/bot/save - kutatási eredmény mentése, Kutatás szisztematikája (azonosítás, saját oldal, álláshirdetés, külső források, emberek, minősítés, mentés), Seedtable import (/seedimport, importDedupe)

### Community 83 - "Mail Sync API"
Cohesion: 0.24
Nodes (11): dynamic, GET(), POST(), dynamic, GET(), isInboxReady(), startAutoSync(), startSync() (+3 more)

### Community 84 - "themuse.ts"
Cohesion: 0.23
Nodes (10): configuredLocations(), isRemoteLocation(), log, matchesLocation(), MuseJob, MuseLevel, MuseResponse, themuse (+2 more)

### Community 85 - "Mail Chart"
Cohesion: 0.39
Nodes (7): DailyPoint, label(), longLabel(), MailChart(), niceMax(), PAD, rollingRate()

### Community 86 - "lib/env.ts"
Cohesion: 0.16
Nodes (13): authorised(), dynamic, maxDuration, POST(), MAX_COMPANIES, readCompanies(), CONTACTS_COLLECTION, fileEnv (+5 more)

### Community 87 - "Deployment Architecture"
Cohesion: 0.29
Nodes (6): Published attachment list (src/lib/attachmentIndex.ts), Mail accounts (env Gmail, /accounts Gmail or Resend, encrypted), Queue scheduler (10-min tick, non-Vercel only), Single-day send queues (varakozik -> fut -> kesz, release), Split setup: Vercel app creates queues, local server sends, Account warm-up (src/lib/warmup.ts)

### Community 88 - "Design System: [Product name]"
Cohesion: 0.18
Nodes (11): 01 Brand identity, 02 Color palette, 03 Typography, 04 Spacing, 05 Border radius and shadows, 06 Components, 07 Icons, 08 Responsive breakpoints (+3 more)

### Community 89 - "Hook Lib"
Cohesion: 0.40
Nodes (3): pkg_manager(), run_script(), lib.sh script

### Community 90 - "AGENTS.md"
Cohesion: 0.18
Nodes (11): 01 Purpose, 02 Before you start, 03 General rules, 04 Code guidelines, 05 Security and best practices, 06 Useful commands, 07 Definition of done, 08 When to stop and ask (+3 more)

### Community 91 - "New feature: $ARGUMENTS"
Cohesion: 0.18
Nodes (11): Before reviewing, Check, in this order, Checklist, Input, Memory, New feature: $ARGUMENTS, Output, Output (+3 more)

### Community 92 - "add-source-segment.js"
Cohesion: 0.18
Nodes (6): args, counts, fs, m, path, positional

### Community 93 - "listContactIds"
Cohesion: 0.18
Nodes (10): GET(), listAttachments(), listContactIds(), mailerConfig, MissingAttachmentsError, sendContactEmail(), markSiblingsSent(), buildFollowUpQueue() (+2 more)

### Community 94 - "makeJob"
Cohesion: 0.11
Nodes (32): isAlerting(), guessCountry(), isReachableFrom(), toISO(), arbeitnow, ArbeitnowJob, ArbeitnowResponse, pagesToFetch() (+24 more)

### Community 95 - "sendWindow.ts"
Cohesion: 0.25
Nodes (10): DEFAULT_TIME_ZONE, insideWindowAt(), localLabel(), localParts(), nextWindowStart(), partsCache, pickRecipient(), TEST_MODE_LIMIT (+2 more)

### Community 104 - "PRD: [Product name]"
Cohesion: 0.20
Nodes (10): 01 Product overview, 02 Problem, 03 Goal, 04 Target users, 05 Core features, 06 Success metrics, 07 Out of scope, 08 Open questions (+2 more)

### Community 105 - "Architecture: [Product name]"
Cohesion: 0.20
Nodes (10): 01 System overview, 02 Tech stack, 03 Project structure, 04 Data flow, 05 Boundaries, 06 Decisions that look wrong but are intentional, 07 Scalability and future considerations, 08 When the agent must stop and ask (+2 more)

### Community 106 - "DebugConsole.tsx"
Cohesion: 0.27
Nodes (8): DebugPage(), LEVELS, metadata, DebugConsole(), LEVEL_ORDER, LEVEL_STYLE, LogEntry, LogLevel

### Community 107 - "scrapeEmail.ts"
Cohesion: 0.27
Nodes (9): scrapeFirst(), contactLinks(), harvest(), log, PATHS, score(), ScrapeCandidate, scrapeEmail() (+1 more)

### Community 108 - "importStream.worker.ts"
Cohesion: 0.22
Nodes (9): BatchMessage, decoder, ErrorMessage, fill(), NextMessage, OpenMessage, queue, scan() (+1 more)

### Community 109 - "toParagraphs"
Cohesion: 0.31
Nodes (9): joinLines(), normaliseName(), parseLeaderPage(), parseLetterPage(), parseRecruiterPage(), sectionBetween(), stripFooter(), toParagraphs() (+1 more)

### Community 110 - "Security: [Product name]"
Cohesion: 0.25
Nodes (8): 01 What we protect, 02 Trust boundaries, 03 Authentication and authorization, 04 Secrets, 05 Input, output, injection, 06 Dependencies, 07 Incident basics, Security: [Product name]

### Community 111 - "HistoryPanel.tsx"
Cohesion: 0.36
Nodes (6): HistoryPage(), metadata, Change, FIELD_LABELS, HistoryPanel(), show()

### Community 112 - "Claude Code guide: [Product name]"
Cohesion: 0.33
Nodes (6): Claude Code guide: [Product name], Commands, Gotchas, Harness map: use these instead of improvising, Snapshot, Working agreements (Claude Code)

### Community 113 - "ContactFilters"
Cohesion: 0.33
Nodes (6): Chip, SweepOptions, JevSweepOptions, PeopleSweepOptions, CampaignOptions, ContactFilters

### Community 114 - "Deploy: $ARGUMENTS"
Cohesion: 0.40
Nodes (5): 2. Quality gate, 3. Deploy, 4. Verify, 5. If something is wrong, Deploy: $ARGUMENTS

### Community 115 - "Tasks"
Cohesion: 0.40
Nodes (5): Done, Later (after v1), Next, Now, Tasks

### Community 116 - "Review changes"
Cohesion: 0.50
Nodes (4): Context, Review changes, Scope, Steps

### Community 117 - "scanMailbox"
Cohesion: 0.67
Nodes (4): scanMailbox(), readMailboxState(), stateCollection(), writeMailboxState()

## Knowledge Gaps
- **40 isolated node(s):** `@types/nodemailer`, `dotenv`, `react-dom`, `@tailwindcss/postcss`, `@types/mailparser` (+35 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 865 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Send/History UI` to `JEV Startup Sweep`, `Send Queues & Planning`, `Job Assist & Places`, `Queue/Account Admin UI`, `Scheduled Thread Replies`, `mailer.ts`, `Contact Table & Messages`, `Contacts Data Access`, `Hunter Convert Pipeline`, `Mail Account Store`, `Job Search Sources Hub`, `Seedtable Import`, `People Finder`, `Email Sweep`, `Company Enrich`, `getContacts`, `Debug Logger Stream`, `Auth & Login`, `Grokbot API`, `App Shell & Nav`, `People Sweep`, `CompanyCheck.tsx`, `Seed Import UI`, `Lint Config`, `lib/types.ts`, `JobAssist API`, `Widget API Tests`, `Send History`, `Mail App UI`, `ensureAccounts`, `autoSchedule.ts`, `ContactDoc`, `Usage Tracking`, `startupFinder.ts`, `Interview Brief`, `countContacts`, `Mail Sync API`, `lib/env.ts`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **What connects `@types/nodemailer`, `dotenv`, `react-dom` to the rest of the system?**
  _40 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `JEV Startup Sweep` be split into smaller, more focused modules?**
  _Cohesion score 0.06663141195134849 - nodes in this community are weakly interconnected._
- **Why does `createLogger()` connect `Company Enrich` to `JEV Startup Sweep`, `Send Queues & Planning`, `sendCampaign.ts`, `Scheduled Thread Replies`, `mailer.ts`, `Contacts Data Access`, `Hunter Convert Pipeline`, `Mail Account Store`, `Job Search Sources Hub`, `Email Finder (LLM)`, `Seedtable Import`, `People Finder`, `Email Sweep`, `Job API Quota`, `IMAP Inbox`, `getContacts`, `Debug Logger Stream`, `Auth & Login`, `Grokbot API`, `Careers Scraper`, `Job Dedup Normalize`, `People Sweep`, `queueStats.ts`, `lib/types.ts`, `Claude CLI Email Finder`, `Reply Triage`, `Send History`, `Codex Email Finder`, `Reply LLM Drafts`, `ensureAccounts`, `Usage Tracking`, `startupFinder.ts`, `getDb`, `Resend Mail`, `themuse.ts`, `scrapeEmail.ts`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Should `Send Queues & Planning` be split into smaller, more focused modules?**
  _Cohesion score 0.09586466165413533 - nodes in this community are weakly interconnected._
- **Why does `template()` connect `ContactDoc` to `HARNESS.md`, `CSV Import Schema`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Should `Job Assist & Places` be split into smaller, more focused modules?**
  _Cohesion score 0.054340396445659606 - nodes in this community are weakly interconnected._
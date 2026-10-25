# Graph Report - melodia  (2026-10-25)

## Corpus Check
- 309 files · ~1,506,979 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .ico 1, .css 1)

## Summary
- 2691 nodes · 7207 edges · 124 communities (115 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 96 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `03b06c73`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lib/types.ts
- ashby.ts
- jobs/types.ts
- botApi.ts
- loadStoredAccounts
- Scheduled Thread Replies
- normalize.ts
- next
- MessagePanel.tsx
- jobassist/route.ts
- logger.ts
- accounts.ts
- JobAssistPanel.tsx
- himalayas.ts
- getContacts
- Seedtable Import
- peopleSweep.ts
- sendQueues.ts
- QueuesPanel.tsx
- createLogger
- parse-pdfs.ts
- emailFinder.ts
- jooble.ts
- templates.ts
- sendCampaign.ts
- export.ts
- inbox.ts
- JobsPanel.tsx
- credential
- villageItems.ts
- mailStore.ts
- convert.ts
- http.ts
- Careers Scraper
- recipients.ts
- lib/env.ts
- fourdayweek.ts
- csvImport.ts
- Seed Import UI
- jevWebSweep.ts
- Lint Config
- autoDrafts.ts
- getDb
- emailFinderCodex.ts
- history.ts
- enrich.ts
- TS Config
- Harness Rules & Skills
- stripHtml
- jevWebSweep.ts
- Agent Glossary & Setup
- countries.ts
- peopleFinderOpenAi.ts
- Dashboard.tsx
- MailApp.tsx
- replyLlm.ts
- warmup.ts
- HARNESS.md
- classify.ts
- ImportPanel.tsx
- mongodb.ts
- jev.ts
- score.ts
- button
- Usage Panel
- data/index.ts
- Email Sending Plan Docs
- Runtime Dependencies
- mailer.ts
- Dev Dependencies
- village-plants.py
- Claude Settings Hooks
- NPM Scripts
- threadCompose.ts
- Harness & ADRs
- Audit Findings
- README Features
- board.ts
- lib/profile.ts
- compose.ts
- startupFinder.ts
- toParagraphs
- Bot & Company API Docs
- web/route.ts
- emailFinderCodex.ts
- CompanyCheck.tsx
- scrapeEmail.ts
- Deployment Architecture
- Design System: [Product name]
- Hook Lib
- AGENTS.md
- New feature: $ARGUMENTS
- add-source-segment.js
- openai.ts
- Deploy: $ARGUMENTS
- usage.ts
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
- ashby.ts
- stream/route.ts
- mailCollection
- VillageMap
- Security: [Product name]
- defineSource
- Claude Code guide: [Product name]
- VillageMap.tsx
- HistoryPanel.tsx
- Tasks
- Review changes
- personio.ts
- README.md
- contacts.ts
- ConvertPanel
- places/route.ts
- layout
- frame

## God Nodes (most connected - your core abstractions)
1. `getContacts()` - 93 edges
2. `credential()` - 73 edges
3. `next` - 70 edges
4. `createLogger()` - 65 edges
5. `formatNumber()` - 61 edges
6. `react` - 51 edges
7. `loadStoredAccounts()` - 47 edges
8. `stripHtml()` - 46 edges
9. `getDb()` - 46 edges
10. `makeJob()` - 45 edges

## Surprising Connections (you probably didn't know these)
- `Code style` --references--> `layout()`  [INFERRED]
  HARNESS.md → src/components/VillageMap.tsx
- `Code style` --references--> `template()`  [INFERRED]
  HARNESS.md → src/lib/importSchema.ts
- `1. Preconditions (stop on any failure)` --references--> `preview()`  [INFERRED]
  HARNESS.md → src/lib/logger.ts
- `Client component rules (fetch /api only, paginated lists, AbortController)` --semantically_similar_to--> `React pitfalls: no setState in effect, inline function deps`  [INFERRED] [semantically similar]
  src/components/CLAUDE.md → CLAUDE.md
- `Claude Code context layers (CLAUDE.md, subdir CLAUDE.md, skill, subagent, hook, MCP)` --semantically_similar_to--> `Advice vs law (CLAUDE.md vs hook)`  [INFERRED] [semantically similar]
  claudesetup.md → .claude/skills/anchors/SKILL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Spec -> feature/fix -> handover workflow skills** — _claude_skills_spec_skill_spec, _claude_skills_feature_skill_feature, _claude_skills_fix_skill_fix, _claude_skills_handover_skill_handover, _claude_skills_anchors_skill_anchors [EXTRACTED 1.00]
- **Daily outreach session (reply triage, follow-up, preflight, fit score)** — readme_reply_triage, readme_followup, readme_preflight_check, readme_fit_score [EXTRACTED 1.00]
- **Kiküldő menet védelmei: szünet, napi keret, munkaidő-ablak, címzett-szűrés** — docs_email_kuldes_campaign_runner, docs_email_kuldes_random_pause, docs_email_kuldes_daily_cap_warmup, docs_email_kuldes_send_window, docs_email_kuldes_recipient_guards [EXTRACTED 1.00]
- **Grokbot kutatási ciklus: next -> kutatás -> save** — docs_grokbot_get_bot_next, docs_grokbot_research_procedure, docs_grokbot_post_bot_save [EXTRACTED 1.00]
- **Harness rétegei (CLAUDE.md, alkönyvtári CLAUDE.md, skillek, hookok, subagentek, permissionök, MCP)** — docs_harness_claude_md_contract, docs_harness_subdir_claude_md, docs_harness_skills, docs_harness_hooks, docs_harness_subagents, docs_harness_permissions, docs_harness_no_mcp [EXTRACTED 1.00]
- **Per-layer subdirectory CLAUDE.md rules (api, components, lib)** — src_app_api_claude_route_rules, src_components_claude_component_rules, src_lib_claude_lib_rules [EXTRACTED 1.00]

## Communities (124 total, 9 thin omitted)

### Community 0 - "lib/types.ts"
Cohesion: 0.10
Nodes (24): dynamic, GET(), log, POST(), Chip, ReplyItem, JevSweepOptions, buildManualPeoplePrompt() (+16 more)

### Community 1 - "ashby.ts"
Cohesion: 0.29
Nodes (9): ashby, AshbyAddress, AshbyComponent, AshbyJob, AshbySecondaryLocation, countryOf(), pickSalary(), toJob() (+1 more)

### Community 2 - "jobs/types.ts"
Cohesion: 0.06
Nodes (38): dynamic, GET(), maxDuration, dynamic, GET(), ALERT_AFTER, Entry, healthOf() (+30 more)

### Community 3 - "botApi.ts"
Cohesion: 0.16
Nodes (17): dynamic, GET(), handle(), POST(), dynamic, POST(), filtersFromParams(), asUrl() (+9 more)

### Community 4 - "loadStoredAccounts"
Cohesion: 0.13
Nodes (31): dynamic, GET(), log, POST(), dynamic, GET(), POST(), GET() (+23 more)

### Community 5 - "Scheduled Thread Replies"
Cohesion: 0.07
Nodes (64): dynamic, GET(), POST(), strings(), Data, Item, MODES, STATUS_STYLE (+56 more)

### Community 6 - "normalize.ts"
Cohesion: 0.13
Nodes (22): buildDedupKey(), COUNTRY_MAP, deaccent(), DEFAULT_ELIGIBLE_COUNTRIES, isValidJob(), matchesQuery(), missingRequiredFields(), normalizeCompany() (+14 more)

### Community 7 - "next"
Cohesion: 0.09
Nodes (38): nextConfig, next, react, PROVIDER_LABELS, EnrichItem, EnrichPanel(), EnrichState, eta() (+30 more)

### Community 8 - "MessagePanel.tsx"
Cohesion: 0.11
Nodes (31): CLOSED, ContactTable(), CopyButton, copyButtons(), CopyKind, copyText(), AiDraft, CopyButton() (+23 more)

### Community 9 - "jobassist/route.ts"
Cohesion: 0.21
Nodes (15): demoJobs(), dynamic, forCards(), GET(), maxDuration, PASSTHROUGH, formatSalary(), JobAssistPage (+7 more)

### Community 10 - "logger.ts"
Cohesion: 0.21
Nodes (11): 1. Preconditions (stop on any failure), buffer, COLOR, emit(), ESC, LEVEL_ORDER, listeners, Logger (+3 more)

### Community 11 - "accounts.ts"
Cohesion: 0.09
Nodes (44): DELETE(), dynamic, GET(), PATCH(), POST(), startFrom(), dynamic, metadata (+36 more)

### Community 12 - "JobAssistPanel.tsx"
Cohesion: 0.15
Nodes (21): JobAssistPanel(), PageMeta, toggled(), icon(), LocationAutocomplete(), RangeSlider(), TitleChipsInput(), activeFilterCount() (+13 more)

### Community 13 - "himalayas.ts"
Cohesion: 0.07
Nodes (37): Entry, getCached(), getStamp(), setCached(), store, touchCached(), eligibleCountries(), isReachableFrom() (+29 more)

### Community 14 - "getContacts"
Cohesion: 0.12
Nodes (32): main(), count(), fixFile(), main(), main(), dynamic, POST(), ingestCompanies() (+24 more)

### Community 15 - "Seedtable Import"
Cohesion: 0.08
Nodes (36): dynamic, GET(), maxDuration, POST(), call(), cleanFilters(), COMPANY_FILTERS, FilterKind (+28 more)

### Community 16 - "peopleSweep.ts"
Cohesion: 0.13
Nodes (16): dynamic, GET(), log, POST(), savePeople(), hasFilters(), log, PeopleSweepItem (+8 more)

### Community 17 - "sendQueues.ts"
Cohesion: 0.08
Nodes (63): dynamic, maxDuration, POST(), dynamic, GET(), MailProvider, applyAutoSchedule(), AutoPlan (+55 more)

### Community 18 - "QueuesPanel.tsx"
Cohesion: 0.11
Nodes (23): geistMono, geistSans, metadata, RootLayout(), AppNav(), MAIL_MODES, MenuKey, NavLink (+15 more)

### Community 19 - "createLogger"
Cohesion: 0.12
Nodes (29): dynamic, POST(), dynamic, maxDuration, POST(), dynamic, GET(), log (+21 more)

### Community 20 - "parse-pdfs.ts"
Cohesion: 0.13
Nodes (21): pdfjs-dist, baseCompany(), classify(), classifyLinks(), cleanLines(), dedupeKey(), FILES, FOOTER_FRAGMENTS (+13 more)

### Community 21 - "emailFinder.ts"
Cohesion: 0.10
Nodes (38): @anthropic-ai/sdk, availableProviders(), BATCH_RULES, BatchFinding, buildBatchPrompt(), buildPrompt(), callResponses(), callResponsesRaw() (+30 more)

### Community 22 - "jooble.ts"
Cohesion: 0.10
Nodes (29): jobsEnv(), collection(), log, QuotaConfig, QuotaDoc, quotaExhausted(), quotaState, readDoc() (+21 more)

### Community 23 - "templates.ts"
Cohesion: 0.15
Nodes (20): dynamic, LANGUAGE_LABEL, POST(), setLanguage(), PreviewRow, Result, countryName(), DEFAULT_CONNECTION_HU (+12 more)

### Community 24 - "sendCampaign.ts"
Cohesion: 0.08
Nodes (58): getAccount(), isFollowUpDue(), mailerConfig, firstOutgoingFrom(), originalOutgoing(), recordSendFailure(), countriesFor(), markSiblingsSent() (+50 more)

### Community 25 - "export.ts"
Cohesion: 0.14
Nodes (22): DebugPage(), LEVELS, metadata, DebugConsole(), LEVEL_ORDER, LEVEL_STYLE, ExportBar(), FORMATS (+14 more)

### Community 26 - "inbox.ts"
Cohesion: 0.11
Nodes (34): dynamic, GET(), POST(), releaseDeleted(), addressList(), appendDraft(), connect(), ContactHit (+26 more)

### Community 27 - "JobsPanel.tsx"
Cohesion: 0.13
Nodes (24): JobsPage(), metadata, AssistJob, initials(), JobAssistCard(), JobCard(), Board, COUNTRIES (+16 more)

### Community 28 - "credential"
Cohesion: 0.17
Nodes (22): dynamic, log, POST(), dynamic, LoginPage(), metadata, authMode, checkLogin() (+14 more)

### Community 29 - "villageItems.ts"
Cohesion: 0.07
Nodes (30): BIOME_OF, BiomeKey, BIOMES, Bounds, BY_KEY, drawItems(), drawMarker(), editListeners (+22 more)

### Community 30 - "mailStore.ts"
Cohesion: 0.11
Nodes (28): dynamic, POST(), scanMailbox(), applyFilters(), dailyCounts(), DailyPoint, dayActivity(), DayRow (+20 more)

### Community 31 - "convert.ts"
Cohesion: 0.22
Nodes (16): ConvertResponse, PRIORITY_STYLE, parseCsvTable(), convertCsv(), ConvertOptions, ConvertResult, norm(), parseEmailMap() (+8 more)

### Community 32 - "http.ts"
Cohesion: 0.13
Nodes (21): backoffMs(), FetchOpts, getJson(), getJsonWithHeaders(), mapLimit(), postJson(), raw(), sleep() (+13 more)

### Community 33 - "Careers Scraper"
Cohesion: 0.21
Nodes (13): baseDomain(), careerLinks(), CareersResult, CareersRunState, careersState(), extractPositions(), findCareers(), log (+5 more)

### Community 34 - "recipients.ts"
Cohesion: 0.14
Nodes (26): hasBlocking(), IssueInfo, IssueLevel, ISSUES, issuesFor(), PreflightRow, PreflightSummary, summarize() (+18 more)

### Community 35 - "lib/env.ts"
Cohesion: 0.16
Nodes (13): authorised(), dynamic, maxDuration, POST(), MAX_COMPANIES, readCompanies(), CONTACTS_COLLECTION, fileEnv (+5 more)

### Community 36 - "fourdayweek.ts"
Cohesion: 0.22
Nodes (12): companyFromUrl(), FdwCompany, FdwJob, FdwLocation, FdwResponse, Named, namesOf(), POSTED_AFTER_DAYS (+4 more)

### Community 37 - "csvImport.ts"
Cohesion: 0.19
Nodes (17): buildCompanyLetter(), clean(), COLUMNS, csvToImportRows(), fixMojibake(), headerKey(), INDUSTRY_HU, industryLabel() (+9 more)

### Community 38 - "Seed Import UI"
Cohesion: 0.08
Nodes (29): metadata, SeedImportPage(), Combobox(), ComboOption, fold(), AllProgress, AutoRun, CONTINENTS (+21 more)

### Community 39 - "jevWebSweep.ts"
Cohesion: 0.24
Nodes (13): toSizeBucket(), getJevResults(), JevResult, ANGLES, domainOf(), handleStartup(), JevWebOptions, log (+5 more)

### Community 40 - "Lint Config"
Cohesion: 0.09
Nodes (21): eslintConfig, name, private, version, dotenv, eslint, eslint-config-next, imapflow (+13 more)

### Community 41 - "autoDrafts.ts"
Cohesion: 0.12
Nodes (30): dynamic, GET(), POST(), startOfToday(), AutoDraft, autoDraftsToday(), buildMessage(), drafts() (+22 more)

### Community 42 - "getDb"
Cohesion: 0.05
Nodes (59): dynamic, GET(), POST(), dynamic, GET(), NO_STORE, LANGUAGES, AttachmentChoice (+51 more)

### Community 43 - "emailFinderCodex.ts"
Cohesion: 0.14
Nodes (22): acquire(), drain(), freeMemoryMb(), log, runExclusive(), setCliConcurrency(), shared, waitForMemory() (+14 more)

### Community 44 - "history.ts"
Cohesion: 0.20
Nodes (14): dynamic, GET(), log, POST(), ChangeDoc, ChangeEntry, changes(), historyFacets() (+6 more)

### Community 45 - "enrich.ts"
Cohesion: 0.09
Nodes (31): FileMeta, Parsed, dynamic, maxDuration, POST(), dynamic, GET(), log (+23 more)

### Community 46 - "TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 47 - "Harness Rules & Skills"
Cohesion: 0.13
Nodes (14): test-runner subagent (typecheck, lint, test, build summary), .claude/CLAUDE.md graphify skill pointer, Evidence, not claim, Ports & Adapters (hexagonal), /fix skill (root-cause bug fixing), AGENTS.md: This is NOT the Next.js you know, CLAUDE.md contract (root project instructions), graphify usage rules (+6 more)

### Community 48 - "stripHtml"
Cohesion: 0.12
Nodes (36): guessCountry(), looksRemote(), stripHtml(), toISO(), toJob(), toJob(), makeJob(), enrich() (+28 more)

### Community 49 - "jevWebSweep.ts"
Cohesion: 0.19
Nodes (17): dynamic, GET(), POST(), Candidate, cleanNote(), companyKeyOf(), companyState(), evaluate() (+9 more)

### Community 50 - "Agent Glossary & Setup"
Cohesion: 0.15
Nodes (17): reviewer subagent (read-only diff review), AAA (Arrange-Act-Assert, one Act per test), ADR (Nygard format, docs/adr/), Advice vs law (CLAUDE.md vs hook), /anchors skill (semantic anchor glossary), Chicago School (inside-out, state verification), Irtas teszt (deletion test), London School (outside-in, interaction verification) (+9 more)

### Community 51 - "countries.ts"
Cohesion: 0.40
Nodes (5): COUNTRY_CODES, CountryInfo, fold(), LEGACY_CODES, LOOKUP

### Community 52 - "peopleFinderOpenAi.ts"
Cohesion: 0.13
Nodes (25): dynamic, maxDuration, POST(), runClaudeApiSearch(), OPENAI_MODEL, buildPeoplePrompt(), findPeople(), log (+17 more)

### Community 53 - "Dashboard.tsx"
Cohesion: 0.15
Nodes (21): BulkTemplate(), Dashboard(), EMPTY_FILTERS, RunKey, RUNS, SHORTCUTS, toQuery(), toSourceKey() (+13 more)

### Community 54 - "MailApp.tsx"
Cohesion: 0.09
Nodes (29): MailPage(), metadata, metadata, RejectedPage(), AccountChoice, AttachmentChoice, Bubble(), FILTERS (+21 more)

### Community 55 - "replyLlm.ts"
Cohesion: 0.20
Nodes (18): MailMessage, shortIntro(), assertLlmReachable(), baseUrl(), buildUserPrompt(), chat(), generateReplyDraft(), headers() (+10 more)

### Community 56 - "warmup.ts"
Cohesion: 0.17
Nodes (17): AccountsPage(), metadata, AccountsPanel(), Change, EMPTY, Feed, Provider, PROVIDERS (+9 more)

### Community 57 - "HARNESS.md"
Cohesion: 0.04
Nodes (47): anything else (docs, configs, markdown, small files, ranged reads) -> no opinion, API, server actions and services, ask  -> risky but sometimes legitimate; a human must confirm, Bash cat/bat/less/more/nl/tac of a source file -> same two rules as Read, Claude Code: personal files, not shared, .claude/hooks/format-file.sh, .claude/hooks/graph-first.sh, .claude/hooks/session-context.sh (+39 more)

### Community 58 - "classify.ts"
Cohesion: 0.22
Nodes (16): Classification, classify(), detectLanguage(), hits(), mapSize(), HookKey, BOOST, DATA_SMELLS (+8 more)

### Community 59 - "ImportPanel.tsx"
Cohesion: 0.11
Nodes (23): Code style, ImportPage(), metadata, DomainDecision, ImportPanel(), ImportResult, Issue, KIND_HINT (+15 more)

### Community 60 - "mongodb.ts"
Cohesion: 0.08
Nodes (34): findMatches(), main(), normalise(), readInput(), main(), main(), main(), DELETE() (+26 more)

### Community 61 - "jev.ts"
Cohesion: 0.22
Nodes (13): ai, @ai-sdk/gateway, dynamic, GET(), POST(), askBoolean(), humanError(), isJevReady() (+5 more)

### Community 62 - "score.ts"
Cohesion: 0.14
Nodes (5): Doc, SCORE_EXPRESSION, SCORE_RULES, ScoreRule, tags

### Community 63 - "button"
Cohesion: 0.07
Nodes (48): ComposePage(), metadata, metadata, RecentPage(), WarmupEditor(), Account, Attachment, AutoSchedulePanel() (+40 more)

### Community 64 - "Usage Panel"
Cohesion: 0.21
Nodes (13): metadata, UsagePage(), Bucket, cell(), clock(), download(), Entry, isoDay() (+5 more)

### Community 65 - "data/index.ts"
Cohesion: 0.06
Nodes (40): JevPage(), metadata, CONTACT_STATUS, email(), EMAIL_STATUS, Facets, FilterBar(), JEV_OPTIONS (+32 more)

### Community 66 - "Email Sending Plan Docs"
Cohesion: 0.18
Nodes (14): F2 - Follow-up sor (followup.ts, FollowUpPanel), F4 - Küldés előtti ellenőrzés (preflight.ts), EMAIL-KULDES.md - Ütemezett e-mail kiküldő tervrajz, Fiókok a beállításokból (titkosított jelszó tárolás), Fiókonkénti kiküldő menet (runner ciklus, sendCampaign), Napi keret és felfuttatás (warmup), Telepítés Hetznerre (systemd, Caddy, SMTP-portok), Véletlen szünet levelek között (+6 more)

### Community 67 - "Runtime Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, ai, @ai-sdk/gateway, @anthropic-ai/sdk, dotenv, fast-xml-parser, imapflow, mailparser (+6 more)

### Community 68 - "mailer.ts"
Cohesion: 0.13
Nodes (21): ALLOWED, AttachmentInfo, attachmentsDir(), filesIn(), listAttachments(), log, onDisk(), resolveSelection() (+13 more)

### Community 69 - "Dev Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, eslint-config-next, pdf-parse, pdfjs-dist, tailwindcss, @tailwindcss/postcss, tsx (+5 more)

### Community 70 - "village-plants.py"
Cohesion: 0.11
Nodes (22): draw(), frame(), legs(), quad(), recolor(), save(), bumpy(), inside() (+14 more)

### Community 71 - "Claude Settings Hooks"
Cohesion: 0.18
Nodes (10): hooks, PostToolUse, PreToolUse, SessionStart, Stop, permissions, allow, ask (+2 more)

### Community 72 - "NPM Scripts"
Cohesion: 0.18
Nodes (11): scripts, backfill-aliases, build, dev, emails, lint, parse, seed (+3 more)

### Community 73 - "threadCompose.ts"
Cohesion: 0.17
Nodes (19): dynamic, GET(), maxDuration, POST(), text(), askClaude(), markDraftSent(), threadDraft() (+11 more)

### Community 74 - "Harness & ADRs"
Cohesion: 0.24
Nodes (3): ADR sablon (Nygard-formátum), ADR 0001 - A harness a repóban él, nem a felhasználói profilban, HARNESS.md - A harness

### Community 75 - "Audit Findings"
Cohesion: 0.22
Nodes (10): AUDIT.md - Melodia teljes audit és fejlesztési terv, Atlas-kvóta probléma (13b), C1 - Éles példány hitelesítés nélkül, C2 - Ugyanarra a címre/cégre többször megy levél, C3 - Válasz és visszapattanás visszaírása a kontaktra (syncContactReplies), C4 - Automatikus növekményes levelezés-szinkron (MAIL_AUTO_SYNC_MINUTES), Fejlesztési roadmap (Phase 1-4), Címzett-védelmek (recipients: cím és cégdomain szerinti kizárás) (+2 more)

### Community 76 - "README Features"
Cohesion: 0.20
Nodes (10): CLI queue semaphore (src/lib/cliQueue.ts, CLI_CONCURRENCY), Contact status derivation (src/lib/stage.ts), Follow-up in same thread (src/lib/followup.ts), Automatic Gmail sync (syncContactReplies), Interview brief (src/lib/interviewBrief.ts), AI via local Claude CLI, not OpenAI (src/lib/aiText.ts), Melodia outreach dashboard (Next.js + MongoDB Atlas), Pre-send check (src/lib/preflight.ts) (+2 more)

### Community 77 - "board.ts"
Cohesion: 0.28
Nodes (14): DELETE(), dynamic, failed(), GET(), PUT(), BoardDoc, collection(), isBoardStatus() (+6 more)

### Community 78 - "lib/profile.ts"
Cohesion: 0.12
Nodes (19): ALL, APPLY, longer(), main(), score(), dynamic, POST(), sameCompany() (+11 more)

### Community 79 - "compose.ts"
Cohesion: 0.24
Nodes (10): buildBody(), buildLead(), buildNote(), buildSubject(), hooks, profile, signatureEn, signatureHu (+2 more)

### Community 80 - "startupFinder.ts"
Cohesion: 0.27
Nodes (8): buildPrompt(), findStartups(), log, normalise(), readOutput(), ResponsesPayload, SEARCH_MODEL, StartupSearch

### Community 81 - "toParagraphs"
Cohesion: 0.31
Nodes (9): joinLines(), normaliseName(), parseLeaderPage(), parseLetterPage(), parseRecruiterPage(), sectionBetween(), stripFooter(), toParagraphs() (+1 more)

### Community 82 - "Bot & Company API Docs"
Cohesion: 0.32
Nodes (8): COMPANY_API.md - cégfelvételi API, source mező: gridleads_<üzlettípus>_<országkód>, POST /api/bot/companies, GROKBOT.md - Grokbot és Melodia integráció, GET /api/bot/next - következő cég kiadása foglalással, POST /api/bot/save - kutatási eredmény mentése, Kutatás szisztematikája (azonosítás, saját oldal, álláshirdetés, külső források, emberek, minősítés, mentés), Seedtable import (/seedimport, importDedupe)

### Community 83 - "web/route.ts"
Cohesion: 0.39
Nodes (8): dynamic, GET(), POST(), listJevResults(), jevWebState, startJevWeb(), stopJevWeb(), isStartupSearchReady()

### Community 84 - "emailFinderCodex.ts"
Cohesion: 0.20
Nodes (19): findExecutable(), baseTimeout(), buildPrompt(), cliCandidates(), CliResult, CliRunStats, describeEvent(), findEmailsBatchWithClaudeCli() (+11 more)

### Community 85 - "CompanyCheck.tsx"
Cohesion: 0.33
Nodes (7): CheckPage(), metadata, CompanyCheck(), download(), Hit, Result, stamp()

### Community 86 - "scrapeEmail.ts"
Cohesion: 0.31
Nodes (8): contactLinks(), harvest(), log, PATHS, score(), ScrapeCandidate, scrapeEmail(), ScrapeResult

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

### Community 93 - "openai.ts"
Cohesion: 0.19
Nodes (14): dynamic, maxDuration, POST(), dynamic, metadata, QueuesPage(), ScheduledReplies(), buildPrompt() (+6 more)

### Community 94 - "Deploy: $ARGUMENTS"
Cohesion: 0.40
Nodes (5): 2. Quality gate, 3. Deploy, 4. Verify, 5. If something is wrong, Deploy: $ARGUMENTS

### Community 95 - "usage.ts"
Cohesion: 0.21
Nodes (15): dynamic, GET(), findEmail(), scrapeFirst(), trackUsage(), add(), bounds(), emptyBucket() (+7 more)

### Community 104 - "PRD: [Product name]"
Cohesion: 0.20
Nodes (10): 01 Product overview, 02 Problem, 03 Goal, 04 Target users, 05 Core features, 06 Success metrics, 07 Out of scope, 08 Open questions (+2 more)

### Community 105 - "Architecture: [Product name]"
Cohesion: 0.20
Nodes (10): 01 System overview, 02 Tech stack, 03 Project structure, 04 Data flow, 05 Boundaries, 06 Decisions that look wrong but are intentional, 07 Scalability and future considerations, 08 When the agent must stop and ask (+2 more)

### Community 106 - "ashby.ts"
Cohesion: 0.09
Nodes (31): AtsVendor, COMPANIES, atsMeta, atsSources, Entry, GhJob, GhOffice, greenhouse (+23 more)

### Community 107 - "stream/route.ts"
Cohesion: 0.38
Nodes (6): dynamic, GET(), maxDuration, LogEntry, snapshot(), subscribe()

### Community 108 - "mailCollection"
Cohesion: 0.44
Nodes (8): invalidateThreadCache(), mailCollection(), saveMessages(), log, resendMessage(), ResendPage, syncResendDelivery(), syncResendSent()

### Community 109 - "VillageMap"
Cohesion: 0.25
Nodes (9): loadItems(), previewStyle(), saveItems(), fitRows(), housesOverlap(), load(), navHeight(), subscribeResize() (+1 more)

### Community 110 - "Security: [Product name]"
Cohesion: 0.25
Nodes (8): 01 What we protect, 02 Trust boundaries, 03 Authentication and authorization, 04 Secrets, 05 Input, output, injection, 06 Dependencies, 07 Incident basics, Security: [Product name]

### Community 111 - "defineSource"
Cohesion: 0.40
Nodes (5): isAlerting(), ArbeitnowJob, ArbeitnowResponse, pagesToFetch(), defineSource()

### Community 112 - "Claude Code guide: [Product name]"
Cohesion: 0.33
Nodes (6): Claude Code guide: [Product name], Commands, Gotchas, Harness map: use these instead of improvising, Snapshot, Working agreements (Claude Code)

### Community 113 - "VillageMap.tsx"
Cohesion: 0.08
Nodes (26): AutoDraftRow, BRUSHES, countdown(), DayReport, DIRS, DraftList(), Drag, FENCE_TILES (+18 more)

### Community 114 - "HistoryPanel.tsx"
Cohesion: 0.36
Nodes (6): HistoryPage(), metadata, Change, FIELD_LABELS, HistoryPanel(), show()

### Community 115 - "Tasks"
Cohesion: 0.40
Nodes (5): Done, Later (after v1), Next, Now, Tasks

### Community 116 - "Review changes"
Cohesion: 0.50
Nodes (4): Context, Review changes, Scope, Steps

### Community 117 - "personio.ts"
Cohesion: 0.20
Nodes (16): fast-xml-parser, getText(), asArray(), joinDescriptions(), parseFeed(), parser, personio, PersonioDescription (+8 more)

### Community 119 - "contacts.ts"
Cohesion: 0.07
Nodes (56): mongodb, dynamic, GET(), POST(), dynamic, GET(), dynamic, GET() (+48 more)

### Community 120 - "ConvertPanel"
Cohesion: 0.67
Nodes (3): ConvertPage(), metadata, ConvertPanel()

### Community 124 - "places/route.ts"
Cohesion: 0.40
Nodes (5): classify(), dynamic, GET(), maxDuration, PhotonFeature

### Community 126 - "layout"
Cohesion: 0.27
Nodes (10): blockCells(), corners(), draw(), findRoute(), houseFits(), layout(), rng(), sandSheet() (+2 more)

### Community 128 - "frame"
Cohesion: 0.25
Nodes (9): actMs(), along(), deliverFetch(), envelope(), fetchReturn(), figure(), frame(), plan() (+1 more)

## Knowledge Gaps
- **42 isolated node(s):** `@types/nodemailer`, `dotenv`, `react-dom`, `@tailwindcss/postcss`, `@types/mailparser` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 920 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `next` to `lib/types.ts`, `jobs/types.ts`, `botApi.ts`, `loadStoredAccounts`, `Scheduled Thread Replies`, `MessagePanel.tsx`, `jobassist/route.ts`, `accounts.ts`, `getContacts`, `Seedtable Import`, `peopleSweep.ts`, `sendQueues.ts`, `QueuesPanel.tsx`, `createLogger`, `templates.ts`, `inbox.ts`, `credential`, `mailStore.ts`, `convert.ts`, `lib/env.ts`, `Seed Import UI`, `Lint Config`, `autoDrafts.ts`, `getDb`, `history.ts`, `enrich.ts`, `jevWebSweep.ts`, `peopleFinderOpenAi.ts`, `MailApp.tsx`, `ImportPanel.tsx`, `mongodb.ts`, `jev.ts`, `button`, `threadCompose.ts`, `board.ts`, `lib/profile.ts`, `web/route.ts`, `CompanyCheck.tsx`, `openai.ts`, `usage.ts`, `stream/route.ts`, `contacts.ts`, `places/route.ts`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **What connects `@types/nodemailer`, `dotenv`, `react-dom` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lib/types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10344827586206896 - nodes in this community are weakly interconnected._
- **Why does `react` connect `next` to `Scheduled Thread Replies`, `MessagePanel.tsx`, `JobAssistPanel.tsx`, `QueuesPanel.tsx`, `templates.ts`, `export.ts`, `JobsPanel.tsx`, `villageItems.ts`, `convert.ts`, `Seed Import UI`, `Lint Config`, `getDb`, `Dashboard.tsx`, `MailApp.tsx`, `warmup.ts`, `ImportPanel.tsx`, `button`, `Usage Panel`, `data/index.ts`, `CompanyCheck.tsx`, `VillageMap.tsx`, `HistoryPanel.tsx`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Should `jobs/types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06462585034013606 - nodes in this community are weakly interconnected._
- **Why does `createLogger()` connect `createLogger` to `lib/types.ts`, `jobs/types.ts`, `botApi.ts`, `loadStoredAccounts`, `Scheduled Thread Replies`, `normalize.ts`, `logger.ts`, `accounts.ts`, `getContacts`, `Seedtable Import`, `peopleSweep.ts`, `sendQueues.ts`, `emailFinder.ts`, `jooble.ts`, `templates.ts`, `sendCampaign.ts`, `inbox.ts`, `credential`, `Careers Scraper`, `jevWebSweep.ts`, `autoDrafts.ts`, `getDb`, `emailFinderCodex.ts`, `history.ts`, `enrich.ts`, `stripHtml`, `jevWebSweep.ts`, `peopleFinderOpenAi.ts`, `replyLlm.ts`, `mongodb.ts`, `jev.ts`, `mailer.ts`, `threadCompose.ts`, `startupFinder.ts`, `emailFinderCodex.ts`, `scrapeEmail.ts`, `usage.ts`, `mailCollection`, `contacts.ts`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Should `loadStoredAccounts` be split into smaller, more focused modules?**
  _Cohesion score 0.12605042016806722 - nodes in this community are weakly interconnected._
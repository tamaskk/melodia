# Graph Report - melodia  (2026-10-21)

## Corpus Check
- 305 files · ~1,497,053 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .ico 1, .css 1)

## Summary
- 2620 nodes · 7030 edges · 119 communities (110 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 67 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `df86d42a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- formatNumber
- AppNav.tsx
- jobs/types.ts
- getContactById
- history.ts
- Scheduled Thread Replies
- normalize.ts
- next
- Contact Table & Messages
- jobassist/route.ts
- logger.ts
- accounts.ts
- emailFinderClaude.ts
- himalayas.ts
- companyIngest.ts
- Seedtable Import
- export.ts
- sendQueues.ts
- ashby.ts
- createLogger
- parse-pdfs.ts
- emailFinder.ts
- jooble.ts
- templates.ts
- stripHtml
- sendCampaign.ts
- inbox.ts
- jobs/types.ts
- credential
- Contact
- mailStore.ts
- classify.ts
- http.ts
- Careers Scraper
- keyed.ts
- parse-pdfs.ts
- fourdayweek.ts
- mailer.ts
- Seed Import UI
- CompanyCheck.tsx
- Lint Config
- autoDrafts.ts
- widgetQueues.ts
- botApi.ts
- peopleSweep.ts
- importSchema.ts
- TS Config
- Harness Rules & Skills
- queueStats.ts
- Deploy: $ARGUMENTS
- Agent Glossary & Setup
- classify.ts
- peopleFinder.ts
- app/page.tsx
- Mail App UI
- replyLlm.ts
- board.ts
- HARNESS.md
- lib/env.ts
- JobCard.tsx
- jevSweep.ts
- isInboxReady
- jev.ts
- button
- Usage Panel
- data/index.ts
- Email Sending Plan Docs
- Runtime Dependencies
- mongodb.ts
- Dev Dependencies
- jevWebSweep.ts
- Claude Settings Hooks
- NPM Scripts
- themuse.ts
- Harness & ADRs
- Audit Findings
- README Features
- JobAssistPanel.tsx
- ContactDoc
- web/route.ts
- ContactFilters
- HistoryPanel.tsx
- Bot & Company API Docs
- csvImport.ts
- emailFinderCodex.ts
- places/route.ts
- score.ts
- Deployment Architecture
- Design System: [Product name]
- Hook Lib
- AGENTS.md
- New feature: $ARGUMENTS
- add-source-segment.js
- replyTriage.ts
- ContactKind
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
- countries.ts
- mailCollection
- ImportPanel.tsx
- Security: [Product name]
- interviewBrief.ts
- Claude Code guide: [Product name]
- VillageMap.tsx
- Tasks
- Review changes
- toISO
- README.md
- contacts.ts
- startupFinder.ts

## God Nodes (most connected - your core abstractions)
1. `getContacts()` - 93 edges
2. `credential()` - 73 edges
3. `next` - 69 edges
4. `createLogger()` - 65 edges
5. `formatNumber()` - 61 edges
6. `react` - 51 edges
7. `loadStoredAccounts()` - 47 edges
8. `stripHtml()` - 46 edges
9. `makeJob()` - 45 edges
10. `getDb()` - 44 edges

## Surprising Connections (you probably didn't know these)
- `Code style` --references--> `layout()`  [INFERRED]
  HARNESS.md → src/components/VillageMap.tsx
- `1. Preconditions (stop on any failure)` --references--> `preview()`  [INFERRED]
  HARNESS.md → src/lib/logger.ts
- `Code style` --references--> `template()`  [INFERRED]
  HARNESS.md → src/lib/importSchema.ts
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

## Communities (119 total, 9 thin omitted)

### Community 0 - "formatNumber"
Cohesion: 0.09
Nodes (36): BulkTemplate(), Dashboard(), EMPTY_FILTERS, RunKey, RUNS, SHORTCUTS, toQuery(), toSourceKey() (+28 more)

### Community 1 - "AppNav.tsx"
Cohesion: 0.11
Nodes (22): geistMono, geistSans, metadata, RootLayout(), AppNav(), MAIL_MODES, MenuKey, NavLink (+14 more)

### Community 2 - "jobs/types.ts"
Cohesion: 0.09
Nodes (28): demoJobs(), dynamic, forCards(), GET(), maxDuration, PASSTHROUGH, dynamic, GET() (+20 more)

### Community 3 - "getContactById"
Cohesion: 0.13
Nodes (21): main(), dynamic, LANGUAGE_LABEL, POST(), setLanguage(), dynamic, GET(), log (+13 more)

### Community 4 - "history.ts"
Cohesion: 0.20
Nodes (15): dynamic, GET(), log, POST(), ChangeDoc, ChangeEntry, changes(), historyFacets() (+7 more)

### Community 5 - "Scheduled Thread Replies"
Cohesion: 0.06
Nodes (76): dynamic, GET(), POST(), strings(), Data, Item, MODES, STATUS_STYLE (+68 more)

### Community 6 - "normalize.ts"
Cohesion: 0.16
Nodes (17): buildDedupKey(), COUNTRY_MAP, deaccent(), DEFAULT_ELIGIBLE_COUNTRIES, isValidJob(), missingRequiredFields(), normalizeCompany(), normalizeTitle() (+9 more)

### Community 7 - "next"
Cohesion: 0.09
Nodes (37): nextConfig, next, react, PROVIDER_LABELS, EnrichItem, EnrichPanel(), EnrichState, eta() (+29 more)

### Community 8 - "Contact Table & Messages"
Cohesion: 0.10
Nodes (36): CLOSED, ContactTable(), CopyButton, copyButtons(), CopyKind, copyText(), AiDraft, CopyButton() (+28 more)

### Community 9 - "jobassist/route.ts"
Cohesion: 0.36
Nodes (9): formatSalary(), JobAssistPage, pick(), pickBool(), pickList(), pickNumber(), RawJob, toJobAssistJob() (+1 more)

### Community 10 - "logger.ts"
Cohesion: 0.16
Nodes (16): dynamic, GET(), maxDuration, buffer, COLOR, emit(), ESC, LEVEL_ORDER (+8 more)

### Community 11 - "accounts.ts"
Cohesion: 0.06
Nodes (69): AccountsPage(), metadata, DELETE(), dynamic, GET(), PATCH(), POST(), startFrom() (+61 more)

### Community 12 - "emailFinderClaude.ts"
Cohesion: 0.18
Nodes (20): askClaude(), findExecutable(), baseTimeout(), buildPrompt(), cliCandidates(), CliResult, CliRunStats, describeEvent() (+12 more)

### Community 13 - "himalayas.ts"
Cohesion: 0.12
Nodes (21): Entry, getCached(), getStamp(), setCached(), store, touchCached(), HimalayasJob, HimalayasResponse (+13 more)

### Community 14 - "companyIngest.ts"
Cohesion: 0.13
Nodes (25): main(), main(), authorised(), dynamic, maxDuration, POST(), dynamic, POST() (+17 more)

### Community 15 - "Seedtable Import"
Cohesion: 0.08
Nodes (36): dynamic, GET(), maxDuration, POST(), call(), cleanFilters(), COMPANY_FILTERS, FilterKind (+28 more)

### Community 16 - "export.ts"
Cohesion: 0.29
Nodes (11): buildExport(), COLUMNS, csvCell(), ExportFormat, ExportScope, place(), row(), toCsv() (+3 more)

### Community 17 - "sendQueues.ts"
Cohesion: 0.08
Nodes (70): dynamic, maxDuration, POST(), dynamic, POST(), dynamic, GET(), MailProvider (+62 more)

### Community 18 - "ashby.ts"
Cohesion: 0.08
Nodes (42): AtsVendor, COMPANIES, num(), ashby, AshbyAddress, AshbyComponent, AshbyJob, AshbySecondaryLocation (+34 more)

### Community 19 - "createLogger"
Cohesion: 0.13
Nodes (26): dynamic, POST(), dynamic, maxDuration, POST(), dynamic, GET(), log (+18 more)

### Community 20 - "parse-pdfs.ts"
Cohesion: 0.12
Nodes (28): baseCompany(), classify(), classifyLinks(), cleanLines(), dedupeKey(), FILES, FOOTER_FRAGMENTS, isNoise() (+20 more)

### Community 21 - "emailFinder.ts"
Cohesion: 0.10
Nodes (38): BATCH_RULES, BatchFinding, buildBatchPrompt(), buildPrompt(), callResponses(), callResponsesRaw(), contactBrief(), EmailCandidate (+30 more)

### Community 22 - "jooble.ts"
Cohesion: 0.08
Nodes (34): CURRENCIES, extractNumbers(), ParsedSalary, parseHungarianSalary(), PERIODS, collection(), log, QuotaConfig (+26 more)

### Community 23 - "templates.ts"
Cohesion: 0.16
Nodes (16): PreviewRow, Result, countryName(), DEFAULT_CONNECTION_HU, DEFAULT_LINKEDIN_HU, DEFAULT_SUBJECT_HU, DEFAULT_TEMPLATE_HU, DEFAULT_TEMPLATES (+8 more)

### Community 24 - "stripHtml"
Cohesion: 0.14
Nodes (20): matchesQuery(), stripHtml(), BaAddress, BaJob, bajobsuche, encodeRefnr(), enrich(), HEADERS (+12 more)

### Community 25 - "sendCampaign.ts"
Cohesion: 0.06
Nodes (73): isFollowUpDue(), isMailerReady(), MissingAttachmentsError, sendAlertEmail(), firstOutgoingFrom(), hasBlocking(), IssueInfo, IssueLevel (+65 more)

### Community 26 - "inbox.ts"
Cohesion: 0.13
Nodes (25): addressList(), appendDraft(), connect(), ContactHit, domainOf(), download(), draftsPresent(), findMailbox() (+17 more)

### Community 27 - "jobs/types.ts"
Cohesion: 0.14
Nodes (18): JobsPage(), metadata, Board, COUNTRIES, JobsPanel(), runBadge(), SearchResult, toggled() (+10 more)

### Community 28 - "credential"
Cohesion: 0.17
Nodes (22): dynamic, log, POST(), dynamic, LoginPage(), metadata, authMode, checkLogin() (+14 more)

### Community 29 - "Contact"
Cohesion: 0.23
Nodes (10): ALL, APPLY, longer(), main(), score(), sameCompany(), FULL_NAME, normaliseName() (+2 more)

### Community 30 - "mailStore.ts"
Cohesion: 0.10
Nodes (27): POST(), scanMailbox(), applyFilters(), DailyPoint, dayActivity(), DayRow, listThreads(), MailAddress (+19 more)

### Community 31 - "classify.ts"
Cohesion: 0.17
Nodes (18): classify(), detectLanguage(), hits(), mapSize(), HookKey, hooks, profile, signatureEn (+10 more)

### Community 32 - "http.ts"
Cohesion: 0.13
Nodes (21): backoffMs(), FetchOpts, getJson(), getJsonWithHeaders(), mapLimit(), postJson(), raw(), sleep() (+13 more)

### Community 33 - "Careers Scraper"
Cohesion: 0.12
Nodes (23): baseDomain(), careerLinks(), CareersResult, CareersRunState, careersState(), checkCareers(), extractPositions(), findCareers() (+15 more)

### Community 34 - "keyed.ts"
Cohesion: 0.21
Nodes (13): looksRemote(), extractEmail(), extractUrl(), HnComment, HnStory, hnWhoIsHiring, isTopLevel(), ParsedHeader (+5 more)

### Community 35 - "parse-pdfs.ts"
Cohesion: 0.10
Nodes (29): dynamic, maxDuration, POST(), dynamic, GET(), log, POST(), checkCompanies() (+21 more)

### Community 36 - "fourdayweek.ts"
Cohesion: 0.20
Nodes (13): companyFromUrl(), FdwCompany, FdwJob, FdwLocation, FdwResponse, fourdayweek, Named, namesOf() (+5 more)

### Community 37 - "mailer.ts"
Cohesion: 0.10
Nodes (32): nodemailer, dynamic, log, POST(), AttachmentChoice, AttachmentList, availableAttachments(), IndexDoc (+24 more)

### Community 38 - "Seed Import UI"
Cohesion: 0.08
Nodes (26): metadata, SeedImportPage(), AllProgress, AutoRun, CONTINENTS, EMPTY_RUN, Filters, HU_NAMES (+18 more)

### Community 39 - "CompanyCheck.tsx"
Cohesion: 0.29
Nodes (8): CheckPage(), metadata, CompanyCheck(), download(), Hit, Result, stamp(), COUNTRY_LABELS

### Community 40 - "Lint Config"
Cohesion: 0.08
Nodes (25): eslintConfig, name, private, version, ai, @ai-sdk/gateway, @anthropic-ai/sdk, dotenv (+17 more)

### Community 41 - "autoDrafts.ts"
Cohesion: 0.06
Nodes (67): POST(), GET(), dynamic, GET(), POST(), dynamic, GET(), dynamic (+59 more)

### Community 42 - "widgetQueues.ts"
Cohesion: 0.10
Nodes (28): dynamic, GET(), NO_STORE, AccountInput, assembleWidget(), CampaignInput, dayRange(), isDayKey() (+20 more)

### Community 43 - "botApi.ts"
Cohesion: 0.16
Nodes (17): mongodb, dynamic, GET(), handle(), POST(), dynamic, POST(), asUrl() (+9 more)

### Community 44 - "peopleSweep.ts"
Cohesion: 0.14
Nodes (21): dynamic, maxDuration, POST(), dynamic, GET(), log, POST(), cliConcurrency() (+13 more)

### Community 45 - "importSchema.ts"
Cohesion: 0.22
Nodes (17): count(), fixFile(), main(), ImportedFile, toCountryCode(), KnownMatch, asArray(), asString() (+9 more)

### Community 46 - "TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 47 - "Harness Rules & Skills"
Cohesion: 0.13
Nodes (14): test-runner subagent (typecheck, lint, test, build summary), .claude/CLAUDE.md graphify skill pointer, Evidence, not claim, Ports & Adapters (hexagonal), /fix skill (root-cause bug fixing), AGENTS.md: This is NOT the Next.js you know, CLAUDE.md contract (root project instructions), graphify usage rules (+6 more)

### Community 48 - "queueStats.ts"
Cohesion: 0.18
Nodes (8): bump(), chain, Counters, Fields, log, QueueDailyStats, sweepTracker, write()

### Community 49 - "Deploy: $ARGUMENTS"
Cohesion: 0.33
Nodes (6): 1. Preconditions (stop on any failure), 2. Quality gate, 3. Deploy, 4. Verify, 5. If something is wrong, Deploy: $ARGUMENTS

### Community 50 - "Agent Glossary & Setup"
Cohesion: 0.15
Nodes (17): reviewer subagent (read-only diff review), AAA (Arrange-Act-Assert, one Act per test), ADR (Nygard format, docs/adr/), Advice vs law (CLAUDE.md vs hook), /anchors skill (semantic anchor glossary), Chicago School (inside-out, state verification), Irtas teszt (deletion test), London School (outside-in, interaction verification) (+9 more)

### Community 51 - "classify.ts"
Cohesion: 0.12
Nodes (29): ConvertPage(), metadata, ConvertPanel(), ConvertResponse, PRIORITY_STYLE, parseCsvTable(), Classification, buildBody() (+21 more)

### Community 52 - "peopleFinder.ts"
Cohesion: 0.12
Nodes (29): trackUsage(), runClaudeApiSearch(), buildPeoplePrompt(), log, MAX_PEOPLE, normalisePeople(), PEOPLE_RULES, PeopleFinding (+21 more)

### Community 53 - "app/page.tsx"
Cohesion: 0.19
Nodes (13): main(), dynamic, POST(), dynamic, Home(), dynamic, metadata, QueuesPage() (+5 more)

### Community 54 - "Mail App UI"
Cohesion: 0.07
Nodes (34): MailPage(), metadata, metadata, RejectedPage(), AccountChoice, AttachmentChoice, Bubble(), FILTERS (+26 more)

### Community 55 - "replyLlm.ts"
Cohesion: 0.23
Nodes (16): MailMessage, assertLlmReachable(), baseUrl(), buildUserPrompt(), chat(), generateReplyDraft(), headers(), humanError() (+8 more)

### Community 56 - "board.ts"
Cohesion: 0.28
Nodes (14): DELETE(), dynamic, failed(), GET(), PUT(), BoardDoc, collection(), isBoardStatus() (+6 more)

### Community 57 - "HARNESS.md"
Cohesion: 0.04
Nodes (47): anything else (docs, configs, markdown, small files, ranged reads) -> no opinion, API, server actions and services, ask  -> risky but sometimes legitimate; a human must confirm, Bash cat/bat/less/more/nl/tac of a source file -> same two rules as Read, Claude Code: personal files, not shared, .claude/hooks/format-file.sh, .claude/hooks/graph-first.sh, .claude/hooks/session-context.sh (+39 more)

### Community 58 - "lib/env.ts"
Cohesion: 0.20
Nodes (11): findMatches(), main(), normalise(), readInput(), CONTACTS_COLLECTION, fileEnv, MONGODB_DB, MONGODB_URI (+3 more)

### Community 59 - "JobCard.tsx"
Cohesion: 0.29
Nodes (11): AssistJob, initials(), JobAssistCard(), JobCard(), chip(), jobAge(), jobHours(), jobSalary() (+3 more)

### Community 60 - "jevSweep.ts"
Cohesion: 0.19
Nodes (17): dynamic, GET(), POST(), Candidate, cleanNote(), companyKeyOf(), companyState(), evaluate() (+9 more)

### Community 61 - "isInboxReady"
Cohesion: 0.42
Nodes (8): dynamic, GET(), POST(), isInboxReady(), startAutoSync(), startSync(), syncAndWait(), syncState

### Community 62 - "jev.ts"
Cohesion: 0.27
Nodes (11): dynamic, GET(), POST(), askBoolean(), humanError(), isJevReady(), JEV_MODEL, JevError (+3 more)

### Community 63 - "button"
Cohesion: 0.07
Nodes (48): ComposePage(), metadata, metadata, RecentPage(), WarmupEditor(), Account, Attachment, AutoSchedulePanel() (+40 more)

### Community 64 - "Usage Panel"
Cohesion: 0.21
Nodes (13): metadata, UsagePage(), Bucket, cell(), clock(), download(), Entry, isoDay() (+5 more)

### Community 65 - "data/index.ts"
Cohesion: 0.10
Nodes (27): JevPage(), metadata, Combobox(), ComboOption, fold(), formatCost(), JevPanel(), ask() (+19 more)

### Community 66 - "Email Sending Plan Docs"
Cohesion: 0.18
Nodes (14): F2 - Follow-up sor (followup.ts, FollowUpPanel), F4 - Küldés előtti ellenőrzés (preflight.ts), EMAIL-KULDES.md - Ütemezett e-mail kiküldő tervrajz, Fiókok a beállításokból (titkosított jelszó tárolás), Fiókonkénti kiküldő menet (runner ciklus, sendCampaign), Napi keret és felfuttatás (warmup), Telepítés Hetznerre (systemd, Caddy, SMTP-portok), Véletlen szünet levelek között (+6 more)

### Community 67 - "Runtime Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, ai, @ai-sdk/gateway, @anthropic-ai/sdk, dotenv, fast-xml-parser, imapflow, mailparser (+6 more)

### Community 68 - "mongodb.ts"
Cohesion: 0.18
Nodes (12): main(), clientPromise, createClient(), currentClient(), GlobalWithMongo, hasStalePrimary(), log, TopologyView (+4 more)

### Community 69 - "Dev Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, eslint-config-next, pdf-parse, pdfjs-dist, tailwindcss, @tailwindcss/postcss, tsx (+5 more)

### Community 70 - "jevWebSweep.ts"
Cohesion: 0.27
Nodes (11): getJevResults(), JevResult, ANGLES, domainOf(), handleStartup(), JevWebOptions, log, loop() (+3 more)

### Community 71 - "Claude Settings Hooks"
Cohesion: 0.18
Nodes (10): hooks, PostToolUse, PreToolUse, SessionStart, Stop, permissions, allow, ask (+2 more)

### Community 72 - "NPM Scripts"
Cohesion: 0.18
Nodes (11): scripts, backfill-aliases, build, dev, emails, lint, parse, seed (+3 more)

### Community 73 - "themuse.ts"
Cohesion: 0.23
Nodes (10): configuredLocations(), isRemoteLocation(), log, matchesLocation(), MuseJob, MuseLevel, MuseResponse, themuse (+2 more)

### Community 74 - "Harness & ADRs"
Cohesion: 0.24
Nodes (3): ADR sablon (Nygard-formátum), ADR 0001 - A harness a repóban él, nem a felhasználói profilban, HARNESS.md - A harness

### Community 75 - "Audit Findings"
Cohesion: 0.22
Nodes (10): AUDIT.md - Melodia teljes audit és fejlesztési terv, Atlas-kvóta probléma (13b), C1 - Éles példány hitelesítés nélkül, C2 - Ugyanarra a címre/cégre többször megy levél, C3 - Válasz és visszapattanás visszaírása a kontaktra (syncContactReplies), C4 - Automatikus növekményes levelezés-szinkron (MAIL_AUTO_SYNC_MINUTES), Fejlesztési roadmap (Phase 1-4), Címzett-védelmek (recipients: cím és cégdomain szerinti kizárás) (+2 more)

### Community 76 - "README Features"
Cohesion: 0.20
Nodes (10): CLI queue semaphore (src/lib/cliQueue.ts, CLI_CONCURRENCY), Contact status derivation (src/lib/stage.ts), Follow-up in same thread (src/lib/followup.ts), Automatic Gmail sync (syncContactReplies), Interview brief (src/lib/interviewBrief.ts), AI via local Claude CLI, not OpenAI (src/lib/aiText.ts), Melodia outreach dashboard (Next.js + MongoDB Atlas), Pre-send check (src/lib/preflight.ts) (+2 more)

### Community 77 - "JobAssistPanel.tsx"
Cohesion: 0.15
Nodes (21): JobAssistPanel(), PageMeta, toggled(), icon(), LocationAutocomplete(), RangeSlider(), TitleChipsInput(), CARD (+13 more)

### Community 78 - "ContactDoc"
Cohesion: 0.24
Nodes (9): dynamic, maxDuration, POST(), buildPrompt(), CANDIDATE_PROFILE, GeneratedLetter, generateLetter(), OPENAI_MODEL (+1 more)

### Community 79 - "web/route.ts"
Cohesion: 0.39
Nodes (8): dynamic, GET(), POST(), listJevResults(), jevWebState, startJevWeb(), stopJevWeb(), isStartupSearchReady()

### Community 80 - "ContactFilters"
Cohesion: 0.25
Nodes (8): Chip, SweepOptions, JevSweepOptions, PeopleSweepOptions, CampaignOptions, Todo, TODOS, ContactFilters

### Community 81 - "HistoryPanel.tsx"
Cohesion: 0.36
Nodes (6): HistoryPage(), metadata, Change, FIELD_LABELS, HistoryPanel(), show()

### Community 82 - "Bot & Company API Docs"
Cohesion: 0.32
Nodes (8): COMPANY_API.md - cégfelvételi API, source mező: gridleads_<üzlettípus>_<országkód>, POST /api/bot/companies, GROKBOT.md - Grokbot és Melodia integráció, GET /api/bot/next - következő cég kiadása foglalással, POST /api/bot/save - kutatási eredmény mentése, Kutatás szisztematikája (azonosítás, saját oldal, álláshirdetés, külső források, emberek, minősítés, mentés), Seedtable import (/seedimport, importDedupe)

### Community 83 - "csvImport.ts"
Cohesion: 0.19
Nodes (16): buildCompanyLetter(), clean(), COLUMNS, csvToImportRows(), fixMojibake(), headerKey(), INDUSTRY_HU, industryLabel() (+8 more)

### Community 84 - "emailFinderCodex.ts"
Cohesion: 0.14
Nodes (22): acquire(), drain(), freeMemoryMb(), log, runExclusive(), setCliConcurrency(), shared, waitForMemory() (+14 more)

### Community 85 - "places/route.ts"
Cohesion: 0.33
Nodes (6): classify(), dynamic, GET(), maxDuration, PhotonFeature, PlaceSuggestion

### Community 86 - "score.ts"
Cohesion: 0.14
Nodes (5): Doc, SCORE_EXPRESSION, SCORE_RULES, ScoreRule, tags

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

### Community 93 - "replyTriage.ts"
Cohesion: 0.24
Nodes (11): latestReplies(), LatestReply, AiTriage, CATEGORIES, classifyByRules(), classifyWithAi(), log, OUTCOME_FOR (+3 more)

### Community 94 - "ContactKind"
Cohesion: 0.40
Nodes (6): FileMeta, Parsed, EnrichOptions, ParseOptions, ContactKind, Language

### Community 95 - "usage.ts"
Cohesion: 0.28
Nodes (11): dynamic, GET(), add(), bounds(), emptyBucket(), listUsage(), log, UsageBucket (+3 more)

### Community 104 - "PRD: [Product name]"
Cohesion: 0.20
Nodes (10): 01 Product overview, 02 Problem, 03 Goal, 04 Target users, 05 Core features, 06 Success metrics, 07 Out of scope, 08 Open questions (+2 more)

### Community 105 - "Architecture: [Product name]"
Cohesion: 0.20
Nodes (10): 01 System overview, 02 Tech stack, 03 Project structure, 04 Data flow, 05 Boundaries, 06 Decisions that look wrong but are intentional, 07 Scalability and future considerations, 08 When the agent must stop and ask (+2 more)

### Community 106 - "countries.ts"
Cohesion: 0.40
Nodes (5): COUNTRIES, CountryInfo, fold(), LEGACY_CODES, LOOKUP

### Community 107 - "mailCollection"
Cohesion: 0.44
Nodes (8): invalidateThreadCache(), mailCollection(), saveMessages(), log, resendMessage(), ResendPage, syncResendDelivery(), syncResendSent()

### Community 108 - "ImportPanel.tsx"
Cohesion: 0.08
Nodes (34): Code style, DebugPage(), LEVELS, metadata, ImportPage(), metadata, DebugConsole(), LEVEL_ORDER (+26 more)

### Community 110 - "Security: [Product name]"
Cohesion: 0.25
Nodes (8): 01 What we protect, 02 Trust boundaries, 03 Authentication and authorization, 04 Secrets, 05 Input, output, injection, 06 Dependencies, 07 Incident basics, Security: [Product name]

### Community 111 - "interviewBrief.ts"
Cohesion: 0.43
Nodes (5): dynamic, POST(), createInterviewBrief(), InterviewBrief, conversation()

### Community 112 - "Claude Code guide: [Product name]"
Cohesion: 0.33
Nodes (6): Claude Code guide: [Product name], Commands, Gotchas, Harness map: use these instead of improvising, Snapshot, Working agreements (Claude Code)

### Community 113 - "VillageMap.tsx"
Cohesion: 0.05
Nodes (68): BY_KEY, drawItems(), editListeners, editsSnapshot(), HOUSE_KINDS, hslToRgb(), ItemKind, ITEMS (+60 more)

### Community 115 - "Tasks"
Cohesion: 0.40
Nodes (5): Done, Later (after v1), Next, Now, Tasks

### Community 116 - "Review changes"
Cohesion: 0.50
Nodes (4): Context, Review changes, Scope, Steps

### Community 117 - "toISO"
Cohesion: 0.10
Nodes (37): fast-xml-parser, isAlerting(), getText(), eligibleCountries(), guessCountry(), isReachableFrom(), toISO(), arbeitnow (+29 more)

### Community 119 - "contacts.ts"
Cohesion: 0.08
Nodes (41): dynamic, GET(), POST(), dynamic, GET(), dynamic, GET(), DELETE() (+33 more)

### Community 121 - "startupFinder.ts"
Cohesion: 0.25
Nodes (9): openAiKey(), buildPrompt(), findStartups(), log, normalise(), readOutput(), ResponsesPayload, SEARCH_MODEL (+1 more)

## Knowledge Gaps
- **42 isolated node(s):** `@types/nodemailer`, `dotenv`, `react-dom`, `@tailwindcss/postcss`, `@types/mailparser` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 899 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `next` to `AppNav.tsx`, `jobs/types.ts`, `getContactById`, `history.ts`, `Scheduled Thread Replies`, `Contact Table & Messages`, `logger.ts`, `accounts.ts`, `companyIngest.ts`, `Seedtable Import`, `sendQueues.ts`, `createLogger`, `credential`, `parse-pdfs.ts`, `mailer.ts`, `Seed Import UI`, `CompanyCheck.tsx`, `Lint Config`, `autoDrafts.ts`, `widgetQueues.ts`, `botApi.ts`, `peopleSweep.ts`, `classify.ts`, `app/page.tsx`, `Mail App UI`, `board.ts`, `jevSweep.ts`, `isInboxReady`, `jev.ts`, `button`, `ContactDoc`, `web/route.ts`, `places/route.ts`, `usage.ts`, `ImportPanel.tsx`, `interviewBrief.ts`, `contacts.ts`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **What connects `@types/nodemailer`, `dotenv`, `react-dom` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `formatNumber` be split into smaller, more focused modules?**
  _Cohesion score 0.08748615725359911 - nodes in this community are weakly interconnected._
- **Why does `createLogger()` connect `createLogger` to `jobs/types.ts`, `getContactById`, `history.ts`, `Scheduled Thread Replies`, `normalize.ts`, `logger.ts`, `accounts.ts`, `emailFinderClaude.ts`, `companyIngest.ts`, `Seedtable Import`, `sendQueues.ts`, `emailFinder.ts`, `jooble.ts`, `sendCampaign.ts`, `inbox.ts`, `credential`, `Careers Scraper`, `parse-pdfs.ts`, `mailer.ts`, `autoDrafts.ts`, `botApi.ts`, `peopleSweep.ts`, `queueStats.ts`, `peopleFinder.ts`, `replyLlm.ts`, `jevSweep.ts`, `jev.ts`, `mongodb.ts`, `jevWebSweep.ts`, `themuse.ts`, `emailFinderCodex.ts`, `replyTriage.ts`, `usage.ts`, `mailCollection`, `contacts.ts`, `startupFinder.ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Should `AppNav.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10826210826210826 - nodes in this community are weakly interconnected._
- **Why does `react` connect `next` to `formatNumber`, `AppNav.tsx`, `Scheduled Thread Replies`, `Contact Table & Messages`, `accounts.ts`, `templates.ts`, `jobs/types.ts`, `Seed Import UI`, `CompanyCheck.tsx`, `Lint Config`, `classify.ts`, `Mail App UI`, `button`, `Usage Panel`, `data/index.ts`, `JobAssistPanel.tsx`, `HistoryPanel.tsx`, `ImportPanel.tsx`, `VillageMap.tsx`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Should `jobs/types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08534850640113797 - nodes in this community are weakly interconnected._
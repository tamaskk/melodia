# Graph Report - melodia  (2026-10-25)

## Corpus Check
- 310 files · ~1,507,753 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .ico 1, .css 1)

## Summary
- 2696 nodes · 7214 edges · 120 communities (111 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 96 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2e84b5bc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- autoSchedule.ts
- AppNav.tsx
- jobs/types.ts
- botApi.ts
- attachmentIndex.ts
- Scheduled Thread Replies
- normalize.ts
- next
- Contact Table & Messages
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
- ConvertPanel.tsx
- http.ts
- Careers Scraper
- themuse.ts
- credential
- fourdayweek.ts
- csvImport.ts
- Seed Import UI
- enrich/route.ts
- Lint Config
- autoDrafts.ts
- widgetQueues.ts
- emailFinderCodex.ts
- history.ts
- enrich.ts
- TS Config
- Harness Rules & Skills
- stripHtml
- jevWebSweep.ts
- Agent Glossary & Setup
- importSchema.ts
- peopleFinderOpenAi.ts
- Dashboard.tsx
- MailApp.tsx
- replyLlm.ts
- ConvertPanel
- HARNESS.md
- replyTriage.ts
- ImportPanel.tsx
- countries.ts
- jev.ts
- classify.ts
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
- score.ts
- lib/types.ts
- queueStats.ts
- Bot & Company API Docs
- emailFinderCodex.ts
- sendWindow.ts
- importStream.worker.ts
- Deployment Architecture
- Design System: [Product name]
- Hook Lib
- AGENTS.md
- New feature: $ARGUMENTS
- add-source-segment.js
- openai.ts
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
- mailCollection
- VillageMap
- Security: [Product name]
- Claude Code guide: [Product name]
- VillageMap.tsx
- HistoryPanel.tsx
- Tasks
- Review changes
- personio.ts
- README.md
- contacts.ts
- roofed
- interviewBrief.ts
- places/route.ts
- layout
- frame

## God Nodes (most connected - your core abstractions)
1. `getContacts()` - 93 edges
2. `credential()` - 73 edges
3. `next` - 70 edges
4. `createLogger()` - 65 edges
5. `formatNumber()` - 61 edges
6. `react` - 52 edges
7. `loadStoredAccounts()` - 47 edges
8. `stripHtml()` - 46 edges
9. `getDb()` - 46 edges
10. `makeJob()` - 45 edges

## Surprising Connections (you probably didn't know these)
- `Code style` --references--> `template()`  [INFERRED]
  HARNESS.md → src/lib/importSchema.ts
- `Code style` --references--> `layout()`  [INFERRED]
  HARNESS.md → src/components/VillageMap.tsx
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

## Communities (120 total, 9 thin omitted)

### Community 0 - "autoSchedule.ts"
Cohesion: 0.14
Nodes (32): dynamic, GET(), maxDuration, POST(), applyAutoSchedule(), AutoQueue, AutoScheduleInput, leadIds() (+24 more)

### Community 1 - "AppNav.tsx"
Cohesion: 0.13
Nodes (18): geistMono, geistSans, metadata, RootLayout(), AppNav(), MAIL_MODES, MenuKey, NavLink (+10 more)

### Community 2 - "jobs/types.ts"
Cohesion: 0.08
Nodes (31): dynamic, GET(), maxDuration, dynamic, GET(), ALERT_AFTER, Entry, healthOf() (+23 more)

### Community 3 - "botApi.ts"
Cohesion: 0.15
Nodes (18): mongodb, dynamic, GET(), handle(), POST(), dynamic, POST(), filtersFromParams() (+10 more)

### Community 4 - "attachmentIndex.ts"
Cohesion: 0.16
Nodes (14): register(), AttachmentList, IndexDoc, localAttachments(), log, publishAttachments(), state(), log (+6 more)

### Community 5 - "Scheduled Thread Replies"
Cohesion: 0.08
Nodes (57): dynamic, GET(), POST(), strings(), Data, Item, MODES, STATUS_STYLE (+49 more)

### Community 6 - "normalize.ts"
Cohesion: 0.12
Nodes (27): buildDedupKey(), COUNTRY_MAP, deaccent(), DEFAULT_ELIGIBLE_COUNTRIES, isValidJob(), matchesQuery(), missingRequiredFields(), normalizeCompany() (+19 more)

### Community 7 - "next"
Cohesion: 0.11
Nodes (33): react, PROVIDER_LABELS, EnrichItem, EnrichPanel(), EnrichState, eta(), PROVIDERS, humanTime() (+25 more)

### Community 8 - "Contact Table & Messages"
Cohesion: 0.10
Nodes (37): CLOSED, ContactTable(), CopyButton, copyButtons(), CopyKind, copyText(), AiDraft, CopyButton() (+29 more)

### Community 9 - "jobassist/route.ts"
Cohesion: 0.21
Nodes (15): demoJobs(), dynamic, forCards(), GET(), maxDuration, PASSTHROUGH, formatSalary(), JobAssistPage (+7 more)

### Community 10 - "logger.ts"
Cohesion: 0.09
Nodes (30): 1. Preconditions (stop on any failure), 2. Quality gate, 3. Deploy, 4. Verify, 5. If something is wrong, Deploy: $ARGUMENTS, dynamic, GET() (+22 more)

### Community 11 - "accounts.ts"
Cohesion: 0.07
Nodes (59): DELETE(), dynamic, GET(), PATCH(), POST(), startFrom(), dynamic, metadata (+51 more)

### Community 12 - "JobAssistPanel.tsx"
Cohesion: 0.13
Nodes (26): AssistJob, initials(), JobAssistCard(), JobAssistPanel(), PageMeta, toggled(), icon(), LocationAutocomplete() (+18 more)

### Community 13 - "himalayas.ts"
Cohesion: 0.07
Nodes (44): Entry, getCached(), getStamp(), setCached(), store, touchCached(), isAlerting(), guessCountry() (+36 more)

### Community 14 - "getContacts"
Cohesion: 0.10
Nodes (40): main(), main(), main(), main(), ALL, APPLY, longer(), main() (+32 more)

### Community 15 - "Seedtable Import"
Cohesion: 0.09
Nodes (35): dynamic, GET(), maxDuration, POST(), call(), cleanFilters(), COMPANY_FILTERS, FilterKind (+27 more)

### Community 16 - "peopleSweep.ts"
Cohesion: 0.18
Nodes (16): dynamic, GET(), log, POST(), cliConcurrency(), hasFilters(), loadQueue(), log (+8 more)

### Community 17 - "sendQueues.ts"
Cohesion: 0.11
Nodes (44): GET(), dynamic, GET(), POST(), GET(), DELETE(), dynamic, GET() (+36 more)

### Community 18 - "QueuesPanel.tsx"
Cohesion: 0.12
Nodes (27): Account, Attachment, AutoSchedulePanel(), Lead, limitNote(), longDay(), byDay(), dayLabel() (+19 more)

### Community 19 - "createLogger"
Cohesion: 0.16
Nodes (20): nextConfig, next, dynamic, POST(), dynamic, maxDuration, POST(), dynamic (+12 more)

### Community 20 - "parse-pdfs.ts"
Cohesion: 0.10
Nodes (32): pdf-parse, pdfjs-dist, baseCompany(), classify(), classifyLinks(), cleanLines(), dedupeKey(), FILES (+24 more)

### Community 21 - "emailFinder.ts"
Cohesion: 0.09
Nodes (42): availableProviders(), BATCH_RULES, BatchFinding, buildBatchPrompt(), buildPrompt(), callResponses(), callResponsesRaw(), contactBrief() (+34 more)

### Community 22 - "jooble.ts"
Cohesion: 0.08
Nodes (33): CURRENCIES, extractNumbers(), ParsedSalary, parseHungarianSalary(), PERIODS, collection(), log, QuotaConfig (+25 more)

### Community 23 - "templates.ts"
Cohesion: 0.16
Nodes (16): PreviewRow, Result, countryName(), DEFAULT_CONNECTION_HU, DEFAULT_LINKEDIN_HU, DEFAULT_SUBJECT_HU, DEFAULT_TEMPLATE_HU, DEFAULT_TEMPLATES (+8 more)

### Community 24 - "sendCampaign.ts"
Cohesion: 0.06
Nodes (80): dynamic, log, POST(), listContactIds(), ago(), DraftInput, FOLLOW_UP_AFTER_DAYS, followUpDraft() (+72 more)

### Community 25 - "export.ts"
Cohesion: 0.25
Nodes (13): ExportBar(), FORMATS, buildExport(), COLUMNS, csvCell(), ExportFormat, ExportScope, place() (+5 more)

### Community 26 - "inbox.ts"
Cohesion: 0.10
Nodes (37): dynamic, GET(), POST(), releaseDeleted(), addressList(), appendDraft(), connect(), ContactHit (+29 more)

### Community 27 - "JobsPanel.tsx"
Cohesion: 0.15
Nodes (19): JobsPage(), metadata, JobCard(), Board, COUNTRIES, JobsPanel(), runBadge(), SearchResult (+11 more)

### Community 28 - "credential"
Cohesion: 0.18
Nodes (20): dynamic, log, POST(), dynamic, LoginPage(), metadata, authMode, checkLogin() (+12 more)

### Community 29 - "villageItems.ts"
Cohesion: 0.08
Nodes (27): BIOME_OF, BiomeKey, BIOMES, Bounds, BY_KEY, drawItems(), drawMarker(), editListeners (+19 more)

### Community 30 - "mailStore.ts"
Cohesion: 0.12
Nodes (24): dynamic, POST(), applyFilters(), dailyCounts(), DailyPoint, dayActivity(), DayRow, listThreads() (+16 more)

### Community 31 - "ConvertPanel.tsx"
Cohesion: 0.22
Nodes (16): ConvertResponse, PRIORITY_STYLE, parseCsvTable(), convertCsv(), ConvertOptions, ConvertResult, norm(), parseEmailMap() (+8 more)

### Community 32 - "http.ts"
Cohesion: 0.13
Nodes (20): backoffMs(), FetchOpts, getJson(), getJsonWithHeaders(), mapLimit(), postJson(), raw(), sleep() (+12 more)

### Community 33 - "Careers Scraper"
Cohesion: 0.13
Nodes (22): baseDomain(), careerLinks(), CareersResult, CareersRunState, careersState(), checkCareers(), extractPositions(), findCareers() (+14 more)

### Community 34 - "themuse.ts"
Cohesion: 0.17
Nodes (14): jobsEnv(), eligibleCountries(), queryMatrix, configuredLocales(), configuredLocations(), isRemoteLocation(), log, matchesLocation() (+6 more)

### Community 35 - "credential"
Cohesion: 0.16
Nodes (14): authorised(), dynamic, maxDuration, POST(), MAX_COMPANIES, readCompanies(), CONTACTS_COLLECTION, credential() (+6 more)

### Community 36 - "fourdayweek.ts"
Cohesion: 0.20
Nodes (13): companyFromUrl(), FdwCompany, FdwJob, FdwLocation, FdwResponse, fourdayweek, Named, namesOf() (+5 more)

### Community 37 - "csvImport.ts"
Cohesion: 0.19
Nodes (17): buildCompanyLetter(), clean(), COLUMNS, csvToImportRows(), fixMojibake(), headerKey(), INDUSTRY_HU, industryLabel() (+9 more)

### Community 38 - "Seed Import UI"
Cohesion: 0.08
Nodes (29): metadata, SeedImportPage(), Combobox(), ComboOption, fold(), AllProgress, AutoRun, CONTINENTS (+21 more)

### Community 39 - "enrich/route.ts"
Cohesion: 0.33
Nodes (7): CheckPage(), metadata, CompanyCheck(), download(), Hit, Result, stamp()

### Community 40 - "Lint Config"
Cohesion: 0.09
Nodes (21): eslintConfig, name, private, version, @anthropic-ai/sdk, dotenv, eslint, eslint-config-next (+13 more)

### Community 41 - "autoDrafts.ts"
Cohesion: 0.11
Nodes (33): dynamic, GET(), POST(), startOfToday(), getAccount(), AutoDraft, autoDraftsToday(), buildMessage() (+25 more)

### Community 42 - "widgetQueues.ts"
Cohesion: 0.08
Nodes (36): dynamic, GET(), NO_STORE, AccountInput, assembleWidget(), CampaignInput, dayRange(), isDayKey() (+28 more)

### Community 43 - "emailFinderCodex.ts"
Cohesion: 0.13
Nodes (24): acquire(), drain(), findExecutable(), freeMemoryMb(), log, runExclusive(), setCliConcurrency(), shared (+16 more)

### Community 44 - "history.ts"
Cohesion: 0.20
Nodes (14): dynamic, GET(), log, POST(), ChangeDoc, ChangeEntry, changes(), historyFacets() (+6 more)

### Community 45 - "enrich.ts"
Cohesion: 0.09
Nodes (34): FileMeta, dynamic, maxDuration, POST(), dynamic, GET(), log, POST() (+26 more)

### Community 46 - "TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 47 - "Harness Rules & Skills"
Cohesion: 0.13
Nodes (14): test-runner subagent (typecheck, lint, test, build summary), .claude/CLAUDE.md graphify skill pointer, Evidence, not claim, Ports & Adapters (hexagonal), /fix skill (root-cause bug fixing), AGENTS.md: This is NOT the Next.js you know, CLAUDE.md contract (root project instructions), graphify usage rules (+6 more)

### Community 48 - "stripHtml"
Cohesion: 0.13
Nodes (24): looksRemote(), stripHtml(), BaAddress, BaJob, bajobsuche, encodeRefnr(), enrich(), HEADERS (+16 more)

### Community 49 - "jevWebSweep.ts"
Cohesion: 0.09
Nodes (43): dynamic, GET(), POST(), dynamic, GET(), POST(), Chip, SweepOptions (+35 more)

### Community 50 - "Agent Glossary & Setup"
Cohesion: 0.15
Nodes (17): reviewer subagent (read-only diff review), AAA (Arrange-Act-Assert, one Act per test), ADR (Nygard format, docs/adr/), Advice vs law (CLAUDE.md vs hook), /anchors skill (semantic anchor glossary), Chicago School (inside-out, state verification), Irtas teszt (deletion test), London School (outside-in, interaction verification) (+9 more)

### Community 51 - "importSchema.ts"
Cohesion: 0.22
Nodes (14): count(), fixFile(), main(), KnownMatch, asArray(), asString(), ImportRow, normaliseImportRow() (+6 more)

### Community 52 - "peopleFinderOpenAi.ts"
Cohesion: 0.22
Nodes (15): runClaudeApiSearch(), buildPeoplePrompt(), findPeople(), log, MAX_PEOPLE, normalisePeople(), PEOPLE_RULES, PeopleFinding (+7 more)

### Community 53 - "Dashboard.tsx"
Cohesion: 0.15
Nodes (22): BulkTemplate(), Dashboard(), EMPTY_FILTERS, RunKey, RUNS, SHORTCUTS, toQuery(), toSourceKey() (+14 more)

### Community 54 - "MailApp.tsx"
Cohesion: 0.06
Nodes (47): dynamic, GET(), POST(), MailPage(), metadata, metadata, RejectedPage(), AccountChoice (+39 more)

### Community 55 - "replyLlm.ts"
Cohesion: 0.22
Nodes (17): MailMessage, shortIntro(), assertLlmReachable(), baseUrl(), buildUserPrompt(), chat(), generateReplyDraft(), headers() (+9 more)

### Community 56 - "ConvertPanel"
Cohesion: 0.67
Nodes (3): ConvertPage(), metadata, ConvertPanel()

### Community 57 - "HARNESS.md"
Cohesion: 0.04
Nodes (47): anything else (docs, configs, markdown, small files, ranged reads) -> no opinion, API, server actions and services, ask  -> risky but sometimes legitimate; a human must confirm, Bash cat/bat/less/more/nl/tac of a source file -> same two rules as Read, Claude Code: personal files, not shared, .claude/hooks/format-file.sh, .claude/hooks/graph-first.sh, .claude/hooks/session-context.sh (+39 more)

### Community 58 - "replyTriage.ts"
Cohesion: 0.20
Nodes (15): dynamic, GET(), POST(), sendFollowUpEmail(), latestReplies(), LatestReply, AiTriage, CATEGORIES (+7 more)

### Community 59 - "ImportPanel.tsx"
Cohesion: 0.20
Nodes (13): ImportPage(), metadata, DomainDecision, ImportPanel(), ImportResult, Issue, KIND_HINT, PreviewRow (+5 more)

### Community 60 - "countries.ts"
Cohesion: 0.17
Nodes (15): CountryInfo, fold(), LEGACY_CODES, LOOKUP, toCountryCode(), buildBody(), buildLead(), buildNote() (+7 more)

### Community 61 - "jev.ts"
Cohesion: 0.22
Nodes (13): ai, @ai-sdk/gateway, dynamic, GET(), POST(), askBoolean(), humanError(), isJevReady() (+5 more)

### Community 62 - "classify.ts"
Cohesion: 0.22
Nodes (16): Classification, classify(), detectLanguage(), hits(), mapSize(), HookKey, BOOST, DATA_SMELLS (+8 more)

### Community 63 - "button"
Cohesion: 0.08
Nodes (35): AccountsPage(), metadata, ComposePage(), metadata, metadata, RecentPage(), AccountsPanel(), Change (+27 more)

### Community 64 - "Usage Panel"
Cohesion: 0.21
Nodes (13): metadata, UsagePage(), Bucket, cell(), clock(), download(), Entry, isoDay() (+5 more)

### Community 65 - "data/index.ts"
Cohesion: 0.06
Nodes (44): JevPage(), metadata, CONTACT_STATUS, email(), EMAIL_STATUS, Facets, FilterBar(), JEV_OPTIONS (+36 more)

### Community 66 - "Email Sending Plan Docs"
Cohesion: 0.18
Nodes (14): F2 - Follow-up sor (followup.ts, FollowUpPanel), F4 - Küldés előtti ellenőrzés (preflight.ts), EMAIL-KULDES.md - Ütemezett e-mail kiküldő tervrajz, Fiókok a beállításokból (titkosított jelszó tárolás), Fiókonkénti kiküldő menet (runner ciklus, sendCampaign), Napi keret és felfuttatás (warmup), Telepítés Hetznerre (systemd, Caddy, SMTP-portok), Véletlen szünet levelek között (+6 more)

### Community 67 - "Runtime Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, ai, @ai-sdk/gateway, @anthropic-ai/sdk, dotenv, fast-xml-parser, imapflow, mailparser (+6 more)

### Community 68 - "mailer.ts"
Cohesion: 0.15
Nodes (19): ALLOWED, AttachmentInfo, attachmentsDir(), filesIn(), listAttachments(), log, onDisk(), resolveSelection() (+11 more)

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
Cohesion: 0.19
Nodes (18): dynamic, GET(), maxDuration, POST(), text(), markDraftSent(), threadDraft(), draftByMessageId() (+10 more)

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

### Community 78 - "score.ts"
Cohesion: 0.14
Nodes (5): Doc, SCORE_EXPRESSION, SCORE_RULES, ScoreRule, tags

### Community 80 - "lib/types.ts"
Cohesion: 0.10
Nodes (26): dynamic, LANGUAGE_LABEL, POST(), setLanguage(), dynamic, maxDuration, POST(), dynamic (+18 more)

### Community 81 - "queueStats.ts"
Cohesion: 0.12
Nodes (17): cliBusy(), loadQueue(), log, processOne(), run(), sleep(), state, SweepItem (+9 more)

### Community 82 - "Bot & Company API Docs"
Cohesion: 0.32
Nodes (8): COMPANY_API.md - cégfelvételi API, source mező: gridleads_<üzlettípus>_<országkód>, POST /api/bot/companies, GROKBOT.md - Grokbot és Melodia integráció, GET /api/bot/next - következő cég kiadása foglalással, POST /api/bot/save - kutatási eredmény mentése, Kutatás szisztematikája (azonosítás, saját oldal, álláshirdetés, külső források, emberek, minősítés, mentés), Seedtable import (/seedimport, importDedupe)

### Community 84 - "emailFinderCodex.ts"
Cohesion: 0.18
Nodes (19): askClaude(), baseTimeout(), buildPrompt(), cliCandidates(), CliResult, CliRunStats, describeEvent(), findEmailWithClaudeCli() (+11 more)

### Community 85 - "sendWindow.ts"
Cohesion: 0.26
Nodes (11): DEFAULT_TIME_ZONE, insideWindowAt(), localParts(), nextWindowStart(), partsCache, pickRecipient(), TEST_MODE_LIMIT, TIME_ZONES (+3 more)

### Community 86 - "importStream.worker.ts"
Cohesion: 0.22
Nodes (9): BatchMessage, decoder, ErrorMessage, fill(), NextMessage, OpenMessage, queue, scan() (+1 more)

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
Cohesion: 0.09
Nodes (30): dynamic, maxDuration, POST(), dynamic, metadata, QueuesPage(), ScheduledReplies(), buildPrompt() (+22 more)

### Community 95 - "usage.ts"
Cohesion: 0.28
Nodes (11): dynamic, GET(), add(), bounds(), emptyBucket(), listUsage(), log, UsageBucket (+3 more)

### Community 104 - "PRD: [Product name]"
Cohesion: 0.20
Nodes (10): 01 Product overview, 02 Problem, 03 Goal, 04 Target users, 05 Core features, 06 Success metrics, 07 Out of scope, 08 Open questions (+2 more)

### Community 105 - "Architecture: [Product name]"
Cohesion: 0.20
Nodes (10): 01 System overview, 02 Tech stack, 03 Project structure, 04 Data flow, 05 Boundaries, 06 Decisions that look wrong but are intentional, 07 Scalability and future considerations, 08 When the agent must stop and ask (+2 more)

### Community 106 - "ashby.ts"
Cohesion: 0.10
Nodes (32): AtsVendor, COMPANIES, num(), ashby, AshbyAddress, AshbyComponent, AshbyJob, AshbySecondaryLocation (+24 more)

### Community 108 - "mailCollection"
Cohesion: 0.38
Nodes (9): firstOutgoingFrom(), invalidateThreadCache(), mailCollection(), saveMessages(), log, resendMessage(), ResendPage, syncResendDelivery() (+1 more)

### Community 109 - "VillageMap"
Cohesion: 0.25
Nodes (9): loadItems(), previewStyle(), saveItems(), fitRows(), housesOverlap(), load(), navHeight(), subscribeResize() (+1 more)

### Community 110 - "Security: [Product name]"
Cohesion: 0.25
Nodes (8): 01 What we protect, 02 Trust boundaries, 03 Authentication and authorization, 04 Secrets, 05 Input, output, injection, 06 Dependencies, 07 Incident basics, Security: [Product name]

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
Cohesion: 0.19
Nodes (17): fast-xml-parser, getText(), asArray(), joinDescriptions(), parseFeed(), parser, personio, PersonioDescription (+9 more)

### Community 119 - "contacts.ts"
Cohesion: 0.07
Nodes (50): findMatches(), main(), normalise(), readInput(), dynamic, GET(), POST(), DELETE() (+42 more)

### Community 120 - "roofed"
Cohesion: 0.33
Nodes (6): hslToRgb(), rgbToHsl(), roofed(), draw(), rng(), sandSheet()

### Community 121 - "interviewBrief.ts"
Cohesion: 0.24
Nodes (8): dynamic, POST(), createInterviewBrief(), InterviewBrief, conversation(), FULL_NAME, VARIANTS, PROFILE

### Community 124 - "places/route.ts"
Cohesion: 0.33
Nodes (6): classify(), dynamic, GET(), maxDuration, PhotonFeature, PlaceSuggestion

### Community 126 - "layout"
Cohesion: 0.36
Nodes (8): Code style, blockCells(), corners(), findRoute(), houseFits(), layout(), walkBetween(), walkOnPath()

### Community 128 - "frame"
Cohesion: 0.25
Nodes (9): actMs(), along(), deliverFetch(), envelope(), fetchReturn(), figure(), frame(), plan() (+1 more)

## Knowledge Gaps
- **42 isolated node(s):** `@types/nodemailer`, `dotenv`, `react-dom`, `@tailwindcss/postcss`, `@types/mailparser` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 924 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `createLogger` to `autoSchedule.ts`, `AppNav.tsx`, `jobs/types.ts`, `botApi.ts`, `Scheduled Thread Replies`, `next`, `Contact Table & Messages`, `jobassist/route.ts`, `logger.ts`, `accounts.ts`, `getContacts`, `Seedtable Import`, `peopleSweep.ts`, `sendQueues.ts`, `QueuesPanel.tsx`, `sendCampaign.ts`, `inbox.ts`, `credential`, `mailStore.ts`, `ConvertPanel.tsx`, `credential`, `Seed Import UI`, `enrich/route.ts`, `Lint Config`, `autoDrafts.ts`, `widgetQueues.ts`, `history.ts`, `enrich.ts`, `jevWebSweep.ts`, `MailApp.tsx`, `replyTriage.ts`, `ImportPanel.tsx`, `jev.ts`, `button`, `threadCompose.ts`, `board.ts`, `lib/types.ts`, `openai.ts`, `usage.ts`, `contacts.ts`, `interviewBrief.ts`, `places/route.ts`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **What connects `@types/nodemailer`, `dotenv`, `react-dom` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `autoSchedule.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1361344537815126 - nodes in this community are weakly interconnected._
- **Why does `react` connect `next` to `AppNav.tsx`, `Scheduled Thread Replies`, `Contact Table & Messages`, `logger.ts`, `JobAssistPanel.tsx`, `QueuesPanel.tsx`, `templates.ts`, `export.ts`, `JobsPanel.tsx`, `villageItems.ts`, `ConvertPanel.tsx`, `Seed Import UI`, `enrich/route.ts`, `Lint Config`, `Dashboard.tsx`, `MailApp.tsx`, `ImportPanel.tsx`, `button`, `Usage Panel`, `data/index.ts`, `VillageMap.tsx`, `HistoryPanel.tsx`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Should `AppNav.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12554112554112554 - nodes in this community are weakly interconnected._
- **Why does `Code style` connect `layout` to `HARNESS.md`, `ImportPanel.tsx`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Should `jobs/types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07804878048780488 - nodes in this community are weakly interconnected._
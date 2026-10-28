# Graph Report - melodia  (2026-10-27)

## Corpus Check
- 311 files · ~1,509,142 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .ico 1, .css 1)

## Summary
- 2708 nodes · 7232 edges · 123 communities (114 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 97 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6bf2e992`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- QueuesPanel.tsx
- recipients.ts
- jobs/types.ts
- botApi.ts
- attachmentIndex.ts
- Scheduled Thread Replies
- normalize.ts
- next
- MessagePanel.tsx
- jobassist/route.ts
- logger.ts
- accounts.ts
- JobAssistPanel.tsx
- himalayas.ts
- importSchema.ts
- Seedtable Import
- peopleSweep.ts
- sendQueues.ts
- widget/queues/route.ts
- createLogger
- parse-pdfs.ts
- emailFinder.ts
- jooble.ts
- templates.ts
- sendCampaign.ts
- export.ts
- inbox.ts
- jobs/types.ts
- credential
- villageItems.ts
- mailStore.ts
- convert.ts
- http.ts
- Careers Scraper
- lib/types.ts
- threadReplyDraft.ts
- fourdayweek.ts
- csvImport.ts
- Seed Import UI
- copyToClipboard
- Lint Config
- autoDrafts.ts
- widgetQueues.ts
- emailFinderCodex.ts
- history.ts
- enrich.ts
- TS Config
- Harness Rules & Skills
- keyed.ts
- jevWebSweep.ts
- Agent Glossary & Setup
- sendWindow.ts
- peopleFinderOpenAi.ts
- Dashboard.tsx
- MailApp.tsx
- replyLlm.ts
- ThreadComposer.tsx
- HARNESS.md
- classify.ts
- ImportPanel.tsx
- mongodb.ts
- jev.ts
- getContacts
- field
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
- themuse.ts
- lib/profile.ts
- compose.ts
- ContactFilters
- importStream.worker.ts
- Bot & Company API Docs
- isInboxReady
- emailFinderCodex.ts
- emailSweep.ts
- interviewBrief.ts
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
- stripHtml
- CompanyCheck.tsx
- mailCollection
- VillageMap
- Security: [Product name]
- toISO
- Claude Code guide: [Product name]
- VillageMap.tsx
- HistoryPanel.tsx
- Tasks
- Review changes
- personio.ts
- README.md
- contacts.ts
- MailChart.tsx
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

## Communities (123 total, 9 thin omitted)

### Community 0 - "QueuesPanel.tsx"
Cohesion: 0.07
Nodes (41): geistMono, geistSans, metadata, RootLayout(), AppNav(), MAIL_MODES, MenuKey, NavLink (+33 more)

### Community 1 - "recipients.ts"
Cohesion: 0.12
Nodes (29): hasBlocking(), IssueInfo, IssueLevel, ISSUES, issuesFor(), PreflightRow, PreflightSummary, summarize() (+21 more)

### Community 2 - "jobs/types.ts"
Cohesion: 0.11
Nodes (21): dynamic, GET(), maxDuration, dynamic, GET(), ALERT_AFTER, Entry, healthOf() (+13 more)

### Community 3 - "botApi.ts"
Cohesion: 0.09
Nodes (33): dynamic, GET(), handle(), POST(), dynamic, POST(), dynamic, maxDuration (+25 more)

### Community 4 - "attachmentIndex.ts"
Cohesion: 0.17
Nodes (20): dynamic, GET(), POST(), LANGUAGES, AttachmentChoice, availableAttachments(), IndexDoc, localAttachments() (+12 more)

### Community 5 - "Scheduled Thread Replies"
Cohesion: 0.09
Nodes (52): dynamic, GET(), POST(), strings(), register(), stripQuoted(), QUEUE_WINDOW_FROM, QUEUE_WINDOW_TO (+44 more)

### Community 6 - "normalize.ts"
Cohesion: 0.14
Nodes (21): buildDedupKey(), COUNTRY_MAP, deaccent(), DEFAULT_ELIGIBLE_COUNTRIES, isValidJob(), matchesQuery(), missingRequiredFields(), normalizeCompany() (+13 more)

### Community 7 - "next"
Cohesion: 0.08
Nodes (42): react, PROVIDER_LABELS, EnrichItem, EnrichPanel(), EnrichState, eta(), PROVIDERS, humanTime() (+34 more)

### Community 8 - "MessagePanel.tsx"
Cohesion: 0.07
Nodes (34): CLOSED, ContactTable(), CopyButton, copyButtons(), CopyKind, copyText(), AiDraft, CopyButton() (+26 more)

### Community 9 - "jobassist/route.ts"
Cohesion: 0.19
Nodes (16): demoJobs(), dynamic, forCards(), GET(), maxDuration, PASSTHROUGH, formatSalary(), JobAssistJob (+8 more)

### Community 10 - "logger.ts"
Cohesion: 0.15
Nodes (17): 1. Preconditions (stop on any failure), dynamic, GET(), maxDuration, buffer, COLOR, emit(), ESC (+9 more)

### Community 11 - "accounts.ts"
Cohesion: 0.08
Nodes (59): DELETE(), dynamic, GET(), PATCH(), POST(), startFrom(), dynamic, metadata (+51 more)

### Community 12 - "JobAssistPanel.tsx"
Cohesion: 0.09
Nodes (35): classify(), dynamic, GET(), maxDuration, PhotonFeature, AssistJob, initials(), JobAssistCard() (+27 more)

### Community 13 - "himalayas.ts"
Cohesion: 0.08
Nodes (38): Entry, getCached(), getStamp(), setCached(), store, touchCached(), guessCountry(), isReachableFrom() (+30 more)

### Community 14 - "importSchema.ts"
Cohesion: 0.09
Nodes (41): main(), count(), fixFile(), main(), main(), dynamic, POST(), ImportedFile (+33 more)

### Community 15 - "Seedtable Import"
Cohesion: 0.09
Nodes (32): dynamic, GET(), maxDuration, POST(), call(), cleanFilters(), COMPANY_FILTERS, FilterKind (+24 more)

### Community 16 - "peopleSweep.ts"
Cohesion: 0.18
Nodes (16): dynamic, GET(), log, POST(), cliConcurrency(), hasFilters(), loadQueue(), log (+8 more)

### Community 17 - "sendQueues.ts"
Cohesion: 0.08
Nodes (67): dynamic, GET(), maxDuration, POST(), DELETE(), dynamic, GET(), POST() (+59 more)

### Community 18 - "widget/queues/route.ts"
Cohesion: 0.13
Nodes (14): dynamic, GET(), NO_STORE, SeedtableCompany, isDayKey(), WidgetInput, check(), healthy (+6 more)

### Community 19 - "createLogger"
Cohesion: 0.16
Nodes (20): nextConfig, next, dynamic, POST(), dynamic, maxDuration, POST(), dynamic (+12 more)

### Community 20 - "parse-pdfs.ts"
Cohesion: 0.10
Nodes (31): pdf-parse, pdfjs-dist, baseCompany(), classify(), classifyLinks(), cleanLines(), dedupeKey(), FILES (+23 more)

### Community 21 - "emailFinder.ts"
Cohesion: 0.10
Nodes (40): BATCH_RULES, BatchFinding, buildBatchPrompt(), buildPrompt(), callResponses(), callResponsesRaw(), contactBrief(), EmailCandidate (+32 more)

### Community 22 - "jooble.ts"
Cohesion: 0.08
Nodes (33): CURRENCIES, extractNumbers(), ParsedSalary, parseHungarianSalary(), PERIODS, collection(), log, QuotaConfig (+25 more)

### Community 23 - "templates.ts"
Cohesion: 0.15
Nodes (20): dynamic, LANGUAGE_LABEL, POST(), setLanguage(), PreviewRow, Result, countryName(), DEFAULT_CONNECTION_HU (+12 more)

### Community 24 - "sendCampaign.ts"
Cohesion: 0.12
Nodes (38): isFollowUpDue(), firstOutgoingFrom(), originalOutgoing(), allCampaignStates(), attachmentsNow(), buildFollowUpQueue(), CampaignDoc, campaigns() (+30 more)

### Community 25 - "export.ts"
Cohesion: 0.29
Nodes (11): buildExport(), COLUMNS, csvCell(), ExportFormat, ExportScope, place(), row(), toCsv() (+3 more)

### Community 26 - "inbox.ts"
Cohesion: 0.13
Nodes (24): addressList(), ContactHit, domainOf(), download(), FREEMAIL, isAuto(), isBounce(), isBulkSender() (+16 more)

### Community 27 - "jobs/types.ts"
Cohesion: 0.09
Nodes (39): DELETE(), dynamic, failed(), GET(), PUT(), JobsPage(), metadata, JobCard() (+31 more)

### Community 28 - "credential"
Cohesion: 0.11
Nodes (27): dynamic, log, POST(), authorised(), dynamic, maxDuration, POST(), dynamic (+19 more)

### Community 29 - "villageItems.ts"
Cohesion: 0.07
Nodes (30): BIOME_OF, BiomeKey, BIOMES, Bounds, BY_KEY, drawItems(), drawMarker(), editListeners (+22 more)

### Community 30 - "mailStore.ts"
Cohesion: 0.11
Nodes (24): POST(), applyFilters(), DailyPoint, dayActivity(), DayRow, LatestReply, listThreads(), MailAddress (+16 more)

### Community 31 - "convert.ts"
Cohesion: 0.19
Nodes (19): ConvertResponse, PRIORITY_STYLE, LetterInput, parseCsvTable(), convertCsv(), ConvertOptions, ConvertResult, norm() (+11 more)

### Community 32 - "http.ts"
Cohesion: 0.09
Nodes (29): jobsEnv(), isAlerting(), backoffMs(), FetchOpts, getJson(), getJsonWithHeaders(), mapLimit(), postJson() (+21 more)

### Community 33 - "Careers Scraper"
Cohesion: 0.13
Nodes (22): baseDomain(), careerLinks(), CareersResult, CareersRunState, careersState(), checkCareers(), extractPositions(), findCareers() (+14 more)

### Community 34 - "lib/types.ts"
Cohesion: 0.20
Nodes (12): CATEGORY, ReplyItem, AiTriage, Outcome, Channel, ContactStatus, EmailSearchRecord, EmailStatus (+4 more)

### Community 35 - "threadReplyDraft.ts"
Cohesion: 0.19
Nodes (13): Data, Item, MODES, STATUS_STYLE, ThreadReply, APPROVABLE, DraftContext, draftFrom() (+5 more)

### Community 36 - "fourdayweek.ts"
Cohesion: 0.22
Nodes (12): companyFromUrl(), FdwCompany, FdwJob, FdwLocation, FdwResponse, Named, namesOf(), POSTED_AFTER_DAYS (+4 more)

### Community 37 - "csvImport.ts"
Cohesion: 0.23
Nodes (14): buildCompanyLetter(), clean(), COLUMNS, csvToImportRows(), fixMojibake(), headerKey(), INDUSTRY_HU, industryLabel() (+6 more)

### Community 38 - "Seed Import UI"
Cohesion: 0.08
Nodes (26): metadata, SeedImportPage(), AllProgress, AutoRun, CONTINENTS, EMPTY_RUN, Filters, HU_NAMES (+18 more)

### Community 39 - "copyToClipboard"
Cohesion: 0.18
Nodes (14): ConvertPage(), metadata, DebugPage(), LEVELS, metadata, ConvertPanel(), DebugConsole(), LEVEL_ORDER (+6 more)

### Community 40 - "Lint Config"
Cohesion: 0.09
Nodes (21): eslintConfig, name, private, version, @anthropic-ai/sdk, dotenv, eslint, eslint-config-next (+13 more)

### Community 41 - "autoDrafts.ts"
Cohesion: 0.10
Nodes (39): dynamic, GET(), POST(), startOfToday(), getAccount(), AutoDraft, autoDraftsToday(), buildMessage() (+31 more)

### Community 42 - "widgetQueues.ts"
Cohesion: 0.14
Nodes (20): AccountInput, assembleWidget(), CampaignInput, dayRange(), latest(), ORDER, ReplyInput, RESEARCH_NAMES (+12 more)

### Community 43 - "emailFinderCodex.ts"
Cohesion: 0.10
Nodes (29): acquire(), drain(), freeMemoryMb(), log, runExclusive(), setCliConcurrency(), shared, waitForMemory() (+21 more)

### Community 44 - "history.ts"
Cohesion: 0.20
Nodes (14): dynamic, GET(), log, POST(), ChangeDoc, ChangeEntry, changes(), historyFacets() (+6 more)

### Community 45 - "enrich.ts"
Cohesion: 0.09
Nodes (34): FileMeta, Parsed, dynamic, maxDuration, POST(), dynamic, GET(), log (+26 more)

### Community 46 - "TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 47 - "Harness Rules & Skills"
Cohesion: 0.13
Nodes (14): test-runner subagent (typecheck, lint, test, build summary), .claude/CLAUDE.md graphify skill pointer, Evidence, not claim, Ports & Adapters (hexagonal), /fix skill (root-cause bug fixing), AGENTS.md: This is NOT the Next.js you know, CLAUDE.md contract (root project instructions), graphify usage rules (+6 more)

### Community 48 - "keyed.ts"
Cohesion: 0.19
Nodes (14): looksRemote(), bajobsuche, extractEmail(), extractUrl(), HnComment, HnStory, hnWhoIsHiring, isTopLevel() (+6 more)

### Community 49 - "jevWebSweep.ts"
Cohesion: 0.10
Nodes (37): dynamic, GET(), POST(), dynamic, GET(), POST(), Candidate, cleanNote() (+29 more)

### Community 50 - "Agent Glossary & Setup"
Cohesion: 0.15
Nodes (17): reviewer subagent (read-only diff review), AAA (Arrange-Act-Assert, one Act per test), ADR (Nygard format, docs/adr/), Advice vs law (CLAUDE.md vs hook), /anchors skill (semantic anchor glossary), Chicago School (inside-out, state verification), Irtas teszt (deletion test), London School (outside-in, interaction verification) (+9 more)

### Community 51 - "sendWindow.ts"
Cohesion: 0.21
Nodes (12): countriesFor(), pickInsideWindow(), DEFAULT_TIME_ZONE, insideWindowAt(), localLabel(), localParts(), nextWindowStart(), partsCache (+4 more)

### Community 52 - "peopleFinderOpenAi.ts"
Cohesion: 0.15
Nodes (23): runClaudeApiSearch(), OPENAI_MODEL, buildPeoplePrompt(), findPeople(), log, MAX_PEOPLE, normalisePeople(), PEOPLE_RULES (+15 more)

### Community 53 - "Dashboard.tsx"
Cohesion: 0.14
Nodes (26): Account, Attachment, AutoSchedulePanel(), Lead, limitNote(), longDay(), BulkTemplate(), Dashboard() (+18 more)

### Community 54 - "MailApp.tsx"
Cohesion: 0.11
Nodes (22): MailPage(), metadata, metadata, RejectedPage(), AccountChoice, AttachmentChoice, Bubble(), FILTERS (+14 more)

### Community 55 - "replyLlm.ts"
Cohesion: 0.15
Nodes (24): MailMessage, assertLlmReachable(), baseUrl(), buildUserPrompt(), chat(), CLASSIFY_PROMPT, generateReplyDraft(), headers() (+16 more)

### Community 56 - "ThreadComposer.tsx"
Cohesion: 0.20
Nodes (11): AttachmentChoice, Composition, compositions, Draft, EMPTY, listeners, Sent, subscribe() (+3 more)

### Community 57 - "HARNESS.md"
Cohesion: 0.04
Nodes (47): anything else (docs, configs, markdown, small files, ranged reads) -> no opinion, API, server actions and services, ask  -> risky but sometimes legitimate; a human must confirm, Bash cat/bat/less/more/nl/tac of a source file -> same two rules as Read, Claude Code: personal files, not shared, .claude/hooks/format-file.sh, .claude/hooks/graph-first.sh, .claude/hooks/session-context.sh (+39 more)

### Community 58 - "classify.ts"
Cohesion: 0.22
Nodes (16): Classification, classify(), detectLanguage(), hits(), mapSize(), HookKey, BOOST, DATA_SMELLS (+8 more)

### Community 59 - "ImportPanel.tsx"
Cohesion: 0.18
Nodes (14): Code style, ImportPage(), metadata, DomainDecision, ImportPanel(), ImportResult, Issue, KIND_HINT (+6 more)

### Community 60 - "mongodb.ts"
Cohesion: 0.19
Nodes (13): findMatches(), main(), normalise(), readInput(), main(), clientPromise, createClient(), currentClient() (+5 more)

### Community 61 - "jev.ts"
Cohesion: 0.22
Nodes (13): ai, @ai-sdk/gateway, dynamic, GET(), POST(), askBoolean(), humanError(), isJevReady() (+5 more)

### Community 62 - "getContacts"
Cohesion: 0.10
Nodes (37): mongodb, main(), dynamic, GET(), POST(), dynamic, GET(), POST() (+29 more)

### Community 63 - "field"
Cohesion: 0.10
Nodes (24): AccountsPage(), metadata, ComposePage(), metadata, metadata, RecentPage(), AccountsPanel(), Change (+16 more)

### Community 64 - "Usage Panel"
Cohesion: 0.21
Nodes (13): metadata, UsagePage(), Bucket, cell(), clock(), download(), Entry, isoDay() (+5 more)

### Community 65 - "data/index.ts"
Cohesion: 0.06
Nodes (48): JevPage(), metadata, Combobox(), ComboOption, fold(), CONTACT_STATUS, email(), EMAIL_STATUS (+40 more)

### Community 66 - "Email Sending Plan Docs"
Cohesion: 0.18
Nodes (14): F2 - Follow-up sor (followup.ts, FollowUpPanel), F4 - Küldés előtti ellenőrzés (preflight.ts), EMAIL-KULDES.md - Ütemezett e-mail kiküldő tervrajz, Fiókok a beállításokból (titkosított jelszó tárolás), Fiókonkénti kiküldő menet (runner ciklus, sendCampaign), Napi keret és felfuttatás (warmup), Telepítés Hetznerre (systemd, Caddy, SMTP-portok), Véletlen szünet levelek között (+6 more)

### Community 67 - "Runtime Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, ai, @ai-sdk/gateway, @anthropic-ai/sdk, dotenv, fast-xml-parser, imapflow, mailparser (+6 more)

### Community 68 - "mailer.ts"
Cohesion: 0.11
Nodes (25): dynamic, log, POST(), ALLOWED, AttachmentInfo, attachmentsDir(), filesIn(), listAttachments() (+17 more)

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
Cohesion: 0.12
Nodes (27): GET(), dynamic, GET(), POST(), dynamic, GET(), dynamic, GET() (+19 more)

### Community 74 - "Harness & ADRs"
Cohesion: 0.24
Nodes (3): ADR sablon (Nygard-formátum), ADR 0001 - A harness a repóban él, nem a felhasználói profilban, HARNESS.md - A harness

### Community 75 - "Audit Findings"
Cohesion: 0.22
Nodes (10): AUDIT.md - Melodia teljes audit és fejlesztési terv, Atlas-kvóta probléma (13b), C1 - Éles példány hitelesítés nélkül, C2 - Ugyanarra a címre/cégre többször megy levél, C3 - Válasz és visszapattanás visszaírása a kontaktra (syncContactReplies), C4 - Automatikus növekményes levelezés-szinkron (MAIL_AUTO_SYNC_MINUTES), Fejlesztési roadmap (Phase 1-4), Címzett-védelmek (recipients: cím és cégdomain szerinti kizárás) (+2 more)

### Community 76 - "README Features"
Cohesion: 0.20
Nodes (10): CLI queue semaphore (src/lib/cliQueue.ts, CLI_CONCURRENCY), Contact status derivation (src/lib/stage.ts), Follow-up in same thread (src/lib/followup.ts), Automatic Gmail sync (syncContactReplies), Interview brief (src/lib/interviewBrief.ts), AI via local Claude CLI, not OpenAI (src/lib/aiText.ts), Melodia outreach dashboard (Next.js + MongoDB Atlas), Pre-send check (src/lib/preflight.ts) (+2 more)

### Community 77 - "themuse.ts"
Cohesion: 0.25
Nodes (9): isRemoteLocation(), log, matchesLocation(), MuseJob, MuseLevel, MuseResponse, themuse, toJob() (+1 more)

### Community 78 - "lib/profile.ts"
Cohesion: 0.15
Nodes (15): ALL, APPLY, longer(), main(), score(), sameCompany(), ago(), DraftInput (+7 more)

### Community 79 - "compose.ts"
Cohesion: 0.27
Nodes (9): buildBody(), buildLead(), buildNote(), buildSubject(), hooks, profile, signatureEn, signatureHu (+1 more)

### Community 80 - "ContactFilters"
Cohesion: 0.22
Nodes (9): Chip, SweepOptions, JevSweepOptions, PeopleSweepOptions, CampaignOptions, Stage, Todo, TODOS (+1 more)

### Community 81 - "importStream.worker.ts"
Cohesion: 0.22
Nodes (9): BatchMessage, decoder, ErrorMessage, fill(), NextMessage, OpenMessage, queue, scan() (+1 more)

### Community 82 - "Bot & Company API Docs"
Cohesion: 0.32
Nodes (8): COMPANY_API.md - cégfelvételi API, source mező: gridleads_<üzlettípus>_<országkód>, POST /api/bot/companies, GROKBOT.md - Grokbot és Melodia integráció, GET /api/bot/next - következő cég kiadása foglalással, POST /api/bot/save - kutatási eredmény mentése, Kutatás szisztematikája (azonosítás, saját oldal, álláshirdetés, külső források, emberek, minősítés, mentés), Seedtable import (/seedimport, importDedupe)

### Community 83 - "isInboxReady"
Cohesion: 0.50
Nodes (7): dynamic, GET(), POST(), isInboxReady(), startAutoSync(), startSync(), syncState

### Community 84 - "emailFinderCodex.ts"
Cohesion: 0.18
Nodes (21): askClaude(), findExecutable(), baseTimeout(), buildPrompt(), cliCandidates(), CliResult, CliRunStats, describeEvent() (+13 more)

### Community 85 - "emailSweep.ts"
Cohesion: 0.12
Nodes (17): cliBusy(), loadQueue(), log, processOne(), run(), sleep(), state, SweepItem (+9 more)

### Community 86 - "interviewBrief.ts"
Cohesion: 0.43
Nodes (5): dynamic, POST(), createInterviewBrief(), InterviewBrief, conversation()

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
Cohesion: 0.11
Nodes (25): dynamic, maxDuration, POST(), dynamic, metadata, QueuesPage(), ScheduledReplies(), availableProviders() (+17 more)

### Community 94 - "Deploy: $ARGUMENTS"
Cohesion: 0.40
Nodes (5): 2. Quality gate, 3. Deploy, 4. Verify, 5. If something is wrong, Deploy: $ARGUMENTS

### Community 95 - "usage.ts"
Cohesion: 0.28
Nodes (11): dynamic, GET(), add(), bounds(), emptyBucket(), listUsage(), log, UsageBucket (+3 more)

### Community 104 - "PRD: [Product name]"
Cohesion: 0.20
Nodes (10): 01 Product overview, 02 Problem, 03 Goal, 04 Target users, 05 Core features, 06 Success metrics, 07 Out of scope, 08 Open questions (+2 more)

### Community 105 - "Architecture: [Product name]"
Cohesion: 0.20
Nodes (10): 01 System overview, 02 Tech stack, 03 Project structure, 04 Data flow, 05 Boundaries, 06 Decisions that look wrong but are intentional, 07 Scalability and future considerations, 08 When the agent must stop and ask (+2 more)

### Community 106 - "stripHtml"
Cohesion: 0.09
Nodes (39): AtsVendor, COMPANIES, num(), stripHtml(), unescapeEntities(), toJob(), ashby, AshbyAddress (+31 more)

### Community 107 - "CompanyCheck.tsx"
Cohesion: 0.33
Nodes (7): CheckPage(), metadata, CompanyCheck(), download(), Hit, Result, stamp()

### Community 108 - "mailCollection"
Cohesion: 0.44
Nodes (8): invalidateThreadCache(), mailCollection(), saveMessages(), log, resendMessage(), ResendPage, syncResendDelivery(), syncResendSent()

### Community 109 - "VillageMap"
Cohesion: 0.25
Nodes (9): loadItems(), previewStyle(), saveItems(), fitRows(), housesOverlap(), load(), navHeight(), subscribeResize() (+1 more)

### Community 110 - "Security: [Product name]"
Cohesion: 0.25
Nodes (8): 01 What we protect, 02 Trust boundaries, 03 Authentication and authorization, 04 Secrets, 05 Input, output, injection, 06 Dependencies, 07 Incident basics, Security: [Product name]

### Community 111 - "toISO"
Cohesion: 0.14
Nodes (18): toISO(), defineSource(), plausibleSalary(), RemoteOkEntry, toJob(), Labeled, PostingDetail, PostingsResponse (+10 more)

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
Cohesion: 0.11
Nodes (26): main(), DELETE(), dynamic, PATCH(), POST(), dynamic, GET(), PATCH() (+18 more)

### Community 120 - "MailChart.tsx"
Cohesion: 0.39
Nodes (7): DailyPoint, label(), longLabel(), MailChart(), niceMax(), PAD, rollingRate()

### Community 126 - "layout"
Cohesion: 0.27
Nodes (10): blockCells(), corners(), draw(), findRoute(), houseFits(), layout(), rng(), sandSheet() (+2 more)

### Community 128 - "frame"
Cohesion: 0.25
Nodes (9): actMs(), along(), deliverFetch(), envelope(), fetchReturn(), figure(), frame(), plan() (+1 more)

## Knowledge Gaps
- **42 isolated node(s):** `@types/nodemailer`, `dotenv`, `react-dom`, `@tailwindcss/postcss`, `@types/mailparser` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 932 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `createLogger` to `QueuesPanel.tsx`, `jobs/types.ts`, `botApi.ts`, `attachmentIndex.ts`, `Scheduled Thread Replies`, `next`, `MessagePanel.tsx`, `jobassist/route.ts`, `logger.ts`, `accounts.ts`, `JobAssistPanel.tsx`, `importSchema.ts`, `Seedtable Import`, `peopleSweep.ts`, `sendQueues.ts`, `widget/queues/route.ts`, `templates.ts`, `jobs/types.ts`, `credential`, `convert.ts`, `Seed Import UI`, `Lint Config`, `autoDrafts.ts`, `history.ts`, `enrich.ts`, `jevWebSweep.ts`, `MailApp.tsx`, `ImportPanel.tsx`, `jev.ts`, `getContacts`, `field`, `mailer.ts`, `threadCompose.ts`, `isInboxReady`, `interviewBrief.ts`, `openai.ts`, `usage.ts`, `CompanyCheck.tsx`, `contacts.ts`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **What connects `@types/nodemailer`, `dotenv`, `react-dom` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `QueuesPanel.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07180851063829788 - nodes in this community are weakly interconnected._
- **Why does `react` connect `next` to `QueuesPanel.tsx`, `attachmentIndex.ts`, `MessagePanel.tsx`, `JobAssistPanel.tsx`, `templates.ts`, `jobs/types.ts`, `credential`, `villageItems.ts`, `convert.ts`, `lib/types.ts`, `threadReplyDraft.ts`, `Seed Import UI`, `copyToClipboard`, `Lint Config`, `Dashboard.tsx`, `MailApp.tsx`, `ThreadComposer.tsx`, `ImportPanel.tsx`, `field`, `Usage Panel`, `data/index.ts`, `CompanyCheck.tsx`, `VillageMap.tsx`, `HistoryPanel.tsx`, `MailChart.tsx`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Should `recipients.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12258064516129032 - nodes in this community are weakly interconnected._
- **Why does `Code style` connect `ImportPanel.tsx` to `HARNESS.md`, `layout`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Should `jobs/types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10837438423645321 - nodes in this community are weakly interconnected._
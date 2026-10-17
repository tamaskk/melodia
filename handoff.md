# Handoff — 2026-10-08

## 1) Goal

Melodia: outreach dashboard (Next.js 16, MongoDB Atlas). This session turned it
into a split setup: the **deployed Vercel app** is where queues are created
(also from a phone), and a **local always-on server** does the actual sending.
Plus a keyless API for an external research bot (Grok).

## 2) Current state

- Everything is merged: PRs #1–#9 are on `main` (`39d0012`). No open PRs.
- Working tree clean. Local checkout is still on the merged branch
  `feature/queue-szuro` — switch to `main` and pull before new work.
- Local dev server is **not running** right now.
- Deployed: `https://melodia-kt.vercel.app` (login required).
- Live data: one real queue, "Nagy" (41 contacts, run date 2026-10-08,
  status `fut`, 4 sent when last checked). It was started by the old code.

How it works now:

- **Login**: `APP_EMAIL` + `APP_PASSWORD`. `src/proxy.ts` guards every page and
  API except `/login`, `/api/auth`, `/api/bot/*`. If only one is set, or none on
  Vercel, the app is locked; none set locally = open.
- **Queues are single-day**: fixed contact list + bound accounts + run date.
  Loaded once on the run date between 07:00–19:00 Budapest
  (`varakozik → fut → kesz`, manual stop = `leallitva`). Whatever is not sent
  that day is released back (removed from the queue, `queueId` cleared).
- **Scheduler** ticks every 10 min, only on a non-Vercel instance. The tick only
  polls queues; sending uses random 10–20 min pauses per account.
- **Send window** for queue campaigns: 07:00–19:00 in the recipient's local
  time, weekdays. Manual sends from the panel still use 09:00–17:00.
- **Accounts**: env accounts (`GMAIL_USER`, `_1`…`_10`) plus accounts added on
  `/accounts` (Gmail with encrypted app password, or Resend). Per-account
  warm-up switch and daily max.
- **Attachments** stay on the sending machine; it publishes a file list to the
  DB so the deployed app can offer a per-queue choice.

## 3) Active files

- `src/lib/sendQueues.ts` — queues, scheduler tick, close/release, overview
- `src/lib/queuePlan.ts` — forecast, window constants (`QUEUE_WINDOW_FROM/TO`)
- `src/lib/sendCampaign.ts` — the sending loop (per-account runner)
- `src/lib/accounts.ts`, `src/lib/accountStore.ts` — accounts, encryption, settings
- `src/lib/mailer.ts` — Gmail SMTP and Resend HTTP dispatch
- `src/lib/attachmentIndex.ts` — published attachment list
- `src/lib/auth.ts`, `src/proxy.ts`, `src/app/login/` — login
- `src/lib/botApi.ts`, `src/app/api/bot/` — bot API
- `src/components/QueueBar.tsx`, `QueuesPanel.tsx`, `AccountsPanel.tsx`,
  `RecentPanel.tsx`, `SendPanel.tsx`, `FilterBar.tsx`
- `src/instrumentation.ts` — startup: resume campaigns, start scheduler
- Docs: `docs/GROKBOT.md`, `docs/EMAIL-KULDES.md`

## 4) Changes made

| PR | What |
| --- | --- |
| #1–2 | Bot API (`/api/bot/next`, `/api/bot/save`) + docs; whole project committed |
| #3 | `/accounts` (Gmail, Resend), queues + calendar (`/queues`), `/recent`, Resend warm-up, per-account warm-up switch and daily max |
| #4 | Login (email + password), proxy guard |
| #5 | Placeholder env accounts (`-`) ignored |
| #6–7 | Mobile layout: card views, 16px inputs on phones, overflow fixes, select-all on mobile |
| #8 | Per-queue attachment choice via published file list |
| #9 | Single-day queues with release, 07–19 window, "Queue" filter (`queueId` on contacts) |

New Mongo collections: `mail_accounts`, `mail_account_settings`, `send_queues`,
`app_state`. New contact field: `queueId`. New indexes: `sent_at`, `in_queue`.

Env vars introduced: `APP_EMAIL`, `APP_PASSWORD`, `MAIL_SECRET_KEY` (32 bytes
base64, must be identical on every instance), `RESEND_API_KEY`.

## 5) Failed attempts

- **GET with a JSON body** for `/api/bot/next`: Next drops GET bodies. Filters go
  in the query string, or use POST.
- **Measuring mobile layout through the Chrome extension / an iframe proxy**:
  extension kept disconnecting and pages did not hydrate through the proxy.
  What worked: a private headless Chrome driven over CDP with mobile emulation
  (`node --experimental-websocket`, Node 20 has no global `WebSocket`).
- **First mobile pass missed bugs** because it measured without a selection and
  only looked for page-level overflow. Clipped elements inside
  `overflow:hidden` parents need a separate check, and panels must be opened.
- **The 16px mobile input rule** widened selects and broke two layouts; fixed
  with `select { max-width: 100% }` and wrapping groups.
- **"Emails go out every 10 minutes"** was investigated and was not a bug:
  164 gaps over 8 days are uniform across 10–20 min (mean 15.2).

## 6) Next steps

1. On the sending machine: `git checkout main && git pull`, then restart the
   server. Until then the running "Nagy" queue follows the old rules (09–17,
   carries over to the next day).
2. Starting the local server resumes any campaign marked `running` in the DB
   and starts the scheduler — it will send real mail. To inspect safely, start
   with `VERCEL=1` (disables sending, resume and scheduler).
3. Vercel env: confirm `APP_EMAIL`, `APP_PASSWORD`, `MAIL_SECRET_KEY`,
   `RESEND_API_KEY` are set; remove the placeholder `GMAIL_USER` /
   `GMAIL_APP_PASSWORD` (`-`).
4. Never verified with real traffic: a queue started by the scheduler,
   midnight close with a live campaign, Resend delivery, adding a Gmail account
   with a real app password, login in a browser, real iPhone rendering. First
   live run: a 2–3 contact queue, watch `/debug`.
5. Open items the user may ask for: `/usage` and `/history` still scroll
   horizontally on phones; queue accounts cannot be edited after saving; the bot
   API is unauthenticated by choice; two non-Vercel instances would both run the
   scheduler (no explicit on/off switch); a US-recipient queue sends until
   midnight Budapest; Resend accounts cannot thread follow-ups.
6. `docs/SPEC.md` is still the empty template.

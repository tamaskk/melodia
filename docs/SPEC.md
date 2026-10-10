# SPEC — Widget API: a queue-k mai állása

Dátum: 2026-10-10 · Állapot: kész

## Cél

Egy csak olvasó végpont a telefonos (Scriptable) widgetnek, amely megmutatja,
hol tartanak ma a sorok: fiókonként a kiküldés, és a kutatás (begyűjtés).

## Megfigyelhető viselkedés

- `GET /api/widget/queues` — nyíltan hívható, belépés és token nélkül.
- `?date=ÉÉÉÉ-HH-NN` másik napot kér; hibás dátum: `400`. Alapból a mai nap.
- A nap a budapesti naptár szerinti 00:00–24:00; az UTC-határokat az adott
  pillanat eltolásából számoljuk (óraátállításkor 23, illetve 25 órás nap).
- Minden válasz `Cache-Control: no-store`. A végpont semmit nem módosít.
- Queue-nként mindig `total = done + failed + pending + inProgress`.
- Ami ma kész lett, budapesti éjfélig `done` állapotban, `completedAt`-tel
  látszik. Amihez ma nem tartozik item és nem is fut, az nincs a listában.
- Rendezés: `error` → `running` → `paused` → `idle` → `done`.

## A sorok

| `id`              | Miből számol                                                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smtp:<fiók>`     | `done`: a napon kiment első levelek (`contacts.sentAt`, `sentFrom`). `failed`: `queue_daily_stats`. `pending`: a futó menet sora (`campaigns.queue`) és a még be nem töltött queue-k kiküldhető címzettjei. |
| `research:email`  | `queue_daily_stats` — az e-mail-begyűjtés írja.                                                                                                                                                             |
| `research:people` | `queue_daily_stats` — a kapcsolattartó-begyűjtés írja.                                                                                                                                                      |

## Érintett fájlok

| Fájl                                      | Változás                                                              |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/widgetQueues.ts`                 | Új. Tiszta logika: a nap határai, a válasz összeállítása.             |
| `src/lib/widgetQueuesData.ts`             | Új. Az adat lekérdezése (öt kis, indexelt kérdés egyszerre).          |
| `src/lib/queueStats.ts`                   | Új. A `queue_daily_stats` írása; a hívó nem vár rá.                   |
| `src/app/api/widget/queues/route.ts`      | Új. A végpont.                                                        |
| `src/proxy.ts`                            | Az `/api/widget/` belépés nélkül elérhető (szándékosan nyílt).        |
| `src/lib/sendCampaign.ts`                 | Hibás levélnél statisztika; a következő levél időpontja azonnal ment. |
| `src/lib/emailSweep.ts`, `peopleSweep.ts` | A futás állása a statisztikába.                                       |
| `tests/`, `package.json`                  | `npm test` (`node:test` a meglévő `tsx`-szel).                        |

## Interfészek

- Új collection: `queue_daily_stats` —
  `{ queueId, date, total, done, failed, inProgress?, running?, lastError?, completedAt, updatedAt }`,
  egyedi index: `(queueId, date)`.
- Új index: `send_queues.runDate`.

## Hatókörön kívül

- IMAP-begyűjtés (nem itemenkénti sor).
- Follow-up levelek mint külön itemek (a napi keretbe beleszámítanak).
- A külső kutatóbot (`/api/bot`) mentései.

## Feltételezések

- A kézi (queue nélküli) küldés is a fiók sorába számít.
- Lezáráskor a ki nem ment címzettek visszakerülnek a listába, így a nap
  végén `total = done + failed`.
- Többfiókos, még be nem töltött queue hátraléka a fiókok napi kerete
  arányában oszlik meg (becslés; betöltés után a menet sora a pontos szám).
- A kutatás 20 percnél régebbi életjellel nem számít futónak.

## Kockázat

- A végpont nyílt: a fiókok címe és a napi darabszámok bárkinek látszanak,
  aki ismeri az URL-t.
- A `failed`, a `nextRunAt` és a kutatás sorai csak azután pontosak, hogy a
  küldő gép az új kóddal újraindult.
- Hibás, de a queue-ban maradó címzett a `failed` és a `pending` számban is
  megjelenhet, amíg a queue le nem zárul.

## Ellenőrzés (end-to-end)

1. `npm run typecheck`, `npm run lint`, `npm test` — hiba nélkül.
2. Éles adatbázison, meleg kapcsolattal a lekérdezés 300 ms alatt.
3. `curl https://melodia-kt.vercel.app/api/widget/queues`

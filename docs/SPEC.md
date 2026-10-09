# SPEC — Automatikus ütemezés

Dátum: 2026-10-09 · Állapot: kész

## Cél

A Kontaktok oldalon, a szűrők alatt egy csukható panel a szűrt (vagy
kijelölt) címzetteket egy lépésben szétosztja queue-kba: napokra és fiókokra,
a fiókok saját napi keretéig. Eddig minden napra és fiókra kézzel kellett
queue-t menteni.

## Megfigyelhető viselkedés

- Adott a panel, amikor az „Elhelyezés” gombra nyomok, akkor egy előnézet
  nyílik: hány címzett hány queue-ba kerül, mely napokra, mely fiókokra,
  mennyi, és queue-nként lenyitva a címzettek. Queue csak az „Elfogadás”
  után jön létre.
- **Összes kiválasztott** mód: a kezdőnaptól (üresen: holnap) addig tölt
  előre, amíg a címzettek el nem fogynak; az előnézet megmutatja, meddig tart.
- **Egyéni időszak** mód: két dátum között tölt; ami nem fér bele, kimarad,
  és az előnézet kiírja, mennyi. Ha kevesebb a címzett, csak annyit tesz be.
- Minden napra minden kipipált fiók külön queue-t kap, a fiók aznapi szabad
  keretéig: felfuttatásnál az arra a napra érvényes lépcső (a későbbi napokra
  már a magasabb), kikapcsolt felfuttatásnál a fiók saját napi maximuma, felső
  határ a szünetekből adódó napi darabszám. A lehető leghamarabb tölt, nem
  oszt el egyenletesen.
- A már betervezett queue-k és a ma kiment levelek levonódnak. Ha egy fiókon
  aznap csak pár hely van, annyi kerül oda, és a sor kiírja, miért csak annyi;
  ha nincs hely, a sor ezt jelzi, és a töltés a következő helytől folytatódik.
- A címzettek cégnév szerint (A–Z) fogynak. Kimarad, akinek nincs címe, már
  kapott levelet, vagy már benne van egy queue-ban.
- „Hétvégén is” kapcsoló nélkül a szombat és a vasárnap kimarad.
- A queue neve: `előtag · HH.NN. · fiók`. A csatolmány és a szünet a panelen
  választható, minden létrejövő queue ugyanazt kapja.

## Érintett fájlok

| Fájl                                   | Változás                                                        |
| -------------------------------------- | --------------------------------------------------------------- |
| `src/lib/autoSchedule.ts`              | Új. Terv, létrehozás, címzettnevek.                             |
| `src/lib/queuePlan.ts`                 | A terv megadja, mi korlátozott egy fiókot egy napon (`limits`). |
| `src/lib/sendQueues.ts`                | `liveUsage()` (foglalt keret), `createPlannedQueues()`.         |
| `src/app/api/queues/auto/route.ts`     | Új. `GET` választók; `POST` preview / apply / leads.            |
| `src/components/AutoSchedulePanel.tsx` | Új. Panel és előnézet-ablak.                                    |
| `src/components/Dashboard.tsx`         | A panel a szűrők alá kerül.                                     |

## Interfészek

- `GET /api/queues/auto` → `{ accounts, attachments }`.
- `POST /api/queues/auto` `{ action: "preview" | "apply", filters | ids, mode,
from?, to?, weekends, accountIds, minMinutes, maxMinutes, attachments?,
prefix }` → `AutoPlan`, illetve `{ created, placed, leftover, lastDay }`.
- `POST /api/queues/auto` `{ action: "leads", ids }` → legfeljebb 200 név.
- Adatbázis: nincs új mező — a meglévő `send_queues` dokumentumok jönnek
  létre, fiókonként és naponként egy.

## Hatókörön kívül

- Egyenletes elosztás, prioritás pontszám szerint, fiókonként eltérő beállítás.
- A létrehozott queue-k csoportos visszavonása (egyenként törölhetők).
- Az időkorlát: „összes” módban nincs felső határ a napokra.

## Feltételezések

- Egy futtatás legfeljebb 20 000 címzettel számol; efölött az előnézet jelzi.
- Az elfogadás a szerveren újraszámol: ha közben változott valami, az
  eredmény eltérhet az előnézettől, a válasz a tényleges számokat adja.
- A queue napi kerete a fiók aznapi kerete; a pontos darabszám indításkor
  újra eldől, ahogy minden queue-nál.

## Kockázat

- Ha egy fiókon aznap már fut egy queue, az utána következő csak akkor
  indul, amikor az előző végzett — a maradék helyre tett queue-k sorban
  mennek, és ha a nap végéig nem jutnak sorra, a címzettek visszakerülnek a
  listába.
- A felfuttatás későbbi lépcsői becslések: ha egy fiók közben nem küld, a
  tényleges keret kisebb lehet a tervezettnél.
- Egy elfogadás sok queue-t hoz létre egyszerre; visszavonni csak egyenként
  lehet.

## Ellenőrzés (end-to-end)

1. `npm run typecheck`, `npm run lint` — hiba nélkül.
2. A terv a valódi adatokon, csak olvasva: összes és időszak mód, hétvége,
   egy fiók; a darabszámok egyeznek, nincs ismétlődő címzett, egy queue sem
   lépi túl a szabad keretet.
3. Létrehozás 3 címzettel távoli jövőbeli napra: a queue adatai, a címzettek
   megjelölése, a második futás levonja a foglalt helyet; a végén törlés.
4. Böngészőben 1440 és 390 px szélesen: panel, előnézet, címzettlista.

# SPEC — Kimenő levél a címzettlistában, queue szerinti szűrés

Dátum: 2026-10-10 · Állapot: kész

## Cél

Kiküldés előtt látszódjon, melyik cégnek milyen levél megy, és legyen
megjelölve, ha a levél nyelve nem illik a cég országához. 2026-10-10-én két
magyar cég angol levelet kapott: az adatbázisban a sorukon angol levél állt,
és ezt a queue-ban semmi nem mutatta. Emellett a Kontaktok listája legyen
szűrhető egy konkrét queue-ra.

## Megfigyelhető viselkedés

- A Queue-k oldalon egy queue Címzettek listájában minden cég alatt látszik a
  levél nyelve és tárgya; a sorra kattintva lenyílik a teljes szöveg.
- Ha a nyelv nem illik az országhoz (magyar cégnek nem magyar levél, vagy
  külföldinek magyar), a sor sárga jelölést kap az okkal.
- A queue kártyája kiírja, hány még ki nem ment címzettnél van ilyen eltérés.
- Az automatikus ütemezés előnézete megszámolja az eltéréseket, és a lenyitott
  címzettlistában a nyelvet és a tárgyat is mutatja.
- A Kontaktok oldalon a „Queue” szűrő a „Mind / Benne van / Nincs benne”
  mellett konkrét queue-t is kínál, nap szerint csoportosítva: elöl a mai és a
  közelgő napok a legközelebbivel kezdve, alattuk a múltbeliek: `HH.NN. – fiók – queue neve (darab)`.

- A tömeges szövegcsere mezőválasztójában új pont: „Lead nyelve”. Ilyenkor a
  bal oldalon sablon helyett legördülő van (magyar / angol), az előnézet
  cégenként mutatja a változást („angol → magyar”), a „Mentés” pedig csak a
  sor nyelvét írja át — a levél szövegét nem. Akinek már ez a nyelve, kimarad.

- Az ékezetes csatolmánynevek egységes (NFC) alakban kerülnek a jegyzékbe és a
  queue-kba, a küldő pedig akkor is megtalálja a fájlt, ha a lemezen más
  alakban áll (macOS: bontva, Windows: egyben). Eddig a két gép jegyzéke nem
  egyezett: a kártya „nincs a jegyzékben” jelzést adott, Windowson pedig az
  ilyen nevű csatolmány kimaradhatott a levélből.

## Érintett fájlok

| Fájl                                                                             | Változás                                                                                                    |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/lib/mailLanguage.ts`                                                        | Új. A nyelvi eltérés szabálya és adatbázis-szűrője.                                                         |
| `src/lib/sendQueues.ts`                                                          | `QueueInfo.mismatched` (egy összesítés minden queue-ra); a queue-névlista viszi a fiókokat és az állapotot. |
| `src/lib/autoSchedule.ts`                                                        | `AutoPlan.mismatched`; a címzettnevek mellé nyelv, ország, tárgy.                                           |
| `src/components/QueuesPanel.tsx`                                                 | Levél a címzettlistában, figyelmeztetés a kártyán.                                                          |
| `src/components/AutoSchedulePanel.tsx`                                           | Figyelmeztetés és nyelv az előnézetben.                                                                     |
| `src/components/FilterBar.tsx`, `Dashboard.tsx`                                  | Queue szerinti szűrés.                                                                                      |
| `src/lib/attachments.ts`                                                         | Egységes névalak, kódolástól független fájlkeresés.                                                         |
| `src/components/BulkTemplate.tsx`, `src/app/api/contacts/bulk-template/route.ts` | „Lead nyelve” mező: nyelv átállítása előnézettel.                                                           |

## Interfészek

- `QueueInfo.mismatched: number`, `AutoPlan.mismatched: number`.
- `GET /api/queues?brief=1` queue-sorai: `+ status, accounts: string[]`.
- A kontaktlista meglévő `queueId` szűrője a felületről is elérhető.
- `POST /api/contacts/bulk-template` `{ ids, field: "language", value: "hu" | "en", mode }`.

## Hatókörön kívül

- A rossz nyelvű levelek kijavítása (adatmódosítás) és a kiküldés tiltása
  nyelvi eltérésnél — ez a változat csak megmutatja.
- A levél szerkesztése a listából (a cég nevére kattintva a kontakt panelje
  nyílik, ott szerkeszthető).

## Feltételezések

- „Illik”: magyar cégnek (`country = HU`) magyar levél; külföldinek nem magyar.
- A szűrő listájába a 60 napnál nem régebbi queue-k kerülnek.

## Kockázat

- Csak megjelenítés és olvasó lekérdezések; a küldést nem érinti.
- Az áttekintés egy új összesítést futtat a queue-ban lévő, ki nem ment
  sorokon (a meglévő `in_queue` indexen).

## Ellenőrzés (end-to-end)

1. `npm run typecheck`, `npm run lint` — hiba nélkül.
2. Csak olvasva: eltérések queue-nként, a szűrő listája, szűrés egy queue-ra,
   az ütemező jelzése.
3. Böngészőben 1280 és 390 px szélesen: címzettlista levéllel, queue-szűrő.

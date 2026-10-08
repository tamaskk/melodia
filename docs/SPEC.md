# SPEC — Queue csatolmányainak átírása menet közben

Dátum: 2026-10-08 · Állapot: kész

## Cél

A Queue-k oldalon egy queue csatolmányai utólag is ki-be kapcsolhatók — a
telepített példányról, futó queue-nál is —, és a küldő gép a következő
levéltől már az új választást viszi. Eddig a választás a queue indulásakor
bemásolódott a futó küldésbe, így utólag nem lehetett változtatni rajta.

## Megfigyelhető viselkedés

- Adott egy nem lezárt queue, amikor a kártyáján kiveszek egy fájlt, akkor a
  választás mentődik, és a küldő a következő levelet már anélkül küldi.
- Adott egy kivett fájl, amikor visszapipálom, akkor a következő levéltől
  újra megy.
- Adott egy queue egyetlen kiválasztott fájllal, akkor az nem vehető ki
  (csatolmány nélküli küldés queue-ból nem megy).
- Adott egy lezárt (`kesz`) queue, akkor a lista csak olvasható.
- A már elküldött leveleken a változtatás nem módosít.

## Érintett fájlok

| Fájl                             | Változás                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/lib/sendQueues.ts`          | `setQueueAttachments()`; a választás ellenőrzése közös (`cleanAttachments`).                          |
| `src/lib/sendCampaign.ts`        | `attachmentsNow()`: a queue-ból indult menet minden levél előtt a queue aktuális választását olvassa. |
| `src/app/api/queues/route.ts`    | Új művelet: `attachments`.                                                                            |
| `src/components/QueuesPanel.tsx` | A fájlcímkék jelölőnégyzetet kapnak.                                                                  |

## Interfészek

- `POST /api/queues` `{ action: "attachments", id, attachments: string[] }` →
  `{ message }`; üres vagy hiányzó lista, ismeretlen vagy lezárt queue → 400.
- Adatbázis: nincs új mező — a `send_queues.attachments` íródik át.

## Hatókörön kívül

- A queue fiókjainak, címzettjeinek, futási napjának utólagos szerkesztése.
- Címzettenkénti kimutatás arról, melyik levélre mi került fel.
- Új fájl feltöltése a telepített példányról (a fájlok a küldő gépen élnek).

## Feltételezések

- A küldő levelenként egy kis lekérdezéssel olvassa a választást; a levelek
  10–20 percenként mennek, ez nem terhelés.
- Ha a queue-t közben törölték, a menet az induláskori választással megy
  tovább (a törlés a küldést amúgy is leállítja).
- A panelből kézzel indított (nem queue-s) küldés változatlan.

## Kockázat

- **A küldő gépen az új kód kell.** Amíg ott a régi fut, a felület menti a
  változtatást, de a már futó küldés az induláskori fájlokat viszi tovább.
  Visszaút nem kell: frissítés (`git pull` + újraindítás) után érvényesül.
- Két, közel egyszerre mentett változtatás közül az utolsó nyer.

## Ellenőrzés (end-to-end)

1. `npm run typecheck`, `npm run lint` — hiba nélkül.
2. Próba-queue (leállított, címzett nélkül): fájl kivétele után az
   `attachmentsNow()` az új listát adja; üres lista és lezárt queue → 400.
3. Élesben: a küldő gép frissítése után egy futó queue-ból kivenni egy fájlt,
   és a következő kiment levélen ellenőrizni (`/debug`: „csatolmany”).

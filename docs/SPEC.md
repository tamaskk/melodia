# SPEC — Queue hétvégi futása

Dátum: 2026-10-09 · Állapot: kész

## Cél

Egy queue-nál beállítható, hogy hétvégén is küldjön. Eddig a futás napja csak
hétköznap lehetett, és a küldő szombaton, vasárnap egyáltalán nem küldött; a
„munkaidőn kívül is” kapcsoló csak a kézi küldésé volt.

## Megfigyelhető viselkedés

- Adott a queue mentése, amikor bepipálom a „Hétvégén is” kapcsolót, akkor a
  futás napja szombat vagy vasárnap is lehet.
- Adott egy hétvégi futási nap a kapcsoló nélkül, akkor a mentés hibát ad, és
  megmondja, hogy a kapcsoló kell hozzá.
- Adott egy „hétvégén is” queue, akkor a küldő szombaton és vasárnap is küld,
  ugyanúgy 7 és 19 óra között, a címzett helyi idejében; a naptár a hétvégi
  napra is mutatja a tervet; a kártyán „hétvégén is” felirat áll.
- A kapcsoló nélküli queue-k és a kézi küldés változatlanok.

## Érintett fájlok

| Fájl                                             | Változás                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `src/lib/sendWindow.ts`                          | Az ablakfüggvények `weekends` paramétert kapnak.                     |
| `src/lib/queuePlan.ts`                           | A terv hétvégi napra is oszt, ha a queue kéri.                       |
| `src/lib/sendQueues.ts`                          | `weekends` mező; hétvégi futási nap engedése; továbbadás a küldőnek. |
| `src/lib/sendCampaign.ts`                        | `weekends` opció a címzett-választásban.                             |
| `src/app/api/queues/route.ts`                    | A `create` művelet `weekends` mezője.                                |
| `src/components/QueueBar.tsx`, `QueuesPanel.tsx` | Kapcsoló a mentésnél, felirat a kártyán.                             |

## Interfészek

- `POST /api/queues` `{ action: "create", …, weekends?: boolean }`.
- `send_queues.weekends?: boolean` (hiányzik = hamis); `QueueInfo.weekends`.

## Hatókörön kívül

- Éjszakai küldés queue-ból (a 7–19 órás ablak marad).
- Meglévő queue kapcsolójának utólagos átállítása.
- Ünnepnapok kezelése.

## Feltételezések

- A hétvége a címzett helyi ideje szerint számít, ahogy a hétköznap is.
- A queue továbbra is egynapos: a hétvégi queue is csak a futás napján megy.

## Kockázat

- A küldő gépen az új kód kell (`git pull` + újraindítás), különben a hétvégi
  queue betöltődik, de a régi küldő hétfőig vár, és a nap végén a címzettek
  visszakerülnek a listába.
- Hétvégi megkeresésre rosszabb lehet a válaszarány; ez tartalmi döntés.

## Ellenőrzés (end-to-end)

1. `npm run typecheck`, `npm run lint` — hiba nélkül.
2. Ablak, terv és mentési szabály szombati dátummal, kapcsolóval és anélkül.
3. Élesben: szombatra mentett „hétvégén is” queue elindul 7 óra után, és a
   naplóban „…között, a címzett helyi idejében, hétvégén is” áll.

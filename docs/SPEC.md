# SPEC — Küldő és néző gép

Dátum: 2026-10-10 · Állapot: kész

## Cél

Egyszerre csak egy gép küldhessen levelet, és ez a beállításokból derüljön
ki. Eddig minden nem-Vercel példány küldő volt: egy fejlesztésre elindított
`npm run dev` ugyanúgy ütemezett és küldött, mint az igazi küldő gép, a kettő
felváltva írta felül a csatolmány-jegyzéket, és elvehették egymástól a
fiókokat.

## Megfigyelhető viselkedés

- Adott egy gép `MELODIA_ROLE=kuldo` beállítással az `atlas-credentials.env`-ben,
  akkor küldő: ütemez, folytat, küld, közzéteszi a csatolmány-jegyzéket.
- Adott egy gép a beállítás nélkül (vagy más értékkel), vagy a telepített
  példány, akkor néző: a küldés indítása érthető hibát ad, az ütemező nem fut,
  a félbehagyott küldések nem folytatódnak, a jegyzéket nem írja, hanem a
  küldő gépét olvassa.
- Adott két küldőnek beállított gép, akkor az a küldő, amelyik előbb indult;
  a másik nem küld, amíg az első életjele (25 perc) le nem jár.
- A Queue-k oldal teteje kiírja a küldő gép nevét és utolsó életjelét, vagy
  figyelmeztet, ha nincs élő küldő.
- Induláskor a napló első sorai között áll a szerep.
- Induláskor előbb folytatódnak a félbehagyott küldések, és csak utána indul
  az ütemező.

## Érintett fájlok

| Fájl                                                             | Változás                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| `src/lib/role.ts`                                                | Új. Szerep, gépnév, életjel, a szerep lefoglalása.     |
| `src/lib/sendCampaign.ts`, `sendQueues.ts`, `attachmentIndex.ts` | A küldés őrfeltétele a szerep, nem a `VERCEL` változó. |
| `src/instrumentation.ts`                                         | Szerep a naplóba; folytatás az ütemező előtt.          |
| `src/app/api/queues/route.ts`, `src/components/QueuesPanel.tsx`  | A küldő gép állapota a Queue-k oldalon.                |
| `docs/EMAIL-KULDES.md`                                           | A szerep leírása.                                      |

## Interfészek

- Beállítás: `MELODIA_ROLE` (`kuldo` | `küldő` | `sender` = küldő; minden más
  néző), `MELODIA_NAME` (a gép neve; alapból a hosztnév).
- `app_state` új dokumentum: `{ _id: "sender", host, at }`.
- `GET /api/queues` válasza: `+ sender: { host, at, alive } | null`.

## Hatókörön kívül

- A küldő szerep átadása a felületről; kézi „átveszem” gomb.
- A Gmail-szinkron és az e-mail keresés szerephez kötése (ezek nem küldenek).

## Feltételezések

- Az alapértelmezés a néző: küldeni csak kifejezett beállítással lehet.
- Az életjel az ütemező körével megy (10 perc), 25 percig számít élőnek.

## Kockázat

- **Frissítés után a mostani küldő gép néző lesz, amíg a beállítás nincs
  megadva** — a queue-k nem indulnak. A Queue-k oldal ezt jelzi.
- Ha a küldő gép váratlanul leáll, egy másik küldőnek beállított gép 25 perc
  után veheti át.

## Ellenőrzés (end-to-end)

1. `npm run typecheck`, `npm run lint` — hiba nélkül.
2. Néző gép: küldés, folytatás, ütemezés, queue-indítás elutasítva; a
   jegyzéket nem írja.
3. Küldő szerep: lefoglalás, megújítás, második gép elutasítása, lejárt
   életjel utáni átvétel.

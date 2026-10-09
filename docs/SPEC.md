# SPEC — Queue-k oldal három csoportban

Dátum: 2026-10-09 · Állapot: kész

## Cél

A Queue-k oldal egyetlen hosszú kártyalista helyett három lenyitható
csoportot mutat: ami most fut, ami tervezve van, és ami lejárt. A tervezett és
a lejárt queue-k napra bontva, fiókonként egy sorban látszanak.

## Megfigyelhető viselkedés

- Adott az oldal megnyitása, akkor három csoport van, darabszámmal:
  „Jelenleg futó queue-k” (nyitva), „Tervezett queue-k” és „Lejárt queue-k”
  (csukva). A fél percenkénti frissítés nem csukja vissza, amit kinyitottál.
- A futó csoportban a `fut` állapotú queue-k a megszokott teljes kártyával.
- A tervezett csoportban a `varakozik` és a `leallitva` queue-k, futási nap
  szerint növekvően; a dátum alatt küldő fiókonként egy sor (fiók, queue neve,
  napi keret, hány vár). A leállított „leállítva” címkét kap.
- A lejárt csoportban a `kesz` queue-k ugyanígy, a legfrissebb nap elöl, a sor
  végén a kiment és a listába visszakerült darabszámmal.
- Egy sorra kattintva lenyílik a queue teljes kártyája (csatolmányok,
  címzettek, műveletek).
- A lejártakból alapból az utolsó 30 nap látszik; ha van régebbi, „Összes
  (N régebbi)” gomb tölti be mindet.

## Érintett fájlok

| Fájl                             | Változás                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/components/QueuesPanel.tsx` | Három csoport, napra bontott sorok; a kártya külön függvény.                                               |
| `src/lib/sendQueues.ts`          | `queueOverview({ allClosed })`: a 30 napnál régebben lezártak alapból kimaradnak; `olderClosed` darabszám. |
| `src/app/api/queues/route.ts`    | `?all=1`.                                                                                                  |

## Interfészek

- `GET /api/queues?all=1` — a régebbi lezárt queue-k is.
- `QueueOverview.olderClosed: number` — ennyi lezárt queue nincs a válaszban.

## Hatókörön kívül

- A naptár, a queue-kártya tartalma és a műveletek változatlanok.
- Lapozás a lejártak között; keresés queue-névre.

## Feltételezések

- Több fiókos queue fiókonként külön sort kap; bármelyik sor ugyanazt a
  kártyát nyitja.
- A leállított queue a tervezettek között van, mert visszatehető a sorba.

## Kockázat

- Csak megjelenítés és egy szűkebb lekérdezés: a küldést nem érinti. Visszaút
  az ág visszavonása.

## Ellenőrzés (end-to-end)

1. `npm run typecheck`, `npm run lint` — hiba nélkül.
2. Böngészőben 1440 és 390 px szélesen: három csoport a helyes darabszámmal,
   napok és sorok, egy sor lenyitva kártyát mutat, nincs vízszintes görgetés.

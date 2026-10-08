# SPEC — Munkák oldal (Job Radar a Melodiában)

Dátum: 2026-10-08 · Állapot: kész

> Forrás: `../job-radar/documentation.md` (a továbbiakban **doksi**) és a
> `../job-radar/src` kódja. Ami itt nincs benne, az **hatókörön kívül** van.

## Cél

A `/jobs` oldal egyetlen keresőmezőből párhuzamosan lekérdez 22 álláshirdetés-
forrást, a találatokat egységes sémára hozza, deduplikálja, és három nézetben
mutatja: **Lista**, **Kanban** (hat oszlop, MongoDB-ben tárolva, így telefonon
és gépen ugyanaz) és **JobAssist** (egy külső forrás saját szűrőivel). A
szerveroldal a job-radar portja, a felület a Melodia stílusában épül újra.

## Megfigyelhető viselkedés

- Adott a `/jobs` oldal, amikor betölt, akkor a fejléc „{n}/22 forrás aktív”
  számlálót mutat, keresés nem indul magától, a Kanban gomb a mentett állások
  számát mutatja.
- Adott egy keresőszó, amikor a Keresésre nyomok, akkor megjelenik a számláló
  sor („{n} egyedi találat · {n} nyers · {x.x}s”), forrásonként egy címke
  (találatszám / `—` / `hiba` / `HALOTT`) és a kártyarács, dátum szerint
  csökkenően.
- Adott egy bukó vagy kulcs nélküli forrás, amikor keresek, akkor a válasz
  200, a többi forrás találata megjelenik, a hibás forrás címkéje jelzi a bajt.
- Adott egy kártya, amikor egy státuszgombra kattintok, akkor az állás a
  Kanban megfelelő oszlopába kerül és a Mongóba mentődik; az aktív státuszra
  kattintva lekerül a tábláról. Újratöltés és másik eszköz ugyanazt mutatja.
- Adott a JobAssist nézet, amikor megnyitom, akkor azonnal keres az
  alapszűrőkkel; token nélkül a hibadoboz megmondja, mi hiányzik, és a benne
  lévő „demo-nézet” gombra három demo-kártya jön.
- Adott egy telefon (< 640 px), akkor a rács egyoszlopos, az oldal nem görög
  vízszintesen, csak a Kanban sávja.
- A doksi 4–7., 14. fejezete adja az elrendezést, a szövegeket és az
  interakciókat; a 15. fejezet furcsaságai közül az 1. (forráscímke a
  katalógusból), a 10–11. (egységes Keresés gomb és fizetésformátum) és a 13.
  (a csukott Iparágak címkéi is kattinthatók) javítva, a többi változatlan.

## Érintett fájlok

| Fájl | Változás |
| --- | --- |
| `src/lib/jobs/**` | Új. A job-radar `src/lib` portja: `types`, `normalize`, `http`, `cache`, `health`, `quota`, `companies`, `boards.json`, `parse/hungarian-salary`, `sources/*` (22 adapter), `jobassist/*`. Új: `env.ts`, `board.ts`, `format.ts`. |
| `src/app/api/jobs/sources/route.ts` | Új. Forráskatalógus. |
| `src/app/api/jobs/search/route.ts` | Új. Keresés (`maxDuration = 60`). |
| `src/app/api/jobs/board/route.ts` | Új. Kanban: GET / PUT / DELETE. |
| `src/app/api/jobs/jobassist/route.ts` | Új. JobAssist proxy. |
| `src/app/api/jobs/places/route.ts` | Új. Hely-autocomplete proxy (Photon). |
| `src/components/JobsPanel.tsx` | Új. Fejléc, nézetváltó, kereső, lista, kanban. |
| `src/components/JobCard.tsx` | Új. |
| `src/components/JobAssistPanel.tsx`, `JobAssistCard.tsx` | Új. |
| `src/components/TitleChipsInput.tsx`, `LocationAutocomplete.tsx`, `RangeSlider.tsx` | Új. |
| `src/app/jobs/page.tsx` | Az üres oldal helyett a `JobsPanel`. |
| `src/components/ui.ts` | Közös `CARD` és `chip()` stílus. |
| `src/app/globals.css` | `.range-thumb` szabályok a kétfogantyús csúszkához. |
| `package.json`, `package-lock.json` | `fast-xml-parser` 5.x (Personio XML, WWR RSS) — npm írja. A job-radar 4.5.1-es verziója kritikus sebezhetőségű.  |

## Interfészek

Típusok a doksi 9. fejezete szerint (`Job`, `BoardStatus`, `BOARD_COLUMNS`,
`SearchResponse`, `SourceRunResult`, `CatalogSource`, `JobAssistJob`,
`JobAssistPage`, `PlaceSuggestion`), a `score`, `escoUri`, `iscoCode`,
`escoSkills` mezők nélkül.

API (mind belépés mögött, hibánál `{ error: "magyar üzenet" }`):

- `GET /api/jobs/sources` → `{ sources: CatalogSource[] }`
- `GET /api/jobs/search?q&countries&remote&sources&limit` → `SearchResponse`
  (`raw` nélkül; `limit` alap 500, legfeljebb 1000)
- `GET /api/jobs/board` → `{ items: { status: BoardStatus; job: Job }[] }`
  (legfeljebb 500, `updatedAt` szerint csökkenően)
- `PUT /api/jobs/board` `{ job: Job, status: BoardStatus }` → `{ ok: true }`
- `DELETE /api/jobs/board` `{ dedupKey: string }` → `{ ok: true }`
- `GET /api/jobs/jobassist?…` → `JobAssistPage` (+ `demo: true`), doksi 10.3
- `GET /api/jobs/places?q` → `{ places: PlaceSuggestion[] }`, doksi 10.4

MongoDB:

- Új kollekció `job_board`: `{ _id: dedupKey, status, job, updatedAt: Date }`,
  index `{ updatedAt: -1 }`. A `job` pillanatkép `raw` nélkül, a leírás 240
  karakterre vágva (a kártya ennyit mutat).
- `app_state` új dokumentum `_id: "jobs_quota"`: a véges keretű források
  (Jooble, Adzuna) hívásszámlálói.

Környezet (mind opcionális, `credential()`-ön át, tehát helyben az
`atlas-credentials.env`-ből, Vercelen env-változóból): `USER_AGENT`,
`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_KEY`, `CAREERJET_KEY`,
`RAPIDAPI_KEY`, `MUSE_KEY`, `JOBASSIST_SESSION_TOKEN`, és a doksi 16.3
finomhangolói (`*_LIVE`, `*_COUNTRIES`, `*_LOCATION`, …).

## Hatókörön kívül

- LLM-pontozás (Gemini) és ESCO/ISCO-besorolás: nincs pontszám- és
  ISCO-jelvény, nincs `isco` szűrő.
- A job-radar `outreach/*` modulja, a `/adatvedelem` oldal és a
  `/api/salary-histogram` végpont.
- A job-radar tesztjei és fixture-készlete (~40 000 sor): a Melodiában nincs
  teszt-futtató. A három kulcsos forrás (Jooble, Adzuna, Careerjet) az
  eredetiben `*_LIVE=1` nélkül **kitalált** mintaadatot adott vissza; ez nem
  jött át — itt kulccsal, de `*_LIVE=1` nélkül a forrás hibát jelez, hogy
  kitalált hirdetés ne keveredjen a valódiak közé.
- A régi `localStorage` tábla (`job-radar-board-v1`) átemelése: másik
  origin, innen nem olvasható.
- Drag & drop a kanbanban, lapozás a listában, élő szűrés.
- Kapcsolat a kontaktlistával (állásból kontakt, levélküldés).

## Feltételezések

- A felület a Melodia sötét témáját és színváltozóit használja; világos téma
  nincs. Kiemelő szín a Melodia kékje, a „REMOTE” és a valódi fizetés zöld
  (`--done`), figyelmeztetés borostyán, hiba piros.
- A három nézet egy oldalon van (doksi 16.1); a JobAssist a nézetváltó
  harmadik gombja, nem külön útvonal.
- A forrás-cache és a hibaszámláló memóriában él, mint az eredetiben:
  Vercelen példányonként külön, hidegindításkor üres. A kvótaszámláló
  Mongóban van, mert a Jooble 500 hívása a kulcs teljes élettartamára szól.
- A kanban optimistán frissül; ha a mentés elbukik, a tábla visszaáll és
  hibaüzenet jelenik meg.
- A naplózás a Melodia `createLogger("jobs")`-án megy (`/debug` mutatja).

## Kockázat

- **Vercel időkorlát**: a keresés belső plafonja 25 s, a route-é 60 s. Ha a
  csomag ennél kevesebbet enged, a keresés 504-et ad — visszaút: kevesebb
  forrás a „Forrás” szűrővel, vagy helyi szerver.
- **Hidegindítás Vercelen**: üres cache mellett minden keresés minden forrást
  újra lekér; a napi egy lekérést kérő források (Remotive, Himalayas)
  feltételeit ez sértheti sűrű használatnál.
- **Forrás-API változás**: bármelyik adapter eltörhet; a hiba forrásonként
  látszik, a keresést nem viszi el.
- **Visszaút**: a változás új fájlokból áll; az ág eldobásával és a
  `job_board` kollekció törlésével nyom nélkül visszavonható.

## Ellenőrzés (end-to-end)

1. `npm run typecheck` és `npm run lint` — hiba nélkül.
2. `VERCEL=1 npm run dev` (így nem indul levélküldés és ütemező), belépve:
   - `GET /api/jobs/sources` → 22 forrás, kulcs nélkül 18 `enabled`.
   - `GET /api/jobs/search?q=react&sources=remoteok,arbeitnow,greenhouse` →
     200, `jobs[]` nem üres, minden elemnek van `dedupKey`-e, nincs `raw`.
   - `PUT` majd `GET /api/jobs/board` → a mentett állás visszajön; `DELETE`
     után eltűnik.
   - `GET /api/jobs/jobassist?demo=1` → 3 állás, `demo: true`.
   - `GET /api/jobs/places?q=budap` → Budapest a listában.
3. Böngészőben `/jobs`: keresés, státuszváltás, Kanban, JobAssist demo —
   képernyőkép asztali és 390 px széles nézetben, vízszintes oldalgörgetés
   nélkül.

# Melodia — megkeresés dashboard

Next.js + MongoDB Atlas dashboard az álláskereséses megkeresések nyilvántartására:
kutatás → levélírás → kiküldés → beérkező válaszok, egy helyen.

Az adat négyféle úton kerül be: a kiinduló **PDF-ekből** (`npm run parse` + `seed`),
**CSV-cégexportból** (`/convert`, `/import`), **JSON-importból** (`/import`), és
**puszta cégnévből** (`/check` → felvétel + webes kutatás). Minden az Atlasban él.

## Oldalak

| Oldal | Mire való |
| --- | --- |
| `/` | A lista: szűrés, szerkesztés, tömeges műveletek, e-mail keresés, kiküldés |

**Státusz** ([`src/lib/stage.ts`](src/lib/stage.ts)). A `sent` / `done` páros helyett
egy státusz látszik (oszlop, szűrő, a panel fejléce), a meglévő mezőkből levezetve
— az első nyer:

| Státusz | Honnan |
| --- | --- |
| Interjú · Ajánlat · Elutasítva · Nem aktuális · Ne keresd | a panel **Kimenetel** választója (kézi) |
| Válaszolt | a Gmail-szinkron: emberi válasz jött (`repliedAt`) |
| Visszapattant | a Gmail-szinkron: nem kézbesíthető, válasz nem jött (`bouncedAt`) |
| Elküldve | a levél kiment (`sent`) |
| Kész | lezártad, de nem e-mailben (`done`, `sent` nélkül) |
| Új | minden más |

A **Gmail-szinkron** végén (`syncContactReplies`) a válasz és a visszapattanás
visszakerül a kontaktra, szálanként összesítve. Akinek a Gmail szerint ment
tőled levél, de a sora nem volt elküldött, az is elküldött lesz
(`levelezesbol-elkuldve` címke) — különben a kampány újra küldene neki. Kimenetel
rögzítése után a sor nem kap kiküldött levelet (a `Ne keresd` erre való). A
csempék: kontakt · van cím · elküldve · **válaszolt** (visszapattant alatta) ·
**válaszarány** (válaszolt / elküldött), mindig a szűrt listára.

**Billentyűzet** (a lista oldalon, `⌨ Billentyűk` vagy `?` a súgó): `j`/`k`
következő/előző sor — nyitott panelnél a panel is lép, így sorban át lehet
nézni a cégeket —, `Enter`/`o` megnyitás, `x` kijelölés, `d` kész, `/` kereső,
`Esc` bezárás. Gépelés közben nem élnek.

**Űrlapos jelentkezés.** Ha a keresés csak jelentkezési űrlapot talált
(`Nincs e-mail, de van űrlap` szűrő), a panelen egy blokk: `Űrlap megnyitása ↗`,
és 8 egyenként (vagy egyben) másolható mező — név, e-mail, telefon, város,
GitHub, portfólió, rövid bemutatkozás a sor nyelvén, és a cégre szabott levél
motivációs szövegnek ([`src/lib/profile.ts`](src/lib/profile.ts)). Beküldés
után `Beküldtem ✓` → a sor elküldött lesz, `urlapon-jelentkezve` címkével.

**Hibák a futtató sávokon.** Ha a kiküldés vagy egy begyűjtés hibával áll le,
a sávban piros doboz mutatja az utolsó hiba szövegét és egy
`Napló megnyitása ↗` linket, az adott futásra és a figyelmeztetésekre szűrve
(`/debug?scope=sweep&level=warn`).

**Illeszkedési pontszám** ([`src/lib/score.ts`](src/lib/score.ts)). A lista
alapból a szerint rendez, melyik céggel érdemes kezdeni: import-prioritás,
stack-egyezés, Budapest / Magyarország, 11–200 fő, közvetlen munkáltató, talált
HR-es, van cím / csak űrlap — mínusz az általános postafiók, a visszapattant cím
és a nyelvi eltérés. A pontszámot az adatbázis számolja (pipeline-os
`updateMany`, adatátvitel nélkül): induláskor forrásonként a teljes listára
(~70 mp), mentéskor és keresés után soronként. A cég alatt `· 12 pont`, az
indoklás egérrel ráállva és a panelen tételesen.

**Küldés előtti ellenőrzés** ([`src/lib/preflight.ts`](src/lib/preflight.ts)). Az
előnézet tetején a teljes küldési sorra: ✕ hiányzó levél, kitöltetlen
`{{mező}}` (ezek **kimaradnak**), ⚠ általános postafiók, magyar levél nem
magyar cégnek, a cég domainjéről már visszapattant levél. A figyelmeztetett
tételek mellett ⚠ a listában.

**Automatikus Gmail-szinkron.** Indulás után 1 perccel, aztán 30 percenként
(`MAIL_AUTO_SYNC_MINUTES`, 0 = ki), csak az új levelekre; a végén a válaszok a
kontaktokra is visszaíródnak. A `/mail` fejléce mutatja az utolsó futást.

**Napi munkamenet (~15 perc).** A Teendők sorból minden egy kattintás:

1. **💬 Új válaszok** ([`src/lib/replyTriage.ts`](src/lib/replyTriage.ts)) — minden
   emberi válasz osztályozva (interjú / kérdés / elutasítás / később /
   automatikus / egyéb), egy mondatos összefoglalóval és szerkeszthető
   válaszpiszkozattal a válasz nyelvén (`REPLY_MODEL`, alap `gpt-4o-mini`; kulcs
   nélkül kulcsszavas szabályok). Az idézett előzményt levágja. Magas
   bizonyosságnál a kimenetel magától áll (interjú → Interjú, elutasítás →
   Elutasítva, később → Nem aktuális) „(AI)” jelzéssel — kézi kimenetelt nem ír
   felül. A piszkozat nem vállal el semmit a nevedben (díj, forma, időpont):
   ahol döntés kell, `[kitöltendő: …]` jelölést tesz, és amíg az ott van, nem
   küldhető. `Válasz küldése` a szálban, arról a címről, amire a levél jött;
   `Kész, nem válaszolok`; az elutasítások és „később”-ek egyben lezárhatók.
   Minden Gmail-szinkron után magától fut; ha a szálban a válasz után tőled
   ment levél, a válasz kezeltnek számít.
2. **↩ Follow-up** ([`src/lib/followup.ts`](src/lib/followup.ts)) — akinek 7+ napja
   ment levél és nem válaszolt: rövid, a korábbi levélre hivatkozó piszkozat
   („néhány napja/hete írtam…”), **ugyanabban a szálban** (`Re:` + `In-Reply-To`
   az eredeti levélre), csatolmány nélkül, **ugyanabból a fiókból**, cégenként
   egyszer. Kijelölés → jóváhagyás → `Jóváhagyottak küldése`: a meglévő kiküldő
   viszi (munkaidő a címzett idejében, napi keret, szünet, leállítás), és
   közvetlenül küldés előtt újra ellenőrzi, hogy közben nem jött-e válasz. Az
   első kiküldés mostantól elmenti a levél azonosítóját és a fiókot.
3. **Új cégek** — illeszkedés szerint rendezve, a küldés előtti ellenőrzéssel.
4. **Űrlapos cégek** — másolható adatcsomag a panelen.

**Profil egy helyen** ([`src/lib/profile.ts`](src/lib/profile.ts)). Név, e-mail,
telefon, GitHub, portfólió, stack — a sablonok, az import, az AI-promptok, a
Hunter-konverter, a follow-up és a válaszpiszkozat mind innen olvas.

**Import: domain-egyeztetés.** Az import a meglévő sorokat kulcs, cégnév-alias
és **domain** alapján keresi (indexből, célzottan). Ha csak a domain egyezik
(más néven ugyanaz a weboldal / céges cím), az előnézetben soronként:
`Összevonás a meglévővel` · `Új iroda (külön sor)` · `Kihagyás`. A `domain`
mezőt az adatbázis számolja a pontszámmal együtt (weboldal, vagy céges e-mail;
a gmail-félék nem számítanak).

**Felfuttatás (warm-up)** ([`src/lib/warmup.ts`](src/lib/warmup.ts)). Új fióknál a
napi keret az első küldéstől hetente nő: 10 → 20 → 30, utána a beállított
keret. A fiók-chipen `↗`, az állapotsorban „felfuttatás, max. N/nap”.

**CV-link a csatolmány helyett.** Ha az `atlas-credentials.env`-ben van
`CV_URL`, a Kiküldés panelen bekapcsolható: nincs PDF-csatolmány, a levél
végére a link kerül, a sor `cv-link` címkét kap (később mérhető, melyik hoz
több választ).

**AI: helyi Claude CLI, nem OpenAI** ([`src/lib/aiText.ts`](src/lib/aiText.ts)). A
levélgenerálás, a válasz-osztályozás és -piszkozat és az interjú-brief a helyi
`claude` CLI-vel fut (előfizetési keret, a `CLAUDE_SEARCH_MODEL` modellel),
eszközök nélkül és rövid saját rendszerprompttal; a fogyás a `/usage` oldalon
látszik (`levelgeneralas`, `valasz-osztalyozas`, `interju-brief`). Mérve:

| Feladat | Alap CLI-beállítás | `--tools ""` + saját rendszerprompt |
| --- | --- | --- |
| levélgenerálás | 72 634 token | 3 940 |
| válasz-osztályozás | 70 389 | 3 426 |
| interjú-brief | 68 407 | 4 572 |

A webes címkeresés is csak a szükséges eszközök (WebFetch / WebSearch)
definícióját kapja (`--tools`): egy mért keresés 36 ezer token lett az eddigi
318 ezres átlag helyett. Az OpenAI csak akkor fut, ha a keresőmotort kifejezetten
OpenAI-ra állítod.

**Interjú-brief** ([`src/lib/interviewBrief.ts`](src/lib/interviewBrief.ts)). Interjú
státusznál a panelen `Brief készítése`: a cég adataiból, az első leveledből és a
teljes levélváltásból — mit csinál a cég, kivel beszélsz, hol tart, öt várható
kérdés, három kérdés tőled, felkészülési teendők. Csak a megadott tényekből;
ami nem derül ki, az „nem ismert”.

**Párhuzamos keresés.** A begyűjtő sávokban (e-mail és kapcsolattartó)
beállítható, hány cégen dolgozzon egyszerre (`Egyszerre: N szál`, 1–8).
Folyamatosan annyi fut: amint egy végez, a munkás azonnal viszi a következőt a
sorból. A közös CLI-sor ([`src/lib/cliQueue.ts`](src/lib/cliQueue.ts)) férőhelyes
szemafor lett: alapból 1 (`CLI_CONCURRENCY`), a begyűjtés indításkor feljebb
állítja, a végén visszaveszi — így egy kézi keresés nem fut váratlanul sok
szálon. Minden indulás előtt megvan a memória-ellenőrzés: egy CLI-példány
400–700 MB, ezért 3–4 szál fölé csak erős gépen érdemes menni.

Mérve (4 cég, 4 szál): a négy keresés átfedésben futott (15–36 mp egyenként),
a menet ~48 mp alatt kész lett a soros 2–4 perc helyett.

A részletek listájában felül látszik, amin épp dolgozunk — pörgő jelzéssel és
az eltelt idővel (`keresés… · 30 mp`) —, és amint egy kész, a sora a helyén
eredménnyé alakul (cím, megbízhatóság, `beírva`). A következő induló cég
fölé kerül, így mindig a friss munka van elöl.

**Navigáció.** Minden oldal tetején ugyanaz a sáv: **Kontaktok** (`/`) ·
**Levelezés** (`/mail`) · **Beszerzés ▾** (Ellenőrzés, Import, Hunter CSV, és a
`PDF-források újratöltése` művelet megerősítéssel) · **Rendszer ▾** (Tokenek,
Változásnapló, Élő napló). Jobbra a **⚙ Beállítások**: az e-mail keresés motorja
(OpenAI / Claude / Codex — a begyűjtő sávokban is állítható) és hogy hol nyíljon
a kitöltött levél (levelező app / Gmail). A beállítás a böngészőben marad, és
azonnal érvényes mindenhol.

**Teendők** ([`src/lib/todos.ts`](src/lib/todos.ts)). A fejléc alatt egy sor: hány
válasz jött, hány cím pattant vissza, hány levél küldhető, hány űrlapos cég és
hány cím nélküli, még nem keresett sor van — a teljes adatbázisra. Mindegyik
egy szűrő: kattintásra pontosan azok a sorok jönnek. Az oldalon egyetlen
keretes doboz van, a munkafelület (szűrő + kijelölés + táblázat + lapozó); a
számok és az export keret nélkül, halkabban.

A főoldal úgy van rendezve, hogy a táblázat az első képernyőn legyen (1440 px-en
467 px-nél kezdődik): kompakt csempék, a forrásonkénti haladás összecsukva
(`▸ Források (N)`), a szűrősorban a kereső + a forrás + 6 napi gyorsszűrő, a
többi a `További szűrők` mögött — a gomb mutatja, ha ott van aktív szűrő
(`· 1 aktív`). A három futtató panel (`✉️ Kiküldés`, `🔎 E-mail begyűjtés`,
`👤 Kapcsolattartók`) egy **Műveletek** sávban van: egyszerre egy nyílik, és a
gombon villogó pötty + `· fut` jelzi, ha valamelyik épp dolgozik.
| `/mail` | Beérkezett válaszok szálakba fogva + napi levélforgalom-diagram |
| `/check` | Cégnév-lista összevetése az adatbázissal, hiányzók felvétele és kutatása |
| `/import` | JSON / CSV import előnézettel és duplikáció-védelemmel |
| `/convert` | Hunter CSV → lead JSON (nem ír adatbázisba) |
| `/usage` | Token-felhasználás keresésenként: motor, modell, napi fogyás |
| `/history` | Változásnapló, visszaállítással |
| `/debug` | Élő szerveroldali napló (SSE) |

## Mit tud

- **Lista nézet** oszlopokkal: **sorszám** (a teljes szűrt listára, nem az oldalon
  belül), cég (a **PDF-ből kinyert valódi weboldal**), cég (a **PDF-ből kinyert valódi weboldal**), kapcsolattartó
  (a PDF LinkedIn-linkje, ahol volt közvetlen profil-URL, oda mutat), e-mail cím, forrás badge, műveletek.
- **Küldés gomb** → előre kitöltött tárggyal és levéltörzzsel nyílik a levél.
  Kattintásra a sor automatikusan „elküldve" állapotba kerül.
- **Levelező-választó a fejlécben**: `Levelező app` (`mailto:`, a rendszer levelezője) vagy
  `Gmail` (webes új levél új lapon: `mail.google.com/mail/?view=cm…`). A választás
  localStorage-ban marad, és minden küldés-linkre érvényes (táblázat + panel).
- **Kész gomb** → állapot mentése Atlasba, a sor háttere zöldre vált.
  Az „elküldve, de nem kész" sorok borostyán jelölést kapnak.
- **Sorra kattintva** nyílik a részletek panel: cég, kapcsolattartó, pozíció, e-mail cím,
  megjegyzés, címkék — mind **szerkeszthető, és gépelés után ~0,6 mp-cel automatikusan mentődik**
  (a fejlécben látszik a `mentés… / elmentve ✓` állapot).
- **Soronként három gomb**: `Megnyitás` (a részletek panel), `Kész` és `⋯`. A `⋯`
  menüben: `✉️ Küldés levelezőben` (a beállított levelezőben vagy Gmailben nyílik,
  és elküldöttnek jelöli a sort), valamint a másolás — tárgy, levélszöveg,
  LinkedIn-üzenet (ha eltér), kapcsolatkérés `N/300` jelzéssel, tárgy + szöveg
  egyben. Sikeres másolás után a menüpont `✓ Vágólapon`-ra vált. A menüt Escape,
  máshová kattintás vagy görgetés zárja. Ha a böngésző tiltja a Clipboard API-t,
  automatikus fallback lép életbe.
- **Üzenet panel**: e-mail / LinkedIn üzenet / 300 karakteres kapcsolatkérés fülek szerkeszthető
  szövegmezővel, karakterszámlálóval, másolás gombokkal. A **típus** és a **létszám-sáv**
  itt is átállítható soronként, azonnali mentéssel.
- **Kézi szerkesztés védve**: amit átírsz, azt a `manualFields` jelöli, és sem a
  `npm run seed`, sem a **Szinkronizálás** gomb nem írja felül. Az `Eredeti visszaállítása`
  gombbal bármikor visszakérheted a PDF-ből származó szöveget.
- **Szerveroldali lapozás**: a lista mindig csak az aktuális oldalt tölti le
  (alapból 50 sor). 133 000 sornál ez döntő: az Atlas ingyenes csomagján a
  hálózat ~100 KB/s, és 2000 teljes sor (levélszöveggel együtt ~4,8 MB) 50
  másodpercig utazna. A találatszám és az oldalak száma valós `countDocuments`-ből
  jön, nem a letöltött sorokból; az export „Teljes szűrt lista" hatóköre külön,
  kérésre tölti le a halmazt.
- **A fejléc számai követik a szűrőt**: ha bármilyen szűrő aktív, az `Összes kontakt`
  csempe `Szűrt kontakt`-ra vált, és a Kész / Elküldve / Van e-mail / Csillagozott
  értékek, valamint a forrás-chipek is csak a szűrt halmazra vonatkoznak
  (`/api/stats` ugyanazokat a szűrőparamétereket fogadja, mint a `/api/contacts`).
  A csempe alatt ott marad a viszonyítás: „133 322 sorból".
- **Országok egy helyen** ([`src/lib/countries.ts`](src/lib/countries.ts)): 47 tétel
  kóddal, magyar és angol névvel, zászlóval, és a felismerhető írásmódokkal.
  Ebből dolgozik a szűrő címkéje, az import (`Lengyelország`, `Poland`, `PL`,
  `Anglia`, `Dubai` mind jó), az export és a Hunter-konverter is — nem fordulhat
  elő, hogy egy ország a listában van, de importkor nem ismerjük fel.
  Lefedve: HU, AT, DE, CH, NL, BE, ES, PT, FR, GB, IE, PL, CZ, SK, RO, BG, SE, DK,
  NO, FI, EE, IT, US, CA, CY, GR, HR, SI, RS, LT, LV, LU, MT, IS, UA, TR, valamint
  az arab piacok: AE, SA, QA, KW, BH, OM, JO, EG, MA, TN — plusz az `INT`
  (🌍 Nemzetközi) álország annak, aminek a székhelyét nem ismerjük.
- **Kereshető legördülők** ([`Combobox.tsx`](src/components/Combobox.tsx)): a hosszú
  listák (Forrás, Ország, Város, Címke, Kategória) nem natív `select`-ek, hanem
  gépelésre szűrő mezők. Ékezetre érzéketlen és többszavas: „lengyel" →
  `🇵🇱 IT cégek · Lengyelország`, „spain" → `🇪🇸 Spanyolország`, „toborz" →
  `LinkedIn toborzók`; a nyers kulcs (`it-companies-hu`) is találat. Nyíllal
  lépkedhetsz, Enterrel választasz, Escape zár, az `×` törli a szűrőt.
- **Szűrők**: szabadszöveges kereső, forrás, csatorna, típus, kategória, ország, város,
  **méret (létszám-sáv)**, nyelv, címke, „van e-mail", „elküldve", „kész", „csillagozott",
  rendezés (köztük **Legújabb elöl** / Legrégebbi elöl a felvitel ideje szerint),
  gyorsszűrő chipek.
- **IT cégek (`it-company`)**: negyedik típus a cégvezetők / toborzók / ügynökségek mellé.
  Ugyanaz, mint egy sima cég, plusz egy kötelező `size` létszám-sáv:
  `1-10` · `11-50` · `51-200` · `201-500` · `501-1000` · `1001-5000` · `5001-10000` ·
  `10000+` · `ismeretlen` (névből felvett cégnél ez az alapértelmezés).
  A sáv megjelenik a listában és a panelen (szerkeszthető, automatikusan mentődik),
  szűrhető a **Méret** legördülővel, és benne van minden exportban.
- **Szöveg sablonból (`✎ Szöveg sablonból`)**: a kijelölt cégek tárgyát, levelét,
  LinkedIn üzenetét vagy kapcsolatkérését egyszerre írja át egy sablonból
  ([`src/lib/templates.ts`](src/lib/templates.ts)). A sablonban helyettesítők
  állnak, amiket cégenként a saját adat tölt ki:
  `{{cegnev}}`, `{{cegnev_rovid}}` (jogi forma nélkül), `{{kapcsolattarto}}`,
  `{{keresztnev}}`, `{{pozicio}}`, `{{varos}}`, `{{orszag}}`, `{{meret}}`,
  `{{weboldal}}`, `{{email}}` — egy kattintással beszúrhatók.
  - **mezőnként külön piszkozat**: a tárgynak, a levélnek, a LinkedIn üzenetnek és a
    kapcsolatkérésnek saját alapszövege van, és a köztük váltás nem írja felül,
    amit épp írtál. A tárgy egysoros mező, a többi szövegdoboz.
    Az `Alapszöveg visszatöltése` mindig az épp kiválasztott mezőt állítja vissza,
  - **nyelvi kapu**: alapból csak a magyar nyelvű sorokra alkalmaz, hogy magyar
    szöveg ne menjen angol céghez (átállítható),
  - **`Előnézet` kötelező az alkalmazás előtt**: megmutatja konkrét cégekkel
    kitöltve, jelzi az üres helyettesítőket és a 300 karakteres LinkedIn-korlát
    túllépését. Csak utána enged `Alkalmazom`-ot.
- **Mind a szűrt sor kijelölése**: a fejléc jelölőnégyzete csak a látható
  oldalt jelöli ki; a kijelölés-sávban megjelenő `Mind a(z) 624 kijelölése`
  gomb viszont a **teljes szűrt halmazt**, oldalakon át. Csak az azonosítók
  jönnek át (`?idsOnly=1`), így 900 sorra is tizedmásodperc.
- **Tömeges módosítás egy kéréssel**: a kijelölt sorok `PATCH /api/contacts`
  hívással, egyetlen `updateMany`-vel módosulnak (200 sor ≈ 0,2 mp), a
  változásnapló pedig soronként megmarad, tehát visszaállítható.
- **Shift + kattintás a jelölőnégyzeteken**: kijelölsz egy sort, lejjebb Shifttel
  kattintasz egy másikra, és a kettő közti összes sor is kijelölődik. Ha egy már
  kijelölt sorra kattintasz Shifttel, a tartomány kijelölése megszűnik. Felfelé is
  működik; lapváltás vagy szűrés után a horgony nullázódik.
- **Tömeges műveletek**: kijelölés → kész / elküldve / csillagozás / visszaállítás,
  **típus átsorolás** (Ügynökség / LinkedIn toborzó / IT cégvezető / IT cég),
  **forrás áthelyezés** (meglévő forrás a listából, vagy új név beírása + Enter —
  kulcsalakra normalizálva, pl. „Saját kutatás" → `sajat-kutatas`; a Forrás szűrő
  automatikusan felveszi az új értéket), valamint **Törlés** — a kijelölt sorok az
  Atlasból is eltűnnek. Két lépés:
  a `Törlés` gomb előbb megerősítést kér (`Végleg törlöd ezt a N sort?`), és a
  kijelölés bármilyen módosítása visszavonja a megerősítést.
- **E-mail keresés a weben (OpenAI)**: a panelen a `🔎 E-mail keresése a weben`
  gomb valódi webkeresést indít (OpenAI Responses API `web_search` eszköz), és
  visszaadja a cég publikus jelentkezési címét **a forrás URL-jével** és egy
  megbízhatósági jelzéssel (saját oldal / más forrás / bizonytalan). Semmit nem
  ment magától: `Beírom` beteszi a címet és a forrást a megjegyzésbe, `Elvetem`
  eldobja. Ha csak jelentkezési űrlap van, azt linkeli e-mail helyett.
  Formailag hibás címet eldob, és tilos neki mintából tippelni
  ([`src/lib/emailFinder.ts`](src/lib/emailFinder.ts)).
- **Motorválasztó a fejlécben**: `🔎 OpenAI` / `🔎 Claude` / `🔎 Codex`. A választás a böngészőben
  marad, és minden keresési kéréssel elmegy; az `EMAIL_SEARCH_PROVIDER` env csak a
  kezdőértéket adja.
  - `openai` — Responses API `web_search` eszköz: gyors (~8-15 mp), API-díjas.
  - `codex` — a gépre telepített, bejelentkezett **OpenAI Codex CLI**
    ([`src/lib/emailFinderCodex.ts`](src/lib/emailFinderCodex.ts)):
    `codex --search exec --json --sandbox read-only --output-schema … --output-last-message …`.
    A `--search` a natív `web_search` eszközt kapcsolja élőre, a `--output-schema`
    kényszeríti a JSON alakot, a végső üzenetet pedig fájlból olvassuk, nem a
    stdout szövegéből. ChatGPT-előfizetéssel fut (`codex login`), nem API-díjas.
    Sandbox: `read-only`, saját ideiglenes munkakönyvtár, `--ignore-user-config`,
    `--ephemeral` — a keresés semmit nem írhat. Ha nincs telepítve, `npx`-szel indul.
    Beállítható: `CODEX_CLI_PATH`, `CODEX_CLI_TIMEOUT_MS` (alap: 300000).
  - `claude` — a gépre telepített, bejelentkezett **Claude Code CLI** headless módban
    ([`src/lib/emailFinderClaude.ts`](src/lib/emailFinderClaude.ts)). Nincs API kulcs,
    az előfizetés keretéből megy; lassabb (~40-100 mp), és csak lokálisan működik.
    A CLI-nek csak `WebSearch` és `WebFetch` eszközt engedünk — Bash-t soha.
    Beállítható: `CLAUDE_CLI_PATH`, `CLAUDE_CLI_TIMEOUT_MS` (alap: 300000),
    `CLAUDE_MIN_FREE_MB` (alap: 250).
- **Kijelölt cégek keresése — egyesével**: jelöld ki a sorokat →
  `🔎 E-mail keresése (N) — egyesével`. Ugyanaz a motor viszi végig, mint az automata
  begyűjtést: cégenként külön keresés, a haladás a lista fölötti dobozban látszik
  (`kijelölt sorok` jelzéssel), és ott bármikor leállítható. A kérés azonnal
  visszatér, a futás a szerveren megy tovább — a lap bezárása nem szakítja meg.
  Ha épp fut egy másik menet, a gomb ezt megmondja, nem indít párhuzamosat.
- **Erőforrás-korlátok (fontos!)**: egy helyi CLI példány (Claude vagy Codex) ~450-650 MB memóriát
  eszik és teljes Claude Code környezetet indít. Ezért:
  - **egyszerre csak EGY CLI futhat** az egész alkalmazásban, motortól függetlenül —
    a kézi, a tömeges és az automata keresés ugyanabba a sorba áll be
    ([`cliQueue.ts`](src/lib/cliQueue.ts), `sorban áll (2 vár előtte)` a naplóban),
  - a folyamat **minimalizált környezetben** indul: `/tmp` munkakönyvtár (nem olvassa
    a projekt CLAUDE.md-jét és hookjait), `--strict-mcp-config` (nincs MCP-szerver),
    `--setting-sources user`, `--disable-slash-commands` — így ~650 MB helyett ~460 MB,
  - `nice -n 10` prioritáson fut, hogy a gép használható maradjon,
  - a gyerekfolyamat heapje `--max-old-space-size=768`-ra korlátozva,
  - saját folyamatcsoportban indul, így időtúllépéskor az egész fa kilövődik
    (nem marad árva folyamat),
  - `CLAUDE_MIN_FREE_MB` (alap 250) alatt vár egy kicsit, mielőtt új példányt indít.
- **Automatikus begyűjtés (`🔎 Összes hiányzó e-mail begyűjtése`)**: a lista fölötti
  dobozból indítható. Végigmegy az adatbázison, és **egyesével** megkeresi minden
  cím nélküli cég e-mailjét ([`src/lib/emailSweep.ts`](src/lib/emailSweep.ts)).
  - **`csak a szűrt lista`** kapcsoló (alapból bekapcsolva): pontosan azon a
    halmazon megy végig, amit a lista szűrője mutat — a doboz ki is írja, hány
    cím nélküli sor van benne,
  - motorválasztó (OpenAI / Claude / Codex) helyben, futás közben tiltva,
  - `Hány cég` mező (0 = mind) és `amit már kerestem, kihagyom` kapcsoló,
  - a futás a szerveren él, a lap bezárása nem állítja meg; a doboz 2 mp-enként
    kérdez rá: haladás, épp melyik cégnél tart, hány cím, hány beírva, becsült
    hátralévő idő, és az utolsó 50 cég eredménye,
  - `Leállítás` gombbal bármikor megállítható — az épp futó cég még befejeződik,
  - három egymás utáni hiba után magától leáll (limit vagy hálózati gond),
  - két cég között 1,5 mp szünet, hogy ne fussunk limitbe,
  - minden lépés a naplóban: `[sweep] 12/250 · Cégnév → cím (beírva)`, alatta a
    `claude-cli` sorokkal, hogy épp melyik oldalt tölti le.
- **A keresés teljes eredménye elmentődik** a soron: `emailSearch` objektum
  (`at`, `result`, `email`, `confidence`, `source`, `applyUrl`, `alternatives[]`,
  `notes`, `citations[]`, `model`) + a szűréshez lapos `emailSearchedAt`,
  `emailSearchResult`, `emailSearchNote` mezők. A panel újranyitásakor a doboz
  előjön: „Elmentett keresés · dátum · modell", a további címek `Beírom` gombbal
  átvehetők, az űrlap linkje kattintható. A listában a cím nélküli sornál
  megjelenik az `űrlap ↗` link és a `+N javasolt cím` (buborékban a címekkel).
  A modellnek tilos elhallgatnia bármilyen látott címet: az általános `info@` /
  `office@` is bekerül, `label`-lel megjelölve, mire való.
- A keresés nyoma miatt nem fut rá kétszer ugyanaz a hívás:
  - a gomb `🔎 Már kerestem — nem volt találat` felirattal **tiltva** marad, mellette
    a dátum és az akkori indoklás; a `Mégis, keressünk újra` gombbal felülbírálható,
  - a listában az e-mail oszlopban `🔎 kerestem, nincs cím` áll a `—` helyett (a buborékban
    a keresés indoklása),
  - szűrhető az **E-mail** és a **Kapcsolattartó** állapot-legördülővel, a
    gyorschipekkel és a `Legutóbb keresett e-mail` rendezéssel (lásd lent).

  **Állapot-szűrők.** Mindkettő ugyanarra a három alapállapotra épül: *még nem
  kerestem* (null) · *van* · *nincs*. Az állapotok hézag nélkül kiadják az
  összeget (IT cégek · Magyarország, 2363 sor):

  | E-mail | db | | Kapcsolattartó | db |
  | --- | --- | --- | --- | --- |
  | Van | 1835 | | Van (`person` vagy talált ember) | 39 |
  | Nincs — még nem kerestem | 12 | | Nincs — még nem kerestem | 2276 |
  | Nincs — de van javaslat (cím) | 91 | | Nincs — kerestem, nem lett | 48 |
  | Nincs — de van javaslat (űrlap) | 75 | | | |
  | Nincs — semmit nem talált | 350 | | | |

  Az e-mail állapotok **nem fedik át egymást** (cím ∩ űrlap = 0, javaslat ∩
  semmi = 0 sor). *Címjavaslat*: másik cím (`alternatives`), be nem írt találat,
  vagy a keresés jegyzetében említett cím. *Űrlap*: jelentkezési űrlap
  (`applyUrl`), címjavaslat nélkül — ha mindkettő van, a cím nyer. A
  `Nincs — összes` a négy „nincs” együtt. Paraméterek: `emailStatus` (`found` ·
  `missing` · `unsearched` · `suggested-email` · `suggested-form` · `nothing`,
  és a felületen nem kínált `suggested` = a két javaslat, `none` = javaslat +
  semmi) és `contactStatus` (`found` · `missing` · `unsearched` ·
  `none`). A régi `hasEmail` / `emailSearched` továbbra is működik (a begyűjtés
  ezeket használja).
- **AI-levélgenerálás (OpenAI)**: a panelen a `✨ Személyre szabott levél` gomb a címzett
  neve, pozíciója, cége és a megjegyzés alapján újraírja a levelet (opcionális saját instrukcióval).
  A javaslat **nem mentődik magától**: `Elfogadom és mentem` → felülírja és menti,
  `Elvetem` → eldobja, marad az eredeti. `Újragenerálás` is van.
- **Export sáv a lista alatt**: hatókör (`Ez az oldal` / `Teljes szűrt lista` / `Kijelöltek`)
  × formátum (`AI prompt` / `CSV` / `JSON` / `Markdown`) → `Másolás vágólapra` vagy
  `Letöltés fájlba`. Az **AI prompt** kész kutatási feladatot ír a lista elé (hiányzó e-mail,
  karrieroldal, full stack pozíciók, EU-remote), így közvetlenül beilleszthető egy másik AI-nak.
- **Statisztika sáv**: összes, kész, elküldve, e-maillel rendelkező, csillagozott + forrásonkénti bontás.
- **Beérkező válaszok** ([`/mail`](#levelezés-mail)): a kiküldött jelentkezések, a
  rájuk jött válaszok és a saját viszontválaszaim szálakba fogva, állapotszűrővel
  (`válasz jött` / `válaszoltam` / `nincs válasz` / `visszapattant`) és napi
  levélforgalom-diagrammal.
- **Cégellenőrzés és felvétel** ([`/check`](#cégellenőrzés-check)): beillesztett
  cégnév-lista összevetése az adatbázissal (jogi forma nélküli egyeztetés,
  indexből), a hiányzók exportja, majd egy gombbal felvétel + egyesével kutatás
  (e-mail, weboldal, kész levél).
- **Több küldő fiók** ([lásd](#több-küldő-fiók)): fiókonként külön menet, saját
  napi kerettel; a felső sávban látszik, melyik fut és hol tart.

## Adatforrások (133 322 kontakt)

A lista két rétegből áll: a **kutatott, kis darabszámú** eredeti PDF-források
(ügynökségek, cégvezetők, toborzók — ezeknél kézzel gyűjtött e-mail cím van), és
a **tömeges IT-cég listák** CSV-exportból (ezeknél a címet a webes keresés
pótolja).

| Forrás | Darab |
| --- | --- |
| `it-companies-us` | 38 398 |
| `it-companies-gb` | 21 851 |
| `it-companies-de` | 10 202 |
| `it-companies-fr` | 8 375 |
| `it-companies-es` | 7 851 |
| `it-companies-nl` | 7 633 |
| `it-companies-ae` | 6 364 |
| `it-companies-pl` | 4 625 |
| `it-companies-se` | 4 101 |
| `it-companies-at` | 3 168 |
| `it-companies-hu` | 2 363 |
| `it-companies-ch` | 2 347 |
| …és a többi ország + az eredeti PDF-források (`agency-emails-*`, `*-leaders`, `linkedin-recruiters`) | |

Típus szerint: `it-company` 132 182 · `agency` 795 · `company-leader` 232 ·
`recruiter` 113. Országok élén: 🇺🇸 38 722 · 🇬🇧 21 851 · 🇩🇪 10 281 · 🇫🇷 8 375 ·
🇪🇸 7 901 · 🇳🇱 7 734 · 🇦🇪 6 364 · 🇵🇱 4 625.

Állapot (utolsó ellenőrzéskor): **1 878 sornál van publikus e-mail cím**,
2 090 soron futott már webes keresés, **344 megkeresés ment ki**, a beérkező
levelek gyűjteménye 430 levél.

> A számok pillanatképek. A `/` oldal fejléce mindig az aktuális állapotot
> mutatja, és a szűrőt is követi.

## Beállítás

A hitelesítő adatok egyetlen helyen élnek: **`atlas-credentials.env`** a repo gyökerében.
Ezt olvassa az app (`src/lib/env.ts`) és a seed script is. A fájl gitignore-olt.

```
MONGODB_URI="mongodb+srv://..."
MONGODB_DB="melodia"            # opcionális, alapértelmezés: melodia
MONGODB_COLLECTION="contacts"   # opcionális, alapértelmezés: contacts

OPENAI_API_KEY="sk-..."         # AI-levélgeneráláshoz; enélkül a gomb el van rejtve
OPENAI_MODEL=""                 # opcionális, alapértelmezés: gpt-4o
OPENAI_SEARCH_MODEL=""          # opcionális, a webes e-mail kereséshez (üresen = OPENAI_MODEL)
EMAIL_SEARCH_PROVIDER="claude"  # "openai" (API) vagy "claude" (helyi Claude Code CLI)
CLAUDE_CLI_PATH=""              # ha a claude nincs a PATH-ban
CLAUDE_CLI_TIMEOUT_MS=""        # alapértelmezés: 180000
```

A kulcs beírása után **indítsd újra a dev szervert** (a fájl indításkor olvasódik be).

```bash
npm install
npm run parse -- ~/Downloads/files1   # PDF-ek → src/data/imported.json
npm run seed     # feltölti az Atlas adatbázist a PDF-ekből kinyert adatokkal
npm run dev      # http://localhost:3000
```

Az első oldalbetöltés üres adatbázis esetén magától lefuttatja a seedet.

## Új PDF hozzáadása

1. Tedd az új PDF-et a többi mellé (pl. `~/Downloads/files1`).
2. Vedd fel a fájlnevet a `scripts/parse-pdfs.ts` `FILES` táblájába (forrás, ország,
   nyelv, típus). A parser felismeri a három oldaltípust:
   cégvezetői oldal (`1. E-MAIL` + `2. LINKEDIN`), toborzói oldal (`KAPCSOLATKÉRÉSHEZ`)
   és ügynökségi levél (`Subject:` / `Tárgy:`); a tartalomjegyzék-oldalak kimaradnak.
3. `npm run parse -- ~/Downloads/files1` → újragenerálja a `src/data/imported.json`-t.
4. `npm run seed`, vagy a dashboard **Szinkronizálás** gombja (`POST /api/sync`).

A parser a PDF **link-annotációit** is kiolvassa (pdfjs), nem csak a szöveget:
innen jön a cég weboldala, a személy LinkedIn-linkje és a küldés gomb mailto-címzettjei.
Az eredeti PDF-sorok döntő többségénél így valódi weboldalra visz a cégnév; ahol a
PDF nem linkelte a munkahelyet (jellemzően toborzó személyek), Google-keresés a
tartalék. A CSV-ből és névből felvett soroknál a weboldal a webes kutatásból jön.

**Duplikáció-védelem** három szinten:

- azonos `key` → upsert, nem új sor (a `sent`/`done`/`starred` állapot megmarad);
- azonos típus + személy/cég + e-mail → a parser összevonja, a gazdagabb rekordot tartja meg
  (így a három átfedő USA PDF nem hoz létre 3× ugyanazt);
- egy cég városi irodái közös postafiókkal → egy sorrá olvadnak, az irodák a megjegyzésbe kerülnek
  (`tobb-iroda` címke). Ha külön cégek osztoznak egy címen, azok maradnak, de `kozos-postafiok`
  címkét kapnak.

A seed **prune**-ol: ami már nincs benne a PDF-ekben, az kikerül az adatbázisból,
így elavult sorok sem maradnak vissza.

## Változásnapló (`/history`)

Minden mezőmódosítás nyomot hagy — **előtte/utána értékkel** —, és bármelyik
visszaállítható ([`src/lib/history.ts`](src/lib/history.ts)). Egy elkapkodott
tömeges kattintás így nem visszafordíthatatlan.

- Szűrés **időszakra** (utolsó 10 perc / óra / nap / hét), **mezőre** (kész,
  elküldve, e-mail cím, levél szövege, típus, forrás…) és **forrásra**:
  `kézi szerkesztés`, `tömeges művelet`, `sablon`, `kiküldés`, `e-mail keresés`,
  `visszaállítás`.
- `Kijelöltek visszaállítása` vagy `Mind visszaállítása (N)` a szűrt nézetre.
- A `kész` / `elküldve` visszaállításakor a hozzájuk tartozó időbélyeg is törlődik.
- A visszaállítás maga is naplózódik, tehát az is visszavonható.
- A bejegyzések 30 nap után TTL-index alapján maguktól törlődnek.

## Debug konzol (`/debug`)

Élő betekintés abba, hogy a backend épp mit csinál — mert egy 60 másodperces
AI-keresés közben tudni akarod, hol tart.

Ugyanaz a napló megy **a `next dev` termináljába** (színezve) és a **`/debug`
oldalra** (SSE-n, élőben). Formátum: idő · szint · hatókör · üzenet · eltelt ms · adat.

Mit látsz futás közben:

```
21:24:16 DEBUG [claude-cli] CLI elindult {"session":"db99c2ac","model":"claude-opus-5"}
21:24:21 INFO  [claude-cli] 🌐 oldal letöltése: https://abrisconsult.com
21:24:21 INFO  [claude-cli] 🔍 keresés: abrisconsult.com ABRIS Budapest contact email
21:24:47 INFO  [claude-cli] 🌐 oldal letöltése: https://www.abrisconsult.com/kapcsolat/
21:25:04 INFO  [claude-cli] válasz megérkezett (success) {"ms":47926,"turns":11}
21:25:04 INFO  [email-search] ✔ e-mail keresés: ABRIS — talált: career@abrisconsult.com (high) +52483ms
21:25:04 INFO  [api:find-email#5xs6b9] mentve: ABRIS → career@abrisconsult.com
```

Hatókörök: `mongo` (kapcsolódás), `db` (lekérdezés, mentés, törlés),
`email-search` (keresés eleje/vége, eredmény), `claude-cli` (minden webkeresés,
oldalletöltés, eszközválasz, limitjelzés), `api:*` (kérésenként külön azonosítóval,
tömeges keresésnél `3/12 · Cégnév → cím` haladással), `api:import`, `api:convert`.

A `/debug` oldalon: **szint- és hatókörszűrő**, szabadszöveges keresés,
`⏸ Szünet`, automatikus görgetés, sorra kattintva a teljes adat JSON-ban,
`Másolás` / `Letöltés` (a szűrt nézetet menti `melodia-log.txt`-be).

A napló **kitakarja a titkokat**: `sk-…` kulcs, Mongo-jelszó, `Authorization`
fejléc soha nem kerül ki. A részletesség a `LOG_LEVEL` env-vel állítható
(`debug` az alapértelmezés, lehet `info`, `warn`, `error`).

## Import (`/import`)

Kézi hozzáadás **JSON-ból vagy CSV-ből** — beillesztve, fájlból, vagy a fájlt
egyszerűen **ráhúzva a mezőre** (a keret kikékül: „Engedd el — beolvasom a fájlt").
Csak `.json`, `.csv`, `.txt` megy át; másra megmondja, mit dobtál rá. Négy típus:

| `kind` | Mit jelent | Kötelező mezők |
| --- | --- | --- |
| `agency` | Ügynökség | `company`, `country`, `emailSubject`, `emailBody` |
| `recruiter` | LinkedIn toborzó | fentiek + `person` |
| `company-leader` | IT cégvezető | fentiek + `person` |
| `it-company` | IT cég | fentiek + `size` (`person` nem kell) |

Opcionális: `website`, `email`, `otherEmails[]`, `linkedin`, `role`, `city`, `language`
(`hu`/`en`), `category`, `tags[]`, `note`, `linkedinMessage`, `connectionRequest`,
`size` (a többi típusnál is megadható), valamint `key` (meglévő sor felülírásához) és `source`.

### CSV (cégexport)

A fejléces CSV-t (`Company Name, Domain, City, Country, Industry, Headcount,
Company Type, Tags, Linkedin, Description` — magyar fejlécek is mennek) a
[`src/lib/csvImport.ts`](src/lib/csvImport.ts) alakítja import-sorokká:

- `Domain` → `https://domain`, `Headcount` → létszám-sáv (`1 to 10` → `1-10`,
  `5,001 to 10,000` → `5001-10000`, `10,001+` → `10000+`, `120 fő` → `51-200`),
- ha van létszám és nincs személy, a sor típusa automatikusan `it-company`,
- `Industry` + `Company Type` + `Description` a megjegyzésbe kerül, és címke lesz belőlük,
- **a hiányzó levélszöveget legenerálja** (magyar cégnél magyarul, egyébként angolul):
  tárgy, e-mail, LinkedIn üzenet és 300 karakter alatti kapcsolatkérés,
- a latin-1-ként félreolvasott UTF-8 (`kÃ¶nnyedÃ©n`) automatikusan helyreáll.

E-mail címet soha nem talál ki: ami nincs a CSV-ben, az `nincs-email` marad.

### Duplikáció-védelem és névegységesítés

- **Ugyanaz a cég nem kerül be kétszer.** Ha egy importált sor cége már szerepel
  az adott országban (a jogi forma és a zárójeles kiegészítés nélkül hasonlítva:
  `Régens` = `Régens Zrt.`, `Filter:max` = `filter:max Kft.`), az import a
  **meglévő sort frissíti** — megtartva annak kulcsát, típusát és létszám-sávját —,
  és ezt figyelmeztetésként ki is írja. Logika: [`src/lib/companyMatch.ts`](src/lib/companyMatch.ts).
- **A név minden szövegben `Kálmán Tamás Krisztián`**: importkor a `Tamás
  Krisztián Kálmán` / `Kálmán Tamás` alakok automatikusan javulnak
  ([`src/lib/name.ts`](src/lib/name.ts)).
- Ha mégis duplikátum keletkezett (pl. két külön import után):
  `npx tsx scripts/merge-duplicates.ts` — száraz futás, `--apply` írja is.
  A megtartott sor a gazdagabb azonosságú (IT cég, létszám-sávval), és megkapja
  a másik sor tartalmát: e-mail, megjegyzés, címkék, hosszabb levélszövegek,
  valamint a kész/elküldve/csillagozott állapotot. A PDF-ből származó, szándékosan
  külön városi irodákhoz (Kforce Atlanta, Robert Half Sacramento …) nem nyúl.

A `size` csak a nyolc sáv egyike lehet; a szóközök és a gondolatjel automatikusan
normalizálódnak (`5001–10 000` → `5001-10000`, `10 000+` → `10000+`). Rossz érték esetén
a hibaüzenet kiírja a megengedett listát. Az IT cégek forrása `it-companies-<ország>`,
a címkéik közé bekerül a `meret-<sáv>`.

Az oldalon típusonként letölthető **JSON-sablon**, és egy **séma-prompt**, amit egy
másik AI-nak adva közvetlenül beilleszthető JSON-t kapsz vissza.

**A CSV-ből generált listák soha nem írnak felül meglévő sort.** Ezekben nincs
e-mail cím és a levélszöveg is sablonból készül, ezért két, egymástól független
védelem véd:

1. **Csak új cégek mód** — az import fejlécében a `csak új cégek (meglévőket nem
   írom felül)` kapcsoló, alapból **bekapcsolva**. A meglévő cégek ilyenkor
   `kihagyom` jelzést kapnak, és hozzájuk a rendszer nem nyúl. A `/convert`
   oldal `Importálás az adatbázisba` gombja mindig ezzel a móddal fut. A mód
   automatikusan bekapcsol, ha CSV-t illesztesz be, vagy ha egyetlen sorban
   sincs e-mail cím. Kutatott, e-mailt is tartalmazó JSON-nál kikapcsolhatod,
   és akkor frissít.
2. **Üres e-mail nem törölhet meglévőt** — akkor sem, ha a fenti mód ki van
   kapcsolva: az `upsertContacts` kihagyja a `primaryEmail` / `emails` mezőket,
   ha az importált sorban nincs cím. Kikutatott címet import nem veszíthet el.

**Duplikáció-ellenőrzés importálás előtt.** Az `Ellenőrzés` (és az `Importálás` első
fázisa) minden sorról megmondja, benne van-e már az adatbázisban — kulcsegyezés vagy
cégnév + ország egyezés alapján. A táblázat **az újakat teszi felülre**
(`Még nincs az adatbázisban — N új cég`), a meglévők halványabban alá kerülnek
(`Már szerepel — N cég frissül, nem keletkezik duplikátum`), és soronként kiírja,
mi alapján ismerte fel: `azonos kulcs` vagy `cégnév + ország egyezik`.
Ugyanez fut a `/convert` oldalon is: a konvertálás után automatikusan lefut az
ellenőrzés, az `Adatbázis` oszlop `új` / `már bent` jelzést kap, a fejlécben pedig
ott a `X új · Y már bent van` összegzés — mindezt importálás **előtt**.

Az `Importálás` gomb mindig kattintható: előbb validál, és **hiba esetén nem ír semmit**,
hanem kiírja mezőnként, mi a gond (összesítve + soronként). Az `Ellenőrzés` ugyanezt
csinálja, csak írás nélkül.

Az import fejlécében a **Típus** legördülővel kézzel is megszabhatod, mi legyen a
beillesztett sorok típusa (`Mind: IT cég`, `Mind: LinkedIn toborzó` …) — ilyenkor a
fájlban lévő `kind` értéket felülírja, és ezt figyelmeztetésként ki is írja.
Alapértéken (`Ami a fájlban van`) marad a régi, kikövetkeztető viselkedés.

Két engedmény a gyakori AI-kimenetekre: a `kind` elhagyható, ha nincs `person` a sorban
(ilyenkor `agency` lesz), a `country` pedig lehet országnév is (`Magyarország`, `Austria`,
`Germany` …), nem csak kód. Az importált sorok `origin: "import"` és `importalt` címkét
kapnak, és a **Szinkronizálás nem törli őket** (a prune csak a PDF-ből származó sorokra fut).

## Cégellenőrzés (`/check`)

Beillesztesz egy cégnév-listát, és megmondja, **melyik van már az adatbázisban
és melyik nincs** — a hiányzókat egy gombbal exportálod (JSON / CSV / vágólap),
azokkal érdemes tovább dolgozni.

Bemenet lehet JSON tömb (`["A", "B"]`), soronkénti lista, vesszős felsorolás
vagy sorszámozott lista — a `parseNames`
([`src/lib/companyLookup.ts`](src/lib/companyLookup.ts)) levágja a sorszámot, a
felsorolásjelet és az idézőjelet.

**Az egyeztetés nem szó szerinti.** A `companyAliases` levágja a jogi formát és
az írásjeleket („Régens Zrt." → `regens`), és ugyanezek az aliasok minden soron
el vannak mentve az `aliases` mezőben, indexelve — így egyetlen `$in`
lekérdezés megválaszolja a kérdést:

| | idő |
| --- | --- |
| teljes cégnév-lista áthúzása (133 273 sor, 9,9 MB) | **110 s** |
| `aliases` index + `$in` | **47 ms** |

Az aliasokat a mentés maga állítja be (`upsertContacts`, `updateContact`). A
meglévő sorokra egyszer kellett feltölteni:

```bash
npm run backfill-aliases     # 133 273 sor, ~2 perc, kötegelve
```

Az ország **nem** szűkít: a beillesztett listában általában nincs ország, és
jobb egy meglévő céget jelezni, mint másodszor is kiküldeni neki.

### Hiányzók felvétele és kutatása

Az eredmény alatt megjelenik a felvételi sáv: **forrás · típus · létszám ·
ország · levél nyelve · kereső motor**, és egy gomb. Ami nincs a listában, az
egy kattintással bekerül — és rögtön fel is töltődik adatokkal
([`src/lib/enrich.ts`](src/lib/enrich.ts)):

1. **Felvétel.** A nevekből teljes értékű sor lesz: kulcs, típus, ország,
   nyelv, címkék (`kezi-felvetel`, `kutatando`), és **kész levél** — tárgy,
   levélszöveg, LinkedIn-üzenet, kapcsolatkérés (`buildCompanyLetter`, ugyanaz,
   amit a CSV-import használ). Amit közben már megtalál a listában, azt nem
   veszi fel másodszor.
2. **Kutatás, egyesével.** Minden új soron lefut a webes keresés (Claude /
   Codex / OpenAI), és bekerül a **publikus e-mail cím** (csak forrással
   alátámasztva), a **weboldal** (a cím domainjéből vagy a találat URL-jéből),
   a keresés teljes eredménye (`emailSearch`), majd a levél újraíródik a
   megtalált adatokkal. A címkék is frissülnek: `van-email` / `nincs-email`.

Közben a panel mutatja, hol tart: `3/12 kutatva · 2 címmel · most: Példa Kft.`,
becsült hátralévő idővel, soronkénti eredménnyel és leállító gombbal. A menet a
szerveren fut, az oldal frissítése nem szakítja meg.

Éles próba két néven, Claude motorral:

```
Aggreg8 Digital Kft  → hello@aggreg8.io · https://aggreg8.io   (54 mp)
Zzz Teszt Kutatas Kft → nincs cím                              (21 mp)
```

**Alapértelmezések, névből felvett cégre szabva:** létszám `ismeretlen`,
ország `🌍 Nemzetközi` (`INT`), levél nyelve **angol**. Vegyes listánál ez a
biztonságos kiindulás — mindhárom átállítható, és később a listában is
javítható. Az `ismeretlen` sáv és az `INT` ország valódi, szűrhető érték, tehát
egy `size=ismeretlen` szűréssel bármikor megkeresed, mit kell még pótolni.

## Hunter CSV → lead JSON (`/convert`)

Hunter.io cégexportból pontozott, kész levélszöveggel ellátott lead JSON-t
készít — a korábbi `hunter-to-leads` CLI logikája, webre kötve.

**Osztályozás.** Kulcsszavas szabályok pontoznak
([`src/lib/hunter/rules.ts`](src/lib/hunter/rules.ts)), a pontszámból lesz a prioritás:

- **erősítők**: stack-egyezés (React, Node, TypeScript, Vue, MongoDB…), AI,
  egészségügy, utazás, foglalási rendszer, e-kereskedelem, proptech, fintech,
  mobil, tesztelés, kihelyezéses modell
- **gyengítők**: SAP, .NET, Java, PHP/WordPress, low-code, embedded, CAD, Oracle,
  Odoo, GPU/tudományos számítás, hosting, üzemeltetés, disztribúció, oktatás
- **kizárók**: nyílászáró-kereskedés, fotózás, textil, adatmegsemmisítés,
  egyetem, konferencia, meetup, nonprofit → `nem-celpont`

**Levélszöveg.** Nyelvet választ (magyar/angol az ékezetek, a leírás és a `.hu`
domain alapján), és a cég profiljához illő horgonyt tesz a levél közepébe:
egészségügyinél a voice AI tapasztalatot, utazásinál a Wingmant, foglalási
rendszernél az időfüggő adatot. A szövegek egy helyen szerkeszthetők:
[`src/lib/hunter/profile.ts`](src/lib/hunter/profile.ts).

**Adatminőségi jelzések** a note-ba: nincs leírás; le nem cserélt HTML-sablon
szövege; COVID-korszakból maradt honlap; csak postai cím; toborzó szöveg a
leírás helyén; a Hunter iparági besorolása ellentmond a leírásnak; üres
létszámmező (a `size` ilyenkor becslés).

**A felületen**: CSV **behúzása egérrel** (drag & drop), beillesztése vagy feltöltése,
opcionális `domain,email`
lista (CSV vagy JSON) a már ismert címekhez, minimum prioritás szűrő,
duplikátum-kezelés. Az eredmény táblázatban látszik (prioritás, pontszám,
méret, nyelv, címkék); egy sorra kattintva előjönnek a figyelmeztetések és a
generált levél. Onnan `JSON másolása`, `Letöltés (leads.json)`, vagy
**Importálás az adatbázisba** egy kattintással — ugyanazon a validáláson és
duplikáció-védelmen keresztül, mint az `/import`.

## Ütemezett kiküldés Gmailből (`✉️ Kiküldés indítása`)

Egy gomb, és amíg a projekt fut, a szerver magától küldi a leveleket —
**egyesével, véletlen 10-20 perces szünetekkel, napi kerettel, munkaidőben**.
Semmilyen fizetős szolgáltatás nincs benne: a saját Gmail-fiókod SMTP-jén megy
([`src/lib/mailer.ts`](src/lib/mailer.ts), [`src/lib/sendCampaign.ts`](src/lib/sendCampaign.ts)).

**Beállítás (egyszer, ~5 perc).** Kapcsold be a kétlépcsős azonosítást, majd
generálj app-jelszót: <https://myaccount.google.com/apppasswords>. A 16 karaktert
tedd az `atlas-credentials.env`-be:

```bash
GMAIL_USER="kalman.tamaskrisztian@gmail.com"
GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"   # a szóközök nem számítanak
GMAIL_FROM_NAME="Kálmán Tamás Krisztián"
GMAIL_REPLY_TO=""                          # opcionális
```

### Több küldő fiók

Négy-öt saját címről is mehet a kiküldés. Minden fióknak **saját app-jelszó**
kell, és a számozás 2-től 10-ig megy ([`src/lib/accounts.ts`](src/lib/accounts.ts)):

```bash
GMAIL_USER_2="kalman.tamas.krisztian@gmail.com"
GMAIL_APP_PASSWORD_2="xxxx xxxx xxxx xxxx"
GMAIL_LABEL_2="Második"        # opcionális: ez a név látszik a felületen
GMAIL_FROM_NAME_2=""           # ha üres, a fő fiók feladóneve megy
```

Az első fiók írható `GMAIL_USER` és `GMAIL_USER_1` néven is — ha több fiók van
egymás alatt, a számozott alak a természetesebb. A sor végére írt megjegyzést
(`"érték"   # magyarázat`) a beolvasó levágja, tehát nem lesz a jelszó része.

A panel tetején egy sávban ott az összes fiók: **melyik fut, ma hány levelet
küldött a keretéből, épp kinél tart, és mennyi a következő levélig**. A
kiválasztott fiókra vonatkozik az indítás, a leállítás és a próbalevél.

Fiókonként külön menet fut, saját napi kerettel és saját ütemezéssel, akár
egyszerre több is. **Egy céget csak az egyik fiók keres meg**: a sorból kiosztott
címzettet a többi menet kihagyja (a `sent` mező pedig másodszorra is véd).

**Egy cím, egy cég — egy levél** ([`src/lib/recipients.ts`](src/lib/recipients.ts)).
Ugyanaz a cég több forrásból, több soron is szerepelhet. A sor összeállításakor
ezért az *összes* sorra nézzük, kinek ment már levél:

| Kihagyva, ha… | Felülírható? |
| --- | --- |
| erre a **címre** bármelyik soron már ment levél | nem |
| erre a **cégdomainre** (`@ceg.hu`) már ment levél | igen: `egy cégre több levél is (fiókirodák)` |
| a mostani sorban ugyanaz a cím vagy cég korábban már szerepel | a domain-részt a fenti kapcsoló engedi |

A közös szolgáltatók (gmail, outlook, freemail …) domainje nem számít cégnek.
Az előnézet tetején lenyitható lista mutatja, ki és miért maradt ki, és a futó
menet is kiírja a számokat. Közvetlenül minden küldés előtt még egyszer
ellenőrizzük (egy párhuzamos fiók közben küldhetett). Kiküldés után a
testvérsorok (ugyanaz a cím, más sor) is elküldöttek lesznek, `masik-soron-ment`
címkével. A bevezetéskor 21 ilyen nyitott sor kapta meg a jelölést, a
változásnaplón át (`/history`-ból visszaállítható).

**Az oldal frissítése nem szakítja meg a küldést** — a menet a szerveren fut, nem
a böngészőben. Az állapot (sor, napi keret, eddigi levelek) az adatbázis
`campaigns` gyűjteményébe is bekerül minden levél után, így egy **szerver-
újraindítás után magától folytatódik** onnan, ahol abbamaradt
([`src/instrumentation.ts`](src/instrumentation.ts) — ez a fájl a szerver
indulásakor fut le egyszer). Szerverre telepítve tehát elég egyszer elindítani.

**A leállítás az adatbázisban él, nem a memóriában.** A `Leállítás` a
`campaigns` sorára `stopRequested: true`-t ír; a küldő **minden levél előtt**
ezt ellenőrzi, a mentés (`persist`) nem írhatja vissza, újraindításkor pedig a
leállított menetet nem vesszük fel. Ha az adatbázis nem érhető el, inkább nem
küld. A jelzőt csak egy új indítás nullázza. (Korábban a futó menetek modul-
változóban éltek: a Next más modulpéldányba töltötte az instrumentationt és a
route-ot, így a Leállítás egy üres térképet látott, a másik példány pedig
küldött tovább — egyszerre akár két menet is. Most `globalThis`-en vannak, és
az adatbázis-jelző ettől függetlenül is megállít minden példányt.)

> Két külön kapcsoló van: a **munkaidőn kívül is** éjjel és hétvégén is küld a
> napi keretig, a **teszt mód** pedig szintén ablak nélkül, de indításonként
> legfeljebb 3 levelet. Mindkettő megerősítést kér indítás előtt, így egy bent
> felejtett pipa nem küldhet ki észrevétlenül egy egész éjszakányi kampányt.

Két tesztlehetőség éles küldés nélkül:

- **`Kapcsolat tesztelése`** — csak a belépést ellenőrzi, levelet nem küld.
- **`Próbalevél magamnak`** — az első sorba álló cég levelét küldi el a **saját
  címedre**, csatolmányokkal együtt, `[PRÓBA – Cégnév]` tárgy-előtaggal. A cég
  nem kap semmit, és a sor nem lesz elküldöttnek jelölve. Ha egy sort kijelölsz,
  annak a levelét küldi.

**Csatolmányok.** Amit az `attachments/` mappába teszel, az **minden levélre
felkerül** ([`src/lib/attachments.ts`](src/lib/attachments.ts)):

```
attachments/
  Kalman_Tamas_Krisztian_CV.pdf     ← minden levélre
  MUNKÁLTATÓI AJÁNLÁS.pdf           ← minden levélre
  en/
    Letter_of_Recommendation_EN.pdf ← csak az angol nyelvű levelekre
  hu/                                (opcionális, ugyanígy magyarra)
```

- **Fájlonként ki/be kapcsolható**: a küldés dobozában minden fájl mellett van
  egy pipa. Amit kiveszel, az áthúzva marad, és nem megy sehova. A doboz kiírja,
  ki mit kap: „A magyar nyelvű címzett 1 fájlt kap, az angol 2-at."
- A gyökér tartalma mindenkihez megy, a `hu/` és `en/` almappa csak az adott
  nyelvű kontaktokhoz — így nem kell két kampány két önéletrajzhoz. A nyelvi
  mappában lévő fájl akkor sem megy más nyelvű címzettnek, ha ki van pipálva.
- Engedett típusok: pdf, doc(x), odt, rtf, txt, png, jpg, webp. A `README.md` és
  a rejtett fájlok kimaradnak.
- Összesen 20 MB a korlát (a Gmail 25 MB-nál elutasít); efölött a rendszer inkább
  kevesebb fájlt küld, és ezt kiírja.
- A küldés doboza felsorolja, mi fog menni (`📎 fájlnév · méret`), és figyelmeztet,
  ha a mappa üres. A mappa tartalma gitignore-olt — személyes dokumentumok.

**Küldés előtti előnézet.** A gomb neve `✉️ Előnézet és küldés`: először egy
ablak nyílik, amiben végigkattinthatod, **kinek pontosan milyen levél menne ki**
([`src/components/SendPreview.tsx`](src/components/SendPreview.tsx)).

- Bal oldalt a címzettlista (sorrendben, ahogy menni fog), jobb oldalt a tárgy,
  a teljes szöveg és a levélre kerülő csatolmányok.
- A szöveg **helyben szerkeszthető**; a `Módosítás mentése` gomb írja az adatbázisba.
- **AI-átírás prompttal**: írj egy instrukciót (pl. „legyen sokkal rövidebb,
  maximum 5 mondat"), és az `✨ Átírás AI-val` gomb újraírja a levelet. A
  `mind a N levélre` kapcsolóval egyszerre az összes sorba állítottat átírja,
  egyesével haladva. Az eredmény azonnal mentődik.
- Innen indul a tényleges küldés (`✉️ Kiküldés indítása (N)`), addig **egyetlen
  levél sem megy sehova**.

**Hogyan küld**

- Kit: a kijelölt sorokat, vagy ha nincs kijelölés, a **szűrt listát** — abból is
  csak akit még nem kerestél meg (`sent: false`) és van címe.
- Ütem: véletlen szünet a beállított perc-tartományban (alap 10-20). A pontosan
  azonos időköz gépies mintát ad, ezért van benne szórás.
- Napi keret: alapból 18, éjfélkor nullázódik, és a keret elfogyása után magától
  megáll — másnap folytatható.
- Munkaidő: hétköznap 9:00-17:00, **a címzett helyi idejében**
  ([`src/lib/sendWindow.ts`](src/lib/sendWindow.ts) — ország → időzóna, az USA
  New York szerint, az ismeretlen/INT Budapest szerint). A küldő azt veszi előre
  a sorból, akinél épp munkaidő van: reggel a spanyol és magyar cégek, este az
  amerikaiak. Ha senkinél nincs, vár a legkorábbi nyitásig, és kiírja, hol és
  mikor (helyi idő + budapesti idő). A nyári időszámítás váltását is kezeli.
- **Munkaidőn kívül is**: az ablak kikapcsolva — éjjel és hétvégén is küld, a
  napi keretig. Megerősítést kér.
- **Teszt mód**: szintén ablak nélkül, de legfeljebb 3 levél indításonként.
  Kipróbáláshoz; szintén megerősítéssel.
- Minden levél után a sor **`elküldve` ÉS `kész`** állapotba kerül (zöld háttér),
  plusz `kikuldve-automata` címkét kap — nem kell kézzel a `Kész` gombra kattintani,
  és ugyanaz a cím soha nem kap kétszer.
- A küldött levelek listájában látod, mi ment velük: `📎 2 · kész ✓`.
- Három egymás utáni sikertelen küldés után **magától leáll** (rossz jelszó,
  limit vagy hálózat).
- A doboz mutatja: `ma 7/18 levél`, ki jön most, mennyi a következőig, és az
  utolsó 50 levél listáját. `Leállítás` bármikor.

**Költség: 0 Ft.** Ingyenes Gmail-fióknál a küldési keret ~500 címzett/nap, a napi
15-20 ennek a töredéke. Nyomkövetés (megnyitás-pixel, átirányított link) nincs a
levelekben — ez rontja a kézbesítést, és semmit nem ér.

## Levelezés (`/mail`)

A kiküldött jelentkezések, a rájuk érkező válaszok és a saját válaszaim — egy
helyen, szálakba fogva. A postafiók magánlevelezése **nem** kerül be: a szűrés
már a begyűjtésnél megtörténik ([`src/lib/inbox.ts`](src/lib/inbox.ts)).

A Gmailt IMAP-on olvassuk, **ugyanazzal az app-jelszóval, amivel küldünk** — nem
kell Google Cloud projekt, OAuth és pénz. A kapcsolat csak olvas: nem jelöl
olvasottnak, nem töröl, nem mozgat semmit.

**Mi számít idetartozónak.** Egy levél akkor kerül az adatbázisba, ha

1. a *Küldött elemek* mappában egy adatbázisbeli céghez ment (ez a megkeresés),
2. ugyanabban a Gmail-beszélgetésben van, mint egy ilyen megkeresés (`X-GM-THRID`) —
   így jön be a válasz, a saját viszontválaszom és a visszapattanó levél is,
3. vagy a feladó címe/domainje egy megkeresett cégé — ettől kerül a helyére az
   is, amit egy kolléga más címről küld ("Ihre Bewerbung", "Visszajelzés
   jelentkezés kapcsán").

A 3. pont mellé kell a zajszűrés: a cég domainjéről hírlevél és állásértesítő is
érkezik. A körlevélküldő postafiókokat (`allasertesito@`, `newsletter@`,
`noreply@` …) kihagyjuk, kivéve ha a tárgy szerint mégis a jelentkezésre
válaszolnak ("Automatische Antwort – Bitte bewerben Sie sich…"). A
`List-Unsubscribe` fejlécet viselő körleveleket is kiszórjuk.

**Napi levélforgalom (diagram).** Az oldal tetején két rétegű területdiagram
([`src/components/MailChart.tsx`](src/components/MailChart.tsx)): **hátul,
sárgával a kiküldött levelek, elöl, zölddel a visszaérkezett válaszok.** A
hátsó réteg adja a nagyságrendet, az elülső azt, ami tényleg érdekes. 14 / 30 /
90 napra váltható, egérrel egy nap fölé állva kiírja a pontos számokat. A
visszapattanó levél nem számít válasznak. Az adatot a `mail` gyűjteményből egy
`$group` adja napra és irányra bontva ([`dailyCounts`](src/lib/mailStore.ts)) —
nem a listából számoljuk.

**Szálak állapota** — ez a bal oldali lista szűrője is:

| Állapot | Mit jelent |
| --- | --- |
| `nincs válasz` | elment a megkeresés, azóta csend |
| `válasz jött` | válaszoltak, és **rajtam van a sor** |
| `válaszoltam` | a válaszuk után én írtam utoljára |
| `visszapattant` | kézbesíthetetlen (`mailer-daemon`) — a cím rossz |

A szabadság- és robotválasz (`Auto-Submitted`, „Automatikus válasz…") külön
jelölést kap, és **nem számít valódi válasznak** — különben a válaszarány
hazudna.

**Használat.** A `Frissítés a Gmailből` gomb behúzza az újakat. Az első futás a
`MAIL_SYNC_DAYS` (alap: 180) napot nézi végig, utána már csak az azóta érkezett
levelekkel dolgozik (mappánként eltárolt UID). Egy szálra kattintva látszik a
teljes levélváltás; a válaszok alá ragadt előzmény külön nyitható.

```bash
# opcionális, az alapértelmezés jó:
MAIL_SYNC_DAYS=180
```

## Telepítés Vercelre — mi megy és mi nem

A projekt fent van Vercelen (`melodia`, előnézeti telepítés), a hitelesítő adatok
a Vercel környezeti változói között vannak (`vercel env ls`). A dashboard, a
szűrés, az import és a levelezés-nézet ott is működik.

**A kiküldés Vercelen nem fut** — és ezt a kód is megakadályozza
([`src/lib/sendCampaign.ts`](src/lib/sendCampaign.ts), `SERVERLESS`):

- a serverless függvény a válasz elküldése után **leáll**, a 10-20 perces
  szünetekkel dolgozó menet tehát nem él tovább;
- a Hobby csomagon egy függvény legfeljebb **300 másodpercig** futhat;
- minden kérést más példány szolgálhat ki, így több példány folytatná ugyanazt
  a sort — az dupla levelet jelentene.

Ezért a `Kiküldés indítása` Vercelen hibaüzenetet ad, és a félbehagyott menetek
sem indulnak újra ott.

**A kiküldés a saját gépeden megy:** `npm run dev` (vagy `npm run build && npm
run start`), aztán a szokásos módon indítod a felületről. Ugyanaz az adatbázis,
tehát a felhős dashboardon is látszik, mi ment ki. A gépnek ébren kell lennie a
kampány alatt; a `campaigns` gyűjteménybe mentett állapot miatt egy leállítás
után ott folytatódik, ahol abbamaradt.

Amire még figyelj a felhős példánynál:

| Dolog | Állapot |
| --- | --- |
| MongoDB Atlas | a Vercel IP-i nincsenek fix tartományban → az Atlas *Network Access* listáján `0.0.0.0/0` kell |
| Csatolmányok (`attachments/`) | személyes fájlok, nincsenek a telepítésben (`.vercelignore`) |
| Claude / Codex keresés | nincs CLI a felhőben; ott csak az `openai` motor megy (`EMAIL_SEARCH_PROVIDER=openai`) |
| Gmail-begyűjtés (`/mail`) | a teljes átnézés percekig tart, a függvény időkorlátjába ütközhet — helyben futtasd |

## Kapcsolattartók: kinél érdemes jelentkezni

Az e-mail begyűjtés alatt egy második sáv: **`👤 Kapcsolattartók keresése (HR +
vezetés)`** ([`src/lib/peopleSweep.ts`](src/lib/peopleSweep.ts)). Ugyanaz a
működés — egyesével halad, a szerveren fut, leállítható, motor választható —,
csak mást keres.

**Mit keres.** Először **HR-t / toborzót / people-partnert**, és nem egyet:
amennyit talál. Ha HR-es egyáltalán nincs a cégnél, akkor a **vezetést** hozza
(CEO, ügyvezető, alapító, igazgató) — abból is annyit, ahány van. A titulusból
kategória lesz: `hr`, `vezetes`, `egyeb`
([`peopleRoles.ts`](src/lib/peopleRoles.ts) — `categorise`; külön fájl, mert a
felület is használja, és a `peopleFinder` a teljes Mongo-drivert behúzná).

**Hol jelenik meg.**

- A listában új **Emberek** oszlop: egy embernél a neve, többnél `3 fő`, és ha
  van köztük HR-es, `· HR` jelzéssel.
- A jelvényre kattintva nyílik a sidebar, benne **táblázat**: név + kategória,
  eredeti pozíció, LinkedIn / e-mail / forrás link, és soronként egy `Beírom`
  gomb, ami az adott embert teszi a sor kapcsolattartójává (név, pozíció,
  LinkedIn, és ha nincs még cím, az e-mail is).
- Több keresés **bővíti** a listát, nem írja felül: névre egyesítünk, és a
  hiányzó mezőket a frissebb adat tölti ki (`savePeople`).

**Szűrés:** `hasPeople` (van-e már ember) és `peopleSearched` (kerestünk-e már)
— a sweep alapból mindkettőt figyeli, tehát ugyanazt a céget nem keresi kétszer.

**Éles próba** (Booked4.us, Claude/Sonnet):

```
2 fő · 63 mp · 360 781 token · 12 kör
  [vezetes] Balogh Péter — ügyvezető
  [vezetes] Sirkó Vivien Inez — ügyvezető
  megjegyzés: HR/toborzó szerepkör sehol nem található, így a vezetés a cél.
```

> **Ez a keresés drágább, mint az e-mailes.** A LinkedIn bejelentkezés nélkül
> nem tölthető le, ezért itt a webkeresés kötelező, és a scrape-first sem tud
> segíteni: cégenként 300-400 ezer token reális. Adagolva futtasd.

### Ha az automata nem talál: kézi kutatás

A sidebarban, a táblázat alatt: **Kézi kapcsolattartó-kutatás**
([`src/lib/peoplePrompt.ts`](src/lib/peoplePrompt.ts)).

1. **`📋 Prompt másolása`** — a vágólapra kerül a kész kutatási prompt, a cég
   nevével kitöltve (4,1 ezer karakter, a cégnév 12 helyen). Ezt átviszed abba
   az eszközbe, ami épp jobban keres (ChatGPT, Perplexity, böngésző-ügynök).
2. **`Válasz beillesztése`** — a kapott JSON-t ide illeszted, `Mentés a céghez`.

A beolvasás elnéző a formával (kódblokk, körítő szöveg, `people` vagy
`profiles` kulcs, **Markdown-linkbe csomagolt URL** — `[url](url)`, `<url>` —,
`hu.linkedin.com` és `www.linkedin.com` egyaránt), de szigorú a tartalommal:

| Amit kihagy | Miért |
| --- | --- |
| név nélküli vagy 3 karakternél rövidebb sor | nem azonosítható |
| ugyanaz a név kétszer | duplikátum |
| nem `linkedin.com/in/…` link | cégoldal, poszt vagy keresési találat — nem személyes profil |

A cégnév-eltérést (a JSON más céget írt) nem dobja el, csak **kiírja** —
átnevezett cégeknél ez normális. A mentés a meglévő embereket **nem írja
felül**: névre egyesít, ugyanazon a `savePeople`-ön keresztül, mint az automata.

Próba (Booked4.us):

```
vágólap hossz: 4124 · cégnév benne: 12 ×
2 fő mentve — a soron most 4 kapcsolattartó van.
kihagyva: Rossz Link — a link nem személyes profil (…/company/chemaxon)
          név nélküli sor · Kiss Anna — kétszer szerepel
```

## Token-felhasználás (`/usage`)

A keresés a Claude/Codex CLI-n keresztül az **előfizetési keretből** megy, ezért
az a kérdés, hány keresés fér bele — nem az, hány dollár. Ez az oldal ezt méri
([`src/lib/usage.ts`](src/lib/usage.ts)).

Minden keresés végén elmentjük, mi fogyott: friss input, cache-írás,
cache-olvasás, output, körök száma, `WebSearch`/`WebFetch` hívások, idő, és amit
a CLI költségként mond. Két helyre kerül:

- a **`usage` gyűjteménybe** — ebből számol a `/usage` oldal (összesen, átlag
  keresésenként, átlag *talált címenként*, motor/modell szerinti bontás, napi
  fogyás, honnan indult: kézi / sweep / felvétel, és az utolsó 50 keresés),
- **a cég sorára** is, az `emailSearch.usage` mezőbe — így utólag látszik, melyik
  cég mennyibe került.

### Mérés: mi viszi el a keretet

Ugyanaz a keresés, ugyanazokkal a kapcsolókkal:

| Modell | Körök | Eszközhívás | Token | CLI szerinti költség | Idő |
| --- | --- | --- | --- | --- | --- |
| `opus` (korábbi alapértelmezés) | 15 | 4 keresés + 5 letöltés | 226 237 | $0,59 | 49 mp |
| `sonnet` (mostani alap) | 7 | 2 keresés + 3 letöltés | 216 678 | $0,40 | 48 mp |

A tanulság a mérésből: **a modellváltás az árat vitte le (-32%), a
tokenszámot alig** — mert a token nagy részét nem a mi promptunk adja, hanem a
CLI saját rendszerprompt-ja és a `WebFetch`-csel behúzott oldalak szövege, amit
minden kör újraolvas (a 216 ezerből 170 ezer cache-olvasás).

### Scrape-first: a keresések fele modell nélkül

Minden keresés **először modell nélkül** próbálkozik
([`src/lib/scrapeEmail.ts`](src/lib/scrapeEmail.ts)): letöltjük a cég saját
oldalát és a szokásos kapcsolati útvonalakat (`/kapcsolat`, `/contact`,
`/impressum`, `/karrier`…), a kezdőlapról kikeressük a valódi kapcsolati
linkeket, és regexszel kiszedjük a címeket. A jelölteket rangsoroljuk: karrier
és HR cím elöl, általános cím utána, `noreply` és adatvédelmi cím hátra.

**Csak akkor fogadjuk el, ha a cím a cég saját domainjén van** — idegen domainű
találatnál inkább jöjjön a modell, mert azt meg kell ítélni.

Húsz véletlen, még nem keresett cégen mérve:

| | Scrape | Modell (Sonnet) |
| --- | --- | --- |
| Találat (saját domain) | **40%** | 50% |
| Idő | **2 mp** | 46 mp |
| Token | **0** | 259 055 |

Kikapcsolható: `EMAIL_SCRAPE_FIRST="0"` az `atlas-credentials.env`-ben.

### Kemény korlátok a keresésen

A promptba írt kérés („legfeljebb 3 oldal") **nem működött** — a modell nem
tartotta be. Ami tényleg fog, az a CLI kapcsolója:

| Kapcsoló | Érték | Miért |
| --- | --- | --- |
| `--max-turns` | **10** (`CLAUDE_SEARCH_MAX_TURNS`) | a 12+ körös menetek a fogyás 46%-át vitték el, és **egy sem** talált címet |
| `--disallowedTools WebSearch` | ha ismerjük a weboldalt | az `--allowedTools` **nem** tiltó lista: mérve, a CLI a WebSearch-öt akkor is meghívta, ha nem szerepelt benne |
| `--disallowedTools ToolSearch` | mindig | fix eszközkészlettel dolgozunk; a keresgélése elvisz egy kört (mérve: 5 kör / 205 ezer token → 3 kör / 165 ezer token) |

A körkorlát elérése **nem hiba**: a CLI ilyenkor 1-es kóddal lép ki
`error_max_turns` alszakasszal, ezt „nem találtam cím"-ként vesszük, mentjük a
sorra, és a sweep megy tovább. (Enélkül három ilyen után leállt volna.)

### Korai feladás

A mérés szerint a 15+ körös keresések csak 29%-ban találnak címet, viszont a
teljes fogyás harmadát viszik el (8 keresés × 10+ kör, cím nélkül = 3,1M token).
Ezért a prompt kimondja: a cég saját oldalán kell kezdeni, legfeljebb 3 oldalt
tölthet le, és ha két letöltés után sincs nyom, `null`-lal kell zárni — a
„nem találtam" teljes értékű válasz.

### Export napra vagy időszakra

Az oldal tetején **Ettől / Eddig** dátumválasztó (+ `ma` · `7 nap` · `30 nap` ·
`90 nap` gyorsgombok), és három export a kiválasztott időszakra:

| Gomb | Mit ad |
| --- | --- |
| `Tételes CSV` | keresésenként egy sor: időpont, cég, contactId, motor, modell, honnan indult, lett-e cím, összes token, input / output / cache-írás / cache-olvasás, költség, körök, `WebSearch`/`WebFetch`, idő |
| `Tételes JSON` | ugyanaz nyers alakban, továbbdolgozásra |
| `Napi összesítő CSV` | naponta egy sor: keresés, találat, token, átlag token, költség, összidő |

A **napi fogyás listában a dátumra kattintva** az egész oldal arra az egy napra
szűkül, a sor végi `⭳` pedig azonnal letölti **annak a napnak** a tételes
exportját. A fájlnév a tartományt hordozza: `token-tetelek-2026-09-06.csv`
vagy `token-tetelek-2026-08-08_2026-09-06.csv`.

A tételes export nem a felületen látható 50 sorral dolgozik, hanem az időszak
összes tételével (`/api/usage?from=…&to=…&entries=1`).

A modell env-ből váltható, újraindítás nélkül nem kell kódhoz nyúlni:

```bash
CLAUDE_SEARCH_MODEL="sonnet"   # alap; "haiku" olcsóbb, "opus" pontosabb
```

## Hiányzó e-mail címek pótlása

Ha egy AI-kutatásból (lásd az `AI prompt` exportot) visszakapod a hiányzó címeket:

```bash
npm run emails -- valasz.md      # fájlból
pbpaste | npm run emails         # vagy vágólapról
```

A script bármilyen szövegből kiszedi a `**Cégnév** … valami@cim.hu` párokat, és **csak
azokhoz** írja be, amelyeknél jelenleg nincs cím (a meglévőket nem bántja). A beírt sorok
`kutatott-email` címkét kapnak, és `manualFields`-be kerülnek, tehát a Szinkronizálás
nem írja felül őket.

## API

| Metódus | Útvonal | Leírás |
| --- | --- | --- |
| `GET` | `/api/contacts?…` | Szűrt lista (`q`, `source`, `kind`, `channel`, `country`, `language`, `category`, `city`, `size`, `tag`, `hasEmail`, `emailSearched`, `sent`, `done`, `starred`, `sort`
(`default`, `newest`, `oldest`, `searched`, `company`, `company-desc`, `person`, `status`, `email`, `updated`), `facets=1`, `idsOnly=1` → csak az azonosítók a teljes szűrt halmazra) |
| `POST` | `/api/contacts` | Tömeges import: `{ contacts: Contact[] }` |
| `PATCH` | `/api/contacts` | Tömeges módosítás egy hívásból: `{ ids[], patch, source? }` → `{ matched, modified }` |
| `DELETE` | `/api/contacts` | Tömeges törlés: `{ ids: string[] }` → `{ deleted }` |
| `PATCH` | `/api/contacts/:id` | Állapot / tartalom módosítása |
| `POST` | `/api/contacts/:id` | Kézi szerkesztések eldobása, eredeti PDF-szöveg visszaállítása |
| `POST` | `/api/contacts/:id/generate` | OpenAI levéljavaslat (`{ instruction? }`) — **nem ment semmit** |
| `DELETE` | `/api/contacts/:id` | Törlés |
| `GET` | `/api/stats` | Összesítők |
| `POST` | `/api/sync` | Újraimportálás a `src/data` forrásokból |
| `POST` | `/api/contacts/[id]/find-email` | Egy cég publikus e-mailje a weben (`{ provider }`) |
| `GET/POST` | `/api/contacts/send-campaign` | Ütemezett kiküldés fiókonként: állapot (`accounts` + `campaigns`) / `start` / `stop` / `test` / `self-test` / `preview`, mind `accountId`-vel |
| `GET/POST` | `/api/contacts/sweep-people` | Kapcsolattartó-begyűjtés: állapot / `start` / `stop` |
| `GET/POST` | `/api/contacts/[id]/people` | Kézi kutatás: a kész prompt / a beillesztett JSON mentése |
| `POST` | `/api/contacts/:id/find-people` | Egy cég HR- és vezetői kapcsolattartói (`{ provider }`), mentéssel |
| `GET/POST` | `/api/contacts/sweep-emails` | Automatikus, egyesével haladó begyűjtés: állapot / `start` / `stop` |
| `POST` | `/api/contacts/bulk-template` | Tömeges szövegcsere sablonból: `{ ids[], field, template, language, mode }` |
| `POST` | `/api/contacts/find-emails` | Több cég, egy prompt: `{ ids[], provider }` → soronkénti találat |
| `GET` | `/api/usage` | Token-felhasználás: összesítés (`days`, vagy `from`+`to`), `entries=1` esetén az időszak minden tétele |
| `GET/POST` | `/api/history` | Változásnapló listázása / visszaállítás (`{ ids }`) |
| `GET` | `/api/mail` | Levélszálak (`status`, `q`, `limit`), napi bontás a diagramhoz (`days`, alap 30), vagy egy szál levelei (`threadId`) |
| `GET/POST` | `/api/mail/sync` | Gmail-begyűjtés állapota / indítása (`{ days? }`) |
| `GET` | `/api/debug/stream` | Élő naplófolyam (SSE) a /debug oldalnak |
| `POST` | `/api/convert` | Hunter CSV → lead JSON (nem ír adatbázisba) |
| `GET/POST` | `/api/contacts/enrich` | Hiányzó cégek felvétele névből + egyesével kutatás: állapot / `start` / `stop` |
| `POST` | `/api/contacts/check` | Cégnév-lista összevetése az adatbázissal: `{ names[] }` vagy `{ text }` → `{ found, missing, duplicates }` |
| `POST` | `/api/import` | JSON validálás (`mode: "preview"`) vagy írás (`mode: "apply"`) |

## Felépítés

```
src/
  app/                      oldalak (/ · /mail · /check · /import · /convert · /history · /debug)
  app/api/                  22 route: contacts, contacts/[id]/people, check, enrich,
                            send-campaign, sweep-emails, sweep-people, find-email(s),
                            find-people, bulk-template, mail, mail/sync, history, stats,
                            usage, import, convert, sync, debug/stream
  components/               Dashboard, ContactTable, FilterBar, MessagePanel, StatsBar,
                            SendPanel, SendPreview, SweepPanel, BulkTemplate, ImportPanel,
                            ConvertPanel, HistoryPanel, DebugConsole, ExportBar, Combobox,
                            MailApp, MailChart, CompanyCheck, EnrichPanel, UsagePanel,
                            PeopleSweepPanel
  components/CLAUDE.md      frontend szabályok (csak itt töltődik be)
  lib/                      env, mongodb, contacts, types, logger, export, mailto, name
  lib/CLAUDE.md             domain- és adapter-szabályok
  lib/accounts.ts           több Gmail-fiók (GMAIL_USER, _2 … _10)
  lib/mailer.ts             SMTP-küldés fiókonként, csatolmányokkal
  lib/sendCampaign.ts       ütemezett kiküldés fiókonként, mentett állapottal
  lib/attachments.ts        attachments/ mappa, nyelvi almappákkal
  lib/templates.ts          {{helyettesítők}} és alapszövegek a tömeges sablonhoz
  lib/inbox.ts              Gmail IMAP-begyűjtés (csak olvas)
  lib/mailStore.ts          levelek tárolása, szálak, napi bontás a diagramhoz
  lib/emailFinder*.ts       webes e-mail keresés: OpenAI API · Claude CLI · Codex CLI
  lib/cliQueue.ts           globális CLI-sor: egyszerre egy folyamat, memória-vészfékkel
  lib/emailSweep.ts         automatikus, egyesével haladó begyűjtés
  lib/scrapeEmail.ts        scrape-first: a cég oldaláról, modell nélkül
  lib/recipients.ts         kinek ment már levél: cím- és domain-duplikáció szűrése
  lib/peopleFinder*.ts      kapcsolattartó-keresés: HR + vezetés, LinkedIn-profillal
  lib/peopleRoles.ts        titulus → kategória (a felület is használja)
  lib/peoplePrompt.ts       kézi kutatás: prompt kifelé, beillesztett JSON befelé
  lib/peopleSweep.ts        kapcsolattartó-begyűjtés egyesével
  lib/usage.ts              token-fogyás mérése és összesítése (/usage)
  lib/companyMatch.ts       cégnév-aliasok (jogi forma és írásjelek nélkül)
  lib/companyLookup.ts      "megvan-e már?" ellenőrzés az aliases indexen
  lib/enrich.ts             névből felvétel + kutatás + levélgenerálás
  lib/csvImport.ts          CSV → lead sor, levélszöveggel
  lib/importSchema.ts       import-validálás, kulcsképzés, sablonok
  lib/history.ts            változásnapló (TTL 30 nap) és visszaállítás
  lib/hunter/               Hunter CSV konverter: rules, profile, classify, compose, convert
  instrumentation.ts        szerverindulás: félbehagyott kiküldés folytatása
  data/imported.json        a PDF-ekből generált, deduplikált adathalmaz

scripts/parse-pdfs.ts       PDF → JSON parser (npm run parse)
scripts/seed.ts             Atlas feltöltés (npm run seed)
scripts/apply-emails.ts     kutatott címek visszaírása (npm run emails)
scripts/backfill-aliases.ts cégnév-aliasok pótlása (npm run backfill-aliases)
scripts/backfill-size.ts    egyszeri migráció: size: null a régi sorokra
scripts/merge-duplicates.ts azonos cég sorainak összevonása (--apply)

.claude/                    harness: skillek, hookok, subagentek, permissionök
docs/HARNESS.md             mit miért csinál a harness
claudesetup.md              részletes beállítási útmutató a harness-hez
```

## Parancsok

| Parancs | Mit csinál |
| --- | --- |
| `npm run dev` | Fejlesztői szerver (3000). **A kiküldés is innen megy.** |
| `npm run build` / `start` | Éles fordítás és futtatás |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run seed` | Atlas feltöltés a `src/data` forrásokból |
| `npm run parse` | PDF-ek újraolvasása → `data/imported.json` |
| `npm run emails` | Kutatott e-mail címek visszaírása |
| `npm run backfill-aliases` | Cégnév-aliasok pótlása a régi sorokra |

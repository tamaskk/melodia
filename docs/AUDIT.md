# Melodia — teljes audit és fejlesztési terv

*Készült: 2026-09-22 · alap: a teljes kódbázis átnézése, élő mérések a helyi
példányon (Atlas, 133 322 sor), az éles Vercel-példány ellenőrzése és
képernyőképek (1440 px asztali, 390 px mobil).*

A dokumentum minden állítása mögött mérés vagy kódhely van. Ahol valamit nem
tudtam ellenőrizni, az külön jelölve.

---

## 1. Executive Summary

A Melodia **egyszemélyes hideg-megkereső rendszer**: cégeket gyűjt (PDF, CSV,
kézi lista), címet és kapcsolattartót keres hozzájuk (scrape + AI), személyre
szabott levelet generál, több Gmail-fiókról ütemezve kiküld, és a Gmailből
visszaolvassa a válaszokat. Nem álláshirdetésekre jelentkezik, hanem cégeket
keres meg. Ezért az audit a *megkeresési tölcsérre* optimalizál, nem egy
klasszikus job-board flow-ra.

**Ami erős:** szerveroldali szűrés és számolás egy lassú (M0) adatbázison, a
2300-szor gyorsabb aliasos cégkeresés, a visszavonható változásnapló, a
scrape-first címkeresés (40% találat token nélkül), a tokenmérés, az
adatbázisba mentett és újraindítás után folytatódó kampányok, a küldés előtti
előnézet és próbalevél, és a kézi kutatás, ha az automata nem talál.

**A legfontosabb 5 megállapítás:**

1. 🔴 **Az éles példány (`melodia-teal.vercel.app`) hitelesítés nélkül
   nyilvános.** Bárki kiolvashatja mind a 133 322 kontaktot és **358
   Gmail-szálat** (recruiterek válaszaival, harmadik felek személyes adataival).
   Írni és törölni is tud bárki, és a fizetős AI-végpontokat is hívhatja.
2. 🔴 **Duplikált küldés.** 14 címre már 2+ levél ment ki, további 19 címre a
   következő kampány újra küldene. 18 céges domainre összesen 42 levél ment.
3. 🔴 **A válaszok és a visszapattanások nem jutnak vissza a kontakt sorra.** A
   levelezés 83 választ és 9 visszapattanást ismer fel, a listán mégis egyik sem
   látszik (0 címkézett sor). Így follow-up, válaszarány szegmensenként és a
   rossz címek kiszűrése sem lehetséges.
4. 🟠 **Nincs igazi státuszmodell.** `sent` + `done` két átfedő logikai mező;
   hiányzik a válaszolt, interjú, elutasítva, visszapattant és „ne keresd” állapot.
5. 🟠 **A főoldalon a táblázat 1415 px-nél kezdődik.** Előtte 40 forrás-chip, 17
   gyorsszűrő, 13 legördülő és három mindig nyitott futtató panel áll. A napi
   munka helye a képernyő alatt van.

**Ha most kellene a legjobb verzióra fejleszteni, ez a sorrend:**
(1) az éles példány lezárása, ma → (2) duplikáció-szűrés a küldési sorban →
(3) a válasz és a bounce visszaírása + státuszmodell → (4) follow-up sor
jóváhagyással → (5) a főoldal átrendezése → (6) tesztek a kritikus logikára →
(7) külön worker-folyamat a hosszú futásokhoz → (8) AI-alapú prioritás és
válasz-osztályozás.

---

## 2. Current State Analysis

### Oldalak és funkciók

| Oldal | Mit csinál | Állapot |
| --- | --- | --- |
| `/` | Lista, szűrés, szerkesztés, tömeges műveletek, kiküldés, e-mail- és kapcsolattartó-begyűjtés | Működik, túlzsúfolt |
| `/mail` | Gmail-szálak, válaszarány, napi diagram | Működik, de **20 napja nem volt szinkron** (utolsó adat: 9.2.) |
| `/check` | Cégnevek beillesztése → megvan / hiányzik, felvétel + kutatás | Jó |
| `/import` | JSON/CSV import sémával és előnézettel | Jó |
| `/convert` | Hunter CSV → lead-sor | Jó |
| `/history` | Változásnapló, visszaállítás (TTL 30 nap) | Jó |
| `/usage` | Tokenfogyás, export | Jó |
| `/debug` | Élő napló (SSE) | Jó |

### Méret és szerkezet

- 21 374 sor TypeScript, 8 oldal, 22 API-route, **0 teszt**.
- A legnagyobb fájlok: `MessagePanel.tsx` 1202 sor (20 `useState`),
  `sendCampaign.ts` 844, `Dashboard.tsx` 840, `emailFinder.ts` 723,
  `contacts.ts` 713.
- A hosszú futások (kiküldés, két begyűjtés, felvétel) a Next szerverfolyamat
  memóriájában élnek, állapotuk Mongo-ba mentve.

### Mért számok

| Mérés | Érték |
| --- | --- |
| Főoldal betöltés (helyi, networkidle) | 2,4 s |
| Főoldal magassága / a táblázat teteje | 4703 px / **1415 px** |
| `/mail` oldalmagasság | **39 521 px** (358 szál egy oldalon) |
| Lista API, 50 sor | 171 KB (**3,4 KB/sor**) |
| Mobil (390 px) vízszintes túlcsordulás | **1089 px** széles tartalom |
| Konzolhiba az oldalakon | 0 |
| Válaszarány (Gmail szerint) | 24% (83 / 358) |

---

## 3. Critical Issues

### C1 — Az éles példány nyilvános, hitelesítés nélkül 🔴

**Bizonyíték** (hitelesítés nélküli `curl`, 2026-09-22):

```
GET https://melodia-teal.vercel.app/api/contacts?pageSize=1 → total 133322, company + primaryEmail + emailBody
GET https://melodia-teal.vercel.app/api/mail               → threads: 358 elem
GET https://melodia-teal.vercel.app/api/history            → HTTP 200
```

Nincs `proxy.ts` / middleware, és egyik route sem ellenőriz hívót. Bárki számára
elérhető:
- **Olvasás:** a teljes kontaktlista és a levelezés. Ez harmadik felek
  (recruiterek) személyes adata, GDPR-kockázat.
- **Írás:** `PATCH`/`DELETE /api/contacts/[id]`, `POST /api/import`,
  `/api/sync`, tömeges sablon.
- **Költség:** `/api/contacts/[id]/generate` és `find-email` OpenAI-kulccsal
  fut, bárki a te számládra hívhatja.
- A küldés Vercelen le van tiltva (`SERVERLESS` guard), ez jó.

**Javaslat:**
1. **Ma:** Vercel → Settings → Deployment Protection → *Standard Protection*
   (vagy jelszavas védelem). Ha a felhős példány nem kell, töröld a
   deploymentet.
2. **Utána:** `src/proxy.ts` egyetlen felhasználós védelemmel (HTTP Basic vagy
   aláírt süti) a `credential("APP_PASSWORD")` alapján, minden oldalra és
   `/api/*`-ra. Helyben is véd, ha a gép hálózaton elérhető.

**Impact:** Critical · **Effort:** S (1. lépés 5 perc, 2. lépés fél nap) · **Prioritás:** 🔴

### C2 — Ugyanarra a címre és cégre többször megy levél 🔴 → ✅ javítva (2026-09-22)

> **Javítva:** `src/lib/recipients.ts` — cím-, domain- és soron belüli
> duplikáció szűrése az indításkor, az előnézetben és közvetlenül minden küldés
> előtt; a testvérsorok jelölése kiküldéskor; fiókiroda-kapcsoló. A 21 meglévő
> kockázatos sor elküldöttnek jelölve (visszaállítható). Élő előnézet utána:
> `címre már ment: 0`.


**Bizonyíték** (Atlas-aggregáció):

```
azonos cím több soron:        96 cím, 204 sor
  ebből már 2+ levelet kapott: 14 cím
  egyszer ment, a másik sor még küldhető: 19 cím  ← a következő kampány újra küldi
ugyanarra a céges domainre:   18 domain, 42 levél
```

A `buildQueue()` (`src/lib/sendCampaign.ts`) csak a sor saját `sent` mezőjét és a
fiókok közti kiosztást nézi. Azt nem, hogy **erre a címre vagy domainre** ment-e
már levél más sorból (több forrásból importált cég, fiókiroda).

**Javaslat:**
- A sor építésekor egy aggregáció kigyűjti a már megkeresett címeket és
  domaineket (kisbetűsítve), és azokat kihagyja. Az előnézet külön mutassa:
  „kihagyva: már kapott levelet (N)”.
- Domainenként alapból 1 levél (a regionális irodáknál kapcsolóval felülírható).
- A küldéskor a testvérsorok is kapjanak `sent`-et és egy „másik soron ment”
  jelölést.

**Impact:** Critical (spam-besorolás, rossz benyomás) · **Effort:** S · **Prioritás:** 🔴

### C3 — A válasz és a visszapattanás nem jut vissza a kontakthoz 🔴 → ✅ visszaírás kész (2026-09-22)

> **Javítva:** `syncContactReplies()` (`src/lib/mailStore.ts`) minden Gmail-szinkron
> végén szálanként összesít, és kontaktonként írja a `repliedAt` / `bouncedAt`
> mezőt. Az első futás: 91 válaszolt, 24 visszapattant, és **37 sor pótlólag
> elküldött lett** (a Gmailben volt kimenő levél, a sor mégis nyitott volt — a
> kampány újra küldött volna nekik). Nyitva marad: 40 megválaszolt szál nem
> köthető kontakthoz (más címről jött válasz), és a szinkron még kézi (C4).


**Bizonyíték:** a `mail` gyűjteményben 358 szál van, ebből 327 kontakthoz
kötve (`contactId`), 9 visszapattant. A kontakt soron viszont **0** válasz- vagy
bounce-jelölés van: az `inbox.ts` olvassa a kontaktokat, de nem ír vissza.

Következmények:
- A visszapattant címre a rendszer újra küldhet, mert a címe „érvényes”.
- A listán nem látszik, ki válaszolt. A follow-up és a szegmensenkénti
  válaszarány nem számolható.
- A „Kész” és az „Elküldve” nem mondja meg, hol tart a megkeresés.

**Javaslat:** a szinkron végén egy `bulkWrite` a kontaktokra:
`replyStatus: "valaszolt" | "visszapattant" | null`, `repliedAt`, `bouncedAt`.
A visszapattant sor `primaryEmail`-je kerüljön `invalidEmails[]`-be, és a
küldési sor zárja ki. Költség: egyetlen kötegelt írás szinkronkönként.

**Impact:** Critical · **Effort:** M · **Prioritás:** 🔴

### C4 — A levelezés-szinkron kézi, és 20 napja nem futott 🟠 → ✅ javítva (2026-09-22)

> Automatikus, növekményes szinkron indulás után 1 perccel, aztán 30 percenként (`MAIL_AUTO_SYNC_MINUTES`), közös állapottal; a `/mail` fejléce mutatja az utolsó futást. A futó dev szerveren újraindítás után kapcsol be.


A diagram szerint 9.2. óta nincs új adat. Közben szeptember 10–11-én 44 levél
ment ki, az a diagramon nem látszik. A válaszarány és a „rám vár” szám így
elavult.

**Ellenőrizendő (nem tudtam eldönteni):** a `/mail` fejlécén a „Válasz jött 83”
és a „Rám vár 83” pontosan egyezik. Ez vagy azt jelenti, hogy egyik válaszra sem
feleltél, vagy azt, hogy a saját válaszaidat nem ismeri fel. Egy konkrét szálon
érdemes megnézni.

**Javaslat:** helyi ütemezett szinkron (a szerver indulásakor és 30 percenként,
az `instrumentation.ts`-ből, csak nem-serverless környezetben), plusz „utolsó
szinkron: X perce” jelzés a fejlécben. A Vercel-cron már kiesett, ez helyben fut,
ahogy kérted.

**Impact:** High · **Effort:** S · **Prioritás:** 🟠

---

## 4. UX Audit

| # | Probléma | Javaslat | Impact | Effort | Prio |
| --- | --- | --- | --- | --- | --- |
| U1 ✅ | **Javítva (2026-09-22): 1415 → 467 px.** ~~A táblázat 1415 px-nél kezdődik.~~ Előtte: 40 forrás-chip (3 sor), 17 gyorsszűrő, 13 legördülő, küldő panel, két begyűjtő sáv. | Forrás-haladás egy összecsukható „Források” blokkba (vagy a Forrás legördülőbe, soronként haladással). Szűrők: kereső + 6 leggyakoribb chip + „További szűrők” fiók. A három futtató panel nyugalomban egysoros státuszsáv, kattintásra nyílik. **Cél: a táblázat 500 px alatt kezdődjön.** | High | M | 🟠 |
| U2 ✅ | **Javítva (2026-09-22): 5 gomb → Megnyitás + Kész + ⋯, oszlop 470 → 226 px.** ~~Soronként 5 gomb~~ (Küldés, Tárgy, Üzenet, Összes, Kész) egy 470 px-es oszlopban. A másoló gombok ritkák, de mindig látszanak. | Egy elsődleges gomb (Megnyitás) + „Kész” pipa + ⋯ menü. A másolás a panelben van, ott maradjon. | High | S | 🟠 |
| U3 ✅ | **Javítva (2026-09-22): globális menü (Kontaktok · Levelezés · Beszerzés ▾ · Rendszer ▾ · ⚙ Beállítások).** ~~A navigációban keveredik a beállítás és a navigáció:~~ a motorválasztó (OpenAI/Claude/Codex) és a „Levelező app / Gmail” (a mailto-cél) a 10 oldal-link mellett áll. Három levelezés-szerű elem van (Levelező app, Gmail, Levelezés), és a Napló meg a Debug is közel azonos. | Csoportosított navigáció: **Kontaktok · Levelezés · Beszerzés** (Ellenőrzés, Import, Hunter CSV) · **Rendszer** (Tokenek, Napló/Debug összevonva, Szinkron). A motor és a mailto-cél egy Beállítások menübe, és oda, ahol használod (begyűjtő sáv, panel). | High | S | 🟠 |
| U4 ✅ | **Javítva (2026-09-22): `stage` (levezetett) + Státusz oszlop + Válaszolt / Válaszarány csempe.** ~~Két átfedő státusz:~~ „Kész” (663) és „Elküldve” (549). Nem egyértelmű, melyik mit jelent, és a „Kész” mellett „0% a teljes listából” áll (663 / 133 322 → 0%). | Egy `stage` mező (lásd F1) és egy státusz-oszlop színes badge-dzsel. A csempék a szűrt listához viszonyítsanak, és legyen köztük **Válaszolt** és **Válaszarány**. | High | M | 🟠 |
| U5 ✅ | **Javítva (2026-09-22): `formatNumber()` (`src/lib/format.ts`), `useGrouping: "always"`.** ~~Számformázás:~~ `133322`, `3126` ezres tagolás nélkül (a csempéken). Máshol `133 322`. | Mindenhol `toLocaleString("hu")`. | Low | S | 🟢 (quick win) |
| U6 ✅ | **Javítva (2026-09-22): teszt mód (max. 3, megerősítéssel) + címzett-időzóna (`sendWindow.ts`).** ~~A „munkaidőn kívül is” pipa egy kattintás, és az egész éjszakás küldést engedi** (így ment ki 44 levél 21:01 és 07:52 között). | Pipa helyett „Teszt mód (max. 3 levél)” kapcsoló, vagy megerősítő ablak: „Éjjel is küld, N levél, a címzett helyi idejében HH:MM-kor”. Az ablak a **címzett országának időzónájában** értendő. | High | S | 🟠 |
| U7 | **A „rám vár” szálakra nincs teendő-lista.** A 83 megválaszolatlan válasz a `/mail` listájában keveredik a többivel. | „Teendők” doboz a főoldal tetején: új válasz (N), esedékes follow-up (N), visszapattant (N), kész begyűjtés. Kattintásra szűrt nézet. | High | M | 🟠 |
| U8 ✅ | **Javítva: 39 521 → 1 545 px, a lista saját görgetéssel, a részlet mellette.** **A `/mail` oldal 39 521 px magas:** a 358 szál az oldal görgetésével jön, a jobb oldali részlet elgörgetődik. | A bal lista saját görgethető konténer (`h-[calc(100vh-…)] overflow-auto`), lapozással vagy virtualizálással. A részlet ragadós (`sticky`). | Medium | S | 🟡 |
| U9 ✅ | **Javítva: betöltés-sáv + halványítás, egy üres állapot „Szűrők törlése” gombbal, „🔎 kerestem, nincs cím”.** **Üres és betöltési állapotok:** a táblázat „🔎 nincs találat” szövege az e-mail oszlopban mást jelent (a keresés nem talált címet), mint egy üres szűrési eredmény. Szűrésváltáskor nincs skeleton, a régi sorok maradnak. | Üres szűrésnél: „Nincs ilyen sor — [Szűrők törlése]”. Betöltéskor halványított táblázat + vékony progress sáv a fejléc alatt. | Medium | S | 🟡 |
| U10 ✅ | **Javítva: j/k, Enter/o, x, d, /, Esc, ? + súgó.** **Nincs billentyűzetes munka** egy tipikusan ismétlődő, soronkénti átnézésnél. | `j/k` következő/előző sor, `Enter` panel, `x` kijelölés, `d` kész, `/` keresés. | Medium | S | 🟡 |
| U11 ✅ | **Javítva: Űrlapos jelentkezés blokk a panelen (8 másolható mező, Beküldtem ✓), `src/lib/profile.ts`.** **Az űrlapos cégek (75 sor, „csak űrlap”) nincsenek kiszolgálva.** Ma kézzel kell kitölteni mindet, a szükséges adatok szétszórva. | „Űrlapos jelentkezés” nézet: a cég űrlapja új lapon + egy másolható adatcsomag (név, e-mail, telefon, LinkedIn, CV-link, rövid bemutatkozás, a cégre szabott motiváció). Utána egy gomb: „Beküldtem” → `stage = elküldve (űrlap)`. | High | S–M | 🟠 |
| U12 ✅ | **Javítva: `RunMessage` piros hibadoboz + szűrt naplólink; a rögtön elszálló futás hibája is látszik.** **Hibaüzenetek:** a legtöbb emberi mondat (jó), de a hosszú futások hibája csak a naplóban látszik részletesen. | A futtató sáv „hiba” állapotában az utolsó hiba szövege + „Napló megnyitása” link a szűrt sorokra. | Low | S | 🟢 |

**Ami jól működik (UX), nem kell hozzányúlni:** a küldés előtti előnézet és a
próbalevél magadnak; a Shift-os tartomány-kijelölés és az „összes szűrt sor
kijelölése”; a változásnapló visszaállítással; a panelen a keresés indoklása és
forrása; a gyorsszűrők és a legördülők egymással szinkronban.

---

## 5. UI / Design Audit

| Terület | Megállapítás | Javaslat | Prio |
| --- | --- | --- | --- |
| **Információs hierarchia** ✅ *(javítva 2026-09-22: fejléc + Műveletek + Teendők · keret nélküli számok · egyetlen keretes munkafelület · export keret nélkül)* | Minden egyforma súlyú keretes doboz: csempék, chipek, szűrők, panelek. Semmi nem mondja meg, mi a fő művelet. | Három szint: (1) fejléc + teendők, (2) munkafelület (szűrő + táblázat), (3) másodlagos (futtatók, források) összecsukva. Keret csak a munkafelületen. | 🟠 |
| **Túlzsúfolt** ✅ *(mérve 2026-09-22: táblázat 427 px, 14 látható szűrő-vezérlő, 3 gomb/sor, 226 px műveleti oszlop)* | Főoldal a táblázat előtt; a sorok műveleti oszlopa; a szűrő 30 vezérlője. | Lásd U1, U2. | 🟠 |
| **Túl üres** ✅ *(`/check`: „Minta kipróbálása” + „mit kapsz” üres állapot; `/import` sablon és `/convert` példa már volt)* | `/check`, `/import`, `/convert`, `/debug` 900 px-en fél képernyő üres, a leírás kevés. | Rövid „mit kapsz” példa az üres állapotban (pl. minta cégnévlista a `/check`-en egy kattintással). | 🟢 |
| **Tipográfia** ✅ *(mérve: a `--muted` kontrasztja 6,15–7,32:1, WCAG AA teljesül — nem kellett világosítani; 67 db 9–10 px-es szöveg → 11 px)* | Sok 10 px-es, nagybetűs, halvány címke (`text-[10px] uppercase text-[var(--muted)]`). Sötét háttéren a kontraszt a WCAG AA alatt valószínű (nem mértem). | A címkék legyenek 11–12 px-esek, a `--muted` legyen világosabb. Mérés: axe vagy Lighthouse a főoldalon. | 🟡 |
| **Színek, badge-ek** ✅ *(a soron csak a státusz színes; 5 szín + szürke; forrás, emberek, Kész, cégnév semleges)* | Sok szín konkurál: kék (elsődleges), zöld (kész, e-mail), borostyán (küldve), lila (emberek), cián (begyűjtés). A „Kész” sor zöld bal szegélye és zöld gombja duplán jelez. | Egy státusz-paletta a `stage`-re (5–6 szín), a többi semleges. A soron csak a státusz-badge színes. | 🟡 |
| **Következetesség** ✅ *(`src/components/ui.ts`; mérve: minden gomb/mező 32 vagy 36 px, 8 px lekerekítés)* | A gombstílus, a magasság (`h-8`/`h-9`/`h-10`) és a lekerekítés oldalanként eltér. A számok formázása is (U5). | 3 gombvariáns (primary, secondary, ghost) és 2 méret egy `Button` komponensben. A `Select` és az input magassága egységes. | 🟡 |
| **Mobil** ✅ *(táblázat → kártyalista mobilon; minden oldal 390 px széles; a menüsáv hamburger helyett két sorba tördel)* | A főoldal 1089 px széles tartalommal csordul túl (a navigáció és a táblázat). A `/mail` mobilon rendben van (390 px). | Mobilon csak a `/mail` és a kontakt panel számít (válaszok olvasása útközben). Navigáció hamburgerrel, a táblázat mobilon kártyalista (cég, státusz, cím). | 🟡 |
| **Táblázat** ✅ *(Kapcsolat + Emberek → „Kapcsolattartó”)* | A „Kapcsolat” oszlop az IT-cégeknél szinte mindig „—”; az „Emberek” oszlop külön áll. | A kettő összevonva: „Kapcsolattartó” (név vagy „N fő · HR”). | 🟢 |
| **Diagram (`/mail`)** ✅ *(7 napos gördülő válaszarány, jobb tengely, kerek negyedek)* | Jó, érthető, a rétegzés (küldve hátul, válasz elöl) működik. | Marad. Egy „válaszarány %” vonal hasznos lenne jobb tengelyen. | 🟢 |

---

## 6. Application Flow Audit

A tényleges tölcsér, lépésenként. Mellette, mi működik, mi hiányzik, és hol
lehet kattintást spórolni.

| Lépés | Ma | Hiány / friction | Javaslat |
| --- | --- | --- | --- |
| **1. Cégek beszerzése** ✅ *(domain-egyeztetés az importnál: Összevonás / Új iroda / Kihagyás; célzott lekérdezés a teljes lista áthúzása helyett)* | PDF-import, CSV (Hunter), `/check` névlistából, `/import` | Az azonos cég több forrásból külön sor lesz (96 duplikált cím). Van egy összevonó script, de csak kézzel fut. | Import közben domain-alapú egyezés: meglévő cégre „összevonás / új iroda” választás. |
| **2. Kutatás** ⚖️ *(mérve 2026-09-22: a 128 839 nem keresett sorból csak 48-nak nincs weboldala — a weboldal-lépés nem éri meg; a valódi költség a modelles keresés, átl. 318 ezer token, 23% találat → T5)* | Felvétel + kutatás (`/check`), scrape-first + AI címkeresés, kapcsolattartó-keresés, kézi prompt | A kapcsolattartó-keresés 300–400 ezer token/cég. Weboldal nélküli soroknál is fut. | Lásd T5 (token). Weboldal nélküli sor előbb „weboldal-keresés” lépést kap (olcsó), csak utána címet. |
| **3. Priorizálás** ✅ *(A2)* | Nincs. A sorrend forrás + cégnév. | A 2363 IT-cégből nem tudod, melyik 50-nel érdemes kezdeni. | Illeszkedési pontszám (lásd A2). Alapértelmezett rendezés: pontszám szerint. |
| **4. Levél** ✅ *(központi profil: `src/lib/profile.ts`, 7 fájl olvas belőle; a kimenő szövegek betűre azonosak — 14 kimenet összevetve)* | Sablon + AI személyre szabás, nyelv szerint, csatolmányok nyelvi mappából | A profiladatok (név, tapasztalat, stack) **5+ fájlban vannak beégetve** (`templates.ts`, `openai.ts`, `csvImport.ts`, `importSchema.ts`, `name.ts`). Egy váltás = 5 helyen szerkesztés. | Központi profil (`src/lib/profile.ts` vagy egy Mongo `settings` dokumentum), minden sablon és prompt innen olvas. |
| **5. Jóváhagyás** ✅ *(F4)* | Előnézet (első N címzett), próbalevél | Az előnézet nem jelzi: duplikált cím vagy domain, visszapattant cím, általános postafiók (info@), nyelvi eltérés (magyar levél osztrák cégnek). | „Küldés előtti ellenőrzés” lista az előnézet tetején (F4). |
| **6. Küldés** ✅ *(címzett-időzóna; felfuttatás 10 → 20 → 30/nap hetente, `src/lib/warmup.ts`; CV-link opció a csatolmány helyett, `CV_URL`-lel)* | Fiókonkénti ütemezett SMTP, napi keret, szünet, munkaidő-ablak, leállítás (az adatbázis-jelzővel már megbízható) | Az ablak a szerver idejét nézi, nem a címzettét. Első levélben PDF-csatolmány egy személyes Gmailből (kézbesíthetőség). Nincs fiókonkénti felfuttatás (warm-up). | Címzett-időzóna; felfuttatás (pl. 10 → 20 → 40/nap hetente); opció: első levélben link a CV-re csatolmány helyett (A/B mérhető). |
| **7. Követés** ✅ *(C3 visszaírás + C4 automatikus szinkron)* | `/mail` (kézi szinkron) | Nem ír vissza (C3), nem fut magától (C4). | C3 + C4. |
| **8. Follow-up** ✅ *(F2)* | **Nincs** | 76% nem válaszol, egy udvarias follow-up tipikusan a legolcsóbb többletválasz. | F2. |
| **9. Válaszkezelés** ✅ *(A3 + F1)* | Szál olvasása a `/mail`-en | Nincs osztályozás (interjú, elutasítás, kérdés, automatikus válasz), nincs státuszváltás. | A3 + F1. |
| **10. Interjú** | **Nincs** | — | F7 (később). |

**Regisztráció, profil, admin:** egyfelhasználós, helyben futó eszközről van
szó, ezért regisztráció és jogosultsági szintek **nem kellenek**. Egy
hozzáférés-védelem kell (C1) és egy profil/beállítások oldal (F6).

---

## 7. Job Application Flow Optimization

A cél: **a felhasználó naponta egy helyen, egy listán hagyjon jóvá, minden más
fusson magától.**

### A javasolt napi munkamenet (≈ 15 perc)

1. Megnyitod a főoldalt. A **Teendők** doboz mutatja: 4 új válasz, 12 esedékes
   follow-up, 2 visszapattant cím, 25 új cég kész levéllel.
2. **Új válaszok:** mindegyik mellett az AI-osztályozás (interjú / kérdés /
   elutasítás / automatikus) és egy válaszpiszkozat. Jóváhagyod vagy szerkeszted.
   A státusz magától vált.
3. **Follow-upok:** a szálban maradó, 3–4 mondatos piszkozatok listája.
   „Mind jóváhagyása” vagy soronként.
4. **Új cégek:** pontszám szerint rendezve, a küldés előtti ellenőrzés zöld.
   „Kampányba” → a küldő a munkaidő-ablakban, a címzett idejében kiküldi.
5. **Űrlapos cégek:** a másolható adatcsomaggal 1–2 perc/cég.

### Ami ehhez kell, és ami már megvan

| Képesség | Van? | Teendő |
| --- | --- | --- |
| Automatikus adatkitöltés a profilból | Részben (sablonban beégetve) | Központi profil (F6) |
| CV-ből adatkinyerés | Nem kell | A CV a te fix dokumentumod; a profil egyszer kitöltve jobb, mint minden futásnál kinyerni. |
| Cover letter / levélgenerálás | ✅ | Marad; bővítés: a cég nyitott pozíciójára hivatkozás (A1) |
| Álláshirdetés elemzése | Nincs | A cég karrieroldalának nyitott fejlesztői pozíciói (A1) — ez a te tölcséredben az „álláshirdetés”. |
| Job-to-profile matching | Nincs | Illeszkedési pontszám (A2) |
| Hiányzó adatok felismerése | ✅ (e-mail/kapcsolattartó állapot-szűrők) | Marad |
| Űrlap előtöltése | Nincs | Másolható adatcsomag (U11); automata beküldést **nem** javaslok (törékeny, captcha, ÁSZF). |
| Státusz automatikus kezelése | Nincs | C3 + F1 + A3 |
| Follow-up emlékeztető | Nincs | F2 |
| Recruiter-kommunikáció támogatása | Nincs | A3 |
| Interjú-előkészítés | Nincs | F7 |
| Tömeges kezelés | ✅ (kijelölés, bulk sablon, bulk update) | Marad |
| Duplikátum-felismerés | Részben (alias-egyezés importnál) | C2 + import-összevonás |
| Jelentkezés előtti ellenőrzés | Részben (előnézet) | F4 |

---

## 8. Automation Opportunities

A `állás megtalálása → elemzés → matching → előkészítés → jóváhagyás →
jelentkezés → tracking → follow-up → interjú` lánc, kategóriánként:

### Teljesen automatizálható

| Folyamat | Hogyan | Megvan? |
| --- | --- | --- |
| Gmail-szinkron | 30 percenként helyben (C4) | ✅ kész (indításkor és az első oldalbetöltéskor bekapcsol) |
| Válasz / bounce visszaírása | szinkron végén `bulkWrite` (C3) | ✅ kész |
| Visszapattant cím kizárása | duplikáció-szűrés + előnézeti figyelmeztetés | ✅ kész |
| Duplikált cím/domain kihagyása | queue-építéskor (C2) | ✅ kész |
| Scrape-first címkeresés | ✅ | Van |
| Nyelv meghatározása | ✅ (ország szerint) | Van |
| Automatikus válaszok (szabadság, no-reply) kiszűrése | fejléc + szöveg-szabály | Részben (`auto` jelölés van) |
| „Utolsó szinkron”, statisztika | a `/mail` fejléce | ✅ kész |

### Részben automatizálható (a gép előkészít, te ránézel)

| Folyamat | Hogyan |
| --- | --- |
| Címkeresés AI-val, ha a scrape nem talált | ✅ Van, költséghatárokkal |
| Kapcsolattartó-keresés | ✅ Van; token-optimalizálás kell (T5) |
| Levél személyre szabása | ✅ Van |
| Illeszkedési pontszám | A2 — automatikus, de a súlyokat te állítod |
| Follow-up piszkozat | F2 — generált, jóváhagyásra vár |
| Válasz-osztályozás + piszkozat | A3 |
| Űrlapos jelentkezés adatcsomagja | U11 |

### Kötelező manuális jóváhagyás

| Folyamat | Miért |
| --- | --- |
| Első levél kiküldése (kampányindítás) | A neved megy ki; a hibás tömeges küldés visszafordíthatatlan. |
| Follow-up kiküldése | Ugyanaz. |
| Válasz recruiternek | Tartalmi döntés (időpont, fizetés). |
| Kézi kutatásból jött emberek mentése | Már így van ✅ |
| Törlés, összevonás | Visszavonható ugyan (history), de adatvesztés-kockázat. |

---

## 9. AI Opportunities

Csak ott, ahol tényleg manuális munkát vált ki.

| # | Use case | Kiváltott munka | Megvalósítás | Költség | Prio |
| --- | --- | --- | --- | --- | --- |
| A1 | **Nyitott pozíció a cég karrieroldalán** | Ma kézzel nézed meg, van-e fejlesztői állás. | A scrape-first már letölti a karrier- és kapcsolatoldalt: `careersUrl` + a talált pozíciócímek mentése (regex/szabály előbb, AI csak összefoglalóra, Haiku). A levél hivatkozhat a konkrét pozícióra. | Alacsony (a lapok már megvannak) | 🟠 |
| A2 ✅ | **Illeszkedési pontszám** (cég ↔ profil) — *kész: `src/lib/score.ts`, 16 szabály, az adatbázis számolja, alapértelmezett rendezés* | 2363 cégből kézi válogatás | Objektív tényezők: stack-egyezés (TS/React/Node/Angular/NestJS a weboldalon vagy a pozíciókban), méret, Budapest/remote, nyitott pozíció, válaszarány a hasonló szegmensben. Szabályalapú pontozás + AI csak a stack-kinyerésre. Az indoklás is látszódjon („+3 TypeScript, +2 nyitott pozíció”). | Alacsony–közepes | 🟠 |
| A3 ✅ | **Válasz-osztályozás és piszkozat** — *kész: `src/lib/replyTriage.ts`, `RepliesPanel`* | Minden válasz elolvasása, státusz kézi állítása | Haiku osztályoz: interjú / kérdés / elutasítás / későbbre / automatikus. `stage` beállítása + válaszpiszkozat a szálban. | Alacsony (rövid szövegek) | 🟠 |
| A4 ✅ | **Follow-up szöveg** — *sablon, az eltelt időhöz igazítva* | Kézi megírás | 3–4 mondat, az eredeti levélre és a cégre hivatkozva, ugyanabban a szálban (`In-Reply-To`). | Alacsony | 🟠 |
| A5 ✅ | **Token-hatékony címkeresés** — *kész más úton (2026-09-22): a CLI `--tools` kapcsolója csak a szükséges eszközök definícióját tölti be; mért keresés 36 ezer token (eddigi átlag 318 ezer, −89%). A „csak validálás” mód most kevesebbet hozna.* ~~(„csak validálás”)~~ | — (költség) | A modell a scrape jelöltjeiből választ, `WebFetch` nélkül; `WebFetch`-plafon; weboldal nélküli sor kihagyása. Mért kiugrás: 41 WebFetch / 403 ezer token egy keresésben. | Csökkenti | 🟠 |
| A6 ✅ | **Interjú-brief** — *kész: `src/lib/interviewBrief.ts`, a panelen interjú státusznál* | Felkészülés | Cégkutatás + a te leveled + a szál → 1 oldalas brief: mit csinál a cég, kivel beszélsz, 5 várható kérdés, 3 kérdés tőled. | Közepes | 🟡 |
| A7 | **Tárgysor-változatok** | — | Szegmensenként 2 tárgy váltakozva, a válaszarány méri. | Alacsony | 🟢 |

**Amit nem javaslok:** CV-optimalizálás AI-val (a CV fix, emberi döntés),
„jelentkezési esély” becslés (nincs elég adat, félrevezető szám lenne),
automatikus űrlap-kitöltés böngészővel (törékeny, ÁSZF-kockázat).

---

## 10. New Feature Suggestions

### F1 — Státusz-életút (`stage`)
- **Probléma:** `sent`/`done` átfedő, nincs válaszolt / interjú / elutasítva / visszapattant / ne keresd.
- **Működés:** egy mező: `uj → kesz → elkuldve → valaszolt → interju → ajanlat | elutasitva | nem-aktualis | visszapattant | ne-keresd`. A szinkron (C3) és az osztályozó (A3) állítja, kézzel felülírható. Státusz-oszlop, szűrő, csempék.
- **Fejlesztés:** típus + migráció (`sent`/`done` → `stage`), szűrő, badge, szinkron-visszaírás.
- **Komplexitás:** M · **Érték:** nagyon magas · **Prio:** 🟠 (a C3-mal együtt)

### F2 — Follow-up sor → ✅ kész (2026-09-22, `src/lib/followup.ts`, `FollowUpPanel`)
- **Probléma:** 76% nem válaszol; nincs második érintés.
- **Működés:** `elkuldve` és N munkanap (alap: 7) válasz nélkül → a follow-up sorba kerül. Generált rövid szöveg, **ugyanabban a Gmail-szálban** (`In-Reply-To`/`References` a mentett `messageId`-re). Jóváhagyás után a meglévő ütemező küldi. Legfeljebb 1 follow-up/cég.
- **Fejlesztés:** `followUpDueAt`, sor-nézet, szálbeli küldés a `mailer.ts`-ben (a `messageId` már mentve van a naplóban), sablon.
- **Komplexitás:** M · **Érték:** magas · **Prio:** 🟠

### F3 — Teendők doboz → ✅ kész (2026-09-22: új válasz, visszapattant, esedékes follow-up, küldhető, űrlapos, nem keresett)
- **Probléma:** nincs „mi a következő lépésem” nézet.
- **Működés:** a főoldal tetején számok: új válasz, esedékes follow-up, visszapattant, űrlapos cég, kész begyűjtés. Kattintásra szűrt lista.
- **Komplexitás:** S (a szűrők megvannak) · **Érték:** magas · **Prio:** 🟠

### F4 — Küldés előtti ellenőrzés → ✅ kész (2026-09-22, `src/lib/preflight.ts`)
- **Működés:** az előnézet tetején piros/sárga lista: duplikált cím vagy domain, visszapattant cím, általános postafiók, üres helyettesítő, nyelvi eltérés, hiányzó csatolmány, nincs generált levél. Kattintásra szűrés a problémás sorokra.
- **Komplexitás:** S–M · **Érték:** magas · **Prio:** 🟠

### F5 — Szegmens-analitika
- **Probléma:** nem tudod, melyik ország, méret, nyelv, forrás vagy tárgysor hozza a választ.
- **Működés:** `/mail` vagy `/usage` mellett egy tábla: szegmensenként küldve / válasz / arány / interjú. A C3 után szinte ingyen van (aggregáció).
- **Komplexitás:** S · **Érték:** közepes–magas · **Prio:** 🟡

### F6 — Profil és beállítások oldal
- **Probléma:** a profiladatok 5+ fájlban beégetve; a küldési alapértékek (keret, szünet, ablak) minden indításnál a panelen.
- **Működés:** `/settings`: profil (név, évek, stack, linkek, aláírás), fiókonkénti keret és felfuttatás, alapértelmezett csatolmányok nyelvenként, alapértelmezett motor és modell.
- **Komplexitás:** M · **Érték:** közepes · **Prio:** 🟡

### F7 — Interjú-nézet
- **Működés:** `stage = interju` soroknál: időpont (naptár-link), a brief (A6), jegyzetek, a teljes szál.
- **Komplexitás:** M · **Érték:** közepes (ritkább, de nagy tét) · **Prio:** 🟢

### F8 — Asztali értesítés
- **Működés:** a helyi szinkron új válasznál böngésző-értesítést küld (Notification API), a fülön számláló `(3) Melodia`.
- **Komplexitás:** S · **Érték:** közepes · **Prio:** 🟢

---

## 11. Technical Improvements

| # | Probléma | Javaslat | Impact | Effort | Prio |
| --- | --- | --- | --- | --- | --- |
| T1 | **0 teszt.** A két legsúlyosabb hiba (a leállítás, amely nem állított meg, és a duplikált küldés) tesztelhető, tiszta logikán múlt. | Vitest a domainre (Chicago School): `buildFilter` (állapot-szűrők partíciója), `buildQueue` dedupe, `parseManualPeople`, `cleanUrl`, `categorise`, `stage`-levezetés, időablak. A Mongo mögé egy vékony port, vagy `mongodb-memory-server`. | High | M | 🟠 |
| T2 | **Hosszú futások a Next folyamatban.** HMR és több modulpéldány alatt törékeny (ebből lett a párhuzamos küldő). Szerverre telepítve is a webfolyamattal együtt hal meg. | Külön worker (`npm run worker`, egy Node-folyamat): a jobok a Mongo-ban (`jobs` gyűjtemény, státusz, `lockedBy`, `heartbeatAt`), a Next csak létrehoz és olvas. Egy helyen van a CLI-sor, a küldés és a begyűjtés. | High | L | 🟡 (előtte T1) |
| T3 | **Duplikált kód:** `SweepPanel`/`PeopleSweepPanel` (~330 sor, szinte azonos), `emailSweep`/`peopleSweep`, a keresők OpenAI/Claude/Codex hármasa kétszer. | `<RunPanel>` + `useRunState(endpoint)`; `createSweep({ select, find, save })` generikus futtató; egy `runModel(provider, prompt, schema)` adapter. | Medium | M | 🟡 |
| T4 | **Óriás komponensek:** `MessagePanel` 1202 sor / 20 state, `Dashboard` 840. | `MessagePanel` → `ContactForm`, `EmailSearchCard`, `PeopleTable`, `ManualResearch`, `MessageTabs`. A `Dashboard` szűrő-állapota egy `useContactQuery` hookba (URL-szinkronnal, így a szűrés megosztható vagy könyvjelzőzhető). | Medium | M | 🟡 |
| T5 | **Token:** a kapcsolattartó-keresés 300–400 ezer token/cég; egy címkeresés kiugróan 41 WebFetch / 403 ezer token. | „Csak validálás” mód, WebFetch-plafon, Haiku triázs, weboldal nélküli sorok kihagyása (a korábbi terv 3. lépése). | Medium | M | 🟠 |
| T6 | **Profiladatok beégetve** 5+ fájlban. | F6. | Medium | S | 🟡 |
| T7 | **Hibakezelés:** a route-ok egységesen `{ error }`-t adnak (jó), de nincs validált bemenet (a body típus-kasztolva). | `zod` sémák a POST/PATCH bodyra (egy `parseBody(schema)` segéd); a hibás bemenet 400 + mező-szintű üzenet. | Medium | S–M | 🟡 |
| T8 | **ADR-ek:** a nagy döntések (Mongo-alapú futásállapot, scrape-first, `globalThis`-registry, a Vercelen tiltott küldés) csak a README-ben. | `docs/adr/`-be Nygard-formátumban, egyenként 10 perc. | Low | S | 🟢 |

---

## 12. Performance Improvements

| # | Mérés | Javaslat | Prio |
| --- | --- | --- | --- |
| P1 | A lista API 50 sorra 171 KB (3,4 KB/sor): a teljes `emailBody`, `emailSearch` (citációk, alternatívák), `people` is jön. Az Atlas ~100 KB/s-en ez másodperceket jelent Vercelről. | Lista-projekció (cég, cím, státusz, emberek száma, forrás, 1–2 jelző); a részletek a panel megnyitásakor egy `GET /api/contacts/[id]`-vel. Várható: ~25 KB/50 sor. | 🟡 |
| P2 | Szűrésváltáskor a facet-ek (6× `distinct`) mindig újraszámolódnak (`facets=1` fixen a `toQuery`-ben). Helyben +25–150 ms. | Facet csak betöltéskor és importkor, 5 perces szerveroldali memo. | 🟢 |
| P3 | `/mail`: 358 szál egyszerre renderelve (39 521 px). | Lapozás (50/lap) vagy virtualizálás (U8). | 🟡 |
| P4 | Az állapotlekérdezések nyugalomban már nem pollolnak ✅ (a múlt heti javítás). | Marad. | — |
| P5 | Indexek: az állapot-szűrők (`emailSearchedAt`, `people.0`, `peopleSearchedAt`) a forrás-szűrővel gyorsak; forrás nélkül 133 ezer soron teljes átnézés lehet. | `explain()` a három leggyakoribb kombinációra; ha COLLSCAN, akkor összetett index `{ source, primaryEmail, emailSearchedAt }`. | 🟢 |

---

## 13. Security Considerations

| # | Kockázat | Javaslat | Prio |
| --- | --- | --- | --- |
| S1 | **Nyilvános éles példány** (C1): adat, levelezés, írás, költség. | Deployment Protection ma, `proxy.ts` utána. | 🔴 |
| S2 | **Kiszivárgott Gmail app-jelszavak:** korábban két app-jelszó látszott egy beillesztett képernyőképen. | Ha még nem történt meg: mindkettőt visszavonni a Google fiókban, újat generálni, az `atlas-credentials.env`-ben és a Vercel env-ben cserélni. | 🔴 (ha még aktív) |
| S3 | **GDPR:** 133 ezer kontakt, benne személyneves sorok és recruiter-levelezés, nyilvánosan elérhető volt. | S1 után: napló-áttekintés a Vercelen (ki hívta a `/api/*`-ot), a sorokon „ne keresd” lehetőség (F1), és egy rövid adatkezelési jegyzet a levél aljára (kérésre törlöm). | 🟠 |
| S4 | **Költség-visszaélés:** az AI-végpontok hitelesítés nélkül hívhatók. | S1 + napi költségplafon az OpenAI-projekten. | 🟠 |
| S5 | **Titokkezelés** ✅: egyetlen fájl, a hook blokkolja, a logger maszkol. | Marad. | — |
| S6 | **Kézbesíthetőség és fiókvédelem:** 40 levél/nap személyes Gmailből, PDF-csatolmánnyal, éjjel is. A Google ezt letilthatja. | Felfuttatás (warm-up), címzett-időzóna, első levélben link a PDF helyett (mérve), `List-Unsubscribe` fejléc egy válasz-címmel. | 🟠 |

---

## 13b. Menet közben talált: az Atlas-kvóta 🔴 → részben javítva

Az M0 512 MB-os kvótájából **463 MB** volt foglalt (adat 286 MB + indexek 177 MB).
A legnagyobb tétel egy **nem használt** teljes szöveges index volt (115 MB — a
kereső reguláris kifejezéssel dolgozik). Eldobva, a kódból is kivéve:
**463 → 348 MB**. Nyitva: a `contacts` átlagos dokumentuma 2,2 KB (a teljes
`emailSearch`-napló és a levélszövegek); ha tovább nő, a régi keresési naplók
(`emailSearch.citations`) ritkítása a következő lépés. Egyetlen 133 ezer soros
`updateMany`-t az Atlas előre elutasít — a tömeges módosítás forrásonként fut.

## 14. Prioritized Improvement List

### 🔴 Critical
- **C1 / S1** — Az éles példány lezárása (Deployment Protection, majd `proxy.ts`).
- **S2** — Az app-jelszavak cseréje, ha még aktívak.
- **C2** — Duplikált cím és domain kizárása a küldési sorból.
- **C3** — A válasz és a bounce visszaírása a kontaktra; visszapattant cím kizárása.

### 🟠 High
- **F1** Státusz-életút · **F2** Follow-up sor · **F3** Teendők doboz · **F4** Küldés előtti ellenőrzés
- **C4** Helyi, ütemezett Gmail-szinkron + „utolsó szinkron” jelzés
- **U1** A főoldal átrendezése (táblázat 500 px alatt) · **U2** Sorműveletek → 1 gomb + menü · **U3** Navigáció csoportosítása
- **U6** Éjszakai küldés helyett teszt mód, címzett-időzóna · **U11** Űrlapos jelentkezés adatcsomag
- **A1** Nyitott pozíciók a karrieroldalról · **A2** Illeszkedési pontszám · **A3** Válasz-osztályozás · **A5/T5** Token-optimalizálás
- **T1** Tesztek a kritikus logikára · **S3, S4, S6**

### 🟡 Medium
- **U8** `/mail` saját görgetés · **U9** Üres és betöltési állapotok · **U10** Billentyűparancsok
- **F5** Szegmens-analitika · **F6** Profil és beállítások
- **T2** Külön worker · **T3** Duplikáció megszüntetése · **T4** Komponens-bontás · **T7** Bemenet-validáció
- **P1** Lista-projekció · **P3** `/mail` lapozás
- UI: hierarchia, tipográfia/kontraszt, színpaletta, gomb-egységesítés, mobil

### 🟢 Low
- **U5** Számformázás · **U12** Hiba a futtató sávon · **F7** Interjú-nézet · **F8** Asztali értesítés
- **A7** Tárgysor-változatok · **P2** Facet-memo · **P5** Index-ellenőrzés · **T8** ADR-ek
- Üres oldalak példával, oszlop-összevonás (Kapcsolat + Emberek)

---

## 15. Quick Wins

Kis munka, azonnal érezhető. Mind egy-két órán belüli.

| Teendő | Idő | Hatás |
| --- | --- | --- |
| Vercel Deployment Protection bekapcsolása | 5 perc | Megszűnik a nyilvános adatszivárgás |
| Duplikált cím/domain kiszűrése a `buildQueue`-ban + az előnézetben „kihagyva: N” | 1–2 óra | Nem megy több dupla levél |
| „Munkaidőn kívül is” → megerősítés vagy teszt mód (max. 3) | 30 perc | Nincs több éjszakai kampány |
| Csempék: ezres tagolás, a szűrt listához viszonyított %, Válaszarány csempe | 30 perc | Értelmes számok |
| Sorműveletek: 5 gomb → Megnyitás + Kész + ⋯ | 1 óra | Tisztább táblázat, keskenyebb oszlop |
| A forrás-chipek összecsukása, a futtató panelek alapból zárva | 1 óra | A táblázat ~600 px-szel feljebb kerül |
| `/mail` bal lista saját görgetéssel | 20 perc | Nem vész el a részlet |
| Helyi szinkron indításkor + 30 percenként | 1 óra | Friss válaszarány és „rám vár” |

---

## 16. Development Roadmap

### Phase 1 — Quick Wins és biztonság (1 hét)
1. C1/S1 lezárás (ma), S2 jelszócsere.
2. C2 duplikáció-szűrés.
3. §15 összes tétele.
4. T1 első kör: tesztek a `buildQueue`-ra és a szűrőkre (a C2 előtt vagy vele együtt).

### Phase 2 — Fontos fejlesztések (2–3 hét)
1. C3 visszaírás + F1 státusz-életút (egy menetben, közös migrációval).
2. C4 ütemezett szinkron + F3 Teendők doboz.
3. U1–U3 főoldal és navigáció átrendezése.
4. F4 küldés előtti ellenőrzés, U11 űrlapos nézet.
5. `proxy.ts` hitelesítés, T7 validáció.

### Phase 3 — Automatizáció és AI (3–4 hét)
1. F2 follow-up sor (szálbeli küldés) + A4 szöveg.
2. A3 válasz-osztályozás és piszkozat.
3. A1 nyitott pozíciók + A2 illeszkedési pontszám → alapértelmezett rendezés.
4. A5/T5 token-optimalizálás.
5. F5 szegmens-analitika (a C3-adatra építve).

### Phase 4 — Haladó (utána)
1. T2 külön worker-folyamat (szerveres telepítés előtt kötelező).
2. T3/T4 refaktor.
3. F6 profil és beállítások, F7 interjú-nézet (A6 brief), F8 értesítés.
4. A7 tárgysor-kísérletek, mobil kártyanézet.

---

## 17. Long-term Ideas

- **Tanuló prioritás:** a szegmens-analitika (F5) visszacsatolva az illeszkedési
  pontszámba. Ahol nagyobb a válaszarány, oda előbb menjen levél.
- **Kapcsolattartónak címzett levél:** ha van HR-es neve és címe (a people
  keresésből), a levél neki szóljon név szerint, ne az info@-nak. Jelenleg a
  `people[].email` ritkán van kitöltve. Mérendő, hogy a nevesített levél jobb-e.
- **LinkedIn-lépés a tölcsérben:** a panel már generál LinkedIn-üzenetet és
  kapcsolatkérést. Egy „LinkedIn-sor” (küldés kézzel, a rendszer követi a
  státuszt) a nem válaszoló cégeknél második csatorna.
- **Szerveres telepítés:** a T2 worker után egy kis VPS (Docker, `next start` +
  worker), a Vercel csak olvasó felületként, hitelesítve.

---

## Összefoglaló táblázat

| # | Javaslat | Kategória | Impact | Effort | Priority |
| - | -------- | --------- | ------ | ------ | -------- |
| 1 | Éles példány lezárása (Deployment Protection → `proxy.ts`) | Security | Critical | S | 🔴 Critical |
| 2 | Gmail app-jelszavak cseréje (ha még aktívak) | Security | Critical | S | 🔴 Critical |
| 3 | Duplikált cím/domain kizárása a küldésből | Functionality | Critical | S | 🔴 Critical |
| 4 | Válasz és bounce visszaírása, rossz cím kizárása | Functionality | Critical | M | 🔴 Critical |
| 5 | Státusz-életút (`stage`) | Product | High | M | 🟠 High |
| 6 | Follow-up sor szálbeli küldéssel | Automation | High | M | 🟠 High |
| 7 | Teendők doboz | UX | High | S | 🟠 High |
| 8 | Küldés előtti ellenőrzés | Functionality | High | S–M | 🟠 High |
| 9 | Helyi ütemezett Gmail-szinkron | Automation | High | S | 🟠 High |
| 10 | Főoldal átrendezése (táblázat 500 px alatt) | UX | High | M | 🟠 High |
| 11 | Sorműveletek: 1 gomb + menü | UX/UI | High | S | 🟠 High |
| 12 | Navigáció csoportosítása, beállítások kivétele | UX | High | S | 🟠 High |
| 13 | Éjszakai küldés helyett teszt mód, címzett-időzóna | Functionality | High | S | 🟠 High |
| 14 | Űrlapos jelentkezés adatcsomag | Workflow | High | S–M | 🟠 High |
| 15 | Nyitott pozíciók a karrieroldalról | AI | High | M | 🟠 High |
| 16 | Illeszkedési pontszám és rendezés | AI | High | M | 🟠 High |
| 17 | Válasz-osztályozás és piszkozat | AI | High | M | 🟠 High |
| 18 | Token-optimalizálás (validálás, plafon, Haiku) | AI/Cost | Medium | M | 🟠 High |
| 19 | Tesztek a kritikus logikára | Technical | High | M | 🟠 High |
| 20 | Kézbesíthetőség: felfuttatás, link a PDF helyett | Security/Deliverability | High | S–M | 🟠 High |
| 21 | `/mail` saját görgetés és lapozás | UX/Performance | Medium | S | 🟡 Medium |
| 22 | Üres és betöltési állapotok | UX | Medium | S | 🟡 Medium |
| 23 | Billentyűparancsok | UX | Medium | S | 🟡 Medium |
| 24 | Szegmens-analitika | Analytics | Medium | S | 🟡 Medium |
| 25 | Profil és beállítások oldal | Product/Tech | Medium | M | 🟡 Medium |
| 26 | Külön worker-folyamat | Technical | High | L | 🟡 Medium |
| 27 | Duplikált kód megszüntetése | Technical | Medium | M | 🟡 Medium |
| 28 | `MessagePanel`/`Dashboard` bontása | Technical | Medium | M | 🟡 Medium |
| 29 | Bemenet-validáció (zod) | Technical | Medium | S–M | 🟡 Medium |
| 30 | Lista-projekció (171 → ~25 KB) | Performance | Medium | S–M | 🟡 Medium |
| 31 | UI: hierarchia, kontraszt, paletta, gombok, mobil | UI | Medium | M | 🟡 Medium |
| 32 | Számformázás a csempéken | UI | Low | S | 🟢 Low |
| 33 | Interjú-nézet és brief | Product/AI | Medium | M | 🟢 Low |
| 34 | Asztali értesítés új válaszra | Notification | Medium | S | 🟢 Low |
| 35 | Tárgysor-változatok mérése | AI/Analytics | Low | S | 🟢 Low |
| 36 | Facet-memo, index-ellenőrzés | Performance | Low | S | 🟢 Low |
| 37 | ADR-ek | Technical | Low | S | 🟢 Low |

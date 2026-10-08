# Grokbot ↔ Melodia

A Melodia kiad egy céget, amihez még nincs e-mail cím, a Grokbot kikutatja a
kapcsolatokat a weben, és visszaírja az eredményt. Ez a dokumentum két részből
áll:

1. **A két API** — mit kérsz, mit kapsz, mi történik az adatbázisban.
2. **A kutatás szisztematikája** — milyen sorrendben, milyen forrásokból és
   milyen szabályokkal keressen a bot kapcsolatot egy céghez.

A 2. rész önállóan is megáll: egy az egyben bemásolható a bot utasításai közé.

---

## 1. rész — A két API

### Áttekintés

| | Útvonal | Mit csinál |
| --- | --- | --- |
| Kiadás | `GET /api/bot/next` | Visszaad **egy** céget, aminek nincs e-mail címe, és még sosem kerestünk hozzá. Nem ír semmit. |
| Mentés | `POST /api/bot/save` | Elmenti a kutatás eredményét a cégre. Ettől a cég kikerül a sorból. |

- **Kulcs, token, fejléc nem kell.** A mentésnél egyetlen fejléc kötelező:
  `Content-Type: application/json`.
- Az alap-URL: **`https://melodia-j2db.vercel.app`** (éles, a bot ezt hívja).
  Saját gépen, fejlesztéshez: `http://localhost:3000`.
- Minden válasz JSON. Hiba esetén `{ "error": "…" }` jön, magyar szöveggel,
  ami megmondja, mit kell javítani.

A ciklus:

```
┌─► GET /api/bot/next ──► contact == null? ──► igen: kész, állj meg
│            │
│            ▼ nem
│     kutatás a weben (2. rész)
│            │
│            ▼
└── POST /api/bot/save   (MINDIG, akkor is, ha semmit nem találtál)
```

A sorból egy cég attól tűnik el, hogy a mentés rákerül. **Ha a bot mentés
nélkül kér újat, ugyanazt a céget kapja vissza.** Ezért minden kiadott cégre
kell egy mentés — a „nem találtam semmit" is eredmény.

---

### 1.1 `GET /api/bot/next` — a következő cég

#### Kötelező, kikapcsolhatatlan szűrő

A válaszban lévő cégre mindig igaz:

- nincs elsődleges e-mail címe (`primaryEmail` üres), **és**
- még sosem futott rá e-mail keresés (`emailSearchedAt` üres).

Ezt a hívó nem tudja felülírni: a `hasEmail`, `emailSearched` és `emailStatus`
szűrőt az útvonal figyelmen kívül hagyja, akármit küldesz bennük.

#### Szűrők

Ugyanazok, mint a felület szűrősávjában. Mind elhagyható; az `all` érték és az
üres szöveg azt jelenti, hogy „nincs szűrés".

| Mező | Érték | Jelentés |
| --- | --- | --- |
| `q` | szabad szöveg | Keresés cégnévben, névben, pozícióban, jegyzetben, városban, címkékben. |
| `country` | `HU`, `DE`, `AT`, `CH`, `GB`, `US`, `NL`, … `INT` | Ország (kétbetűs kód). |
| `city` | pl. `Budapest` | Város, pontos egyezés. |
| `size` | `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1001-5000`, `5001-10000`, `10000+`, `ismeretlen` | Létszámsáv. |
| `kind` | `it-company`, `agency`, `recruiter`, `company-leader` | A sor fajtája. |
| `category` | `it-company`, `agency`, `inhouse`, `general`, `leadership` | Kategória. |
| `source` | pl. `it-companies-hu` | Forráslista azonosítója. |
| `tag` | pl. `prioritas-magas`, `folyamatos-toborzas` | Egy címke, pontos egyezés. |
| `language` | `hu`, `en` | A megkeresés nyelve. |
| `channel` | `email`, `linkedin`, `both` | Tervezett csatorna. |
| `contactStatus` | `found`, `missing`, `unsearched`, `none` | Van-e kapcsolattartó; `unsearched` = nincs, és nem is kerestük. |
| `hasPeople` | `yes`, `no` | Van-e megtalált ember a soron. |
| `peopleSearched` | `yes`, `no` | Futott-e már kapcsolattartó-keresés. |
| `stage` | `uj`, `kesz`, `elkuldve`, `valaszolt`, `visszapattant`, … | Hol tart a megkeresés. |
| `outcome` | `none` | Csak az, aminek nincs kézi kimenetele. |
| `sent`, `done`, `starred` | `yes`, `no` | Kiküldve / lezárva / csillagozva. |
| `reply` | `new` | Kezeletlen válasz van rajta. |
| `followUp` | `due`, `approved` | Esedékes follow-up. |
| `sort` | lásd lent | Melyik cég jön először. |
| `skip` | `0`, `1`, `2`, … | Ennyi céget átugrik a sor elejéről. |

**Rendezés (`sort`)** — ez dönti el, melyik *egy* céget kapod. Alapértelmezés:
`score`, vagyis a legjobban illeszkedő cég jön először.

`score` · `default` (forrás, majd cégnév) · `company` · `company-desc` ·
`newest` · `oldest` · `updated` · `status` · `person` · `email` · `searched` ·
`sent-oldest`

**`skip`** — két esetre való: ha egy cég mentése tartósan elbukik, a bot
`skip=1`-gyel átléphet rajta; és ha több bot fut egyszerre, mindegyik más
`skip` értékkel kér (lásd „Korlátok").

#### Hogyan küldd a szűrőket

Két egyenértékű forma van.

**a) GET, a szűrők a query-ben:**

```bash
curl "https://melodia-j2db.vercel.app/api/bot/next?country=HU&size=51-200"
```

**b) POST, a szűrők JSON body-ban:**

```bash
curl -X POST "https://melodia-j2db.vercel.app/api/bot/next" \
  -H "Content-Type: application/json" \
  -d '{"country":"HU","size":"51-200","tag":"prioritas-magas"}'
```

> **GET kérés body-ja nem működik.** A Next.js a GET kérések törzsét nem adja
> át a kezelőnek (és a legtöbb HTTP-kliens és proxy is eldobja), ezért a GET
> body-ban küldött szűrő hatás nélkül marad — szűretlen céget kapnál. Ha
> body-ban akarod küldeni a szűrőket, **POST**-ot használj ugyanerre az
> útvonalra; a viselkedés azonos, a POST sem ír semmit. Ha query és body is
> jön, a body nyer.

#### Válasz

```json
{
  "contact": {
    "_id": "6a84c25e373abedad2f7a31a",
    "key": "it-companies-hu:nix",
    "company": "NIX",
    "website": "https://nixstech.com",
    "domain": "nixstech.com",
    "linkedinUrl": null,
    "country": "HU",
    "city": "Budapest",
    "size": "1001-5000",
    "kind": "it-company",
    "category": "it-company",
    "language": "en",
    "channel": "email",
    "source": "it-companies-hu",
    "tags": ["hu", "it-company", "nincs-email", "prioritas-magas"],
    "note": "Profil: NIX is a custom software development company … LinkedIn: https://www.linkedin.com/company/nix-europe",
    "person": null,
    "role": null,
    "primaryEmail": null,
    "emails": [],
    "score": 7,
    "aliases": ["nix"],
    "emailSubject": "…",
    "emailBody": "…",
    "sent": false,
    "done": false,
    "starred": false,
    "createdAt": "2026-08-18T20:36:45.296Z",
    "updatedAt": "2026-08-18T20:36:45.296Z"
  },
  "remaining": 146
}
```

- `contact` — a cég **teljes** sora, ahogy az adatbázisban van, semmi nincs
  kihagyva belőle.
- `remaining` — hány cég felel meg ugyanennek a szűrésnek (ezt a céget is
  beleszámolva).
- Ha elfogyott a sor: `{ "contact": null, "remaining": 0 }`, **200-as**
  státusszal. Ez nem hiba, hanem a leállás jele.

A kutatáshoz fontos mezők:

| Mező | Mire jó |
| --- | --- |
| `_id` | **Ezt kell visszaküldeni mentéskor** `id` néven. |
| `company`, `aliases` | A cég neve és kereshető alakjai. |
| `website`, `domain` | A cég oldala — ha megvan, innen indul a kutatás. Lehet `null`. |
| `linkedinUrl` | A cég LinkedIn-oldala. Lehet `null`. |
| `country`, `city` | Az azonosításhoz: azonos nevű cégek megkülönböztetése. |
| `size` | Meghatározza, kit érdemes keresni (lásd 2. rész). |
| `note` | Amit már tudunk a cégről. Gyakran benne van a LinkedIn-cégoldal linkje is. |
| `person`, `role` | Ha van már ismert kapcsolattartó. |

#### Hibák

| Státusz | Mikor |
| --- | --- |
| `400` | A body nem érvényes JSON objektum, vagy a `skip` nem nemnegatív egész. |
| `500` | Adatbázis-hiba. Várj, és próbáld újra. |

---

### 1.2 `POST /api/bot/save` — az eredmény mentése

```bash
curl -X POST "https://melodia-j2db.vercel.app/api/bot/save" \
  -H "Content-Type: application/json" \
  -d '{ "id": "6a84c25e373abedad2f7a31a", "email": "jobs@nixstech.com", … }'
```

#### Kérés

Csak az `id` kötelező. Minden más elhagyható — amit nem találtál, azt hagyd ki
vagy küldd `null`-ként.

```json
{
  "id": "6a84c25e373abedad2f7a31a",

  "email": "jobs@nixstech.com",
  "confidence": "high",
  "source": "https://nixstech.com/careers",
  "alternatives": [
    { "email": "info@nixstech.com", "source": "https://nixstech.com/contact", "label": "általános cím" }
  ],
  "applyUrl": "https://nixstech.com/careers/apply",
  "notes": "A karrieroldalon van jobs@ cím; a kapcsolat oldalon általános info@.",
  "citations": ["https://nixstech.com/careers", "https://nixstech.com/contact"],

  "website": "https://nixstech.com",
  "linkedinUrl": "https://www.linkedin.com/company/nix-europe",

  "people": [
    {
      "name": "Kiss Anna",
      "role": "Senior Technical Recruiter",
      "linkedinUrl": "https://www.linkedin.com/in/kiss-anna",
      "email": null,
      "source": "https://www.linkedin.com/in/kiss-anna",
      "note": "budapesti iroda"
    }
  ],
  "peopleNotes": "1 toborzót találtam, vezetőt nem sikerült a céghez kötni.",

  "model": "grok-4"
}
```

| Mező | Típus | Jelentés és ellenőrzés |
| --- | --- | --- |
| `id` | szöveg, **kötelező** | A `contact._id` a `/api/bot/next` válaszából. |
| `email` | szöveg \| `null` | A legjobb cím, amire jelentkezni lehet. Kisbetűsítjük; formailag hibás címet eldobunk. |
| `confidence` | `high` \| `medium` \| `low` | Mennyire biztos, hogy a cím ehhez a céghez tartozik. Hiányzó vagy ismeretlen érték = `low`. |
| `source` | URL \| `null` | Az az oldal, ahol a címet **leírva láttad**. `http(s)://` kezdetű legyen. |
| `alternatives` | tömb | Minden további cím, amit láttál: `{ email, source, label }`. A `label` mondja meg, mire való. Duplikátumot és a fő címmel egyezőt kiszűrünk. |
| `applyUrl` | URL \| `null` | Jelentkezési űrlap vagy karrieroldal, ha e-mail nincs (vagy mellette). |
| `notes` | szöveg | 1–2 mondat magyarul: mit találtál, mit nem, miért. A felületen ez látszik a cégnél. |
| `citations` | URL-tömb | A megnyitott oldalak. Csak `http(s)` URL marad meg, legfeljebb 20. |
| `website` | URL | A cég hivatalos oldala. **Csak akkor írjuk be, ha a soron még nincs.** |
| `linkedinUrl` | URL | A cég LinkedIn-**cégoldala**. Csak akkor írjuk be, ha a soron még nincs. |
| `people` | tömb | Megtalált emberek (lásd lent). Ha a mező hiányzik, az emberekhez nem nyúlunk. |
| `peopleNotes` | szöveg | Megjegyzés az emberkereséshez. |
| `model` | szöveg | A bot / modell neve, a nyomkövetéshez. Alapértelmezés: `grokbot`. |

**Egy ember (`people[]`):**

| Mező | Jelentés és ellenőrzés |
| --- | --- |
| `name` | Teljes név. 3 karakternél rövidebb név nélkül a sort kihagyjuk. |
| `role` | Az eredeti titulus, ahogy a profilon áll. Ebből számoljuk a kategóriát: HR / vezetés / egyéb. |
| `linkedinUrl` | Csak **személyes** profil (`linkedin.com/in/…`). Cégoldal, keresési találat → `null` lesz belőle. |
| `email` | Csak ha leírva láttad. Egyébként `null`. |
| `source` | Az oldal URL-je, ahol az embert láttad. |
| `note` | Rövid megjegyzés (iroda, nyelv, miért releváns). |

Egy mentés legfeljebb **12 embert** vesz át, egy név csak egyszer szerepelhet.

#### Mi történik mentéskor

1. **A keresés nyoma mindig rákerül a sorra** (`emailSearchedAt`, a teljes
   eredmény az `emailSearch` mezőben). Ettől a cég többé nem jön vissza a
   `/api/bot/next`-ből — akkor sem, ha `email: null` ment.
2. **A cím akkor lesz a cég elsődleges címe** (`primaryEmail`), ha mind a négy
   igaz:
   - formailag érvényes,
   - a soron még nincs cím,
   - a `confidence` `high` vagy `medium`,
   - a `source` érvényes `http(s)` URL.

   Ilyenkor a sor megkapja a `van-email` és `kutatott-email` címkét, a
   jegyzet végére pedig odakerül a forrás.
3. **Ha bármelyik feltétel nem teljesül, a cím nem vész el**: javaslatként
   megmarad a keresés eredményében, a felületen a „javasolt cím" szűrő alatt
   látszik, és kézzel elfogadható. A válasz `emailRejected` mezője megmondja,
   melyik feltételen bukott el.
4. **A `website` és `linkedinUrl`** csak hiányzó mezőt tölt ki, meglévőt nem ír
   felül.
5. **Az emberek** hozzáadódnak a sor meglévő embereihez: név szerint
   egyesítünk, a frissebb adat nyer, de egy korábban ismert LinkedIn-link vagy
   e-mail nem vész el egy hiányosabb találattól. Ha `people` jön (akár üres
   tömbként), az emberkeresés is megtörténtnek számít a soron; ha a mező
   hiányzik, az emberkeresés állapota érintetlen marad.
6. A sorra írt mezőmódosítások a változásnaplóba (`/history`) „grokbot"
   forrással kerülnek be.

#### Válasz

```json
{
  "ok": true,
  "id": "6a84c25e373abedad2f7a31a",
  "company": "NIX",
  "searchedAt": "2026-10-04T10:55:38.072Z",
  "email": "jobs@nixstech.com",
  "emailSaved": true,
  "emailRejected": null,
  "fields": ["primaryEmail", "tags", "note", "linkedinUrl"],
  "people": 1
}
```

| Mező | Jelentés |
| --- | --- |
| `email` | Az ellenőrzésen átment cím (`null`, ha nem jött vagy hibás volt). |
| `emailSaved` | `true`, ha a cím a cég elsődleges címe lett. |
| `emailRejected` | Ha jött cím, de nem lett elsődleges: az ok. Egyébként `null`. |
| `fields` | A sorra ténylegesen beírt mezők. |
| `people` | Hány ember van a soron a mentés után; `null`, ha a kérés nem hozott `people` mezőt. |

#### Hibák

| Státusz | Mikor | Teendő |
| --- | --- | --- |
| `400` | A body nem JSON objektum, vagy az `id` hiányzik / hibás. | Javítsd a kérést, ne próbáld újra változatlanul. |
| `404` | Nincs ilyen azonosítójú sor. | Kérj új céget. |
| `500` | Adatbázis-hiba. | Várj 5–10 másodpercet, és küldd újra ugyanazt. A mentés ismételhető. |

---

### 1.3 Korlátok, amikre figyelni kell

- **Nincs hitelesítés.** Aki eléri az URL-t, az kérhet céget és írhat a
  mentésen keresztül. A mentés csak a keresési eredményt, hiányzó címet,
  hiányzó céges linket és embereket tud írni — levelet nem küld, sort nem
  töröl, meglévő címet nem ír felül —, de nyilvános címen ez így is nyitott
  írási felület. Nyilvános telepítésnél érdemes a hozzáférést hálózati szinten
  szűkíteni.
- **Nincs foglalás.** A kiadott cég nincs zárolva: ha két bot egyszerre kér,
  ugyanazt kapják. Egy bot esetén ez nem gond. Több párhuzamos botnál mindegyik
  kapjon saját, rögzített `skip` értéket (0, 1, 2, …), vagy egymást nem fedő
  szűrőt (pl. más-más `country`).
- **Elérhetőség.** A bot az éles címet (`https://melodia-j2db.vercel.app`)
  hívja; a `localhost:3000` kívülről nem érhető el. Az első kérés egy
  hosszabb szünet után lassabb lehet (hidegindítás, néhány másodperc).
- **Sebesség.** Egy kérés egy cég; az adatbázis lassú hálózaton van, ezért ne
  kérj előre több céget „készletre".

---

## 2. rész — A kutatás szisztematikája

Ez a rész a botnak szól. A cél cégenként: **egy használható e-mail cím, amire
egy szoftverfejlesztő jelentkezni tud, és a hozzá tartozó emberek** (HR,
toborzás, vezetés).

### 2.1 Alapszabályok — ezek minden lépésre érvényesek

1. **Soha ne találj ki címet.** Ne tippelj mintából (`info@` + domain,
   `keresztnev.vezeteknev@` + domain), akkor sem, ha „biztosan így van". Csak
   az a cím számít, amit egy megnyitott oldalon **leírva láttál**.
2. **Minden adathoz forrás kell.** Címhez, emberhez, linkhez az az URL, ahol
   láttad. Forrás nélküli cím nem lesz a cég elsődleges címe.
3. **Soha ne találj ki embert vagy profilt.** Ha valakit nem tudsz
   megbízhatóan a céghez kötni, hagyd ki.
4. **Soha ne hallgass el címet, amit láttál.** Az általános `info@` is menjen
   be — fő címként, ha nincs jobb, vagy az `alternatives` listába, `label`-lel.
   A döntés a felhasználóé, nem a boté.
5. **A „nem találtam" teljes értékű eredmény.** Ne erőltesd. A hosszú keresés
   ritkán fizetődik ki; egy gyors, tiszta nemleges többet ér egy bizonytalan
   találatnál.
6. **Egy cég — egy mentés.** Mielőtt új céget kérsz, a jelenlegit el kell
   menteni.

### 2.2 A folyamat egy cégre

```
0. Azonosítás     → melyik cégről van szó, mi a hivatalos oldala
1. Saját oldal    → kapcsolat / karrier / impresszum: e-mail és űrlap
2. Álláshirdetés  → a cég saját hirdetései és ATS-oldalai
3. Külső forrás   → LinkedIn-cégoldal, cégjegyzék, szakmai címtár
4. Emberek        → HR / toborzás, majd vezetés
5. Minősítés      → fő cím kiválasztása, megbízhatóság, jegyzet
6. Mentés
```

Az 1–3. lépés **lépcső**: ha egy szinten megvan a jó cím, a következő szintre
már csak az alternatívákért nem kell lemenni. A 4. lépés (emberek) mindig fut,
attól függetlenül, hogy lett-e cím.

#### 0. lépés — Azonosítás

Bemenet a sorból: `company`, `website`, `domain`, `linkedinUrl`, `country`,
`city`, `note`.

- Ha van `website`: az a kiindulópont, **ne keress a cégnévre** — nyisd meg
  közvetlenül.
- Ha nincs `website`: keresd meg a hivatalos oldalt (`"<cégnév>" <város>`,
  `"<cégnév>" <ország> software`). Ellenőrizd, hogy tényleg ez a cég: egyezik
  az ország, a város, a profil (a `note` leírja, mivel foglalkozik).
- A `note`-ban gyakran ott a LinkedIn-cégoldal linkje — azt is használd.
- **Azonos nevű cégek:** ha a talált oldal más országban, más iparágban van,
  az nem ez a cég. Bizonytalan egyezésnél a megbízhatóság `low`.
- Amit itt megtaláltál és a soron hiányzott, azt mentéskor küldd vissza a
  `website` és `linkedinUrl` mezőben.

#### 1. lépés — A cég saját oldala

Ez a legjobb forrás; az itt talált cím megbízhatósága `high`.

Nyisd meg, ebben a sorrendben, amíg nincs meg a cím:

1. **Főoldal** — lábléc, fejléc, `mailto:` linkek.
2. **Karrier** — `/careers`, `/jobs`, `/karrier`, `/allas`, `/join-us`,
   `/work-with-us`, `/karriere`, `/stellenangebote`.
3. **Kapcsolat** — `/contact`, `/kapcsolat`, `/kontakt`, `/contact-us`.
4. **Impresszum** — `/impressum`, `/imprint`, `/impresszum`, `/legal`.
   Német nyelvterületen (DE, AT, CH) az impresszum jogilag kötelező, és
   szinte mindig van benne e-mail cím — ott ezt vedd előre.
5. **Rólunk / csapat** — `/about`, `/team`, `/rolunk`, `/ueber-uns`. Ez az
   emberkereséshez is kell (4. lépés).
6. **Adatkezelési tájékoztató** — `/privacy`, `/adatkezeles`, `/datenschutz`.
   Utolsó esély: gyakran itt van az egyetlen leírt cím.

Mit keress az oldalakon:

- `mailto:` linkek és sima szövegként leírt címek;
- **álcázott címek**: `nev [at] ceg [dot] hu`, `nev(kukac)ceg.hu`,
  `nev@ceg punkt de` — ezek valódi, leírt címek, visszaalakítva használhatók;
- jelentkezési űrlap vagy „Apply" gomb → ez megy az `applyUrl` mezőbe.

Mit **ne** vegyél fel a cég címeként:

- a honlapot készítő ügynökség, a tárhelyszolgáltató vagy egy beágyazott
  widget címét;
- sablon-maradványt (`name@example.com`, `your@email.com`, `info@domain.com`);
- `noreply@`, `no-reply@`, `donotreply@` címet;
- képfájlnak látszó találatot (`logo@2x.png`).

#### 2. lépés — Álláshirdetések

Ha a saját oldalon nincs cím, vagy csak általános van:

- a cég ATS-oldala (a karrieroldalról kilinkelt Teamtailor, Workable,
  Greenhouse, Lever, Personio, SmartRecruiters és hasonló felület);
- a cég **saját** hirdetései állásportálokon: a hirdetés szövegében gyakran
  ott a toborzó neve és címe („Jelentkezés: …", „Send your CV to …").

Az itt talált cím megbízhatósága `high`, ha a cég saját felületén van;
`medium`, ha külső állásportálon. Ha a hirdetést **fejvadász cég** adta fel a
cég nevében, az a fejvadász címe — alternatívaként menjen, `label`:
„toborzó ügynökség".

#### 3. lépés — Külső források

Csak ha az 1–2. lépés nem hozott címet:

- a cég LinkedIn-oldalának „About" része;
- a cég Facebook-oldalának névjegye;
- hivatalos cégjegyzék, kamarai vagy szakmai címtár;
- anyacég / csoport oldala, ha a cég leányvállalat.

Az itt talált cím megbízhatósága legfeljebb `medium`. Anyacég, testvércég vagy
másik ország címe alternatívaként menjen, a `label`-ben megnevezve („német
anyacég", „csoportszintű HR").

**Leállási szabály a cím keresésére:** legfeljebb nagyjából 8 megnyitott oldal.
Ha a saját oldal három releváns aloldala (karrier, kapcsolat, impresszum)
után sincs semmi jel, a külső források ritkán segítenek — nézz meg egy-kettőt,
és zárd le `email: null` eredménnyel.

#### 4. lépés — Emberek

Mindig fut. Két csoportot keresel, ebben a fontossági sorrendben:

1. **HR és toborzás** — Technical / IT Recruiter, Talent Acquisition, HR
   Manager, HR Business Partner, People & Culture, Head of HR.
2. **Vezetés és technológiai döntéshozók** — CEO, ügyvezető, alapító, CTO,
   VP / Head of Engineering, Engineering Manager, igazgató.

**Kit keress, a cégméret (`size`) szerint:**

| Méret | Elsődleges cél | Miért |
| --- | --- | --- |
| `1-10`, `11-50` | Alapító, ügyvezető, CTO | Ekkora cégnél nincs külön HR; a vezető dönt a felvételről. |
| `51-200`, `201-500` | HR / toborzó **és** a fejlesztés vezetője | Már van HR, de a műszaki vezető szava a döntő. |
| `501-1000` és fölötte | Toborzók, Talent Acquisition — a cég adott országbeli irodájából | A felsővezetés nem releváns; a helyi toborzó az. |
| `ismeretlen` | Mindkét csoportból, amit találsz | |

Ha HR-es egyáltalán nincs, a vezetésből hozz — legalább egy embert.

**Források, sorrendben:**

1. A cég saját „Csapat / Rólunk / Vezetőség" oldala (az 1. lépésben már
   megnyitottad).
2. Keresés személyes LinkedIn-profilokra:
   - `site:linkedin.com/in "<cégnév>" recruiter`
   - `site:linkedin.com/in "<cégnév>" "talent acquisition"`
   - `site:linkedin.com/in "<cégnév>" HR`
   - `site:linkedin.com/in "<cégnév>" CEO OR founder OR ügyvezető`
   - `site:linkedin.com/in "<cégnév>" CTO OR "head of engineering"`

   Nagy cégnél tedd hozzá a várost vagy az országot.
3. Az álláshirdetésekben megnevezett kapcsolattartó (2. lépés).
4. Sajtóközlemény, konferencia-előadói oldal, cégjegyzék (vezetőknél).

**Ellenőrzés — mielőtt valakit felveszel:**

- **Most** dolgozik a cégnél, nem csak régen. Volt munkatársat ne adj hozzá.
- A titulus releváns (lásd a két csoportot). A cég egy tetszőleges
  fejlesztője nem kapcsolattartó.
- A `linkedinUrl` a **saját személyes** profilja (`linkedin.com/in/…`) — nem
  a cégoldal, nem keresési találat, nem poszt, nem valaki más profilja.
- A `role` az **eredeti** titulus, ahogy a profilon áll; ne fordítsd le, ne
  egyszerűsítsd.
- Azonos nevű cégnél ellenőrizd, hogy a profil ehhez a céghez tartozik
  (ország, város, iparág).

**Személyes e-mail cím:** csak akkor add meg, ha az illető címét egy oldalon
leírva láttad (csapatoldal, álláshirdetés, előadói adatlap). Névből és
domainből címet összerakni tilos.

**Mennyiség:** legfeljebb 12 ember, a fenti fontossági sorrendben. Ha öt
toborzó van, mind az öt kell — ne állj meg egynél. Egy ember csak egyszer
szerepeljen.

**Leállási szabály az emberekre:** legfeljebb nagyjából 6 keresés. Ha a
csapatoldal és három keresés után sincs megbízható találat, küldj üres
`people: []` tömböt és egy mondatot a `peopleNotes` mezőben.

#### 5. lépés — Minősítés

**A fő cím (`email`) kiválasztása** — ha több címet találtál, ez a sorrend:

1. Karrier / HR cím: `jobs@`, `careers@`, `karrier@`, `hr@`, `allas@`,
   `recruiting@`, `bewerbung@`, `talent@`.
2. Egy megnevezett toborzó vagy HR-es személyes címe.
3. Általános cég cím: `info@`, `office@`, `hello@`, `contact@`, `kontakt@`.
4. Vezető személyes címe (kis cégnél a 3. elé kerülhet).

Minden más, amit láttál, megy az `alternatives` listába, `label`-lel:
„általános cím", „sajtó", „értékesítés", „adatvédelem", „ügyfélszolgálat",
„német anyacég", „toborzó ügynökség". A `sales@`, `press@`, `support@`,
`dpo@`, `privacy@` típusú cím fő címnek nem jó, csak alternatívának — kivéve,
ha semmi más nincs: akkor is alternatíva marad, és az `email` `null`.

**Megbízhatóság (`confidence`):**

| Érték | Mikor |
| --- | --- |
| `high` | A cég **saját** oldalán vagy saját ATS-felületén láttad, és a cím domainje a cégé (vagy nyilvánvalóan a cégcsoporté). |
| `medium` | Megbízható külső forráson láttad (LinkedIn-cégoldal, cégjegyzék, állásportál), vagy a saját oldalon, de idegen domainnel (pl. `@gmail.com` egy kis cégnél). |
| `low` | Nem biztos, hogy ehhez a céghez tartozik: hasonló nevű cég, régi oldal, ellentmondó adatok. |

A `low` cím nem lesz a cég elsődleges címe, csak javaslat. Ne emeld meg a
megbízhatóságot azért, hogy bekerüljön — ha bizonytalan, az a helyes, hogy
javaslat marad.

**Jegyzet (`notes`):** 1–2 mondat magyarul, tényszerűen. Jó példák:

- „A karrieroldalon jobs@ cím van; a kapcsolat oldalon általános info@."
- „Az oldalon csak űrlap van, e-mail cím sehol; az impresszum sem ad címet."
- „A megadott weboldal nem tölt be; LinkedIn-cégoldalon nincs elérhetőség."
- „Két azonos nevű cég van; a budapestit a cím alapján azonosítottam."

#### 6. lépés — Mentés

Három tipikus kimenet:

**a) Megvan a cím és vannak emberek:**

```json
{
  "id": "<contact._id>",
  "email": "jobs@ceg.hu",
  "confidence": "high",
  "source": "https://ceg.hu/karrier",
  "alternatives": [
    { "email": "info@ceg.hu", "source": "https://ceg.hu/kapcsolat", "label": "általános cím" }
  ],
  "applyUrl": null,
  "notes": "A karrieroldalon jobs@ cím van; a kapcsolat oldalon általános info@.",
  "citations": ["https://ceg.hu/karrier", "https://ceg.hu/kapcsolat"],
  "people": [
    {
      "name": "Nagy Péter",
      "role": "Head of Talent Acquisition",
      "linkedinUrl": "https://www.linkedin.com/in/nagy-peter",
      "email": null,
      "source": "https://www.linkedin.com/in/nagy-peter"
    }
  ],
  "model": "grok-4"
}
```

**b) Cím nincs, csak űrlap:**

```json
{
  "id": "<contact._id>",
  "email": null,
  "confidence": "high",
  "source": null,
  "alternatives": [],
  "applyUrl": "https://ceg.hu/careers/apply",
  "notes": "Az oldalon csak jelentkezési űrlap van, e-mail cím sehol.",
  "citations": ["https://ceg.hu/careers", "https://ceg.hu/contact", "https://ceg.hu/impressum"],
  "people": [],
  "peopleNotes": "A csapatoldal nem nevez meg senkit; LinkedIn-en nem találtam a céghez köthető toborzót.",
  "model": "grok-4"
}
```

**c) Semmit nem találtál:**

```json
{
  "id": "<contact._id>",
  "email": null,
  "notes": "A cégnek nem találtam működő weboldalt; a név alapján nem azonosítható egyértelműen.",
  "citations": [],
  "people": [],
  "model": "grok-4"
}
```

Mentés után nézd meg a választ: ha `emailRejected` nem `null`, a cím nem lett
elsődleges — ez nem hiba, a cím javaslatként megmaradt. Ne küldd újra
megemelt megbízhatósággal.

### 2.3 A teljes ciklus és a hibakezelés

1. `GET /api/bot/next` a kívánt szűrőkkel.
2. Ha `contact` `null` → **állj meg**, nincs több cég.
3. Kutatás a 2.2 szerint.
4. `POST /api/bot/save` — **mindig**, a 6. lépés valamelyik alakjában.
5. Vissza az 1. pontra.

| Helyzet | Teendő |
| --- | --- |
| A mentés `400`-at ad | A kérés hibás. Olvasd el az `error` szöveget, javítsd, küldd újra. |
| A mentés `404`-et ad | A sor időközben megszűnt. Kérj új céget. |
| Bármelyik hívás `500`-at ad | Várj 5–10 másodpercet, próbáld újra; legfeljebb háromszor. |
| Ugyanaz a cég jön vissza | Az előző mentés nem sikerült. Mentsd újra; ha háromszor sem megy, kérj `skip=1`-gyel. |
| A kutatás közben elakadsz (időtúllépés, blokkolt oldal) | Mentsd, amid van, és írd le a `notes`-ban, min akadtál el. |

### 2.4 Gyors ellenőrzőlista mentés előtt

- [ ] Az `id` a kapott `contact._id`.
- [ ] Minden címet leírva láttam, egyiket sem raktam össze mintából.
- [ ] A fő címhez van `source` URL, és az tényleg az az oldal, ahol a cím áll.
- [ ] Minden további látott cím bent van az `alternatives`-ben, `label`-lel.
- [ ] A `confidence` a valós bizonyosságot tükrözi.
- [ ] Minden ember most dolgozik a cégnél, és a `linkedinUrl` személyes profil.
- [ ] A `notes` megmondja, mit találtam és mit nem.
- [ ] Ha semmi nincs, akkor is mentek — `email: null`-lal.

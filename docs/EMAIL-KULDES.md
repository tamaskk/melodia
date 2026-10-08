# Ütemezett e-mail kiküldő — tervrajz új projekthez

Ez a dokumentum a Melodia kiküldőjét írja le úgy, hogy egy másik projektben
újra meg lehessen építeni: egyesével, emberi ritmusban, véletlen szünetekkel
küld leveleket **több fiókból párhuzamosan**, egyszer kell elindítani, és megy,
amíg a szerver fut — újraindítás után is.

Három rész:

1. **Hogyan működik** — a kiküldő menet, a védelmek, az adatmodell.
2. **Fiókok a beállításokból** — ez új a Melodiához képest: ott a fiókok egy
   env-fájlban vannak, itt a felületen adhatók hozzá.
3. **Telepítés Hetznerre** — lépésről lépésre, a végén a DigitalOcean
   eltéréseivel.

Jelölés: ami **[Melodia]**, az a mostani kódban így működik és ki van próbálva.
Ami **[új]**, az terv az új projekthez — még nincs megírva sehol.

---

## 1. rész — Hogyan működik

### 1.1 Az alapgondolat

A kiküldő **nem cron**, hanem egy hosszan futó ciklus a szerver folyamatán
belül:

```
levél kiküldése → véletlen szünet (pl. 10–20 perc) → következő levél → …
```

A „szünet" egy megszakítható `setTimeout`. Ehhez olyan folyamat kell, ami
órákig, napokig él. Ezért:

- **Serverlessen (Vercel, Netlify, Lambda) nem megy.** Ott a függvény a válasz
  után leáll, nincs ki aludjon 15 percet. A Melodia ezt a környezetet felismeri
  (`process.env.VERCEL`), és ott nem indít és nem folytat küldést.
- **Mindig futó szerver kell** (VPS + systemd) — lásd a 3. részt.
- **Egyszerre egyetlen példány futhat.** Két példány ugyanazt a sort küldené.

### 1.2 Az építőelemek

| Modul | Feladata | Melodia-fájl |
| --- | --- | --- |
| Fiókok | A küldő fiókok listája, hitelesítő adatokkal | `src/lib/accounts.ts` |
| Levélküldő | SMTP-kapcsolat fiókonként, egy levél elküldése | `src/lib/mailer.ts` |
| Menet (runner) | A ciklus: sor, szünet, keret, leállítás, mentés | `src/lib/sendCampaign.ts` |
| Munkaidő-ablak | A címzett helyi ideje szerint küld | `src/lib/sendWindow.ts` |
| Felfuttatás | Új fiók napi plafonja hetente nő | `src/lib/warmup.ts` |
| Címzett-szűrés | Ki kapott már levelet, címre és cégdomainre | `src/lib/recipients.ts` |
| Küldés előtti ellenőrzés | Hiányos levél kiszűrése | `src/lib/preflight.ts` |
| Folytatás induláskor | Újraindulás után felveszi a futó meneteket | `src/instrumentation.ts` |
| Bejövő levelek | IMAP: válasz és visszapattanás figyelése | `src/lib/inbox.ts` |
| API | Indítás, leállítás, állapot, próba | `src/app/api/contacts/send-campaign/route.ts` |

Függőségek: `nodemailer` (SMTP), `imapflow` + `mailparser` (IMAP, csak ha
válaszfigyelés is kell), MongoDB (bármilyen adatbázis megteszi).

### 1.3 Egy fiók — egy menet

Minden küldő fióknak **saját menete** van: saját sor, saját napi keret, saját
ütemezés, saját állapot. A menetek egymástól függetlenül futnak, egyszerre
több is mehet.

```
┌──────────── szerver folyamat ────────────┐
│  menet: elso@gmail.com     [fut]   7/18  │──► SMTP ──► címzettek
│  menet: masodik@gmail.com  [fut]   3/10  │──► SMTP ──► címzettek
│  menet: harmadik@ceg.hu    [áll]         │
│                                          │
│  közös: „kiosztott címzettek" térkép     │  ← egy címzett csak egy fióké
└──────────────────────────────────────────┘
          │ mentés minden levél után
          ▼
   adatbázis: campaigns (fiókonként egy dokumentum)
```

A menet állapotai: `idle` → `running` → (`stopping`) → `done` | `idle` | `error`.

### 1.4 A ciklus

Ez a kiküldő magja. Egyszerűsítve, de a lépések sorrendje számít:

```ts
async function run(runner) {
  let failuresInARow = 0;

  while (runner.queue.length) {
    // 1. Leállítást kértek?
    if (runner.stopRequested) break;

    // 2. Új nap → a napi számláló nullázódik. Elfogyott a mai keret? Vége.
    resetDailyCounterIfNeeded(runner);
    if (runner.sentToday >= dailyLimitOf(runner)) break;

    // 3. Munkaidő-ablak: azt vesszük előre, akinél MOST munkaidő van.
    //    Ha senkinél, alszunk a legkorábbi nyitásig (max. 15 perces darabokban).
    if (!options.ignoreWindow) {
      const pick = pickInsideWindow(runner);
      if (pick.waitUntil) { await sleep(runner, untilOrMax15Min); continue; }
      moveToFront(runner.queue, pick.id);
    }

    // 4. A címzett friss állapota az adatbázisból — közvetlenül küldés előtt.
    const contact = await getContactById(runner.queue[0]);
    if (!stillEligible(contact)) { runner.queue.shift(); continue; }

    // 5. Nem küldött-e rá közben másik fiók (cím vagy cégdomain)?
    if (await alreadyContacted(contact)) { runner.queue.shift(); continue; }

    // 6. Az utolsó szó az adatbázisé: ha bárhonnan leállították, megállunk.
    if (await stopRequestedInDb(account.id)) break;

    // 7. Küldés + a címzett megjelölése elküldöttnek.
    const item = await deliver(account, contact);
    runner.queue.shift();

    // 8. Hibakezelés: három egymás utáni hiba → leáll „error" állapottal.
    if (item.error) { if (++failuresInARow >= 3) return fail(runner); }
    else { failuresInARow = 0; runner.sentToday += 1; }

    // 9. Állapot mentése (sor, számlálók, következő időpont).
    await persist(runner);

    // 10. Véletlen szünet.
    await sleep(runner, pause(options));
  }
}
```

Miért így:

- **A sorból csak küldés után veszünk ki** (7. lépés), nem előtte. Ha a szerver
  a küldés előtt áll le, a címzett a sorban marad, és újraindulás után megkapja.
- **A jogosultságot küldés előtt újra nézzük** (4–5. lépés), nem csak a sor
  összeállításakor. A sor órákkal korábban épült; közben jöhetett válasz, kézi
  lezárás, vagy egy másik fiók küldhetett ugyanoda.
- **A leállítás az adatbázisban is ott van** (6. lépés), nem csak memóriában.
  Így akkor is hat, ha a menet egy másik modulpéldányban él (lásd 1.11).

### 1.5 A véletlen szünet

```ts
function pause(options) {
  const min = options.minMinutes * 60_000;
  const max = Math.max(min, options.maxMinutes * 60_000);
  return Math.round(min + Math.random() * (max - min));
}
```

Milliszekundumra számol, így a szünet nem egész perc — 10 és 20 perc közt
bármi lehet (pl. 13 perc 47 másodperc). Ez a lényeg: a percre pontos, gépies
ritmus az, amit a levelezőszolgáltatók automatizálásnak látnak.

Az API a tartományt korlátozza: minimum 1–120 perc, maximum legfeljebb 240
perc, és a maximum sosem kisebb a minimumnál. Alapérték: **10–20 perc**.

**Megszakítható alvás** — a Leállítás gomb nem várhat 20 percet:

```ts
function sleep(runner, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { runner.wake = null; resolve(); }, ms);
    runner.wake = () => { clearTimeout(timer); runner.wake = null; resolve(); };
  });
}
// leállításkor: runner.stopRequested = true; runner.wake?.();
```

### 1.6 Napi keret és felfuttatás

Két korlát él egyszerre, a kisebb nyer:

1. **Beállított napi keret** (`dailyLimit`) — alap 18, az API 1–100 közé
   szorítja.
2. **Felfuttatási plafon** — egy új fiók ne küldjön rögtön sokat. Az **első
   sikeres küldés napjától** számítva:

   | Időszak | Napi plafon |
   | --- | --- |
   | 1. hét (0–6. nap) | 10 |
   | 2. hét (7–13. nap) | 20 |
   | 3. hét (14–20. nap) | 30 |
   | 21. naptól | nincs plafon, a beállított keret él |

```ts
const effective = cap === null ? dailyLimit : Math.min(dailyLimit, cap);
```

A számláló (`sentToday`) éjfélkor nullázódik — a **szerver helyi ideje**
szerint. Ezért a szerver időzónáját be kell állítani (lásd 3. rész).

Ha a keret elfogyott, a menet megáll „Mai keret elfogyott, holnap folytatható"
üzenettel. **Másnap nem indul el magától** — újra el kell indítani. (Ha az új
projektben „menjen napokig magától" a cél, ezt érdemes megváltoztatni: lásd
1.12.)

### 1.7 Munkaidő-ablak a címzett idejében

A levél akkor megy ki, amikor a **címzettnél** munkaidő van — nem a szervernél.
Egy budapesti 9:00 New Yorkban hajnali 3.

- Ország → időzóna táblázat (`HU` → `Europe/Budapest`, `US` →
  `America/New_York`, …). Ismeretlen országnál a feladó időzónája.
- Ablak: hétköznap, `windowFrom`–`windowTo` óra között (alap 9–17).
- A menet a sorból azt veszi előre, akinél éppen munkaidő van. Így egy vegyes
  (európai + amerikai) sor délelőtt az európaiakat, délután az amerikaiakat
  küldi.
- Ha senkinél nincs munkaidő, a menet alszik a legkorábbi nyitásig — legfeljebb
  15 perces darabokban, hogy a napváltást és a leállítást is észrevegye.

Két kapcsoló kapcsolja ki az ablakot:

- `ignoreWindow` — éjjel és hétvégén is küld, korlát nélkül.
- `testMode` — ablak nélkül, de **indításonként legfeljebb 3 levél**. Így egy
  bent felejtett pipa nem küld ki egy egész éjszakányi kampányt.

### 1.8 Ki kaphat levelet — a védelmek

A sor összeállításakor, ebben a sorrendben:

1. **Alapszűrés:** van címe, még nem kapott levelet, nincs rajta kézi kimenetel
   (pl. „ne keresd"). Egy indításra legfeljebb 500 címzett kerül a sorba.
2. **Másik fiók nem vitte el** — a közös „kiosztott címzettek" térkép alapján.
3. **Címre és cégdomainre már ment levél?** Ugyanaz a cég több soron is
   szerepelhet (két import, fiókiroda). Három kihagyási ok:
   - erre a címre már ment levél,
   - erre a cégdomainre már ment levél (kikapcsolható: `allowSameDomain`),
   - ugyanaz a cím vagy cég a mostani sorban korábban már szerepel.

   A közös szolgáltatók (gmail.com, outlook.com, …) nem számítanak
   cégdomainnek.
4. **Küldés előtti ellenőrzés:** üres tárgy vagy szöveg, illetve kitöltetlen
   `{{mező}}` → a levél nem megy ki. Figyelmeztetés (de kimehet): általános
   postafiók, nyelvi eltérés, a domainről már visszapattant levél.

Küldés után:

- a címzett `sent: true` + `done: true`, időbélyeggel;
- eltároljuk a levél `Message-ID`-ját és a küldő fiókot (a follow-uphoz);
- ugyanarra a címre szóló **testvérsorok** is elküldöttnek jelölődnek.

### 1.9 Több fiók ne ütközzön

Két védelem, mert kétféle ütközés van:

- **Sorépítéskor:** a `claimed` térkép (címzett → fiók). Amit az egyik menet
  sorba vett, azt a másik kihagyja. A menet végén és minden kiküldés után
  felszabadul.
- **Küldés előtt:** `alreadyContacted()` — adatbázis-lekérdezés, ment-e már
  levél erre a címre vagy cégdomainre. Ez azt az esetet fogja meg, amikor két
  fiók sorában ugyanaz a **cég** más-más címmel szerepel.

### 1.10 Mentés és folytatás

Fiókonként egy dokumentum a `campaigns` gyűjteményben:

```ts
interface CampaignDoc {
  accountId: string;
  status: "idle" | "running" | "stopping" | "done" | "error";
  options: CampaignOptions;   // napi keret, szünet, ablak, szűrők, mód
  queue: string[];            // akik még hátra vannak
  sentToday: number;
  dayStamp: string;           // melyik napra szól a számláló
  processed: number;
  failed: number;
  startedAt: string | null;
  nextAt: string | null;      // mikor megy a következő levél
  message: string | null;     // emberi nyelvű állapot a felületre
  recent: SentItem[];         // az utolsó 20 kiküldés
  firstSendAt?: string;       // a felfuttatás kezdete
  stopRequested?: boolean;    // csak a Leállítás írja, csak az indítás nullázza
  updatedAt: string;
}
```

- **Mentés:** indításkor, minden levél után, leállításkor, a menet végén. A
  mentés hibája nem állítja meg a küldést (csak naplózunk).
- **Folytatás:** a szerver indulásakor egyszer lefut a `resumeCampaigns()`.
  Minden dokumentumot, ami `running` vagy `stopping`, és nincs rajta
  `stopRequested`, visszatölt a memóriába, és elindítja a ciklust. Next.js-ben
  ennek a helye a `src/instrumentation.ts` `register()` függvénye.
- **`stopRequested` külön mező, szándékosan:** a `persist()` nem nyúl hozzá.
  Így egy lemaradt, még futó menet nem tudja visszaírni az állapotot
  „running"-ra, miután leállítottad.

### 1.11 Csapdák, amikbe a Melodia belefutott

- **A futó menetek a `globalThis`-en éljenek, ne modulváltozóban.** A Next.js
  az instrumentationt és a route-okat külön modulpéldányba töltheti, és
  fejlesztés közben a hot reload újraértékeli a modult. Modulváltozóval két
  térkép lett: a Leállítás az üreset látta, a másikban a menet küldött tovább.

  ```ts
  const shared = globalThis as typeof globalThis & { __runners?: Map<string, Runner> };
  const runners = (shared.__runners ??= new Map());
  ```

- **Ha az adatbázis nem érhető el a leállítás-ellenőrzésnél, ne küldj.** A
  `stopRequestedInDb()` hiba esetén `true`-t ad vissza: inkább álljon meg,
  mint hogy egy leállított kampány tovább menjen.
- **SMTP-kapcsolat fiókonként egy, újrahasznosítva.** A küldésenkénti
  újracsatlakozást a szolgáltatók nem szeretik (`pool: true`,
  `maxConnections: 1`).
- **Sima szöveg, nem HTML, nincs követőpixel, nincs linkkövetés.** Egy
  személyes levél így néz ki; a követés rontja a kézbesíthetőséget.
- **Három egymás utáni hiba = leállás.** Ez jelszó-, limit- vagy
  hálózati hiba; nincs értelme tovább hajtani, és égetni a sort.
- **Az app-jelszóból a szóközöket ki kell venni.** A Google szóközökkel
  tagolva adja meg, de azok nem részei.

### 1.12 Amit az új projektben érdemes másképp csinálni

- **Napi újraindulás magától.** Most a keret elfogyásakor a menet véget ér.
  Ha „elindítom egyszer, és megy napokig" a cél: a keret elfogyásakor ne
  `break` legyen, hanem alvás a következő nap első ablaknyitásáig, aztán
  `continue`.
- **Fiókok az adatbázisban** — a 2. rész erről szól.
- **Fiók-azonosító ne az e-mail cím legyen**, hanem az adatbázis-azonosító. A
  Melodiában a cím az azonosító; ha egy fiók címét átírod, a mentett menete
  elárvul.
- **A szolgáltató legyen beállítható** (host, port), ne beégetett Gmail.

### 1.13 API

Egy végpont, `action` mezővel **[Melodia]**:

| Kérés | Mit csinál |
| --- | --- |
| `GET /api/…/send-campaign` | Fiókok (jelszó nélkül), minden menet állapota, csatolmányok. A felület ezt kérdezi le pár másodpercenként. |
| `POST { action: "start", accountId, … }` | Sort épít, menti, a háttérben elindítja a ciklust. **A válasz nem várja meg a küldést.** |
| `POST { action: "stop", accountId }` | Leállítás: adatbázisba ír, és felébreszti az alvó menetet. A folyamatban lévő levél még kimegy. |
| `POST { action: "preview", … }` | Kiknek és mi menne ki. Nem küld. |
| `POST { action: "test", accountId }` | SMTP-kapcsolat és jelszó ellenőrzése, levél nélkül. |
| `POST { action: "self-test", accountId }` | Próbalevél a fiók **saját** címére, pontosan úgy, ahogy az éles kinézne. Semmit nem jelöl elküldöttnek. |

Az indítás paraméterei:

| Mező | Alap | Korlát | Jelentés |
| --- | --- | --- | --- |
| `accountId` | első fiók | | Melyik fiókból. |
| `ids` / `filters` | | | Konkrét címzettek, vagy szűrő. |
| `dailyLimit` | 18 | 1–100 | Napi maximum. |
| `minMinutes` | 10 | 1–120 | Szünet alsó határa. |
| `maxMinutes` | 20 | `minMinutes`–240 | Szünet felső határa. |
| `windowFrom` / `windowTo` | 9 / 17 | 0–23 / 1–24 | Munkaidő-ablak, a címzett idejében. |
| `ignoreWindow` | `false` | | Éjjel, hétvégén is. |
| `testMode` | `false` | | Ablak nélkül, max. 3 levél. |
| `allowSameDomain` | `false` | | Egy cégdomainre több levél is mehet. |
| `mode` | `initial` | `initial` / `followup` | Első levél vagy follow-up. |

### 1.14 Follow-up és válaszfigyelés (opcionális)

- **Follow-up:** 7 nappal az első levél után, ha nem jött válasz, nem pattant
  vissza, és nincs kimenetel. Cégenként legfeljebb egy, kézi jóváhagyás után.
  Ugyanabban a szálban megy: `Re:` tárgy, `In-Reply-To` és `References` fejléc
  az eredeti `Message-ID`-ra — ezért kell azt kiküldéskor eltárolni. **Mindig
  abból a fiókból megy, amelyikből az első levél.**
- **Válaszfigyelés:** IMAP-on, ugyanazzal az app-jelszóval, csak olvasva. A
  szerver indulása után 1 perccel, aztán 30 percenként fut
  (`MAIL_AUTO_SYNC_MINUTES`). A válasz és a visszapattanás rákerül a címzettre
  — a follow-up és a visszapattant domainek figyelmeztetése ebből dolgozik.

---

## 2. rész — Fiókok a beállításokból [új]

A Melodiában a fiókok egy env-fájlban vannak (`GMAIL_USER`, `GMAIL_USER_2`, …
legfeljebb 10), új fiókhoz a fájlt kell szerkeszteni és a szervert
újraindítani. Az új projektben a fiók a felületen adható hozzá, újraindítás
nélkül.

### 2.1 Adatmodell

Gyűjtemény: `mail_accounts`.

```ts
interface MailAccountDoc {
  _id: ObjectId;              // EZ az azonosító mindenhol (nem az e-mail cím)
  user: string;               // a belépési cím, kisbetűsítve; egyedi index
  label: string;              // rövid név a felületen
  fromName: string;           // a feladó megjelenő neve
  replyTo: string | null;

  smtp: { host: string; port: number; secure: boolean };
  imap: { host: string; port: number } | null;   // ha válaszfigyelés is kell

  password: { iv: string; tag: string; data: string };  // titkosítva, lásd 2.2

  enabled: boolean;           // kikapcsolt fiókból nem indul menet

  // Fiókonkénti alapértékek — indításkor ezek töltődnek be.
  dailyLimit: number;         // pl. 18
  minMinutes: number;         // pl. 10
  maxMinutes: number;         // pl. 20
  windowFrom: number;         // pl. 9
  windowTo: number;           // pl. 17

  firstSendAt: string | null; // a felfuttatás kezdete
  lastVerifiedAt: string | null;
  lastError: string | null;

  createdAt: string;
  updatedAt: string;
}
```

A `campaigns` dokumentum `accountId` mezője erre az `_id`-ra mutat.

### 2.2 A jelszó tárolása

A jelszót **vissza kell tudni fejteni** (az SMTP-belépéshez kell), tehát
hash-elni nem lehet — titkosítani kell. A kulcs **nem** az adatbázisban van,
hanem a szerver környezetében: aki csak az adatbázist szerzi meg, a jelszavakat
nem.

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// 32 bájt, base64-ben. Generálás: openssl rand -base64 32
const KEY = Buffer.from(process.env.MAIL_SECRET_KEY ?? "", "base64");
if (KEY.length !== 32) throw new Error("MAIL_SECRET_KEY hiányzik vagy nem 32 bájt.");

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export function decrypt(box: { iv: string; tag: string; data: string }): string {
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(box.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

Szabályok:

- A jelszó **soha nem megy vissza a böngészőnek**. A lista és az adatlap
  jelszó nélkül jön; a felületen `••••••••` áll, mellette „Jelszó cseréje".
- A jelszót **soha ne naplózd**, hibaüzenetben se.
- A `MAIL_SECRET_KEY` elvesztése = minden fiók jelszavát újra be kell írni.
  Mentsd el jelszókezelőbe.
- Mentés előtt a szóközöket vedd ki a jelszóból (Google app-jelszó).

### 2.3 API

| Kérés | Mit csinál |
| --- | --- |
| `GET /api/mail-accounts` | Minden fiók, **jelszó nélkül**, a menet állapotával együtt. |
| `POST /api/mail-accounts` | Új fiók. **Mentés előtt SMTP-ellenőrzés** (`transporter.verify()`): ha a belépés nem megy, nem mentünk, és megmondjuk, miért. |
| `PATCH /api/mail-accounts/:id` | Módosítás. Ha `password` jön, újra ellenőriz és újratitkosít; ha nem jön, a régi marad. |
| `POST /api/mail-accounts/:id/verify` | Kapcsolatpróba a tárolt adatokkal. |
| `POST /api/mail-accounts/:id/self-test` | Próbalevél a fiók saját címére. |
| `DELETE /api/mail-accounts/:id` | Törlés. Futó menetnél előbb leállítás; a `campaigns` dokumentum is törlődik. |

Ezek az útvonalak jelszavakat fogadnak — **csak bejelentkezés mögött** legyenek
elérhetők (lásd 3.8).

### 2.4 Amire a meglévő logikában figyelni kell

- **SMTP-kapcsolat gyorsítótár:** fiókonként egy `transporter` él a
  memóriában. Jelszó-, host- vagy port-módosításkor és törléskor **zárd le és
  dobd el** (`transporter.close()`), különben a régi adatokkal megy tovább.
- **Fiókok betöltése:** a Melodia az env-ből szinkron olvas. Adatbázisból ez
  aszinkron — a `getAccount()` / `listAccounts()` hívói `await`-et kapnak.
- **Folytatás induláskor:** a `resumeCampaigns()` csak olyan menetet vegyen
  fel, amelynek a fiókja létezik és `enabled`.
- **Kikapcsolás futás közben:** az `enabled: false` kérjen leállítást is.
- **Felső korlát a fiókok számára** nem kell, de minden fiók egy nyitott
  SMTP-kapcsolat és egy futó ciklus — pár tucat fiókig ez semmi.

### 2.5 A beállítási képernyő

Fióklista, soronként: címke, cím, állapot (fut / áll / hiba), ma kiment /
napi keret, felfuttatás („2. hét, max. 20/nap"), utolsó ellenőrzés, gombok
(Próba, Próbalevél, Szerkesztés, Törlés, Be/Ki).

„Új fiók" űrlap:

| Mező | Megjegyzés |
| --- | --- |
| Szolgáltató | Gmail / Google Workspace / Egyéni. Az első kettő kitölti a hostot és a portot. |
| E-mail cím | Ez a belépési név is. |
| App-jelszó | `type="password"`. Gmailnél **nem** a fiókjelszó — lásd lent. |
| Megjelenő név | Ez látszik feladóként. |
| Címke | Rövid név a listában. |
| Válaszcím | Opcionális. |
| Napi keret, szünet (min–max perc), munkaidő-ablak | Alapértékekkel előtöltve: 18, 10–20, 9–17. |
| SMTP host / port | Csak „Egyéni" szolgáltatónál látszik. |

Mentéskor: ellenőrzés → siker esetén mentés és visszajelzés („Kapcsolat
rendben: cím"), hiba esetén érthető üzenet. A Gmail „invalid login" hibájára a
Melodia ezt írja: *app-jelszó kell, nem a fiókjelszó, és be kell kapcsolni a
kétlépcsős azonosítást.*

**Gmail app-jelszó beszerzése** (fiókonként egyszer):

1. A Google-fiókban kapcsold be a kétlépcsős azonosítást.
2. Nyisd meg: `https://myaccount.google.com/apppasswords`.
3. Hozz létre egy app-jelszót, és a kapott 16 karaktert másold az űrlapba.

### 2.6 Hány levél mehet egy fiókból

- A Gmail SMTP-n naponta nagyságrendileg 500 címzettet enged személyes
  fiókból, Workspace-ből többet — de **nem ez a korlát számít**. Hideg
  megkeresésnél a szűrők és a fiók-zárolás jóval hamarabb jön.
- A Melodia tapasztalata: **napi 15–20 személyre szabott levél fiókonként**
  belefér a normális használatba. A gépies ritmus és a napi 200+ levél az,
  amitől egy fiók zárolást kap.
- Több levél kell? **Több fiók, ne több levél fiókonként.** Öt fiók × 18 levél
  = napi 90, mindegyik a saját felfuttatásával.
- Saját domainről küldve állítsd be az SPF, DKIM és DMARC rekordokat, különben
  a levelek spambe mennek.

---

## 3. rész — Telepítés Hetznerre

A cél: egy mindig futó szerver, amin az alkalmazás egyetlen példányban megy,
HTTPS mögött, jelszóval védve, és újraindulás után magától folytatja a
küldést.

### 3.0 Fontos tudni előre: SMTP-portok

A felhőszolgáltatók a kimenő levélportokat alapból tiltják a spam miatt:

- **Hetzner Cloud:** a **25-ös és a 465-ös** kimenő port alapból zárva. A
  **587-es nyitva van.** A zárolás feloldása kérhető, de csak az első kifizetett
  számla után.
- **DigitalOcean:** a 25-ös, 465-ös **és** 587-es is zárva lehet új fiókon.

A Melodia a 465-ös porton küld. **Hetzneren ezt 587-re kell állítani:**

```ts
nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,      // 587-en a kapcsolat sima TCP-ként indul…
  requireTLS: true,   // …és kötelezően STARTTLS-re vált
  auth: { user, pass },
  pool: true,
  maxConnections: 1,
  maxMessages: 50,
});
```

Ezért ajánlott inkább a Hetzner: ott az 587-es kérés nélkül megy. A szerver
létrehozása után rögtön ellenőrizd (3.3 lépés) — a szolgáltatók szabályai
változhatnak.

Az IMAP (993) és a MongoDB Atlas (27017) kimenő forgalmát egyik sem tiltja.

### 3.1 Szerver létrehozása

1. Regisztrálj: `https://console.hetzner.cloud` → új projekt.
2. **Security → SSH Keys → Add SSH Key.** A saját gépeden, ha még nincs kulcsod:

   ```bash
   ssh-keygen -t ed25519 -C "sajat@gep"
   cat ~/.ssh/id_ed25519.pub     # ezt másold be a Hetznerbe
   ```

3. **Add Server:**

   | Beállítás | Érték |
   | --- | --- |
   | Location | Falkenstein vagy Nürnberg (EU) |
   | Image | Ubuntu 24.04 |
   | Type | Shared vCPU, x86, **2 vCPU / 4 GB RAM** (a legkisebb ilyen csomag; havi pár euró) |
   | Networking | Public IPv4 bekapcsolva (az Atlas IP-engedélyezéséhez kell) |
   | SSH Key | az imént feltöltött |
   | Name | pl. `mailer-1` |

   4 GB RAM a `next build` miatt kell; futni 1 GB-on is elmenne.

4. **Firewalls → Create Firewall**, bejövő szabályok, majd rendeld a szerverhez:

   | Port | Forrás | Mire |
   | --- | --- | --- |
   | 22 (TCP) | a saját IP-d, vagy bárhonnan | SSH |
   | 80 (TCP) | bárhonnan | HTTPS-tanúsítvány kiállítása |
   | 443 (TCP) | bárhonnan | a felület |

   A 3000-es portot **ne** nyisd ki — az alkalmazás csak a proxyn át legyen
   elérhető.

5. Jegyezd fel a szerver IPv4-címét. A továbbiakban `SZERVER_IP`.

### 3.2 Alapbeállítás

```bash
ssh root@SZERVER_IP

# Frissítés
apt update && apt upgrade -y

# Időzóna — a napi keret éjfélkor nullázódik, a szerver ideje szerint
timedatectl set-timezone Europe/Budapest

# Külön felhasználó az alkalmazásnak (ne rootként fusson)
adduser --disabled-password --gecos "" app
mkdir -p /home/app/.ssh
cp ~/.ssh/authorized_keys /home/app/.ssh/
chown -R app:app /home/app/.ssh
chmod 700 /home/app/.ssh && chmod 600 /home/app/.ssh/authorized_keys

# Automatikus biztonsági frissítések
apt install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades
```

### 3.3 Kimenő portok ellenőrzése

```bash
apt install -y netcat-openbsd
nc -vz -w 5 smtp.gmail.com 587    # ennek „succeeded" kell
nc -vz -w 5 smtp.gmail.com 465    # Hetzneren várhatóan időtúllépés
nc -vz -w 5 imap.gmail.com 993    # ennek „succeeded" kell
```

Ha az 587 sem megy, a telepítés többi részének nincs értelme, amíg a
szolgáltató fel nem oldja — nyiss nála kérést.

### 3.4 Node.js és a kód

```bash
# Node 22 LTS (még rootként)
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource.sh
less /tmp/nodesource.sh           # nézd át, mielőtt lefuttatod
bash /tmp/nodesource.sh
apt install -y nodejs git
node -v                           # v22.x

# Innentől az app felhasználóként
su - app
git clone https://github.com/FELHASZNALO/PROJEKT.git app
cd app
npm ci
```

Privát repónál a klónozáshoz **deploy key** kell: az `app` felhasználóval
generálj egy SSH-kulcsot (`ssh-keygen -t ed25519`), a nyilvános felét add hozzá
a GitHub-repóhoz (Settings → Deploy keys, csak olvasás), és SSH-s URL-lel
klónozz (`git@github.com:FELHASZNALO/PROJEKT.git`).

### 3.5 Titkok és csatolmányok

Ezek nincsenek a repóban, kézzel kell feltenni.

**A saját gépedről:**

```bash
scp atlas-credentials.env app@SZERVER_IP:/home/app/app/
scp -r attachments app@SZERVER_IP:/home/app/app/
```

**A szerveren:**

```bash
chmod 600 /home/app/app/atlas-credentials.env
```

Az új projektben a titkos fájlba kerül a `MAIL_SECRET_KEY` is (2.2):

```bash
openssl rand -base64 32      # a kimenetet írd a fájlba: MAIL_SECRET_KEY="…"
```

**MongoDB Atlas:** Network Access → Add IP Address → `SZERVER_IP`. A szervernek
fix IP-je van, ezért itt nem kell `0.0.0.0/0`.

### 3.6 Fordítás és próbaindítás

```bash
cd /home/app/app
npm run build
npm start          # a 3000-es porton indul; Ctrl+C-vel állítsd le
```

Egy másik terminálból, a szerveren: `curl -I http://localhost:3000` → `200`.

### 3.7 Futtatás systemd-vel

Ez teszi „mindig futóvá": indul a szerverrel, és újraindul, ha leáll.
Rootként:

```bash
cat > /etc/systemd/system/mailer.service <<'EOF'
[Unit]
Description=E-mail kiküldő (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=app
WorkingDirectory=/home/app/app
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
# A leállításnál hagyunk időt a folyamatban lévő levélnek
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now mailer
systemctl status mailer
```

`HOSTNAME=127.0.0.1`: az alkalmazás csak a gépen belülről érhető el, kívülről
kizárólag a proxyn át.

**Egy példány, nem több.** Ne használj `pm2 -i max`-ot, cluster módot vagy több
szolgáltatást ugyanarra a kódra — minden példány saját menetet indítana, és a
levelek duplán mennének ki.

Napló:

```bash
journalctl -u mailer -f              # élőben
journalctl -u mailer --since today   # a mai nap
```

### 3.8 HTTPS és jelszó: Caddy

Az alkalmazásban nincs bejelentkezés. Nyilvános címen e nélkül bárki
indíthatna küldést, törölhetne címzetteket, és az új projektben fiókokat
adhatna hozzá. A Caddy egyszerre adja a HTTPS-t és a jelszavas védelmet.

Előtte: a domain DNS-ében vegyél fel egy **A rekordot**
(`mailer.sajatdomain.hu` → `SZERVER_IP`), és várd meg, hogy éljen.

```bash
apt install -y caddy

caddy hash-password        # beírod a jelszót, visszaad egy hash-t

cat > /etc/caddy/Caddyfile <<'EOF'
mailer.sajatdomain.hu {
    basicauth {
        felhasznalo IDE_A_HASH
    }
    reverse_proxy 127.0.0.1:3000
}
EOF

systemctl reload caddy
```

A `basicauth` írásmód az Ubuntu csomagjában lévő Caddy-verzióval működik; az
újabb (2.8+) verziók `basic_auth` néven ismerik, de a régit is elfogadják.

A tanúsítványt a Caddy maga kéri és újítja meg. Ezután
`https://mailer.sajatdomain.hu` jelszót kér, majd a felületet adja.

Ha egyes útvonalaknak nyitva kell maradniuk (pl. egy külső bot API-ja), azokat
vedd ki a védelem alól:

```
mailer.sajatdomain.hu {
    @vedett not path /api/bot/*
    basicauth @vedett {
        felhasznalo IDE_A_HASH
    }
    reverse_proxy 127.0.0.1:3000
}
```

Domain nélkül: a Caddy helyett SSH-alagúton át is elérhető a felület
(`ssh -L 3000:127.0.0.1:3000 app@SZERVER_IP`, majd `http://localhost:3000` a
saját gépeden). Ilyenkor a 80-as és 443-as portot ki sem kell nyitni.

### 3.9 Első indítás — ellenőrzőlista

1. Nyisd meg a felületet, add hozzá az első fiókot (2.5).
2. **Kapcsolatpróba** → „Kapcsolat rendben".
3. **Próbalevél magadnak** → megérkezik, jól néz ki, a csatolmány rajta van.
4. Indítás **teszt módban** (max. 3 levél) → a naplóban látszik a küldés és a
   „következő levél N perc múlva".
5. **Újraindítási próba:** `systemctl restart mailer`, majd a naplóban:
   „1 félbehagyott küldés folytatódik". Ez igazolja, hogy a menet túléli a
   szerver újraindulását.
6. **Leállítási próba:** Leállítás a felületen → a menet megáll, és
   újraindítás után sem indul el.
7. Éles indítás a valódi kerettel.

A Google az első belépésnél új helyről (adatközponti IP) biztonsági
figyelmeztetést küldhet a fiókra — ezt a fiókban jóvá kell hagyni.

### 3.10 Frissítés

Új verzió kitelepítése, az `app` felhasználóval:

```bash
cd /home/app/app
git pull
npm ci
npm run build
exit
systemctl restart mailer      # rootként
```

Az újraindítás a futó meneteket nem veszíti el: az állapot az adatbázisban
van, indulás után folytatódnak. A folyamatban lévő levél még kimegy
(`TimeoutStopSec=30`); a szünetben alvó menet egyszerűen újraindul, és a
következő levelet a sor elejéről küldi.

Érdemes ezt egy `deploy.sh` szkriptbe tenni.

### 3.11 Üzemeltetés

| Mit | Hogyan |
| --- | --- |
| Fut-e | `systemctl status mailer` |
| Mit csinál | `journalctl -u mailer -f` |
| Lemez | `df -h` — a naplót a journald magától forgatja |
| Memória | `free -h` |
| Mentés | Hetzner konzol → a szerver → Backups (felárért), vagy Snapshot kézzel |
| Titkok mentése | `atlas-credentials.env` és a `MAIL_SECRET_KEY` jelszókezelőben — a szerver elvesztése után ezekből építhető újra |
| Adatbázis | Az Atlasban él, nem a szerveren — a szerver bármikor újraépíthető |

Leállás esetén a sorrend: `systemctl status mailer` → `journalctl -u mailer
-n 100` → a felületen a fiók állapota és üzenete (a menet a hiba okát emberi
mondatként írja ki).

### 3.12 DigitalOcean — az eltérések

A lépések ugyanazok, a különbségek:

| | Hetzner | DigitalOcean |
| --- | --- | --- |
| Szerver neve | Server | Droplet |
| Javasolt méret | 2 vCPU / 4 GB | Basic, 2 GB RAM (szűkösebb a fordításhoz; ha a `next build` memóriahiánnyal leáll, 4 GB kell, vagy swap) |
| Tűzfal | Firewalls menü | Networking → Firewalls |
| **SMTP-portok** | 25 és 465 zárva, **587 nyitva** | 25, 465 **és 587 is zárva lehet** — támogatási kérést kell nyitni a feloldásért, és nem biztos, hogy megadják |
| Mentés | Backups / Snapshots | Backups / Snapshots |

Az SMTP-portok miatt a Hetzner az egyszerűbb út. DigitalOceanön a 3.3 lépés
ellenőrzését a Droplet létrehozása után azonnal futtasd le; ha az 587 zárva
van és nem oldják fel, a küldést egy HTTP-alapú levélküldő API-n (nem SMTP-n)
keresztül kellene megoldani, ami már más felépítés.

Swap hozzáadása kis memóriájú gépen, rootként:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## Összefoglaló — a legfontosabb szabályok

1. **Hosszan futó folyamat kell**, nem serverless és nem cron.
2. **Egyetlen példány** fusson.
3. **Fiókonként egy menet**, saját sorral, kerettel, ütemezéssel.
4. **A szünet véletlen és megszakítható.**
5. **Az állapot az adatbázisban is ott van** — ettől éli túl az újraindítást,
   és ettől megbízható a leállítás.
6. **Küldés előtt mindig friss ellenőrzés:** jogosult-e még, nem kapott-e már,
   nem állították-e le.
7. **Kevés levél fiókonként, felfuttatással.** Több levélhez több fiók kell.
8. **A fiókjelszó titkosítva tárolódik, a kulcs a szerveren van, a jelszó
   sosem megy vissza a böngészőnek.**
9. **Hetzneren 587-es port**, STARTTLS-szel.
10. **A felület legyen jelszó mögött.**

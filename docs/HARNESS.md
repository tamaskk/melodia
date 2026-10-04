# A harness

Nem konfigfájlok gyűjteménye. Az a rendszer, ami három kérdésre válaszol,
mielőtt egy sor kód megszületne: **mit lát az agent, mit tehet meg, és mikor
mondhatja, hogy kész.** Minden fájl ebben a mappában e három közül pontosan az
egyikre válasz.

## Alaprajz

```
melodia/
├── CLAUDE.md                     # a szerződés — mindig betöltődik (~85 sor)
├── .worktreeinclude              # mi másolódjon új worktree-be (titkok!)
├── .claude/
│   ├── settings.json             # hookok + permissionök (verziókövetve)
│   ├── settings.local.json       # személyes eltérés (gitignore-olva)
│   ├── skills/                   # eljárások: /spec /feature /fix /handover /anchors
│   ├── agents/                   # reviewer (opus), test-runner (haiku)
│   └── hooks/                    # protect-files, guard-bash, format, gate-stop, session-context
├── src/components/CLAUDE.md      # frontend szabályok — csak itt töltődik be
├── src/lib/CLAUDE.md             # domain és adapterek
├── src/app/api/CLAUDE.md         # route-ok
└── docs/
    ├── SPEC.md                   # az aktuális feladat hatóköre
    ├── HANDOVER.md               # a /handover írja, session végén
    └── adr/                      # döntések, Nygard-formátum
```

Négy kategória, semmi más: **ami mindig igaz** (CLAUDE.md), **ami néha igaz**
(alkönyvtárbeli CLAUDE.md), **ami eljárás** (skill), **ami kötelező** (hook).
Ha egy szabály egyikbe se fér bele, valószínűleg nem szabály, csak gondolat.

## L1 · CLAUDE.md — a szerződés

Ez az egyetlen fájl, ami minden session minden tokenjét terheli. Az **irtás
teszt** tartja méretben: ha egy sor kivétele nem okoz hibát, a sor felesleges.
Ami bent van: parancsok, amiket nem lehet kitalálni; környezeti kényszerek
(titkok helye, Atlas hálózata, Vercel korlátai); csapdák, amikbe már belefutottam;
és a **szótár** — a horgonyok, amiktől egy szó kivált két bekezdést.

## L2 · Alkönyvtárbeli CLAUDE.md — amit csak néha kell tudni

> **Pontosítás a tervhez képest:** `.claude/rules/` `paths:` frontmatterrel
> **nem létezik** a Claude Code-ban. A path-scoped szabály valódi mechanizmusa
> az **alkönyvtárba tett `CLAUDE.md`**: nem indításkor töltődik be, hanem
> akkor, amikor az agent abban a fában olvas vagy ír fájlt. Dokumentált
> mélység- vagy darabszám-korlát nincs.

Ezért a Mongo-konvenciók nem terhelik a kontextust, amikor egy React
komponenst szerkeszt — és fordítva.

## L3 · Skillek — az eljárások

A skill teste csak híváskor kerül kontextusba; a leírása mindig ott van, ebből
tudja, mikor való. Mind az öt egy visszatérő hibára válasz.

| Skill | Mit csinál | Melyik hibára válasz |
| --- | --- | --- |
| `/spec` | Felderít, legfeljebb öt kérdést tesz fel, megírja a `docs/SPEC.md`-t | Homályos feladat indul el, aztán elkanyarodik |
| `/feature` | A sín: SPEC → bukó ellenőrzés → implementáció → typecheck/lint → bizonyíték → commit | Nincs rögzített sorrend |
| `/fix` | Reprodukció → gyökérok → javítás → bizonyíték | Tünetet kezelünk, nem okot |
| `/handover` | `docs/HANDOVER.md`: mi történt, hol tart, mi a következő lépés, mit ne próbáljunk újra | A napi kontextus a fejemben marad |
| `/anchors` | A horgonyok szótára, on-demand | Még nem ülnek a fogalmak |

A `disable-model-invocation: true` az elsőnél négynél azt jelenti: **csak én
hívhatom**. Mellékhatásos eljárásnál ez kell — nem akarom, hogy magától
commitoljon. Az `allowed-tools` pedig előre engedélyezi a hívás idejére azt a
pár parancsot, ami az eljáráshoz kell (szóközzel elválasztva, nem vesszővel).

Amit **nem** írok meg, mert gyárilag megvan: `/code-review`, `/debug`,
`/verify`, `/doctor`, `/goal`, `/loop`, `/context`, `/btw`, `/compact`.

## L4 · Hookok — a törvény

Itt válik el a harness a jókívánságtól: a hookot a Claude Code futtatja, nem a
modell dönt róla.

| Esemény | Script | Miért |
| --- | --- | --- |
| `PreToolUse` · Edit\|Write\|MultiEdit | `protect-files.sh` | Titkok, lockfile, `.git/`, migrációk, `attachments/` — a szerkesztés **előtt** áll meg, mert a PostToolUse már nem tud visszacsinálni semmit |
| `PreToolUse` · Bash | `guard-bash.sh` | Ugyanez shell oldalról: `rm -rf`, `--force` push, `reset --hard`, `dropDatabase`, `curl \| sh`, titkos fájl felülírása |
| `PostToolUse` · Edit\|Write | `format.sh` | Prettier + ESLint a szerkesztett fájlra. Soha többé nem kérem meg, hogy formázzon |
| `SessionStart` · compact\|resume | `session-context.sh` | Tömörítés után visszainjektálja az alapszabályokat — a stdout itt egyenesen a kontextusba megy |
| `Stop` | `gate-stop.sh` | A kapu: typecheck + lint (+ teszt, ha van) zöld, különben nem zárható le a kör |

A szerződés, amit ismerni kell:

- **Kilépési kód 2 = blokk**, és a stderr az indoklás. Ezért nem csak
  megakadályozzuk, hanem meg is mondjuk, mit csináljon helyette.
- A `Stop` hook **nem fut le Ctrl+C-re** — csak normál befejezéskor.
  Subagentnél külön esemény van (`SubagentStop`).
- A `stop_hook_active` mezőt figyelni kell, különben végtelen kör lesz belőle.
  A rendszer ~8 blokk után amúgy is felülbírálja.
- A `gate-stop.sh` nem fut feleslegesen: ha egy körben egyetlen `.ts/.tsx`
  fájl sem változott, azonnal kiszáll — a kérdés-válasz körök nem fizetnek
  20 másodpercet.
- A hookok a csomagkezelőt lockfile-ból ismerik fel (npm/pnpm/yarn/bun), és
  csak létező npm scriptet futtatnak — így ez a harness átemelhető olyan
  projektbe is, ahol van teszt-futtató.

**Biztonság:** egy klónozott repó `.claude/settings.json`-je tetszőleges
parancsot futtathat a gépeden. Idegen projekt hookjait ugyanúgy át kell nézni,
mint egy npm `postinstall` scriptet.

## L5 · Subagentek — a friss szem

Kettő, nem tíz: ha elárasztom opciókkal, romlik az automatikus delegálás.

- **`reviewer`** (Read/Grep/Glob/Bash, **opus**): a diffet nézi, nem látta az
  érvelést, ami a kódot szülte. A promptjában benne van a fék is: *csak azt
  jelezd, ami a helyességet vagy a specifikációt érinti* — egy hibakeresésre
  utasított review mindig talál valamit, és ha mindet végigcsináljuk,
  túltervezett kód lesz belőle.
- **`test-runner`** (Bash/Read/Grep, **haiku**): lefuttatja az ellenőrzéseket és
  összefoglal. A több száz sor kimenet nála marad, nem a fő kontextusban. Olcsó
  modell, mert csak futtat.

## L6 · Permissionök — a döntési fáradtság ellen

Nem elsősorban biztonsági kérdés, hanem figyelmi: ha húszszor kérdez rá naponta
egy tesztfuttatásra, a huszonegyedikre reflexből igent nyomok — és pont az lesz
az, amit el kellett volna olvasnom.

- **allow**: ami olvas és ellenőriz (`Read(src/**)`, `npm run typecheck`, `lint`,
  `build`, `git status/diff/log`).
- **ask**: ami ír vagy hálózatra megy (`git commit`, `git push`, `npm install`,
  `vercel`, `curl`).
- **deny**: amit soha (`atlas-credentials.env`, `.env*`, `attachments/`,
  `*.pem`, `rm -rf`, `--force` push, `reset --hard`).

## L7 · MCP — a láthatatlan adó

Az eszköz-sémák indításkor betöltődnek, akkor is, ha nem használom őket: két
böngésző-MCP 30 ezer tokent is elvihet az első karakter előtt. Ezért ebben a
projektben **nincs `.mcp.json`** — a Mongóhoz saját kódunk van, a keresésekhez
CLI. Ha bejön egy, a `/context` az első hely, ahol az árát megnézem.

## L8 · Ütemezés

Rendszerszintű cron nincs a Claude Code-ban. Ami van:

| Eszköz | Meddig él | Mire jó |
| --- | --- | --- |
| `/loop 15m …` | sessionben, 7 nap után lejár | rendszeres állapotellenőrzés hosszú futtatás mellett |
| `/goal …` | amíg a feltétel nem teljesül | „addig dolgozz, amíg zöld" — külön kiértékelő nézi minden kör után |
| GitHub Actions / `claude -p` | a gépemtől függetlenül | ez az igazi cronjob: PR-review, éjszakai ellenőrzés |

## A munkafolyamat — ezért van az egész

1. **Felderítés → terv → kód → commit.** Plan mód, ha a feladat nem
   egymondatos; ha a diffet le tudom írni egy mondatban, a tervezés overhead.
2. **Az ellenőrzési létra**, egyre több beállítással, egyre kevesebb
   figyelmemért: promptban kérem → `/goal` → `Stop` hook → `reviewer` subagent.
3. **Bizonyítékot mutasson, ne állítsa a sikert.** Parancs és kimenete.
   Bizonyítékot átnézni gyorsabb, mint újrafuttatni az ellenőrzést.
4. **Kontextus-higiénia.** `/clear` a nem összefüggő feladatok között;
   `/handover` előtte. Ha ugyanazt kétszer kellett javítani, nem a harmadik
   javítás kell.

## Mit ellenőriztem élesben

| Amit vizsgáltam | Eredmény |
| --- | --- |
| `protect-files.sh` egységteszt | `atlas-credentials.env` → exit 2 indoklással; `src/lib/mailer.ts` → exit 0 |
| `guard-bash.sh` egységteszt | `rm -rf`, `git push --force` → exit 2; `npm run typecheck` → exit 0 |
| `gate-stop.sh` zöld kódon | exit 0 |
| `gate-stop.sh` szándékos típushibán | exit 2, a `tsc` hibasora az indoklásban |
| Stop hook valódi sessionben | lefutott (`claude -p` után marker a lemezen) |
| Deny szabály valódi sessionben | „Írd bele az `atlas-credentials.env`-be…" → megtagadva, a fájl bitre azonos maradt |

## Átemelés másik projektbe

1. Másold: `.claude/`, `CLAUDE.md`, `.worktreeinclude`, `docs/adr/0000-sablon.md`.
2. A `CLAUDE.md`-ben cseréld a parancsokat és a környezeti részt — a szótár és
   a munkamód marad.
3. Az alkönyvtárbeli `CLAUDE.md`-ket tedd a saját mappaszerkezethez.
4. A hookok nem igényelnek átírást: a csomagkezelőt és a létező scripteket
   maguktól ismerik fel. Ahol van `test` script, a kapu a tesztet is futtatja.

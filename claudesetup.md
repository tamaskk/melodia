# Claude Code harness — teljes beállítási útmutató

Mit tegyél a `CLAUDE.md`-be, a `.claude/skills/`, `.claude/agents/`,
`.claude/hooks/` mappákba és a `.claude/settings.json`-be — pontos szintaxissal,
buktatókkal, ellenőrzési recepttel. A példák ebből a repóból valók, tehát
működnek.

Egy mondatban, mire jó az egész: eldönteni, **mit lát az agent, mit tehet meg,
és mikor mondhatja, hogy kész**.

---

## 0. A betöltési modell — ezt kell először érteni

| Réteg | Hol | Mikor kerül a kontextusba | Kontextus-ár |
| --- | --- | --- | --- |
| `CLAUDE.md` (gyökér) | `./CLAUDE.md` | **minden session indulásakor** | minden token, minden kérésnél |
| Alkönyvtár `CLAUDE.md` | `src/lib/CLAUDE.md` | **csak amikor abban a fában olvas/ír fájlt** | nulla, amíg nem nyúl oda |
| Skill leírás | `.claude/skills/*/SKILL.md` frontmatter | indulásnál (csak a `description`) | pár tíz token skillenként |
| Skill törzs | ugyanaz a fájl | **csak hívásnál** | nulla, amíg nem hívod |
| Subagent | `.claude/agents/*.md` | a `description` indulásnál, a törzs a subagent saját ablakában | a fő ablakot nem terheli |
| Hook | `.claude/settings.json` + script | **soha nem kerül kontextusba** — a Claude Code futtatja | nulla |
| MCP | `.mcp.json` | indulásnál, minden eszköz sémája | **sok**: 2 szerver akár 30 000 token |

Ebből következik az egész tervezés: ami mindig kell → `CLAUDE.md`; ami néha →
alkönyvtár; ami eljárás → skill; ami kötelező → hook.

**A leggyakoribb tévhit:** a `@fajl.md` import a `CLAUDE.md`-ben **nem spórol
kontextust** — az importált fájl ugyanúgy betöltődik indulásnál. Szervezésre
jó, méretcsökkentésre nem.

---

## 1. `CLAUDE.md` — a szerződés

**Cél: 100 sor alatt, maximum 200.** Nem azért, mert szép, hanem mert hosszabb
fájlnál romlik a betartás, és a fontos elveszik a lényegtelenben.

### Az irtás teszt

Minden sornál egy kérdés: **ha ezt kiveszem, hibázni fog tőle?** Ha nem, ki vele.

| Bekerül | Nem kerül be |
| --- | --- |
| Parancsok, amiket nem tud kitalálni (`npm run seed`) | Amit a kódot elolvasva megért |
| Stílusszabály, ami **eltér** az alapértelmezettől | Szokásos nyelvi konvenciók |
| Repó-etikett: ág- és commit-forma | Részletes API-dokumentáció (arra link van) |
| Környezeti kényszer: hol vannak a titkok, mi a szűk keresztmetszet | Ami hetente változik |
| Csapdák, amikbe már belefutottál | „Írj tiszta kódot" típusú semmitmondás |

### Szerkezet, ami bevált

```markdown
@AGENTS.md                    ← ha van ilyen (a Next.js maga írja)

# Szerződés

## Parancsok                  ← 4-6 sor, kommenttel, mikor melyik
## Környezet                  ← titkok helye, teljesítmény-kényszer, mi nem megy hol
## Repó-etikett               ← ág, commit, nyelv
## Csapdák, amikre rámentem   ← ez a legértékesebb rész, idővel nő
## Szótár                     ← horgonyok: egy név = egy tudásblokk
## Munkamód                   ← 5 pont, számozva
```

### A szótár (horgonyok) — a fájl legjobban megtérülő tíz sora

Egy bevett név egész tudásblokkot aktivál. Rövidebb prompt, kevesebb
félreértés:

```markdown
- **Chicago School** (inside-out): domain-egységteszt valódi collaboratorokkal,
  állapot-ellenőrzés.
- **London School** (outside-in): külső integráció (HTTP, fizetés, e-mail)
  mockolt collaboratorokkal, interakció-ellenőrzés.
- **AAA**: Arrange-Act-Assert, tesztenként egy Act.
- **Ports & Adapters**: minden külső rendszer adapter mögött.
- **Irtás teszt**: ha egy sor kivétele nem okoz hibát, a sor felesleges.
```

„Csinálj TDD-t" kétértelmű. „London School" nem az.

### Amire figyelj

- **Ne emelj ki tíz dolgot.** Ha minden `IMPORTANT`, semmi nem az.
- **Ellentmondó szabályból tetszőlegesen választ.** Egy szabály, egy helyen.
- **A `CLAUDE.md` tanács, nem törvény.** User üzenetként érkezik; nincs
  betartási garancia. Amit tényleg be kell tartatni → hook.
- **Gondozd.** Havonta fusd át; két hónap alatt magától visszahízik.
- `/init` legenerálja a vázat, de az eredmény tipikusan kétszer akkora, mint
  amekkora kell — utána irtsd meg.

---

## 2. Path-scoped szabályok — `.claude/rules/` **nem létezik**

Sok blogposzt (és több harness-terv) `.claude/rules/frontend.md` fájlokat
emleget `paths:` frontmatterrel. **Ilyen funkció nincs a Claude Code-ban.** Ha
létrehozod, nem fog betöltődni, és csendben nem történik semmi — ez a
legrosszabb fajta hiba.

**A valódi mechanizmus: alkönyvtárba tett `CLAUDE.md`.** Nem indulásnál
töltődik be, hanem akkor, amikor az agent abban a fában olvas vagy ír fájlt.
Dokumentált mélység- vagy darabszám-korlát nincs.

```
src/components/CLAUDE.md     ← React-szabályok: csak komponens-szerkesztésnél
src/lib/CLAUDE.md            ← domain és adapterek: adatbázis, külső hívások
src/app/api/CLAUDE.md        ← route-ok: válaszformátum, futásidő-korlátok
```

Tartalom-példa (`src/app/api/CLAUDE.md`), 15 sor, csupa olyan, ami itt igaz és
máshol nem:

```markdown
# API route-ok (Next App Router)

Vékony réteg: kérés beolvasása, hívás a `src/lib`-be, válasz. Üzleti logika
itt nincs.

- `export const dynamic = "force-dynamic";` minden adatot olvasó útvonalon.
- Hiba: `NextResponse.json({ error: "…" }, { status: 4xx })`, magyar üzenettel.
- `maxDuration`: Vercel Hobby csomagon legfeljebb 300 — nagyobb érték a
  telepítést bukja meg.
```

**Szabály:** ami csak egy mappában igaz, az oda való. A Mongo-konvenció zaj egy
React-komponens szerkesztése közben.

---

## 3. `.claude/skills/` — az eljárások

Útvonal: **`.claude/skills/<név>/SKILL.md`** (a mappanév adja a `/parancs`-ot).
A `.claude/commands/` elavult, de működik; ma skillként írjuk.

### Frontmatter — a használható mezők

```yaml
---
name: feature                       # kötelező; ez lesz a /feature
description: Feature végigvitele…   # kötelező; EBBŐL dönti el, mikor való
argument-hint: "[feature neve]"     # a / menüben látszik
disable-model-invocation: true      # csak ÉN hívhatom, magától nem
user-invocable: false               # fordítva: csak ő hívhatja, én nem
allowed-tools: Read Edit Bash(npm run*)   # SZÓKÖZZEL elválasztva, nem vesszővel
disallowed-tools: Write             # amit vegyen el az örökölt készletből
model: sonnet                       # olcsóbb/drágább modell erre az eljárásra
context: fork                       # külön ablakban fusson (nagy kimenetnél)
agent: Explore                      # forkolt skillnél melyik subagent vigye
effort: high                        # gondolkodási mélység
---
```

**A két mező, ami a legtöbbet számít:**

- `disable-model-invocation: true` — **mellékhatásos eljárásnál kötelező.**
  Enélkül magától is lefuttathatja: nem akarod, hogy magától commitoljon.
- `allowed-tools` — a hívás idejére előre engedélyezi azt a pár parancsot, ami
  az eljáráshoz kell. Így nem kattintasz végig húsz engedélykérést, és nem
  szoksz rá, hogy mindenre igent nyomsz.

### Argumentumok

- `$ARGUMENTS` — a teljes argumentumszöveg
- `$0`, `$1`, `$2` — pozíció szerint
- Ha egyik helyőrzőt sem használod, a bemenet a végére kerül `ARGUMENTS:` alatt

### Melyik legyen skill?

| Ez | Ide |
| --- | --- |
| Egymondatos szabály | `CLAUDE.md` |
| Mappára jellemző szabály | alkönyvtár `CLAUDE.md` |
| **Többlépéses eljárás, rögzített sorrenddel** | **skill** |
| Amit ki kell kényszeríteni | hook |

Öt skill bőven elég egy repóhoz. Nálam: `/spec` (kikérdez → `docs/SPEC.md`),
`/feature` (SPEC → bukó ellenőrzés → kód → typecheck/lint → bizonyíték →
commit), `/fix` (reprodukció → gyökérok → javítás → bizonyíték), `/handover`
(session vége, `/clear` előtt), `/anchors` (fogalomtár).

Mindegyiket **egy visszatérő hibádra** írd, és a skill első sorába írd is oda,
melyikre — attól lesz konkrét.

### Amit ne írj meg

Gyárilag megvan: `/code-review`, `/debug`, `/verify`, `/doctor`, `/goal`,
`/loop`, `/context`, `/clear`, `/compact`, `/btw`, `/model`, `/effort`,
`/permissions`, `/init`, `/plan`. Saját `/review` és `/commit` írása ma
felesleges.

### Buktatók

- **A `description` a trigger.** Ha homályos, sose fogja magától használni.
  Írd bele, *mikor* való: „Akkor hívd, amikor egy feladat készen van, de még
  nincs commitolva."
- A skill törzse **nem** kerül kontextusba, amíg nem hívod — nyugodtan lehet
  hosszú referencia benne.
- Túl sok skill rontja a választást. 15-20 fölött már kezelhetetlen.

---

## 4. `.claude/agents/` — a subagentek

Útvonal: `.claude/agents/<név>.md`. Külön kontextusablak, **nem látja a
beszélgetést, és nem tud visszakérdezni** — a prompt legyen önhordó.

### Frontmatter

```yaml
---
name: reviewer
description: Friss szemmel átnézi a diffet, mielőtt commitolnánk. Csak olvas.
tools: Read, Grep, Glob, Bash        # VESSZŐVEL — itt más a szintaxis, mint a skillnél!
disallowedTools: Write, Edit         # vagy fordítva: az örököltből vegyen el
model: opus                          # opus | sonnet | haiku | inherit
permissionMode: default              # default | acceptEdits | plan | …
maxTurns: 10                         # felső korlát, hogy ne fusson el
color: blue
---
```

> **Figyelem a szintaxisra:** skillben `allowed-tools` **szóközzel**, agentben
> `tools` **vesszővel**. Ez a leggyakoribb elgépelés.

### Kettő elég

- **`reviewer`** (`opus`, csak olvasó eszközök): a diffet nézi. Az értéke pont
  az, hogy nem látta az érvelést, ami a kódot szülte.
- **`test-runner`** (`haiku`, `Bash, Read, Grep`): lefuttatja a
  typecheck/lint/teszt hármast és **összefoglal**. A több száz sor kimenet
  nála marad, nem a te ablakodban. Olcsó modell, mert csak futtat.

Ez a **modell-tiering**: drága modell az ítélethez, olcsó a futtatáshoz.

### A fék, amit a reviewer promptjába muszáj beírni

Egy hibakeresésre utasított review majdnem mindig talál valamit, akkor is, ha a
munka rendben van — mert ezt kérték tőle. Ha minden találatát végigcsinálod,
túltervezett kód lesz belőle: felesleges absztrakció, védekező kód, teszt olyan
esetre, ami elő sem fordulhat. Ezért:

```markdown
Csak azt jelezd, ami a helyességet vagy a specifikációt érinti.
Stílus, elnevezés, „szebb lenne így" — csak ha kifejezetten kérik.
Ha a munka rendben van, mondd ki egy mondatban. Nem kell találnod semmit.
```

És add meg a kimenet alakját is, különben esszét ír:
`fájl:sor — mi a baj. Mi a következmény. Mi a javaslat.` — legfeljebb 8 pont.

---

## 5. `.claude/hooks/` — a törvény

A hook nem a modell döntése: a Claude Code futtatja, **még
`bypassPermissions` módban is**. Itt válik el a harness a jókívánságtól.

### Beállítás a `settings.json`-ben

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/protect-files.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- `${CLAUDE_PROJECT_DIR}` **működik** — ne írj abszolút útvonalat, mert más
  gépen elhasal.
- `matcher`: regex a **tool nevére** (`Bash`, `Edit|Write`, `mcp__.*`).
  `SessionStart`-nál más a készlet: `startup`, `resume`, `clear`, `compact`,
  `fork`. A `Stop` eseménynél nincs matcher.
- `timeout` másodpercben. A `Stop` kapunál legyen bőséges (300), a
  `PreToolUse`-nál kicsi (10), különben minden szerkesztés lassul.

### Események, amiket érdemes használni

| Esemény | Mire | Tud blokkolni? |
| --- | --- | --- |
| `PreToolUse` | védett fájl, veszélyes parancs | **igen** |
| `PostToolUse` | formázás, lint --fix a szerkesztett fájlra | nem (az eszköz már lefutott) |
| `UserPromptSubmit` | kontextus-injektálás minden prompt elé | igen |
| `SessionStart` (`compact`, `resume`) | tömörítés után visszaadni az alapszabályokat | nem |
| `Stop` | „nem fejezheted be, amíg nem zöld" | **igen** |
| `SubagentStop` | ugyanez subagentre | igen |

### A szerződés, amit ismerni kell

- **Kilépési kód 2 = blokk**, és a **stderr az indoklás**. Ezért ne csak
  megakadályozz, hanem mondd is meg, mit csináljon helyette.
- Kilépési kód 0: a stdout a naplóba megy — **kivéve** `UserPromptSubmit`,
  `SessionStart` (és néhány társuk), ahol egyenesen a kontextusba kerül.
- Bármi más kilépési kód: nem blokkoló hiba, megy tovább.
- A `PostToolUse` már **nem tud visszacsinálni** semmit. Amit meg kell
  akadályozni, az `PreToolUse`.
- A `Stop` hook **nem fut le Ctrl+C-re**, csak normál befejezéskor.
- A `Stop` hook végtelen körbe futna, ha nem figyelnéd a **`stop_hook_active`**
  mezőt. A rendszer ~8 blokk után amúgy is felülbírálja.

### Bemenet: mit kapsz stdinre (JSON)

```json
{
  "session_id": "…",
  "cwd": "/Users/…/projekt",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "stop_hook_active": false
}
```

Szerkesztésnél `tool_input.file_path`, Bash-nél `tool_input.command`. Ezt `jq`-val
szedd ki — a hookok gyakorlatilag mindig igénylik a `jq`-t.

### Öt hook, ami lefedi a visszatérő bajokat

**1. Védett fájlok (`PreToolUse` · Edit|Write)**

```bash
#!/usr/bin/env bash
set -uo pipefail
input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"
[[ -z "$file" ]] && exit 0
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
rel="${file#"$root"/}"

block() { echo "BLOKKOLVA: $rel — $1" >&2; echo "Kérd meg a felhasználót." >&2; exit 2; }

case "$rel" in
  .env|.env.*|*/.env)                 block "titkokat tartalmazó fájl" ;;
  atlas-credentials.env)              block "hitelesítő adatok" ;;
  *.pem|*.key|*id_rsa*)               block "kulcsfájl" ;;
  package-lock.json|pnpm-lock.yaml)   block "lockfile — a csomagkezelő írja" ;;
  .git/*)                             block "a git belső állapota" ;;
  */migrations/*)                     block "lefutott migráció" ;;
esac
exit 0
```

**2. Veszélyes shell (`PreToolUse` · Bash)** — ugyanez a minta
`.tool_input.command`-ra: `rm -rf`, `git push --force`, `git reset --hard`,
`git clean -f`, `dropDatabase`, `chmod 777`, `curl … | sh`, `sudo`.

**3. Formázás (`PostToolUse` · Edit|Write)**

```bash
file="$(printf '%s' "$(cat)" | jq -r '.tool_input.file_path // empty')"
[[ -f "$file" ]] || exit 0
npx --no-install prettier --write "$file" >/dev/null 2>&1
npx --no-install eslint --fix "$file" >/dev/null 2>&1
exit 0
```

A `--no-install` a lényeg: ha a projektben nincs prettier, csendben kimarad.

**4. Tömörítés utáni emlékeztető (`SessionStart` · `compact|resume`)** — a
stdout itt kontextusba megy, tehát elég `cat <<'TXT' … TXT`. Ide az az 5-6
szabály jön, aminek az elvesztése minőségromlást okoz.

**5. A kapu (`Stop`)**

```bash
input="$(cat)"
[[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" == "true" ]] && exit 0

# Ha egy kódfájl sem változott, ne büntessük a kérdés-válasz köröket.
changed="$(git status --porcelain | grep -cE '\.(ts|tsx|js|jsx)$' || true)"
[[ "${changed:-0}" -eq 0 ]] && exit 0

if ! out="$(npm run --silent typecheck 2>&1)"; then
  { echo "A kör nem zárható le: typecheck hibás."; echo; echo "$out" | tail -40; } >&2
  exit 2
fi
exit 0
```

Ez az, ami miatt el lehet menni ebédelni futó feladat mellől.

### Hogyan teszteld — futtatás nélkül, egy sorból

```bash
echo '{"tool_input":{"file_path":"/projekt/.env"}}' | .claude/hooks/protect-files.sh; echo "exit=$?"
# → BLOKKOLVA: .env — titkokat tartalmazó fájl        exit=2

echo '{"stop_hook_active":false}' | .claude/hooks/gate-stop.sh; echo "exit=$?"
```

Élesben így bizonyítod, hogy tényleg fut: tegyél a script elejére egy
`echo "lefutott $(date)" >> /tmp/hook.log` sort, futtass egy `claude -p "ok"`
kört, és nézd meg a fájlt. (A `--debug` kimenetben nem feltétlenül látszik.)

### Buktatók, amikbe bele fogsz futni

- **A hook a teljes parancsszöveget látja.** Ha a mintád `rm -rf`-re illeszkedik,
  akkor egy olyan parancsot is blokkol, ami csak *említi* — például a saját
  javító scriptedet vagy egy tesztesetet. Ilyenkor a fájlt Edit eszközzel írd
  át, ne shellből.
- **Ne írj túl tág mintát.** Nálam a „rekurzív törlés abszolút úton" szabály
  `[rf]`-et illesztett, így az ártalmatlan `rm -f /tmp/fajl` is fennakadt.
  Javítva `r`-re. Egy vak riasztás annyit ér, mint egy hiányzó szabály —
  mindkettőtől megtanulsz nem figyelni rá.
- **Idegen repó hookja a te gépeden fut.** Klónozás után nézd át a
  `.claude/settings.json`-t, ugyanúgy, mint egy npm `postinstall` scriptet.
- Minden hook legyen `chmod +x`, és `#!/usr/bin/env bash` sorral kezdődjön.
- A hook a projekt gyökeréből indul, de ne bízz benne:
  `root="$(git rev-parse --show-toplevel)"`.

---

## 6. `.claude/settings.json` — engedélyek és beállítások

### Precedencia (felül a legerősebb)

1. vállalati/managed beállítás
2. `.claude/settings.local.json` — **gépspecifikus, gitignore-olva**
3. `.claude/settings.json` — projekt, **verziókövetve**
4. `~/.claude/settings.json` — felhasználói, minden projektre
5. alapértelmezések

### A permissions blokk

```json
{
  "permissions": {
    "allow": [
      "Read(src/**)",
      "Bash(npm run typecheck)",
      "Bash(npm run lint)",
      "Bash(git status)",
      "Bash(git diff*)"
    ],
    "ask": [
      "Bash(git push*)",
      "Bash(git commit*)",
      "Bash(npm install*)"
    ],
    "deny": [
      "Read(./atlas-credentials.env)",
      "Read(./.env)",
      "Read(**/*.pem)",
      "Bash(rm -rf*)",
      "Bash(git push --force*)"
    ]
  }
}
```

**A szabály, ami mögötte van:** engedélyezz mindent, ami **olvas és ellenőriz**;
kérdezzen mindenre, ami **ír vagy hálózatra megy**; tiltsd, amit **soha** nem
akarsz — a titkokat és a visszafordíthatatlant.

Ez nem elsősorban biztonsági, hanem **figyelmi** kérdés: ha húszszor kérdez rá
naponta egy tesztfuttatásra, a huszonegyedikre reflexből igent nyomsz — és pont
az lesz az, amit el kellett volna olvasni.

Mintaszintaxis: `Eszköz` vagy `Eszköz(minta)`. A `Bash(npm run*)` prefix-minta,
a `Read(src/**)` glob. Tagadás nincs — arra van a `deny`.

### Egyéb hasznos kulcsok

```json
{
  "model": "opus",
  "alwaysThinkingEnabled": true,
  "env": { "NODE_OPTIONS": "--max-old-space-size=4096" },
  "statusLine": { "type": "command", "command": "…" },
  "enabledPlugins": [],
  "cleanupPeriodDays": 30
}
```

### Amit **ne** tegyél a `settings.json`-be

- **Titkot semmilyen formában** — a fájl verziókövetett.
- Gépspecifikus útvonalat (`/Users/te/...`) — az `settings.local.json`-be való.
- Olyan `allow` bejegyzést, amit egyszer, egy hibakeresés közben engedtél meg
  (`Bash(curl -u user:pass …)`). A felhasználói szintű allowlist idővel tele
  lesz ilyennel — érdemes néha kitakarítani.

---

## 7. Ütemezés — mi létezik valójában

Rendszerszintű cron **nincs** a Claude Code-ban. Ami van:

| Eszköz | Meddig él | Mire jó |
| --- | --- | --- |
| `/loop 15m …` | sessionben, 7 nap után lejár | rendszeres állapotellenőrzés hosszú futtatás mellett |
| `/goal …` | amíg a feltétel nem teljesül | „addig dolgozz, amíg zöld" — külön kiértékelő nézi minden kör után |
| GitHub Actions + `claude -p` | a gépedtől függetlenül | ez az igazi cronjob: PR-review, éjszakai ellenőrzés |

---

## 8. Bevezetési sorrend (fél nap, nem több)

1. **`CLAUDE.md`** — 60-100 sor, irtás teszttel. Kezdd a parancsokkal és a
   környezeti kényszerekkel.
2. **`.claude/settings.json`** — csak a `permissions`, hook nélkül. Egy napig
   használd így, és jegyezd fel, mire kérdez rá feleslegesen.
3. **Két hook**: `protect-files.sh` és `gate-stop.sh`. Ez a kettő adja a
   hasznot 80%-át.
4. **Alkönyvtár `CLAUDE.md`-k**, amikor a gyökér elkezd hízni.
5. **Skillek**, egyesével, mindegyiket egy konkrét visszatérő hibádra.
6. **Subagentek** a végén — csak ha tényleg zajos kimenettel dolgozol.
7. **Plugin** csak akkor, ha már két-három projekten letisztult. Előbb
   működjön, aztán csomagoljuk.

### Karbantartás

- Havonta: `CLAUDE.md` irtás teszt, felhasználói allowlist takarítás.
- `/context` — nézd meg, mi töltődött be és mibe kerül. Lassuló, butuló
  sessionnél ez az első hely.
- `/doctor` — beállítás-ellenőrzés.
- Új csapda → egy sor a `CLAUDE.md` „Csapdák" szakaszába, aznap.

---

## 9. Gyorsellenőrző lista

- [ ] `CLAUDE.md` 200 sor alatt, és minden sora átment az irtás teszten
- [ ] Nincs `.claude/rules/` mappa (nem létező funkció) — helyette alkönyvtár `CLAUDE.md`
- [ ] Minden skill mappája = a parancs neve, `name` + `description` kitöltve
- [ ] Mellékhatásos skillen `disable-model-invocation: true`
- [ ] `allowed-tools` **szóközzel**, agent `tools` **vesszővel**
- [ ] Minden hook `chmod +x`, `${CLAUDE_PROJECT_DIR}` úttal hivatkozva
- [ ] `Stop` hook figyeli a `stop_hook_active` mezőt
- [ ] Minden blokkoló hook stderrbe **indoklást** ír, nem csak tilt
- [ ] Hookok tesztelve `echo '{"…"}' | script` módon, mindkét irányban
- [ ] `settings.json`-ben nincs titok és nincs gépspecifikus útvonal
- [ ] `.claude/settings.local.json` a `.gitignore`-ban
- [ ] `.mcp.json` csak akkor van, ha naponta használod

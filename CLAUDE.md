@AGENTS.md

# Szerződés

Ez a fájl minden session minden tokenjét terheli. Csak az van benne, aminek a
hiánya hibát okozna. Ami néha igaz: `.claude/rules/`. Ami eljárás: `.claude/skills/`.
Ami kötelező: `.claude/hooks/`.

## Parancsok

```bash
npm run dev         # Next.js dev szerver (3000). Ne indíts másikat, ha már fut.
npm run typecheck   # tsc --noEmit — a kör végén zöldnek kell lennie
npm run lint        # eslint — ugyanez
npm run build       # éles fordítás; lassú, csak ha tényleg kell
npm run seed        # Atlas feltöltés a src/data forrásokból
```

Nincs teszt-futtató ebben a projektben. Amíg nincs, a bizonyíték a typecheck, a
lint és a tényleges kimenet (parancs + válasz, képernyőkép, API-válasz).

## Környezet

- Titkok **kizárólag** az `atlas-credentials.env`-ben. Nem `.env`, nem kód,
  nem README. A hook blokkolja a szerkesztésüket.
- Az `attachments/` személyes dokumentum (CV, ajánlólevél) — nem verziókövetett,
  nem szerkeszthető, nem másolható máshova.
- MongoDB Atlas M0: **a hálózat a szűk keresztmetszet** (~100 KB/s). Minden
  lekérdezés lapozzon vagy összegezzen a szerveren; sose húzz át listát azért,
  hogy itt számold meg.
- Vercelen nincs hosszan futó háttérmunka (kiküldés, IMAP-begyűjtés). Az a
  saját gépen vagy mindig futó szerveren megy.

## Repó-etikett

- Ága: `feature/rövid-név`, `fix/rövid-név`. A `main`-re nem commitolunk közvetlenül.
- Commit: jelen idejű, egy mondat, magyarul. Csak akkor, ha kérték.
- Kód angolul, komment és felületi szöveg magyarul.

## Csapdák, amikre rámentem

- React: **ne hívj setState-et effekt törzsében** (`react-hooks/set-state-in-effect`),
  és ne állíts refet állapotfrissítőn belül — fejlesztői módban kétszer fut.
- A szülőtől kapott inline függvény minden rendernél új: ha effekt-függőség,
  végtelen újratöltés lesz belőle. Refbe tedd.
- A `\b` és `\w` csak ASCII-ra illeszkedik — ékezetes szövegnél nem használható.
- Kombináló ékezeteket írj escape-elve (`[̀-ͯ]`), literálisan elromlik.

## Szótár

Ezek horgonyok: egy bevett név egész tudásblokkot aktivál. Ha egyet használok,
azt a jelentést kérem, nem körülírást. Részletek: `/anchors`.

- **Chicago School** (inside-out): domain-egységteszt valódi collaboratorokkal,
  állapot-ellenőrzés.
- **London School** (outside-in): külső integráció (HTTP, fizetés, e-mail)
  mockolt collaboratorokkal, interakció-ellenőrzés.
- **AAA**: Arrange-Act-Assert, tesztenként egy Act.
- **Ports & Adapters**: minden külső rendszer adapter mögött; a domain nem
  ismeri a MongoDB-t, a nodemailert és az OpenAI-t.
- **ADR**: döntés rögzítése Nygard-formátumban, `docs/adr/`.
- **Irtás teszt**: ha egy sor kivétele nem okoz hibát, a sor felesleges.

## Munkamód

1. **Felderítés → terv → kód → commit.** Nem triviális feladatnál előbb terv.
   Ha a diffet egy mondatban le tudom írni, a tervezés csak overhead.
2. **A `docs/SPEC.md` a hatókör.** Ami nincs benne, arról kérdezz, ne találd ki.
3. **Bizonyítékot mutass, ne állítsd a sikert.** Parancs és kimenete, mérés,
   képernyőkép. „Lefuttattam, jó" nem bizonyíték.
4. **Ha ugyanazt kétszer kellett javítani**, állj meg és jelezd. Nem a harmadik
   javítás kell, hanem tiszta lap és jobb kiindulás.
5. Amit a kódból ki lehet olvasni, azt ne kérdezd meg — olvasd el.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

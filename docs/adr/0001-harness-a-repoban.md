# 0001. A harness a repóban él, nem a felhasználói profilban

Dátum: 2026-08-31 · Állapot: elfogadott

## Kontextus

A Claude Code beállításai három helyen élhetnek: felhasználói szinten
(`~/.claude/`), a projektben (`.claude/`, verziókövetve), és gépspecifikusan
(`.claude/settings.local.json`, gitignore-olva). A projekt szabályai — a
parancsok, a csapdák, az Atlas hálózati korlátja, a titkok helye — a
projekthez tartoznak, nem hozzám.

## Döntés

A harness a repóban van, verziókövetve: `CLAUDE.md`, alkönyvtárankénti
`CLAUDE.md`, `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`,
`.claude/settings.json`. Ami személyes vagy gépfüggő, az
`.claude/settings.local.json`-ba megy, és nincs verziókövetve.

## Következmények

- Aki klónozza a repót, ugyanazt a védelmet és ugyanazokat az eljárásokat
  kapja — nem kell szóban átadni a konvenciókat.
- A harness változása ugyanúgy review alá esik, mint a kód.
- Cserébe: **egy idegen repó `.claude/settings.json`-je tetszőleges parancsot
  futtathat a gépemen.** Klónozás után a hookokat ugyanúgy át kell nézni, mint
  egy npm `postinstall` scriptet.
- A több projektben közös rész (a skillek nagy része) duplikálódik. Ha ez
  fájni kezd, akkor jön a plugin — előbb működjön, aztán csomagoljuk.

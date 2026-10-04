---
name: handover
description: Session végén kiírja, mi történt, mi maradt, és mi a következő lépés — /clear vagy /compact előtt. A napi kontextus a repóba kerüljön, ne a fejemben maradjon.
argument-hint: "[opcionális: mire figyeljek a következő körben]"
disable-model-invocation: true
allowed-tools: Read Write Edit Bash(git status) Bash(git diff*) Bash(git log*)
---

$ARGUMENTS

Az a hiba, amire válaszol: a session végén a fejemben van minden, másnap
viszont nulláról kezdjük. A `/clear` olcsó, ha van hova visszatérni.

## Mit csinálj

1. Nézd meg, mi változott: `git status`, `git diff --stat`, és a session során
   érintett fájlok.
2. Írd (vagy frissítsd) a `docs/HANDOVER.md`-t — mindig **felülírva**, nem
   halmozva; a napló a git, ez a pillanatkép:

```markdown
# Átadás — <dátum, óra>

## Mit csináltunk
3-6 pont, eredmény szinten, nem lépésenként.

## Hol tart
Melyik fájl van kész, melyik félkész, mi a jelenlegi állapot (fut-e, zöld-e).

## Következő lépés
A legelső konkrét dolog, amivel folytatni kell. Egy mondat, cselekvő.

## Ami nyitva maradt
Kérdések a felhasználónak, döntések, amiket nem hoztunk meg.

## Amit ne csinálj újra
Zsákutcák: mit próbáltunk, miért nem működött. Ez menti meg a legtöbb időt.
```

3. Ha született közben elvi döntés (adatmodell, architektúra, külső szolgáltatás),
   írj hozzá egy ADR-t a `docs/adr/`-be a sablon szerint — **ne** a HANDOVER-be.
4. A végén egy mondatban mondd ki: mehet a `/clear`.

---
name: fix
description: Hibajavítás gyökérokkal — előbb reprodukció, aztán ok, aztán javítás, végül bizonyíték. Akkor használd, amikor valami elromlott, nem amikor újat építünk.
argument-hint: "[a hiba egy mondatban, vagy a hibaüzenet]"
disable-model-invocation: true
allowed-tools: Read Grep Glob Edit Bash(npm run*) Bash(npx tsc*) Bash(git log*) Bash(git diff*) Bash(git status)
---

A hiba: $ARGUMENTS

Az a hiba, amire válaszol: tünetet kezelünk, nem okot — és két hét múlva
ugyanaz jön vissza más köntösben.

## 1. Reprodukálj, mielőtt bármit módosítanál

Írd le pontosan: mit tettem, mit vártam, mi történt. Ha nem tudod
reprodukálni, **ne javíts** — kérdezd meg, milyen körülmények közt jött elő.
Ha van teszt-futtató, a reprodukció egy bukó teszt.

## 2. Keresd meg a gyökérokot

- Mióta hibás? `git log -S'<jellemző kód>'`, `git log -p <fájl>`.
- Mi az az egy állítás a kódban, ami nem igaz? Írd le egy mondatban.
- Ha egy réteggel feljebb vagy lejjebb van az ok, mondd ki — a tünet helyén
  javítani olcsóbb, de rossz.

## 3. Javíts

A legkisebb változtatás, ami a gyökérokot szünteti meg. Ha a helyes javítás
nagy, jelezd, és kérdezd meg, most kell-e — a tüneti javítás is lehet tudatos
döntés, ha ki van mondva.

## 4. Bizonyíts

- A reprodukciós lépés most a helyes eredményt adja — mutasd a kimenetet.
- `npm run typecheck` és `npm run lint` zöld.
- Mondd meg, **mi volt az ok**, egy mondatban. Ha ugyanez a hiba máshol is
  ott van a kódban, sorold fel a helyeket — de csak azt javítsd, amit kértek.

## 5. Ha a hiba visszatérő fajta

Írj róla egy sort a `CLAUDE.md` „Csapdák" szakaszába. Egy csapda, amit egyszer
leírunk, nem kerül még egyszer bele a kódba.

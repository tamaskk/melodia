---
name: feature
description: Feature végigvitele a SPEC-től a commitig, rögzített sorrendben — bukó ellenőrzés, implementáció, typecheck, lint, bizonyíték, commit.
argument-hint: "[feature neve a SPEC-ből]"
disable-model-invocation: true
allowed-tools: Read Grep Glob Edit Write Bash(npm run*) Bash(npx tsc*) Bash(git status) Bash(git diff*) Bash(git add*) Bash(git commit*) Bash(git checkout -b*)
---

A feladat: $ARGUMENTS

Ez a végrehajtási sín. Az a hiba, amire válaszol: minden alkalommal más
sorrendben csinálom, és a végén nincs bizonyíték.

## A sorrend — ettől ne térj el

1. **Olvasd el a `docs/SPEC.md`-t.** Ha ez a feature nincs benne, **állj meg**,
   és szólj: előbb `/spec` kell. Ne találd ki a hatókört.
2. **Ág.** Ha `main`-en vagyunk, `git checkout -b feature/<rövid-név>`.
3. **Bukó ellenőrzés először.**
   - Ha van teszt-futtató: írj egy tesztet, ami a kért viselkedést írja le,
     futtasd, és **mutasd, hogy bukik**. A teszt neve a viselkedést mondja,
     nem a függvényt. AAA szerkezet, egy Act.
   - Ha nincs teszt-futtató: írd le a konkrét reprodukciós lépést (parancs,
     kérés, képernyő), és mutasd, hogy **most még nem** azt csinálja.
4. **Implementálj** — a legkisebb változtatással, ami zöldre viszi. Kövesd a
   repó meglévő mintáit; új absztrakciót csak akkor, ha a SPEC kéri.
5. **Ellenőrizz, és mutasd a kimenetet:** `npm run typecheck`, `npm run lint`,
   és ha van, `npm test`. Ne azt írd, hogy „lefutott" — mutasd, mit írt ki.
6. **Bizonyíték a viselkedésre:** a 3. pont reprodukciós lépése most a kért
   eredményt adja. Ezt is mutasd.
7. **Commit** leíró üzenettel, magyarul, jelen időben. Ha a felhasználó nem
   kérte a commitot, kérdezd meg előtte.

## Szabályok a sín mentén

- Ha a SPEC hiányos vagy ellentmond a kódnak: állj meg és kérdezz, ne írd felül
  a specifikációt magadtól.
- Ha egy hibát kétszer kellett javítanod ugyanabban a körben, mondd ki: valami
  a felderítésnél csúszott el.
- Ne nyomd el a hibát (`any`, `@ts-ignore`, kikapcsolt lint-szabály, `try/catch`
  üres ággal). Ha tényleg indokolt, írd le, miért, a commit üzenetében.
- A `docs/SPEC.md` állapotát a végén állítsd `kész`-re.

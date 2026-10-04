---
name: spec
description: Kikérdez egy feladatról, majd megírja a docs/SPEC.md-t — érintett fájlok, interfészek, hatókörön kívül, ellenőrzési lépés. Akkor használd, amikor egy feladat nagyobb egy egymondatos diffnél.
argument-hint: "[feladat egy mondatban]"
disable-model-invocation: true
allowed-tools: Read Grep Glob Write Edit Bash(git status) Bash(git diff*) Bash(git log*)
---

A feladat: $ARGUMENTS

Ez a skill azt a hibát orvosolja, hogy túl nagy, homályos feladat indul el, és
menet közben kanyarodik el. A specifikáció a hatókör szerződése.

## 1. Derítsd fel — ne kérdezz olyat, amit a kód megválaszol

Nézd meg a témához tartozó fájlokat, a meglévő mintákat, a hasonló megoldásokat
a repóban. Csak azután kérdezz.

## 2. Kérdezz — legfeljebb öt kérdés, egyszerre

Csak azt kérdezd meg, amitől **más lesz a megoldás**. Tipikusan:

- Mi a megfigyelhető viselkedés, amiről tudni fogjuk, hogy kész? (konkrét eset)
- Mi az, ami kifejezetten **nincs** benne?
- Van-e meglévő minta a repóban, amit követni kell?
- Adat: új mező, migráció, visszafelé kompatibilitás?
- Mi a legrosszabb, ami elromolhat, és mi ilyenkor a helyes viselkedés?

Ha valamire ésszerű alapértelmezés van, ne kérdezd — írd le feltételezésként.

## 3. Írd meg a `docs/SPEC.md`-t

Pontosan ezzel a szerkezettel, magyarul, tömören:

```markdown
# SPEC — <feladat neve>
Dátum: <ma> · Állapot: tervezet | elfogadva | kész

## Cél
Egy bekezdés: mit fog tudni a rendszer, amit most nem.

## Megfigyelhető viselkedés
- Adott <helyzet>, amikor <esemény>, akkor <eredmény>.

## Érintett fájlok
| Fájl | Változás |
|---|---|

## Interfészek
Új vagy módosuló típus, API-válasz, adatbázis-mező — konkrét alakkal.

## Hatókörön kívül
Amit szándékosan NEM csinálunk meg most.

## Feltételezések
Amit alapértelmezésnek vettem, és felülírható.

## Kockázat
Mi romolhat el, és mi a visszaút.

## Ellenőrzés (end-to-end)
A konkrét lépéssor, amivel a kész állapot bizonyítható: parancs, várt kimenet.
Ha van teszt-futtató a projektben, itt a teszt neve; ha nincs, a kézzel
lefuttatható lépés.
```

## 4. Zárás

Foglald össze három mondatban, mi a terv, és kérdezd meg, mehet-e. **Ne kezdj
implementálni** — ez a skill csak specifikációt ír.

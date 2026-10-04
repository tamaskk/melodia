---
name: anchors
description: A projekt szemantikus horgonyainak szótára — mit jelent pontosan London/Chicago School, Ports & Adapters, AAA, ADR és a többi. Akkor hívd, ha egy fogalom pontos jelentése kell.
argument-hint: "[opcionális: melyik fogalom]"
---

$ARGUMENTS

Egy bevett név egész tudásblokkot aktivál: rövidebb prompt, kevesebb
félreértés. Ez a fájl a szótár — a `CLAUDE.md` csak a neveket sorolja.

## Tesztelési iskolák

**Chicago School (inside-out, „classicist").** A domain magból építkezel
kifelé. Valódi collaboratorok, mockolás csak a rendszer határán. Az
**állapotot** ellenőrzöd: a művelet után mi lett az eredmény. Ide tartozik
minden üzleti logika: számítás, szabály, állapotgép.

**London School (outside-in, „mockist").** A belépési ponttól haladsz befelé.
A collaboratorokat mockolod, és az **interakciót** ellenőrzöd: kit hívott meg,
milyen argumentumokkal, hányszor. Ide tartozik minden, aminek mellékhatása van
és lassú vagy pénzbe kerül: HTTP-hívás, e-mail küldés, fizetés, LLM-hívás.

A választás nem ízlés kérdése: ha az eredmény érdekes, Chicago; ha a
*megtörtént-e egyáltalán* a kérdés, London.

**AAA.** Arrange – Act – Assert, ebben a sorrendben, üres sorral elválasztva.
Tesztenként **egy** Act. Az Assertet írd meg először: onnantól a teszt neve
adja magát.

## Architektúra

**Ports & Adapters (hexagonális).** A domain nem ismer külső rendszert. Minden
külvilág (Mongo, SMTP, OpenAI, IMAP) interfész — port — mögött van, a konkrét
megvalósítás az adapter. Ettől lesz a domain tesztelhető valódi objektumokkal.

**Adapter-határ szabály.** Az adapter fordítja a külső alakot belsőre. Ha egy
Mongo-dokumentum mezőneve átszivárog a felületre, a határ elmosódott.

## Döntés és dokumentáció

**ADR (Nygard-formátum).** Egy döntés, egy fájl: *Kontextus – Döntés –
Következmények*, plusz állapot (javasolt / elfogadott / felváltva). Számozva,
`docs/adr/NNNN-cim.md`. Nem íródik át: ha megváltozik, új ADR váltja fel.

**SPEC.** Az aktuális feladat hatóköre, nem a rendszer dokumentációja.
Feladatonként újraíródik.

## Munkamódszer

**Irtás teszt.** Minden sornál: ha kiveszem, hibázik tőle valaki? Ha nem, ki
vele. Ez tartja a `CLAUDE.md`-t 100 sor alatt.

**Bizonyíték, nem állítás.** A „lefuttattam, jó" nem bizonyíték. A parancs és a
kimenete az.

**Két javítás szabály.** Ha ugyanazt kétszer kellett javítani egy körben, a
kontextus tele van zsákutcával: `/clear` és jobb kiinduló prompt kell, nem
harmadik javítás.

**Tanács kontra törvény.** Amit kérni lehet, az `CLAUDE.md`. Amit be kell
tartatni, az hook — az a harness kódja, nem a modell döntése.

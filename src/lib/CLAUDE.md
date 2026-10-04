# Domain és adapterek

Itt él a logika és minden külső rendszer adaptere (Mongo, SMTP, IMAP, OpenAI,
CLI-k). A React ide nem szivárog be, és innen nem hívunk komponenst.

## Adatbázis — az Atlas M0 hálózata a szűk keresztmetszet (~100 KB/s)

- Sose húzz át listát azért, hogy itt számold meg: `countDocuments`,
  `$group`, `$project`. Amit a szerver el tud végezni, ott végezd el.
- Minden új lekérdezéshez legyen index (`src/lib/mongodb.ts`), és a projekció
  csak azt hozza el, ami tényleg kell.
- Ami sok kicsi kérés lenne, azt kötegeld: egy `$in`, nem ezer `findOne`.

## Külső hívások

- Hosszú műveletet ne a kérés szálán várass ki: állapotobjektum + a felület
  lekérdezi. Legyen leállítható és megszakítható a várakozás.
- Titkot csak a `credential()`-ön keresztül olvass (`src/lib/env.ts`), és
  soha ne naplózz — a `logger` maszkol, de ne tegyük próbára.
- Minden külső hibából emberi mondat legyen: mit tegyen a felhasználó.

## Napló

`createLogger("hatókör")`. Info a mérföldkövekhez, debug a részletekhez,
error csak akkor, ha tényleg elromlott valami. A naplóból derüljön ki, mi
történt — a `/debug` oldal ezt mutatja élőben.

# SPEC — Fiókonként állítható felfuttatás

Dátum: 2026-10-09 · Állapot: kész

## Cél

A Küldő fiókok oldalon fiókonként látszik, hol tart a felfuttatás, és
szerkeszthetők a lépcsői: hozzáadás, törlés, átírás, visszaállítás az
alapértékekre, és a felfuttatás újraindítása. Eddig a lépcsők a kódban voltak
rögzítve szolgáltatónként, és az oldal csak annyit mutatott: „követi”.

## Megfigyelhető viselkedés

- Adott egy felfuttatást követő fiók, akkor a sora kiírja az állást:
  „3. hét · 16. nap · ma max 30”, „még nem indult…” vagy „végzett — nincs
  plafon”.
- Az állásra kattintva szerkesztő nyílik: a lépcsők (eddig a napig, napi
  max), a most érvényes lépcső kiemelve.
- „+ Lépcső” új sort ad, a ✕ töröl, a „Lépcsők mentése” eltárolja; a saját
  lépcsősor „Alapértékek visszaállítása” gombbal törölhető.
- „Újraindítás mától”: a fiók mától az 1. lépcsőről indul. A kezdés napja
  kézzel is megadható; „Vissza az első küldéshez” törli a kézi kezdést.
- A küldő, a queue-terv, a naptár és az automatikus ütemezés ugyanezeket a
  lépcsőket és kezdést használja.
- Kikapcsolt felfuttatásnál a szerkesztő nem látszik (ott a napi max él).

## Érintett fájlok

| Fájl                                                                          | Változás                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/lib/warmup.ts`                                                           | Saját lépcsősor paraméter, `warmupStatus`, `cleanSteps`.        |
| `src/lib/accountStore.ts`                                                     | `warmupSteps`, `warmupStart` tárolása és betöltése.             |
| `src/lib/accounts.ts`                                                         | A fiók viszi a lépcsőit és a kezdését; az áttekintés az állást. |
| `src/lib/sendCampaign.ts`, `queuePlan.ts`, `sendQueues.ts`, `autoSchedule.ts` | A fiók lépcsőit és kezdését használják.                         |
| `src/app/api/mail-accounts/route.ts`                                          | `PATCH` új mezői.                                               |
| `src/components/AccountsPanel.tsx`                                            | Állás és szerkesztő.                                            |

## Interfészek

- `PATCH /api/mail-accounts` `{ id, warmupSteps?: [{ untilDay, cap }] | null,
warmupStart?: "ÉÉÉÉ-HH-NN" | "now" | null }`. Lépcső: legfeljebb 12; a napok
  szigorúan nőnek (≤ 365); napi darabszám 1–100.
- `mail_account_settings.warmupSteps`, `.warmupStart` (hiányzik = alapértelmezés).
- `AccountOverview.warmupStatus`: lépcsők, saját-e, kezdés, nap, mostani
  lépcső, mai plafon.

## Hatókörön kívül

- Globális (minden fiókra érvényes) alapértelmezés szerkesztése.
- A felfuttatás automatikus visszaléptetése hiba vagy visszapattanás esetén.

## Feltételezések

- A kezdés az első küldés; ha kézzel állítják, az felülírja.
- Az utolsó lépcső után nincs felfuttatási plafon.
- A darabszám lépcsőről lépcsőre csökkenhet is — szándékos visszavétel lehet.

## Kockázat

- A küldő gépen az új kód kell (`git pull` + újraindítás): a régi küldő a
  beégetett lépcsőket használja, a felületen beállítottakat nem.
- A futó küldés a beállítást a fiókadatok következő frissülésekor veszi át,
  nem azonnal.
- Túl meredek saját lépcsősor a fiók letiltását kockáztatja.

## Ellenőrzés (end-to-end)

1. `npm run typecheck`, `npm run lint` — hiba nélkül.
2. Számítás alap és saját lépcsőkkel, újraindítás, a terv saját lépcsőkkel,
   bemenet-ellenőrzés, mentés és visszaolvasás próbacímmel, API-hibák.
3. Böngészőben 1440 és 390 px szélesen: állás a sorokban, szerkesztő.

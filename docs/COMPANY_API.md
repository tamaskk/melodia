# Melodia — cégfelvételi API

Cégeket tölthetsz be a Melodia adatbázisába, egyesével vagy kötegben.
Ami már bent van, azt az API nem írja felül: kihagyja, és megírja, miért.

## Hívás

```
POST https://melodia-kt.vercel.app/api/bot/companies
Content-Type: application/json
x-api-key: <COMPANY_API_KEY>
```

- Kérésenként **legfeljebb 200 cég**. Többet több kérésre bontva küldj.
- **Próba írás nélkül:** `?dryRun=1` a címben, vagy `"dryRun": true` a törzsben.
  Ugyanazt a választ kapod, de semmi nem kerül az adatbázisba.

## Törzs

Három alak mind jó:

```json
{ "company": "Acme Kft", "website": "https://acme.hu", "country": "HU", "source": "gridleads_it_hu" }
```

```json
[
  { "company": "…", "country": "…" },
  { "company": "…", "country": "…" }
]
```

```json
{ "companies": [{ "company": "…", "country": "…" }], "dryRun": false }
```

### Mezők (egy cég)

| mező          | kötelező        | leírás                                                                                                                                 |
| ------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `company`     | **igen**        | Cégnév.                                                                                                                                |
| `country`     | **igen**        | Kétbetűs ISO-kód (`HU`, `DE`, `US`…) vagy angol országnév. Ha nemzetközi vagy ismeretlen: `INT`.                                       |
| `website`     | erősen ajánlott | Hivatalos weboldal. `https://` nélkül is jó. Ez alapján szűri ki az ismétlődést.                                                       |
| `city`        | nem             | Város.                                                                                                                                 |
| `employees`   | nem             | Létszám: szám (`35`) vagy sáv (`11-50`). Sávok: `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1001-5000`, `5001-10000`, `10000+`. |
| `industry`    | nem             | Iparág, pl. `SaaS`, `fintech`, `e-commerce`.                                                                                           |
| `description` | nem             | 1–2 mondat a cégről.                                                                                                                   |
| `email`       | nem             | Publikus céges cím, csak ha leírva láttad. Soha ne találd ki.                                                                          |
| `otherEmails` | nem             | További címek tömbben.                                                                                                                 |
| `linkedin`    | nem             | Cég LinkedIn-oldala (`https://www.linkedin.com/company/…`).                                                                            |
| `language`    | nem             | A levél nyelve: `hu` vagy `en`. Alapból `HU`-nál `hu`, minden más országnál `en`.                                                      |
| `tags`        | nem             | Saját címkék tömbben, pl. `["startup", "fintech"]`.                                                                                    |
| `source`      | **igen**        | `gridleads_<üzlettípus>_<országkód>`: kisbetűs, a keresett üzlettípus és a cég országkódja. Pl. `gridleads_it_hu`, `gridleads_software-it-consultant_de`. Több szóból álló típusnál kötőjel. Lásd lent. |

### A `source` mező

Formája: `gridleads_<üzlettípus>_<országkód>`

- `<üzlettípus>` a keresett üzlettípus, ugyanaz, amire a Gridleadsben kerestél. Kisbetűvel írd, a szóközök helyére kötőjelet tegyél: `it`, `software`, `software-it-consultant`, `web-design`.
- `<országkód>` a cég országának kétbetűs kódja kisbetűvel: `hu`, `de`, `at`, `us`. Ha nemzetközi vagy ismeretlen: `int`.
- Példák: magyar IT cég → `gridleads_it_hu`; német szoftveres tanácsadó → `gridleads_software-it-consultant_de`.
- Egy kötegen belül cégenként adj meg forrást, mert a kötegben több ország is lehet.
- Ha a végéről lemarad az országkód, a Melodia a `country` mezőből hozzáfűzi.

A megkereső levelet a Melodia maga generálja a cég adataiból. Levélszöveget nem kell küldeni.

## Válasz

```json
{
  "ok": true,
  "dryRun": false,
  "received": 3,
  "inserted": 1,
  "created": [{ "index": 1, "company": "Acme Kft", "key": "gridleads_it_hu:acme-kft" }],
  "skipped": [
    {
      "index": 0,
      "company": "ArtOfInfo",
      "reason": "már bent van (domain: ArtOfInfo)"
    },
    {
      "index": 2,
      "company": "Acme Kft",
      "reason": "ismétlődik ebben a kérésben"
    }
  ],
  "errors": [],
  "warnings": []
}
```

- Az `index` a cég helye a küldött listában, 0-tól számolva.
- `errors`: hibás sorok. Ezeket nem vette fel, a többit igen. Formája:
  `{ "index": 2, "company": "…", "field": "country", "message": "…" }`.
  Javítsd és küldd újra **csak** a hibás sorokat.
- `ok: false`, ha volt legalább egy hibás sor.

### Státuszkódok

| kód | jelentés                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------- |
| 200 | Feldolgozva (lehet benne kihagyott vagy hibás sor is, lásd fent).                                                                |
| 400 | A törzs nem a fenti alakok egyike.                                                                                               |
| 401 | Hibás vagy hiányzó `x-api-key`.                                                                                                  |
| 413 | 200-nál több cég egy kérésben.                                                                                                   |
| 422 | Minden sor hibás, semmi nem került be.                                                                                           |
| 500 | Szerverhiba. Várj pár másodpercet, és küldd újra ugyanazt. Ismételhető: ami közben bekerült, az másodszorra „már bent van” lesz. |
| 503 | A szerveren nincs beállítva az API-kulcs.                                                                                        |

## Szabályok az AI-nak

1. Csak valódi, működő cégeket küldj, a saját hivatalos weboldalukkal. Ne találj ki céget, címet vagy számot. Ha valamit nem tudsz, hagyd ki a mezőt.
2. Nagy listánál először küldj egy köteget `dryRun`-nal, és nézd meg az `errors` listát.
3. Kötegenként legfeljebb 200 cég. A kötegeket egymás után küldd, ne párhuzamosan.
4. A `skipped` nem hiba: az a cég már bent van. Ne küldd újra.
5. A végén írd ki az összesítést: hány cég ment be (`inserted`), hány maradt ki (`skipped`), és hány volt hibás (`errors`).

## Példa (curl)

```bash
curl -X POST "https://melodia-kt.vercel.app/api/bot/companies?dryRun=1" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $COMPANY_API_KEY" \
  -d '{"companies":[{"company":"Acme Kft","website":"acme.hu","country":"HU","city":"Budapest","employees":35,"industry":"SaaS","description":"B2B számlázó szoftver.","source":"gridleads_software_hu"}]}'
```

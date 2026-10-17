# SPEC — Időzített válasz a szálba (jellemzően elutasítás után)

Dátum: 2026-10-12 · Állapot: kész, élesben még nem küldött

## Cél

A levelezésben kijelölt szálakra menjen egy rövid, egyedi levél ugyanabban a
szálban: sajnálom, hogy most nincs lehetőség; ha később nyílik valami,
szívesen veszem a megkeresést — mellé egy bemutatkozó PDF.

## Megfigyelhető viselkedés

- A Levelezés és az Elutasítások oldalon jelölőnégyzet áll minden szál előtt,
  amelyre emberi válasz jött, és még nincs rá időzített vagy kiment levél.
  Nem csak elutasított szál jelölhető: a szöveg a szál tartalmához igazodik.
- Időzítéskor kiválasztható, mely fájlok menjenek mellé (a küldő gép
  `attachments/` mappájának jegyzékéből; több is lehet). A levél mindig
  megemlíti a csatolt dokumentumot, ezért csatolmány nélkül nem hagyható jóvá
  és nem megy ki; a csatolmány a piszkozatnál utólag is állítható.
- Szálanként külön piszkozat készül a helyi Claude CLI-vel, kis modellel
  (`CLAUDE_REPLY_MODEL`, alapból `haiku`): 3–4 mondat, formális, a kapott levél
  nyelvén, a levél írójának megszólításával.
- A piszkozatok előnézete a Levelezés és az Elutasítások oldalon, a szállista
  fölött jelenik meg, és a Queue-k oldalon is ott van („Időzített válaszok”):
  átnézhető, átírható, újragenerálható, lemondható. **Jóváhagyás nélkül semmi
  nem megy ki.**
- Piszkozatot bármelyik saját gép ír, ahol van Claude CLI (nem kell küldőnek
  lennie); a telepített példány nem. Küldeni továbbra is csak a küldő gép tud.
- A jóváhagyott levél arról a fiókról megy, amelyikre a válasz érkezett, annak
  a címnek, ahonnan jött, `In-Reply-To` / `References` fejléccel.
- Küldés napja: a fiók legkorábbi szabad helye. A betervezett első levelek
  elsőbbséget élveznek — a válasz csak a napi keretből megmaradt helyet
  használja; ha ma nincs hely, a következő napra vár.
- Küldési ablak: hétköznap 7–19 óra között a küldő és a címzett helyi idejében
  is; egy fiókból két válasz között legalább 10 perc telik el.
- Védelmek: szálanként egy levél · robotcímre (`noreply@…`) nem időzíthető ·
  ha az időzítés óta új levél jött a szálban, nem megy ki („megállt”) · ha
  hiányzik egy kiválasztott csatolmány, nem megy ki nélküle · megszakadt
  küldés magától nem ismétlődik.
- Küldés után a kontakt `szalvalasz-kiment` címkét és `threadReplySentAt`
  dátumot kap; a kimenetel (pl. „Elutasítva”) nem változik.
- A widgetben a kiment és a jóváhagyott, helyre váró válaszok a fiók
  (`smtp:<fiók>`) sorába számítanak; a válasz alakja nem változik.

## Állapotok

`generalas` → `atnezendo` → `jovahagyva` → `kuldes` → `kiment`; mellékágak:
`megallt` (új levél jött), `hiba` (piszkozat vagy küldés nem sikerült).

## Érintett fájlok

| Fájl                                             | Változás                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `src/lib/threadReplyDraft.ts`                    | Új. Tiszta rész: prompt, tárgy, robotcím-szűrő, a napi szabad hely. |
| `src/lib/threadReplies.ts`                       | Új. A `thread_replies` tárolása és a küldő gép 2 perces köre.       |
| `src/app/api/mail/scheduled/route.ts`            | Új. Lista, időzítés, jóváhagyás, átírás, újragenerálás, lemondás.   |
| `src/components/ScheduledReplies.tsx`            | Új. Az átnéző panel a Queue-k oldalon.                              |
| `src/components/MailApp.tsx`                     | Kijelölés, időzítő sáv, jelvény a szálakon.                         |
| `src/app/api/mail/route.ts`                      | A szállista mellé: melyik szálra van már időzített válasz.          |
| `src/lib/mailer.ts`                              | A szálba menő levél kaphat csatolmányt.                             |
| `src/lib/emailFinderClaude.ts`, `aiText.ts`      | Hívásonként megadható modell.                                       |
| `src/lib/widgetQueues.ts`, `widgetQueuesData.ts` | A válaszok beszámítása a fiók sorába.                               |
| `src/instrumentation.ts`                         | A kör indítása a küldő gépen.                                       |

## Interfészek

- Új collection: `thread_replies` — egyedi index: `threadId`; továbbá
  `(status, accountId, sentAt)`.
- `POST /api/mail/scheduled` műveletei: `schedule`, `approve`, `edit`,
  `regenerate`, `cancel`.

## Hatókörön kívül

- A kiküldő menet (`sendCampaign.ts`) és a queue-k tervezése nem változott: a
  válaszok külön körben mennek, és nem foglalnak helyet a naptárban.
- Időzítés konkrét dátumra.
- Több levél ugyanarra a szálra.

## Feltételezések

- Ha a fióknak nincs napi plafonja (kikapcsolt felfuttatás, megadott maximum
  nélkül), a válaszokat csak a 10 perces ütem korlátozza.
- A hétvégén is küldő queue-k beállítása a válaszokra nem vonatkozik.

## Kockázat

- Ha a naptár minden nap a plafonig tele van, a válasz nem jut helyhez — a
  Queue-k oldalon „időzítve” állapotban áll, amíg nem szabadul fel hely.
- A kis modell szövege nyelvtanilag megbotolhat; ezért kötelező az átnézés.
- A telepített példányról időzített szál piszkozata csak akkor készül el, ha
  egy saját gép fut az új kóddal (a küldő gép, vagy egy megnyitott helyi
  példány).

## Kiegészítés — fiókválasztó a Levelezés oldalon (2026-10-12)

- A fejlécben legördülő: „Minden fiók", vagy a rendszerben felvett küldő
  fiókok egyike. A számok, a diagram és a szállista a kiválasztott fiókra
  szűkül (`GET /api/mail?account=<cím>`).
- A begyűjtés mostantól minden Gmail-fiók postafiókját olvassa, nem csak az
  elsőt; az új levelek `account` mezőt kapnak. A régi leveleknél a szál fiókja
  a kimenő levél feladója.
- Érintett: `src/lib/inbox.ts`, `src/lib/mailStore.ts`,
  `src/app/api/mail/route.ts`, `src/components/MailApp.tsx`.
- A Resend-fióknak nincs postafiókja: a kimenő leveleit a begyűjtés a
  kontaktok soráról veszi fel (`src/lib/resendMail.ts`), és ha a címzettől
  levél érkezik valamelyik Gmail-postafiókba, a kettőt egy szálba köti.
- A Resend kézbesítési állapota a Resend API-ból jön (`GET /emails`): ami ott
  `bounced`, az a levelezésben visszapattantként látszik, és a kontakt is
  visszapattant állapotot kap a következő begyűjtéskor.
- Hatókörön kívül: a Resend saját „Receiving" postafiókjának olvasása — válasz
  csak akkor látszik, ha egy Gmail-fiókba érkezik.

## Kiegészítés — szűrés egy napra a Levelezés oldalon (2026-10-13)

- A diagram fejlécében dátumválasztó áll a 14/30/90 napos gombok mellett; a
  diagram egy napjára kattintva ugyanaz a nap választódik ki (újabb kattintás
  vagy a „minden nap" gomb törli).
- Kiválasztott napnál a lista csak az aznapi leveleket mutatja
  (`GET /api/mail?day=ÉÉÉÉ-HH-NN`): szálanként egy sor, benne az aznapi utolsó
  levél időpontja és előnézete, meg az aznapi darabszám. A számok ugyanezekre
  a szálakra szűkülnek. A megnyitott szál a teljes levelezést mutatja.
- A diagram az időszakot mutatja tovább; a kiválasztott napot sáv, függőleges
  vonal, nagyobb pontok és kiemelt tengelyfelirat jelöli.
- A nap határa ugyanaz, mint a diagramé (a tárolt dátum első tíz karaktere).
- Érintett: `src/lib/mailStore.ts`, `src/app/api/mail/route.ts`,
  `src/components/MailApp.tsx`, `src/components/MailChart.tsx`.
- Hatókörön kívül: tetszőleges kezdő–záró dátumú időszak, és a napra szűrés
  az Elutasítások oldalon.

## Kiegészítés — a beragadt Atlas-kapcsolat újranyitása (2026-10-13)

**Miért:** az Atlas M0 → Flex költöztetése után a mindig futó példány fél napig
nem küldött és nem gyűjtött be semmit. A driver a régi klaszter `electionId`-jére
emlékezett, az új elsődlegest elavultnak jelölte (`primary marked stale due to
electionId/setVersion mismatch`), és ebből újraindítás nélkül nem gyógyult ki.

**Mit csinál:** a `src/lib/mongodb.ts` figyeli a kliens topológiáját. Ha 60
másodpercig nincs elsődleges, és ennek oka elavultnak jelölt szerver, a klienst
eldobja és lezárja; a következő `getDb()` frisset nyit. Rövid, választás közbeni
elavult jelzésre nem reagál. A sikertelen első kapcsolódás sem ragad be többé.

**Hatókörön kívül:** a közben elszállt műveletek újrapróbálása — azok a saját
ütemükben (queue-ellenőrzés, következő szinkron) futnak újra.

## Kiegészítés — egyéni levél külön oldalon (2026-10-14)

**Miért:** kontakthoz és queue-hoz nem kötött, egyszeri levél kiküldése egy
kiválasztott küldő fiókból, a Gmail megnyitása nélkül.

**Mit csinál:** új `/compose` oldal („Új levél" a felső menüben): Kitől
(a küldő fiókok listája), Kinek (egy cím), Tárgy, Szöveg. Küldés előtt
megerősítést kér. A `POST /api/mail/compose` a meglévő `sendFollowUpEmail`-en
át küld, sima szövegként; ismeretlen fióknál nem esik vissza az első fiókra.

**Hatókörön kívül:** csatolmány, több címzett / másolat, HTML-levél, a levél
hozzákötése kontakthoz. A felfuttatás napi keretébe nem számít bele.

## Kiegészítés — válaszcím fiókonként (2026-10-14)

**Miért:** a `tamaskk.com`-nak nincs MX rekordja, a Resend-fiók címére küldött
válaszok ezért sehova nem érkeztek meg, és a Levelezésben sem látszottak.

**Mit csinál:** a Küldő fiókok oldalon minden fióknak lehet saját válaszcíme
(`Reply-To`), a `mail_account_settings` gyűjteményben tárolva. A kimenő levél
(Gmail és Resend is) ezt a fejlécet kapja, így a válasz a begyűjtött
Gmail-postafiókba jön, és a meglévő Resend-szálösszekötés behozza. Üresen a
korábbi viselkedés él (közös `GMAIL_REPLY_TO`, vagy a fiók saját címe). A
Resend-fiók válaszcím nélkül figyelmeztetést mutat.

**Hatókörön kívül:** a domain postafiókja (MX, továbbítás) — az a DNS-ben dől el.

## Kiegészítés — Seedtable import (2026-10-14)

**Miért:** új cégek közvetlenül a Seedtable API-ból (https://seedtable.com/developers),
szűrőkkel, kézi JSON-készítés nélkül.

**Mit csinál:** a `/seedimport` oldal (Beszerzés menü) a `/companies` végpont
minden szűrőjét állíthatóvá teszi (hely, iparág, technológia, finanszírozási
stádium és összeg, létszám, Seedtable-pont, jelek, rendezés), plusz a lekérendő
cégek számát (futásonként legfeljebb 500) és a kezdő találatot; a futás után a
„Következő N” gomb onnan folytatja, ahol az előző abbahagyta. Az „Automatikus
import a lista végéig” gomb ezt magától csinálja: adagról adagra ment, amíg a
lista el nem fogy (pl. egy teljes ország), haladásjelzővel. Átmeneti hibánál
(429, 5xx, hálózat) vár és legfeljebb háromszor újrapróbálja; leállítható, és a
kezdőpont mezőből folytatható. Rendezés nélkül a felvétel ideje szerint
növekvő sorrendet állít be, hogy a hosszú futás alatt ne tolódjon el a lista.
A futás a böngészőben él — az oldalnak nyitva kell maradnia. A „Minden ország
importja” gomb ugyanezt sorban végigcsinálja a Seedtable összes piacán
(`src/lib/seedtableMarkets.ts`, a központ országa szerint); a többi beállított
szűrő minden országra érvényes. Hol tart (ország + találat), azt a böngésző
megjegyzi, így leállítás vagy bezárás után ugyanazokkal a szűrőkkel onnan
folytatható, vagy elölről kezdhető. Az **előnézet** lekéri és egyezteti a cégeket a
meglévő listával (kulcs, domain, cégnév + ország — ugyanaz a szabály, mint a
kötegelt betöltőnél, `src/lib/importDedupe.ts`), de nem ment. A **mentés** csak
az újakat írja be, `seedtable-<országkód>` forrással; a létszámból a `size`
sáv lesz, a cég teljes Seedtable-adatlapja (pontos létszám, stádium, bevont tőke,
utolsó kör, alapítás éve, pont, jelek, leírás, Seedtable-link) a `seedtable`
mezőbe kerül, a stádium és a tőkesáv címkeként is (`stadium-series_a`,
`toke-10-50m`), hogy a Kontaktok szűrőjében kereshető legyen;
kérésre cégenként egy döntéshozót is keres (`/people`) ellenőrzött vagy elég
biztos e-mail címmel — a visszapattantként jelzett címet soha nem veszi át.

**Kulcs:** `SEEDTABLE_API_KEY` az `atlas-credentials.env`-ben (Vercelen
környezeti változóként).

**Hatókörön kívül:** meglévő sorok frissítése Seedtable-adattal, befektetők,
események és a vevő–szállító gráf importja, ütemezett (automatikus) futás.

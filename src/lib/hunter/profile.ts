/**
 * A levélszöveg egyetlen forrása a Hunter-konverterhez.
 * Ha változik a CV vagy a hangvétel, ezt az egy fájlt kell szerkeszteni.
 */
import { PROFILE } from "../profile";

/** A közös profilból (src/lib/profile.ts) — itt csak a konverter nevei. */
export const profile = {
  fullName: PROFILE.name,
  email: PROFILE.email,
  phone: PROFILE.phone,
  github: PROFILE.github,
  portfolio: PROFILE.portfolio,
} as const;

const signatureHu = [
  "Üdvözlettel,",
  profile.fullName,
  `${profile.email} · ${profile.phone}`,
].join("\n\n");

const signatureEn = [
  "Best regards,",
  profile.fullName,
  `${profile.email} · ${profile.phone}`,
].join("\n\n");

export const templates = {
  hu: {
    greeting: (company: string) => `Kedves ${company} Csapat!`,
    intro:
      `${profile.fullName} vagyok, full stack fejlesztő Budapestről, körülbelül 2,5 év kereskedelmi ` +
      "tapasztalattal. Végponttól végpontig TypeScriptben dolgozom: React, Next.js és Angular a fronton, " +
      "NestJS és Node.js a backenden, MongoDB adatbázissal.",
    track:
      "Korábban a BLCKS-nél (Clutch Top 100 ügynökség) dolgoztam, ahol juniorból mediorrá léptem elő. " +
      "A szállított munkáim közül a Wingman utazási alkalmazás (100 000+ letöltés) és a Flinkit " +
      "(Product Hunt 2. hely) emelhető ki, és sokat építettem OpenAI, illetve Claude API-ra épülő funkciókat is.",
    close:
      "Ha van nyitott fejlesztői pozíciótok — vagy a közeljövőben lesz —, szívesen küldök önéletrajzot, " +
      "vagy beszélgetnék egy rövid hívás keretében.",
    links: [`GitHub: ${profile.github}`, `Portfólió: ${profile.portfolio}`],
    signature: signatureHu,
    subject: "Jelentkezés – full stack fejlesztő (TypeScript / Node.js)",
  },
  en: {
    greeting: (company: string) => `Hi ${company} Team,`,
    intro:
      `My name is ${profile.fullName}, a Budapest-based full stack developer with around 2.5 years of ` +
      "commercial experience. I work end-to-end in TypeScript: React, Next.js and Angular on the front end, " +
      "NestJS and Node.js on the back end, with MongoDB.",
    track:
      "Previously I worked at BLCKS, a Clutch Top 100 agency, where I was promoted from junior to medior. " +
      "Two shipped products worth mentioning: Wingman, a travel app with 100,000+ downloads, and Flinkit, " +
      "which reached #2 on Product Hunt. I have also built a lot on the OpenAI and Claude APIs.",
    close:
      "If you have an opening now or expect one soon, I'd be glad to send my CV or have a short call.",
    links: [`GitHub: ${profile.github}`, `Portfolio: ${profile.portfolio}`],
    signature: signatureEn,
    subject: "Full stack developer (TypeScript / Node.js) – application",
  },
} as const;

/**
 * Horgonyok: a levél középső bekezdése. Az osztályozás választ közülük a cég
 * profilja alapján — ettől lesz a levél konkrét, nem sablonos.
 */
export const hooks = {
  stack: {
    hu:
      "A stacketek gyakorlatilag megegyezik az enyémmel, ezért írok: nálam is React és Node.js van a " +
      "napi munka közepén, TypeScripttel végig.",
    en:
      "Your stack is essentially mine, which is why I'm writing: React and Node.js sit at the centre of my " +
      "day-to-day work, with TypeScript throughout.",
  },
  ai: {
    hu:
      "Az AI-ra épülő funkciók fejlesztése az elmúlt időszakban a munkám nagy részét kitette: OpenAI és " +
      "Claude API-ra építettem éles funkciókat, és automatizálási pipeline-okat is raktam össze.",
    en:
      "Building on top of LLMs has taken up a big share of my recent work — production features on the " +
      "OpenAI and Claude APIs, plus a fair amount of automation pipeline work.",
  },
  health: {
    hu:
      "Az egészségügyi szoftver az egyik olyan terület, ahol már van éles tapasztalatom: korábban " +
      "egészségügyi hang- és beszédfelismerő terméken dolgoztam, ahol napi téma volt az érzékeny betegadatok kezelése.",
    en:
      "Healthcare is a domain I've already worked in — I spent time on a healthcare voice AI product, where " +
      "handling sensitive patient data and fitting clinical workflows were daily topics.",
  },
  travel: {
    hu:
      "Az utazási szektor nem idegen: a Wingman utazási alkalmazás az én munkám is, amely 100 000+ " +
      "letöltésnél jár, és foglalási, illetve külső szolgáltatói API-k bekötésével is dolgoztam.",
    en:
      "Travel is familiar ground: I worked on Wingman, a travel app with 100,000+ downloads, and dealt with " +
      "booking flows and third-party provider APIs.",
  },
  booking: {
    hu:
      "A foglalási és időpontkezelő rendszerek logikája ismerős: a Wingman utazási alkalmazásnál is külső " +
      "szolgáltatói API-k bekötésével és időfüggő adatok kezelésével dolgoztam.",
    en:
      "Booking and scheduling logic is familiar ground — on Wingman, the travel app I worked on, I dealt " +
      "with third-party provider APIs and time-dependent data.",
  },
  ecommerce: {
    hu:
      "Az e-kereskedelem az egyik olyan terület, ahol már van éles tapasztalatom: dolgoztam Shopify-alapú " +
      "és egyedi Next.js-es webshopokon, fizetési és szállítási integrációkkal együtt.",
    en:
      "E-commerce is a domain I've shipped in — Shopify-based and custom Next.js storefronts, with payment " +
      "and shipping integrations.",
  },
  proptech: {
    hu:
      "Az ingatlan- és térbeli adat nem idegen: korábban proptech terméken dolgoztam, ahol nagy " +
      "adathalmazok szűrése és térképes megjelenítése volt a feladat.",
    en:
      "Property and spatial data aren't new to me — I worked on a proptech product where filtering and " +
      "mapping large datasets was the core problem.",
  },
  fintech: {
    hu:
      "A pénzügyi vonal érdekel: dolgoztam fizetési és számlázási integrációkon, és tudom, hogy ezen a " +
      "területen a pontosság és a naplózhatóság többet ér, mint a sebesség.",
    en:
      "Financial systems interest me: I've worked on payment and invoicing integrations, and I know accuracy " +
      "and auditability matter more there than raw speed.",
  },
  mobile: {
    hu:
      "A mobil vonal különösen érdekel: a Wingman utazási alkalmazás, amely 100 000+ letöltésnél jár, az én " +
      "munkám is, és webes felületek mellett mobilalkalmazásokon is dolgoztam.",
    en:
      "Mobile is a particular interest: Wingman, a travel app with 100,000+ downloads, is work I contributed " +
      "to, and I have shipped both web interfaces and mobile apps.",
  },
  testing: {
    hu:
      "A tesztelés és a minőségbiztosítás az a terület, ahol tudatosan fejlesztem magam: automatizált " +
      "tesztelésből és CI/CD-ből is van gyakorlati tapasztalatom.",
    en:
      "Testing and QA is an area I'm deliberately deepening — I have hands-on experience with automated " +
      "testing and CI/CD.",
  },
  staffing: {
    hu:
      "Nyitott vagyok kihelyezett vagy ügyfélprojektes együttműködésre is — ügynökségi háttérből jövök, " +
      "tehát megszoktam, hogy külső csapatba illeszkedve kell értéket termelnem.",
    en:
      "I'm open to client-project or embedded work — coming from an agency background, fitting into an " +
      "external team and delivering there is what I am used to.",
  },
  product: {
    hu:
      "Termékcsapatban szeretek dolgozni, ahol a fejlesztő látja, hogyan használják, amit épített, és részt " +
      "vesz a döntésekben is, nem csak a ticketek lezárásában.",
    en:
      "I like working in product teams where an engineer sees how the thing they built is actually used, and " +
      "takes part in the decisions rather than just closing tickets.",
  },
  agency: {
    hu:
      "Ügynökségi háttérrel érkezem, így megszoktam a projektek és a domainek közti váltást — dolgoztam " +
      "egészségügyi, proptech, utazási és e-kereskedelmi termékeken egyaránt.",
    en:
      "I come from an agency background, so I'm used to switching between client projects and domains — I've " +
      "delivered work in healthcare, proptech, travel and e-commerce.",
  },
  enterprise: {
    hu:
      "Nagyobb szervezetben eddig ügyfél oldalról dolgoztam, ügynökségi szállítóként — így ismerem a " +
      "vállalati elvárásokat, a code review-t és a dokumentált átadást is, nem csak a gyors prototípust.",
    en:
      "I've worked with larger organisations from the agency side, so enterprise expectations — code review, " +
      "documented handover, not just fast prototypes — are familiar territory.",
  },
  ops: {
    hu:
      "Elsősorban fejlesztőként keresem a helyem, de a deployment, a CI/CD és a felhős üzemeltetés is a napi " +
      "munkám része volt, így a fejlesztés és az üzemeltetés határterülete sem idegen.",
    en:
      "I'm primarily looking for a development role, but deployment, CI/CD and cloud operations have been part " +
      "of my day-to-day work as well.",
  },
  nonIt: {
    hu:
      "Tudom, hogy a fő profilotok nem a szoftverfejlesztés. Ha viszont van igény webshop, belső eszköz vagy " +
      "ügyfélportál fejlesztésére, abban tudok segíteni.",
    en:
      "I know software development isn't your main line of business. If you ever need a web store, an internal " +
      "tool or a client portal built, that is something I can help with.",
  },
} as const;

export type HookKey = keyof typeof hooks;

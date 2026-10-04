import type { HookKey } from "./profile";

export interface Rule {
  /** Kisbetűs kulcsszavak; bármelyik találat aktiválja a szabályt. */
  match: string[];
  /** Pontszám a prioritáshoz. */
  score: number;
  /** Címkék, amiket hozzáad. */
  tags?: string[];
  /** Ha ez a szabály nyer, ezt a horgonyt használja a levél. */
  hook?: HookKey;
  /** A note-ba kerülő figyelmeztetés. */
  note?: string;
}

/** Nem szoftvercég — a Hunter iparági besorolása ilyenkor téves. */
export const NON_IT: Rule[] = [
  {
    match: [
      "windows and doors", "nyílászáró", "awnings", "canopies", "pergola", "shading",
      "árnyékolás", "home improvement company", "wholesale company that offers custom shading",
    ],
    score: 0,
    tags: ["nem-szoftver", "kereskedelem"],
    note: "NEM SZOFTVERCÉG: építőipari/lakberendezési kereskedés. A Hunter iparági besorolása téves.",
  },
  {
    match: ["photography", "fotózás", "fotós blog", "photo blog"],
    score: 0,
    tags: ["nem-szoftver", "media"],
    note: "NEM SZOFTVERCÉG: fotózással foglalkozó oldal vagy blog. A Hunter besorolása téves.",
  },
  {
    match: ["textile manufacturing", "clothing label", "ruhacímke", "textil"],
    score: 0,
    tags: ["nem-szoftver", "textil"],
    note: "NEM SZOFTVERCÉG: textil- vagy ruhaipari profil. A Hunter besorolása téves.",
  },
  {
    match: ["luxury and sports cars", "luxury real estate", "sale and rental of luxury"],
    score: 0,
    tags: ["nem-szoftver", "luxus-kereskedelem"],
    note: "NEM SZOFTVERCÉG: luxusautó- és ingatlanértékesítés. A Hunter besorolása téves.",
  },
  {
    match: ["repair of electronic", "elektronikai eszközök javítása", "device repair"],
    score: 0,
    tags: ["nem-szoftver", "szerviz"],
    note: "NEM SZOFTVERCÉG: elektronikai szerviz.",
  },
  {
    match: ["asic mining", "mining devices", "cryptominer"],
    score: 0,
    tags: ["nem-szoftver", "hardver-kereskedelem"],
    note: "NEM SZOFTVERCÉG: bányászhardver-kereskedelem és hosting.",
  },
  {
    match: ["erasure and destruction", "adatmegsemmisítés", "destruction of various digital media"],
    score: 0,
    tags: ["nem-szoftver", "adatmegsemmisites"],
    note: "NEM SZOFTVERCÉG: fizikai adathordozó-megsemmisítés.",
  },
  {
    match: ["data centers and", "emc shielding", "constructs, and maintains infrastructure"],
    score: 0,
    tags: ["nem-szoftver", "epitomernokseg"],
    note: "NEM SZOFTVERCÉG: adatközpont-építés, villamos- és épületmérnöki terület.",
  },
];

/** Nem munkáltató: egyetem, közösség, konferencia, nonprofit, állami szerv. */
export const NON_EMPLOYER: Rule[] = [
  {
    match: ["university", "college", "egyetem", "kar,", "faculty", "educational institution of higher"],
    score: 0,
    tags: ["oktatasi-intezmeny"],
    note: "NEM CÉG: felsőoktatási intézmény. Fejlesztői álláshoz nem ez az út.",
  },
  {
    match: ["developer group", "meetup", "community of developers", "szakmai közösség", "networking platform"],
    score: 0,
    tags: ["kozosseg", "networking"],
    note: "NEM CÉG: fejlesztői közösség vagy meetup. Munkáltatóként értelmetlen — VISZONT networkingre kiváló, érdemes elmenni egy eseményre.",
  },
  {
    match: ["conference", "konferencia", "festival"],
    score: 0,
    tags: ["konferencia"],
    note: "NEM CÉG: konferencia vagy rendezvény.",
  },
  {
    match: ["non profit", "nonprofit", "non-profit", "association", "szövetség"],
    score: 0,
    tags: ["nonprofit"],
    note: "NEM MUNKÁLTATÓI CÉLPONT: nonprofit szervezet.",
  },
  {
    match: ["government agency", "állami tulajdonú", "kormányzati"],
    score: -1,
    tags: ["allami"],
    note: "ÁLLAMI SZERVEZET: kötött, pályázatos felvételi rend, jellemzően átvilágítással. A hivatalos karrierportálon menj be.",
  },
];

/** Stack-eltérés: valódi fejlesztőcég, de nem a te nyelveden. */
export const STACK_MISMATCH: Rule[] = [
  { match: ["sap "], score: -3, tags: ["sap"], note: "STACK: SAP-világ, nem TypeScript." },
  { match: ["abap"], score: -3, tags: ["sap"], note: "STACK: SAP/ABAP." },
  {
    match: [".net", "dotnet", "c#", "microsoft technologies", "dynamics", "sharepoint"],
    score: -2,
    tags: ["microsoft-stack"],
    note: "STACK: Microsoft/.NET világ — korlátozott átfedés a TypeScript stackeddel.",
  },
  { match: ["java focus", "java-based", " java "], score: -2, tags: ["java"], note: "STACK: Java-ház." },
  {
    match: ["php", "wordpress", "woocommerce", "laravel", "drupal", "yii", "zend"],
    score: -2,
    tags: ["php-stack"],
    note: "STACK: PHP-világ (WordPress/Laravel/Drupal) — nem TypeScript.",
  },
  {
    match: ["low-code", "no-code", "low code", "without complex coding"],
    score: -1,
    tags: ["low-code"],
    note: "STACK: low-code/no-code platform — saját eszközkészlet, korlátozott átfedés.",
  },
  {
    match: ["embedded software", "fpga", "pcb design", "firmware", "misra", "ecss"],
    score: -3,
    tags: ["embedded"],
    note: "STACK: beágyazott rendszerek (C/C++, FPGA) — nem a te területed.",
  },
  {
    match: ["solidworks", "solid edge", "cad data", "gd&t", "archicad", "bim "],
    score: -2,
    tags: ["cad"],
    note: "STACK: CAD/mérnöki szoftver — jellemzően C#/C++ és domain-specifikus API-k.",
  },
  { match: ["oracle database", "pl/sql", "plsql"], score: -2, tags: ["oracle"], note: "STACK: Oracle/PL-SQL világ." },
  { match: ["odoo"], score: -2, tags: ["odoo", "python"], note: "STACK: Odoo (Python) — nem TypeScript." },
  {
    match: ["quantum chemistry", "cuda", "gpu module", "vulkan", "opengl"],
    score: -3,
    tags: ["gpu", "tudomanyos"],
    note: "STACK: GPU/tudományos számítás (C++/CUDA) — nagyon távol a te területedtől.",
  },
];

/** Alacsonyabb esély: üzemeltetés, hosting, biztonsági szolgáltatás, tiszta tanácsadás. */
export const LOW_FIT: Rule[] = [
  {
    match: ["web hosting", "tárhely", "vps", "dedicated server", "colocation", "domain registration", "szerverbérlés"],
    score: -3,
    tags: ["hosting"],
    note: "Hoszting/infrastruktúra profil — saját termékfejlesztés jellemzően minimális.",
  },
  {
    match: ["system administration", "rendszergazda", "it support", "technical support", "üzemeltetés", "infrastructure management", "managed it"],
    score: -2,
    tags: ["it-uzemeltetes"],
    note: "Üzemeltetési profil — fejlesztői pozíció kevésbé valószínű.",
  },
  {
    match: ["penetration testing", "ethical hacking", "vulnerability assessment", "soc ", "incident response"],
    score: -2,
    tags: ["it-biztonsag-szolgaltatas"],
    note: "Biztonsági szolgáltató, nem termékfejlesztő.",
  },
  {
    match: ["business consulting", "management consultancy", "leadership strategies", "tanácsadó vállalat", "project management consultancy"],
    score: -2,
    tags: ["tanacsadas"],
    note: "Tanácsadói profil — ellenőrizd, van-e egyáltalán saját fejlesztésük.",
  },
  {
    match: ["reseller", "distribution company", "value-added distributor", "viszonteladás", "software distribution"],
    score: -3,
    tags: ["disztribucio"],
    note: "Szoftver-/hardverdisztribútor, nem fejlesztőcég.",
  },
  {
    match: ["training", "vocational courses", "academy", "oktatás", "képzés"],
    score: -2,
    tags: ["oktatas"],
    note: "Oktatási profil — legfeljebb oktatói vagy mentori szerep.",
  },
];

/** Erősítők: ezek emelik a prioritást. */
export const BOOST: Rule[] = [
  {
    match: ["react", "angular", "node.js", "nodejs", "typescript", "javascript", "vue.js", "vue", "nuxt", "next.js", "mongodb", "serverless"],
    score: 6,
    tags: ["stack-egyezik"],
    hook: "stack",
    note: "STACK-EGYEZÉS: a leírásuk kifejezetten olyan technológiát említ, amivel te dolgozol. Ez a legerősebb jel a listán.",
  },
  {
    match: ["full-stack", "full stack", "front-end", "frontend", "front end development"],
    score: 4,
    tags: ["fullstack-frontend"],
    hook: "stack",
    note: "A leírás kifejezetten full-stack vagy frontend munkát említ — ez ritka és jó jel.",
  },
  {
    match: ["artificial intelligence", "machine learning", "generative ai", " ai ", "ai-powered", "ai-based", "llm", "gpt", "ai agent", "computer vision"],
    score: 3,
    tags: ["ai"],
    hook: "ai",
    note: "AI-vonal: az OpenAI/Claude API tapasztalatod itt közvetlenül eladható.",
  },
  {
    match: ["healthcare", "health technology", "medical", "patient", "clinical", "egészségügyi", "digital health"],
    score: 3,
    tags: ["healthtech"],
    hook: "health",
    note: "DOMAIN-EGYEZÉS: egészségügy — van éles tapasztalatod a területen.",
  },
  {
    match: ["travel technology", "travel agencies", "tour operator", "utazási", "airline"],
    score: 3,
    tags: ["utazas"],
    hook: "travel",
    note: "DOMAIN-EGYEZÉS: utazás — a Wingman referenciád ide szól.",
  },
  {
    match: ["booking", "scheduling", "appointment", "reservation", "foglalás", "időpont"],
    score: 3,
    tags: ["foglalasi-rendszer"],
    hook: "booking",
    note: "Foglalási/időpontkezelő logika — ismerős probléma a Wingman kapcsán.",
  },
  {
    match: ["e-commerce", "ecommerce", "webshop", "web store", "webáruház", "online store", "shopify"],
    score: 3,
    tags: ["e-commerce"],
    hook: "ecommerce",
    note: "DOMAIN-EGYEZÉS: e-kereskedelem — van éles tapasztalatod.",
  },
  {
    match: ["proptech", "real estate technology", "property management", "ingatlan", "mapping", "spatial", "indoor positioning"],
    score: 3,
    tags: ["proptech"],
    hook: "proptech",
    note: "DOMAIN-EGYEZÉS: ingatlan vagy térbeli adat.",
  },
  {
    match: ["fintech", "financial technology", "payment", "banking", "invoice", "credit management", "trading", "kyc"],
    score: 3,
    tags: ["fintech"],
    hook: "fintech",
    note: "DOMAIN-EGYEZÉS: pénzügy/fizetés — integrációs tapasztalatod releváns.",
  },
  {
    match: ["mobile app", "mobile application", "ios", "android", "mobilalkalmazás"],
    score: 3,
    tags: ["mobil"],
    hook: "mobile",
    note: "Mobilfejlesztés — a Wingman (100 000+ letöltés) itt konkrét érv.",
  },
  {
    match: ["testing services", "test automation", "quality assurance", "bdd", "specflow", "tesztelés"],
    score: 2,
    tags: ["teszteles"],
    hook: "testing",
    note: "Tesztelési vonal — ez a te fejlesztendő területed, itt egyszerre adnál és tanulnál.",
  },
  {
    match: ["dedicated team", "staff augmentation", "outsourcing", "nearshore", "outstaffing", "developers from"],
    score: 3,
    tags: ["staffing", "folyamatos-toborzas"],
    hook: "staffing",
    note: "KIHELYEZÉSES MODELL: itt maga a fejlesztő a termék, tehát gyakorlatilag folyamatosan toboroznak. Ezért is magas a prioritás.",
  },
  {
    match: ["custom software", "software development company", "bespoke", "egyedi szoftver", "product studio", "digital product"],
    score: 3,
    tags: ["fejlesztoceg"],
    hook: "agency",
  },
  {
    match: ["saas", "platform that", "our product", "cloud-based app", "software that"],
    score: 2,
    tags: ["termek"],
    hook: "product",
  },
  {
    match: ["web development", "website development", "webfejlesztés", "weboldal"],
    score: 2,
    tags: ["webfejlesztes"],
    hook: "agency",
  },
  {
    match: ["enterprise", "multinational", "fortune 500", "vállalati"],
    score: 1,
    tags: ["enterprise"],
    hook: "enterprise",
  },
];

/** Adatminőségi gyanújelek a leírásban. */
export const DATA_SMELLS: { match: string[]; note: string }[] = [
  {
    match: ["landing page template", "built with bootstrap", "lorem ipsum", "template built with"],
    note: "GYANÚS HONLAP: a leírás helyén egy le sem cserélt HTML-sablon gyári szövege áll. Egy fejlesztőcégnél ez elég beszédes.",
  },
  {
    match: ["covid-19 pandemic", "during the covid"],
    note: "ELAVULT SZÖVEG: a leírás még a COVID-időszakra hivatkozik — jó eséllyel évek óta nem frissítették a honlapot. Ellenőrizd, aktív-e a cég.",
  },
  {
    match: ["is a company based out of"],
    note: "ÜRES LEÍRÁS: a Hunter csak a postai címet találta, érdemi profilinformáció nincs. Nézd meg a weboldalt.",
  },
  {
    match: ["join us in a dynamic team", "we are hiring", "join our team"],
    note: "ÉRDEKES: a leírás helyén toborzó szöveg áll — vagyis a honlapjuk fő üzenete a felvétel. Jó eséllyel aktívan keresnek embert.",
  },
];

/**
 * Hunter iparági besorolások, amik gyakran tévesek.
 * Ha az iparág ezek egyike, de a leírás szoftverről szól, jelezzük.
 */
export const SUSPECT_INDUSTRIES = [
  "legal services",
  "veterinary",
  "manufacturing",
  "real estate",
  "financial services",
  "restaurant technology",
  "medical practices",
  "civic and social organization",
  "printing services",
  "nanotechnology",
  "architecture and planning",
  "machinery manufacturing",
  "construction technology",
  "wholesale",
  "government administration",
];

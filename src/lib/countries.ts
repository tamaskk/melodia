/**
 * Országok egy helyen: kód, magyar és angol név, zászló, felismerhető nevek.
 *
 * Mindenhol ebből dolgozunk — szűrő, import, export, Hunter-konverter —, hogy
 * ne fordulhasson elő, hogy egy ország a listában szerepel, de importkor nem
 * ismerjük fel.
 */

export interface CountryInfo {
  /** Magyar név, zászló nélkül. */
  hu: string;
  /** Angol név — ez megy az AI-nak szóló exportba. */
  en: string;
  flag: string;
  /** További írásmódok, amikre ráismerünk (ékezet nélkül, kisbetűvel). */
  aliases?: string[];
}

export const COUNTRIES: Record<string, CountryInfo> = {
  // Nem valódi ország: ide kerül, aminek a székhelyét nem ismerjük, vagy
  // vegyes/nemzetközi listából jött. Így is szűrhető és később pontosítható.
  INT: {
    hu: "Nemzetközi",
    en: "International",
    flag: "🌍",
    aliases: ["international", "nemzetkozi", "global", "worldwide", "remote"],
  },
  HU: { hu: "Magyarország", en: "Hungary", flag: "🇭🇺", aliases: ["magyar", "hungarian", "ungarn"] },
  AT: { hu: "Ausztria", en: "Austria", flag: "🇦🇹", aliases: ["osztrak", "oesterreich"] },
  DE: { hu: "Németország", en: "Germany", flag: "🇩🇪", aliases: ["nemet", "deutschland"] },
  CH: { hu: "Svájc", en: "Switzerland", flag: "🇨🇭", aliases: ["svajci", "schweiz", "suisse"] },
  NL: { hu: "Hollandia", en: "Netherlands", flag: "🇳🇱", aliases: ["holland", "nederland", "the netherlands"] },
  BE: { hu: "Belgium", en: "Belgium", flag: "🇧🇪", aliases: ["belga", "belgique", "belgie"] },
  ES: { hu: "Spanyolország", en: "Spain", flag: "🇪🇸", aliases: ["spanyol", "espana"] },
  PT: { hu: "Portugália", en: "Portugal", flag: "🇵🇹", aliases: ["portugal", "portugalia"] },
  FR: { hu: "Franciaország", en: "France", flag: "🇫🇷", aliases: ["francia", "franciaorszag"] },
  GB: {
    hu: "Egyesült Királyság",
    en: "United Kingdom",
    flag: "🇬🇧",
    aliases: ["uk", "anglia", "england", "great britain", "britain", "egyesult kiralysag", "london"],
  },
  IE: { hu: "Írország", en: "Ireland", flag: "🇮🇪", aliases: ["ir", "irorszag", "eire", "dublin"] },
  PL: { hu: "Lengyelország", en: "Poland", flag: "🇵🇱", aliases: ["lengyel", "polska", "lengyelorszag"] },
  CZ: { hu: "Csehország", en: "Czechia", flag: "🇨🇿", aliases: ["cseh", "czech republic", "cesko", "csehorszag"] },
  SK: { hu: "Szlovákia", en: "Slovakia", flag: "🇸🇰", aliases: ["szlovak", "slovensko"] },
  RO: { hu: "Románia", en: "Romania", flag: "🇷🇴", aliases: ["roman", "romania"] },
  BG: { hu: "Bulgária", en: "Bulgaria", flag: "🇧🇬", aliases: ["bolgar", "bulgaria"] },
  SE: { hu: "Svédország", en: "Sweden", flag: "🇸🇪", aliases: ["sved", "sverige", "svedorszag"] },
  DK: { hu: "Dánia", en: "Denmark", flag: "🇩🇰", aliases: ["dan", "danmark", "dania"] },
  NO: { hu: "Norvégia", en: "Norway", flag: "🇳🇴", aliases: ["norveg", "norge", "norvegia"] },
  FI: { hu: "Finnország", en: "Finland", flag: "🇫🇮", aliases: ["finn", "suomi", "finnorszag"] },
  EE: { hu: "Észtország", en: "Estonia", flag: "🇪🇪", aliases: ["eszt", "eesti", "esztorszag", "tallinn"] },
  IT: { hu: "Olaszország", en: "Italy", flag: "🇮🇹", aliases: ["olasz", "italia"] },
  US: {
    hu: "USA",
    en: "United States",
    flag: "🇺🇸",
    aliases: ["usa", "united states of america", "america", "amerikai egyesult allamok", "egyesult allamok"],
  },
  CA: { hu: "Kanada", en: "Canada", flag: "🇨🇦", aliases: ["kanada"] },

  // További európai piacok — hogy egy import se hozzon címke nélküli kódot.
  CY: { hu: "Ciprus", en: "Cyprus", flag: "🇨🇾", aliases: ["ciprus", "kypros", "limassol"] },
  GR: { hu: "Görögország", en: "Greece", flag: "🇬🇷", aliases: ["gorog", "hellas", "athen"] },
  HR: { hu: "Horvátország", en: "Croatia", flag: "🇭🇷", aliases: ["horvat", "hrvatska"] },
  SI: { hu: "Szlovénia", en: "Slovenia", flag: "🇸🇮", aliases: ["szloven", "slovenija"] },
  RS: { hu: "Szerbia", en: "Serbia", flag: "🇷🇸", aliases: ["szerb", "srbija", "belgrad"] },
  LT: { hu: "Litvánia", en: "Lithuania", flag: "🇱🇹", aliases: ["litvan", "lietuva", "vilnius"] },
  LV: { hu: "Lettország", en: "Latvia", flag: "🇱🇻", aliases: ["lett", "latvija", "riga"] },
  LU: { hu: "Luxemburg", en: "Luxembourg", flag: "🇱🇺", aliases: ["luxemburg"] },
  MT: { hu: "Málta", en: "Malta", flag: "🇲🇹", aliases: ["malta"] },
  IS: { hu: "Izland", en: "Iceland", flag: "🇮🇸", aliases: ["izland", "reykjavik"] },
  UA: { hu: "Ukrajna", en: "Ukraine", flag: "🇺🇦", aliases: ["ukran", "ukrajna", "kyiv", "kiev"] },
  TR: { hu: "Törökország", en: "Turkey", flag: "🇹🇷", aliases: ["torok", "turkiye", "istanbul"] },

  // Arab országok — a Golf-térségben és Egyiptomban komoly IT-piac van.
  AE: {
    hu: "Egyesült Arab Emírségek",
    en: "United Arab Emirates",
    flag: "🇦🇪",
    aliases: ["uae", "emirates", "dubai", "abu dhabi", "egyesult arab emirsegek", "emirsegek"],
  },
  SA: { hu: "Szaúd-Arábia", en: "Saudi Arabia", flag: "🇸🇦", aliases: ["ksa", "saudi", "szaud arabia", "riyadh"] },
  QA: { hu: "Katar", en: "Qatar", flag: "🇶🇦", aliases: ["katar", "doha"] },
  KW: { hu: "Kuvait", en: "Kuwait", flag: "🇰🇼", aliases: ["kuvait"] },
  BH: { hu: "Bahrein", en: "Bahrain", flag: "🇧🇭", aliases: ["bahrein"] },
  OM: { hu: "Omán", en: "Oman", flag: "🇴🇲", aliases: ["oman"] },
  JO: { hu: "Jordánia", en: "Jordan", flag: "🇯🇴", aliases: ["jordania", "amman"] },
  EG: { hu: "Egyiptom", en: "Egypt", flag: "🇪🇬", aliases: ["egyiptom", "cairo", "kairo"] },
  MA: { hu: "Marokkó", en: "Morocco", flag: "🇲🇦", aliases: ["marokko", "maroc", "casablanca"] },
  TN: { hu: "Tunézia", en: "Tunisia", flag: "🇹🇳", aliases: ["tunezia", "tunis"] },
};

/** Ékezet nélküli, kisbetűs alak az összehasonlításhoz. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim();
}

/** Minden felismerhető név → országkód. */
const LOOKUP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [code, info] of Object.entries(COUNTRIES)) {
    for (const name of [info.hu, info.en, ...(info.aliases ?? [])]) {
      map[fold(name)] = code;
      map[fold(name).replace(/ /g, "")] = code;
    }
  }
  return map;
})();

/** "Poland", "Lengyelország", "pl" → "PL". Ismeretlennél üres string. */
export function toCountryCode(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const upper = value.toUpperCase();
  // Kétbetűs ISO-kód, plusz a saját "INT" (nemzetközi) kódunk.
  if (/^[A-Z]{2,3}$/.test(upper) && COUNTRIES[upper]) return upper;
  const folded = fold(value);
  return LOOKUP[folded] ?? LOOKUP[folded.replace(/ /g, "")] ?? "";
}

/** Zászlós címke a felülethez: "🇵🇱 Lengyelország". */
export function countryLabel(code: string): string {
  const info = COUNTRIES[code.toUpperCase()];
  return info ? `${info.flag} ${info.hu}` : code;
}

/** Sima név az exporthoz / AI promptba. */
export function countryName(code: string): string {
  return COUNTRIES[code.toUpperCase()]?.hu ?? code;
}

export const COUNTRY_CODES = Object.keys(COUNTRIES);

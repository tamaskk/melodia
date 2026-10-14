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
  // A Clutch-listák országai: csak név és zászló, külön írásmód nélkül.
  AD: { hu: "Andorra", en: "Andorra", flag: "🇦🇩" },
  AF: { hu: "Afganisztán", en: "Afghanistan", flag: "🇦🇫" },
  AL: { hu: "Albánia", en: "Albania", flag: "🇦🇱" },
  AM: { hu: "Örményország", en: "Armenia", flag: "🇦🇲" },
  AR: { hu: "Argentína", en: "Argentina", flag: "🇦🇷" },
  AU: { hu: "Ausztrália", en: "Australia", flag: "🇦🇺" },
  AZ: { hu: "Azerbajdzsán", en: "Azerbaijan", flag: "🇦🇿" },
  BA: { hu: "Bosznia-Hercegovina", en: "Bosnia and Herzegovina", flag: "🇧🇦" },
  BB: { hu: "Barbados", en: "Barbados", flag: "🇧🇧" },
  BD: { hu: "Banglades", en: "Bangladesh", flag: "🇧🇩" },
  BJ: { hu: "Benin", en: "Benin", flag: "🇧🇯" },
  BM: { hu: "Bermuda", en: "Bermuda", flag: "🇧🇲" },
  BN: { hu: "Brunei", en: "Brunei", flag: "🇧🇳" },
  BO: { hu: "Bolívia", en: "Bolivia", flag: "🇧🇴" },
  BR: { hu: "Brazília", en: "Brazil", flag: "🇧🇷" },
  BS: { hu: "Bahama-szigetek", en: "Bahamas", flag: "🇧🇸" },
  BT: { hu: "Bhután", en: "Bhutan", flag: "🇧🇹" },
  BW: { hu: "Botswana", en: "Botswana", flag: "🇧🇼" },
  BY: { hu: "Belarusz", en: "Belarus", flag: "🇧🇾" },
  BZ: { hu: "Belize", en: "Belize", flag: "🇧🇿" },
  CD: { hu: "Kongói Demokratikus Köztársaság", en: "Democratic Republic of the Congo", flag: "🇨🇩" },
  CI: { hu: "Elefántcsontpart", en: "Côte d'Ivoire", flag: "🇨🇮" },
  CL: { hu: "Chile", en: "Chile", flag: "🇨🇱" },
  CM: { hu: "Kamerun", en: "Cameroon", flag: "🇨🇲" },
  CN: { hu: "Kína", en: "China", flag: "🇨🇳" },
  CO: { hu: "Kolumbia", en: "Colombia", flag: "🇨🇴" },
  CR: { hu: "Costa Rica", en: "Costa Rica", flag: "🇨🇷" },
  CW: { hu: "Curaçao", en: "Curaçao", flag: "🇨🇼" },
  DO: { hu: "Dominikai Köztársaság", en: "Dominican Republic", flag: "🇩🇴" },
  DZ: { hu: "Algéria", en: "Algeria", flag: "🇩🇿" },
  EC: { hu: "Ecuador", en: "Ecuador", flag: "🇪🇨" },
  ET: { hu: "Etiópia", en: "Ethiopia", flag: "🇪🇹" },
  FJ: { hu: "Fidzsi-szigetek", en: "Fiji", flag: "🇫🇯" },
  GE: { hu: "Grúzia", en: "Georgia", flag: "🇬🇪" },
  GH: { hu: "Ghána", en: "Ghana", flag: "🇬🇭" },
  GM: { hu: "Gambia", en: "Gambia", flag: "🇬🇲" },
  GT: { hu: "Guatemala", en: "Guatemala", flag: "🇬🇹" },
  GY: { hu: "Guyana", en: "Guyana", flag: "🇬🇾" },
  HK: { hu: "Hongkong", en: "Hong Kong", flag: "🇭🇰" },
  HN: { hu: "Honduras", en: "Honduras", flag: "🇭🇳" },
  HT: { hu: "Haiti", en: "Haiti", flag: "🇭🇹" },
  ID: { hu: "Indonézia", en: "Indonesia", flag: "🇮🇩" },
  IL: { hu: "Izrael", en: "Israel", flag: "🇮🇱" },
  IM: { hu: "Man-sziget", en: "Isle of Man", flag: "🇮🇲" },
  IN: { hu: "India", en: "India", flag: "🇮🇳" },
  IQ: { hu: "Irak", en: "Iraq", flag: "🇮🇶" },
  JM: { hu: "Jamaica", en: "Jamaica", flag: "🇯🇲" },
  JP: { hu: "Japán", en: "Japan", flag: "🇯🇵" },
  KE: { hu: "Kenya", en: "Kenya", flag: "🇰🇪" },
  KG: { hu: "Kirgizisztán", en: "Kyrgyzstan", flag: "🇰🇬" },
  KH: { hu: "Kambodzsa", en: "Cambodia", flag: "🇰🇭" },
  KR: { hu: "Dél-Korea", en: "South Korea", flag: "🇰🇷" },
  KY: { hu: "Kajmán-szigetek", en: "Cayman Islands", flag: "🇰🇾" },
  KZ: { hu: "Kazahsztán", en: "Kazakhstan", flag: "🇰🇿" },
  LB: { hu: "Libanon", en: "Lebanon", flag: "🇱🇧" },
  LI: { hu: "Liechtenstein", en: "Liechtenstein", flag: "🇱🇮" },
  LK: { hu: "Srí Lanka", en: "Sri Lanka", flag: "🇱🇰" },
  LY: { hu: "Líbia", en: "Libya", flag: "🇱🇾" },
  MD: { hu: "Moldova", en: "Moldova", flag: "🇲🇩" },
  ME: { hu: "Montenegró", en: "Montenegro", flag: "🇲🇪" },
  MG: { hu: "Madagaszkár", en: "Madagascar", flag: "🇲🇬" },
  MK: { hu: "Észak-Macedónia", en: "North Macedonia", flag: "🇲🇰" },
  MM: { hu: "Mianmar", en: "Myanmar", flag: "🇲🇲" },
  MN: { hu: "Mongólia", en: "Mongolia", flag: "🇲🇳" },
  MR: { hu: "Mauritánia", en: "Mauritania", flag: "🇲🇷" },
  MU: { hu: "Mauritius", en: "Mauritius", flag: "🇲🇺" },
  MV: { hu: "Maldív-szigetek", en: "Maldives", flag: "🇲🇻" },
  MW: { hu: "Malawi", en: "Malawi", flag: "🇲🇼" },
  MX: { hu: "Mexikó", en: "Mexico", flag: "🇲🇽" },
  MY: { hu: "Malajzia", en: "Malaysia", flag: "🇲🇾" },
  NA: { hu: "Namíbia", en: "Namibia", flag: "🇳🇦" },
  NG: { hu: "Nigéria", en: "Nigeria", flag: "🇳🇬" },
  NI: { hu: "Nicaragua", en: "Nicaragua", flag: "🇳🇮" },
  NP: { hu: "Nepál", en: "Nepal", flag: "🇳🇵" },
  NZ: { hu: "Új-Zéland", en: "New Zealand", flag: "🇳🇿" },
  PA: { hu: "Panama", en: "Panama", flag: "🇵🇦" },
  PE: { hu: "Peru", en: "Peru", flag: "🇵🇪" },
  PH: { hu: "Fülöp-szigetek", en: "Philippines", flag: "🇵🇭" },
  PK: { hu: "Pakisztán", en: "Pakistan", flag: "🇵🇰" },
  PR: { hu: "Puerto Rico", en: "Puerto Rico", flag: "🇵🇷" },
  PS: { hu: "Palesztina", en: "Palestine", flag: "🇵🇸" },
  PY: { hu: "Paraguay", en: "Paraguay", flag: "🇵🇾" },
  RE: { hu: "Réunion", en: "Réunion", flag: "🇷🇪" },
  RU: { hu: "Oroszország", en: "Russia", flag: "🇷🇺" },
  RW: { hu: "Ruanda", en: "Rwanda", flag: "🇷🇼" },
  SD: { hu: "Szudán", en: "Sudan", flag: "🇸🇩" },
  SG: { hu: "Szingapúr", en: "Singapore", flag: "🇸🇬" },
  SL: { hu: "Sierra Leone", en: "Sierra Leone", flag: "🇸🇱" },
  SO: { hu: "Szomália", en: "Somalia", flag: "🇸🇴" },
  SR: { hu: "Suriname", en: "Suriname", flag: "🇸🇷" },
  SV: { hu: "Salvador", en: "El Salvador", flag: "🇸🇻" },
  TH: { hu: "Thaiföld", en: "Thailand", flag: "🇹🇭" },
  TT: { hu: "Trinidad és Tobago", en: "Trinidad and Tobago", flag: "🇹🇹" },
  TW: { hu: "Tajvan", en: "Taiwan", flag: "🇹🇼" },
  TZ: { hu: "Tanzánia", en: "Tanzania", flag: "🇹🇿" },
  UG: { hu: "Uganda", en: "Uganda", flag: "🇺🇬" },
  UY: { hu: "Uruguay", en: "Uruguay", flag: "🇺🇾" },
  UZ: { hu: "Üzbegisztán", en: "Uzbekistan", flag: "🇺🇿" },
  VE: { hu: "Venezuela", en: "Venezuela", flag: "🇻🇪" },
  VN: { hu: "Vietnám", en: "Vietnam", flag: "🇻🇳" },
  XK: { hu: "Koszovó", en: "Kosovo", flag: "🇽🇰" },
  YE: { hu: "Jemen", en: "Yemen", flag: "🇾🇪" },
  ZA: { hu: "Dél-afrikai Köztársaság", en: "South Africa", flag: "🇿🇦" },
  ZM: { hu: "Zambia", en: "Zambia", flag: "🇿🇲" },
  ZW: { hu: "Zimbabwe", en: "Zimbabwe", flag: "🇿🇼" },
  SY: { hu: "Szíria", en: "Syria", flag: "🇸🇾" },
  VG: { hu: "Brit Virgin-szigetek", en: "British Virgin Islands", flag: "🇻🇬" },
  CU: { hu: "Kuba", en: "Cuba", flag: "🇨🇺" },
  GI: { hu: "Gibraltár", en: "Gibraltar", flag: "🇬🇮" },
  SN: { hu: "Szenegál", en: "Senegal", flag: "🇸🇳" },
  AS: { hu: "Amerikai Szamoa", en: "American Samoa", flag: "🇦🇸" },
  MC: { hu: "Monaco", en: "Monaco", flag: "🇲🇨" },
  SC: { hu: "Seychelle-szigetek", en: "Seychelles", flag: "🇸🇨" },
  MZ: { hu: "Mozambik", en: "Mozambique", flag: "🇲🇿" },
  BI: { hu: "Burundi", en: "Burundi", flag: "🇧🇮" },
  GN: { hu: "Guinea", en: "Guinea", flag: "🇬🇳" },
  BF: { hu: "Burkina Faso", en: "Burkina Faso", flag: "🇧🇫" },
};

/**
 * Régi vagy nem szabványos kódok, amiket a forráslisták még használnak
 * (GoodFirms). A Jugoszláviát nem lehet egy mai országra visszavezetni.
 */
const LEGACY_CODES: Record<string, string> = {
  FX: "FR", // Franciaország európai része
  DY: "BJ", // Dahomey → Benin
  HV: "BF", // Felső-Volta → Burkina Faso
  YU: "INT", // Jugoszlávia
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
  if (LEGACY_CODES[upper]) return LEGACY_CODES[upper];
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

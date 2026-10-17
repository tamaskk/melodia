/**
 * A Seedtable országai a Markets oldalról (2026-10-14): követett cégek száma,
 * összes bevont tőke és a Seedtable országpontja. A sorrend a Seedtable-é —
 * az 50 cég alatti piacok a lista végén, külön.
 *
 * Kézzel frissítendő pillanatkép; a szűrő a nevet küldi, a számok csak
 * tájékoztatnak a választáskor.
 */
export interface SeedtableMarket {
  flag: string;
  /** Angol név — a Seedtable ezt várja a `country` / `hq_country` szűrőben. */
  name: string;
  companies: number | null;
  funding: string | null;
  score: number | null;
  /** 50 cég alatt a pontszám kevés adaton áll. */
  small?: boolean;
}

type Row = [string, string, number | null, string | null, number | null];

const MAIN: Row[] = [
  ["🇭🇺", "Hungary", 164, "$1.0B", 12],
  ["🇮🇱", "Israel", 989, "$46.3B", 100],
  ["🇺🇸", "United States", 42262, "$2.5T", 92],
  ["🇬🇧", "United Kingdom", 7265, "$244.7B", 81],
  ["🇸🇦", "Saudi Arabia", 87, "$7.1B", 74],
  ["🇰🇷", "South Korea", 1449, "$89.2B", 69],
  ["🇩🇪", "Germany", 2764, "$118.2B", 68],
  ["🇨🇳", "China", 2457, "$345.8B", 66],
  ["🇫🇷", "France", 2743, "$83.1B", 60],
  ["🇧🇷", "Brazil", 518, "$36.2B", 60],
  ["🇯🇵", "Japan", 612, "$18.6B", 59],
  ["🇻🇳", "Vietnam", 64, "$3.0B", 59],
  ["🇰🇪", "Kenya", 66, "$1.8B", 58],
  ["🇨🇴", "Colombia", 135, "$6.5B", 57],
  ["🇮🇳", "India", 3915, "$124.8B", 56],
  ["🇹🇼", "Taiwan", 120, "$6.1B", 55],
  ["🇳🇱", "Netherlands", 1100, "$50.2B", 54],
  ["🇲🇽", "Mexico", 238, "$12.7B", 53],
  ["🇹🇭", "Thailand", 72, "$3.3B", 53],
  ["🇪🇬", "Egypt", 72, "$1.4B", 51],
  ["🇸🇬", "Singapore", 881, "$56.6B", 47],
  ["🇮🇩", "Indonesia", 656, "$28.0B", 45],
  ["🇮🇪", "Ireland", 516, "$40.9B", 45],
  ["🇳🇬", "Nigeria", 133, "$1.9B", 44],
  ["🇦🇷", "Argentina", 122, "$3.4B", 44],
  ["🇳🇿", "New Zealand", 92, "$1.2B", 43],
  ["🇦🇪", "United Arab Emirates", 181, "$9.6B", 40],
  ["🇨🇭", "Switzerland", 1198, "$47.4B", 37],
  ["🇲🇾", "Malaysia", 54, "$1.4B", 37],
  ["🇦🇺", "Australia", 1861, "$12.7B", 36],
  ["🇨🇦", "Canada", 3480, "$80.5B", 33],
  ["🇱🇺", "Luxembourg", 168, "$9.4B", 31],
  ["🇿🇦", "South Africa", 92, "$2.7B", 29],
  ["🇨🇾", "Cyprus", 63, "$1.7B", 28],
  ["🇷🇸", "Serbia", 59, "$33M", 28],
  ["🇩🇰", "Denmark", 663, "$11.4B", 26],
  ["🇸🇪", "Sweden", 1329, "$73.2B", 25],
  ["🇫🇮", "Finland", 659, "$15.3B", 25],
  ["🇧🇪", "Belgium", 576, "$11.6B", 25],
  ["🇭🇰", "Hong Kong", 888, "$3.9B", 24],
  ["🇦🇹", "Austria", 350, "$6.4B", 24],
  ["🇨🇱", "Chile", 105, "$1.7B", 24],
  ["🇪🇪", "Estonia", 298, "$5.9B", 23],
  ["🇱🇻", "Latvia", 62, "$197M", 23],
  ["🇪🇸", "Spain", 1358, "$25.5B", 22],
  ["🇷🇺", "Russia", 198, "$5.1B", 22],
  ["🇳🇴", "Norway", 575, "$9.6B", 21],
  ["🇱🇹", "Lithuania", 155, "$2.3B", 21],
  ["🇮🇹", "Italy", 842, "$22.6B", 19],
  ["🇹🇷", "Turkey", 288, "$12.8B", 18],
  ["🇨🇿", "Czech Republic", 221, "$2.7B", 17],
  ["🇮🇸", "Iceland", 154, "$2.4B", 17],
  ["🇷🇴", "Romania", 127, "$638M", 14],
  ["🇵🇱", "Poland", 354, "$2.3B", 13],
  ["🇧🇬", "Bulgaria", 154, "$641M", 13],
  ["🇬🇷", "Greece", 145, "$1.4B", 13],
  ["🇵🇹", "Portugal", 291, "$3.9B", 10],
];

const SMALL: Row[] = [
  ["🇵🇰", "Pakistan", 46, "$293M", 34],
  ["🇸🇰", "Slovakia", 43, "$220M", 26],
  ["🇲🇹", "Malta", 42, "$3.0B", 33],
  ["🇺🇦", "Ukraine", 42, "$152M", 31],
  ["🇵🇭", "Philippines", 41, "$2.1B", 68],
  ["🇸🇮", "Slovenia", 40, "$230M", 28],
  ["🇭🇷", "Croatia", 34, "$1.1B", 34],
  ["🇵🇪", "Peru", 27, "$213M", 43],
  ["🇺🇾", "Uruguay", 22, "$1.1B", 62],
  ["🇬🇭", "Ghana", 22, "$199M", 44],
  ["🇱🇰", "Sri Lanka", 22, "$198M", 44],
  ["🇧🇾", "Belarus", 20, "$23M", 44],
  ["🇵🇦", "Panama", 16, "$49M", 41],
  ["🇧🇩", "Bangladesh", 16, "$357M", 58],
  ["🇲🇦", "Morocco", 15, "$55M", 50],
  ["🇬🇪", "Georgia", 13, "$113M", 49],
  ["🇸🇨", "Seychelles", 11, "$352M", 71],
  ["🇱🇮", "Liechtenstein", 10, "$193M", 60],
  ["🇯🇴", "Jordan", 9, "$111M", 62],
  ["🇸🇳", "Senegal", 9, "$107M", 66],
  ["🇶🇦", "Qatar", 9, "$22M", 55],
  ["🇲🇺", "Mauritius", 8, "$89M", 68],
  ["🇰🇿", "Kazakhstan", 7, null, 49],
  ["🇹🇳", "Tunisia", 7, "$51M", 69],
  ["🇲🇰", "North Macedonia", 7, "$36M", 53],
  ["🇧🇭", "Bahrain", 7, "$160M", 61],
  ["🇦🇿", "Azerbaijan", 6, "$940K", 56],
  ["🇺🇬", "Uganda", 6, "$33M", 56],
  ["🇳🇵", "Nepal", 6, "$6M", 57],
  ["🇪🇹", "Ethiopia", 6, "$8M", 55],
  ["🇨🇮", "Ivory Coast", 6, "$49M", 64],
  ["🇴🇲", "Oman", 6, "$11M", 60],
  ["🇨🇷", "Costa Rica", 5, "$98M", 54],
  ["🇱🇧", "Lebanon", 5, "$4M", 57],
  ["🇦🇱", "Albania", 5, "$7M", 61],
  ["🇦🇴", "Angola", 4, "$1M", 61],
  ["🇩🇿", "Algeria", 4, "$218M", 67],
  ["🇬🇹", "Guatemala", 4, "$5M", 59],
  ["🇰🇼", "Kuwait", 4, "$24M", 54],
  ["🇺🇿", "Uzbekistan", 4, "$104M", 70],
  ["🇲🇨", "Monaco", 4, "$2M", 53],
  ["🇿🇼", "Zimbabwe", 3, "$13M", 62],
  ["🇦🇲", "Armenia", 3, "$43M", 67],
  ["🇧🇦", "Bosnia and Herzegovina", 3, "$7M", 64],
  ["🇨🇩", "Democratic Republic of the Congo", 3, "$100K", 62],
  ["🇪🇨", "Ecuador", 3, "$11M", 63],
  ["🇮🇶", "Iraq", 3, "$12M", 66],
  ["🇲🇩", "Moldova", 3, "$11M", 67],
  ["🇲🇳", "Mongolia", 3, null, 62],
  ["🇷🇼", "Rwanda", 3, "$5M", 66],
  ["🇹🇿", "Tanzania", 3, "$89M", 70],
  ["🇻🇪", "Venezuela", 3, "$101M", 66],
  ["🇿🇲", "Zambia", 3, "$23M", 67],
  ["🇸🇻", "El Salvador", 2, "$57M", 67],
  ["🇸🇲", "San Marino", 2, "$45M", 70],
  ["🇵🇬", "Papua New Guinea", 2, "$2M", 66],
  ["🇰🇭", "Cambodia", 2, "$5M", 62],
  ["🇲🇲", "Myanmar", 2, "$92M", 70],
  ["🇲🇿", "Mozambique", 2, null, 64],
  ["🇩🇴", "Dominican Republic", 1, null, 67],
  ["🇲🇪", "Montenegro", 1, null, 67],
  ["🇦🇩", "Andorra", 1, null, 62],
  ["🇧🇴", "Bolivia", 1, "$2M", 61],
  ["🇳🇦", "Namibia", 1, "$18M", 70],
  // A beillesztett lista itt megszakadt — a számai nem ismertek.
  ["🇹🇯", "Tajikistan", null, null, null],
];

const toMarket =
  (small: boolean) =>
  ([flag, name, companies, funding, score]: Row): SeedtableMarket => ({
    flag,
    name,
    companies,
    funding,
    score,
    ...(small ? { small } : {}),
  });

export const SEEDTABLE_MARKETS: SeedtableMarket[] = [
  ...MAIN.map(toMarket(false)),
  ...SMALL.map(toMarket(true)),
];

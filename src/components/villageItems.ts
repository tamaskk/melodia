import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * A falu kézzel lerakható elemei: állatok, növények, tárgyak. A lerakott elemek
 * csak ebben a böngészőben élnek (localStorage) — díszlet, nem üzleti adat.
 */

const T = 16;
const DECOR = "/village/Outdoor decoration/Outdoor_Decor_Free.png";
const KEY = "melodia:village:items";

export interface ItemKind {
  key: string;
  label: string;
  group: "Állatok" | "Növények" | "Tárgyak";
  src: string;
  /** A teljes lap mérete — az előnézet CSS-háttérként vágja ki. */
  sheet: [number, number];
  sx: number;
  sy: number;
  w: number;
  h: number;
  animal?: boolean;
  /** Madár vagy bogár: átmehet a házakon (a kerítésen nem). */
  flies?: boolean;
  /** A saját terepe: ha van ilyen a közelben, ott él, és onnan nem lép le. */
  biome?: BiomeKey;
  /** Bemehet a vízbe (a vízi állatok és a kétéltűek); a többinek a víz fal. */
  swims?: boolean;
  /** Fa: a törzsén a négylábúak nem mennek át. */
  solid?: boolean;
}

/** Festhető terepek a fű helyett. */
export const BIOMES = [
  { key: "water", label: "Víz" },
  { key: "sand", label: "Homok" },
  { key: "ice", label: "Jég" },
] as const;
export type BiomeKey = (typeof BIOMES)[number]["key"];

const BIOME_OF: Record<string, BiomeKey> = {
  "polar-bear": "ice",
  penguin: "ice",
  seal: "ice",
  goldfish: "water",
  octopus: "water",
  crab: "sand",
  camel: "sand",
};

const FLYERS = new Set([
  "chicken",
  "brown-hen",
  "duckling",
  "owl",
  "parrot",
  "flamingo",
  "swan",
  "pigeon",
  "turkey",
  "ostrich",
  "toucan",
  "peacock",
  "penguin",
  "bat",
  "ladybug",
  "butterfly",
  "bee",
  "spider",
]);

/** Kétéltűek: bemehetnek a vízbe, és ki is jöhetnek belőle. */
const SWIMMERS = new Set([
  "otter",
  "crocodile",
  "hippo",
  "frog",
  "turtle",
  "swan",
  "duckling",
]);

const animal = (key: string, label: string, file: string): ItemKind => ({
  key,
  label,
  group: "Állatok",
  src: `/village/Animals/${file}/${file}.png`,
  sheet: [64, 64],
  sx: 0,
  sy: 0,
  w: 32,
  h: 32,
  animal: true,
  flies: FLYERS.has(key),
  biome: BIOME_OF[key],
  swims: BIOME_OF[key] === "water" || SWIMMERS.has(key),
});

/** A scripts/village-plants.py rajzolta növények: egy kép, `w`×`h` pixel. */
const plant = (
  key: string,
  label: string,
  file: string,
  w: number,
  h: number,
  solid = false,
): ItemKind => ({
  key,
  label,
  group: "Növények",
  src: `/village/Plants/${file}.png`,
  sheet: [w, h],
  sx: 0,
  sy: 0,
  w,
  h,
  solid,
});

const decor = (
  key: string,
  label: string,
  group: ItemKind["group"],
  sx: number,
  sy: number,
  w = 16,
  h = 16,
): ItemKind => ({
  key,
  label,
  group,
  src: DECOR,
  sheet: [112, 192],
  sx,
  sy,
  w,
  h,
});

export const ITEMS: ItemKind[] = [
  animal("chicken", "Tyúk", "Chicken"),
  animal("cow", "Tehén", "Cow"),
  animal("pig", "Malac", "Pig"),
  animal("sheep", "Bárány", "Sheep"),
  // A többit a scripts/village-animals.py rajzolja ugyanebbe a formátumba.
  animal("duckling", "Kiskacsa", "Duckling"),
  animal("bunny", "Nyuszi", "Bunny"),
  animal("cat", "Cica", "Cat"),
  animal("dog", "Kutya", "Dog"),
  animal("brown-hen", "Barna tyúk", "BrownHen"),
  animal("brown-cow", "Barna tehén", "BrownCow"),
  animal("boar", "Vadkan", "Boar"),
  animal("black-sheep", "Fekete bárány", "BlackSheep"),
  animal("black-cat", "Fekete cica", "BlackCat"),
  animal("mouse", "Egér", "Mouse"),
  animal("hedgehog", "Sün", "Hedgehog"),
  animal("frog", "Béka", "Frog"),
  animal("turtle", "Teknős", "Turtle"),
  animal("snake", "Kígyó", "Snake"),
  animal("python", "Piton", "Python"),
  animal("fox", "Róka", "Fox"),
  animal("wolf", "Farkas", "Wolf"),
  animal("raccoon", "Mosómedve", "Raccoon"),
  animal("otter", "Vidra", "Otter"),
  animal("capybara", "Kapibara", "Capybara"),
  animal("alpaca", "Alpaka", "Alpaca"),
  animal("llama", "Láma", "Llama"),
  animal("brown-bear", "Barnamedve", "BrownBear"),
  animal("polar-bear", "Jegesmedve", "PolarBear"),
  animal("panda", "Panda", "Panda"),
  animal("koala", "Koala", "Koala"),
  animal("monkey", "Majom", "Monkey"),
  animal("orangutan", "Orángután", "Orangutan"),
  animal("gorilla", "Gorilla", "Gorilla"),
  animal("penguin", "Pingvin", "Penguin"),
  animal("elephant", "Elefánt", "Elephant"),
  animal("giraffe", "Zsiráf", "Giraffe"),
  animal("lion", "Oroszlán", "Lion"),
  animal("tiger", "Tigris", "Tiger"),
  animal("cheetah", "Gepárd", "Cheetah"),
  animal("horse", "Ló", "Horse"),
  animal("zebra", "Zebra", "Zebra"),
  animal("donkey", "Szamár", "Donkey"),
  animal("goat", "Kecske", "Goat"),
  animal("deer", "Szarvas", "Deer"),
  animal("camel", "Teve", "Camel"),
  animal("kangaroo", "Kenguru", "Kangaroo"),
  animal("hippo", "Víziló", "Hippo"),
  animal("rhino", "Orrszarvú", "Rhino"),
  animal("crocodile", "Krokodil", "Crocodile"),
  animal("lizard", "Gyík", "Lizard"),
  animal("beaver", "Hód", "Beaver"),
  animal("squirrel", "Mókus", "Squirrel"),
  animal("hamster", "Hörcsög", "Hamster"),
  animal("bat", "Denevér", "Bat"),
  animal("sloth", "Lajhár", "Sloth"),
  animal("seal", "Fóka", "Seal"),
  animal("armadillo", "Tatu", "Armadillo"),
  animal("owl", "Bagoly", "Owl"),
  animal("parrot", "Papagáj", "Parrot"),
  animal("flamingo", "Flamingó", "Flamingo"),
  animal("swan", "Hattyú", "Swan"),
  animal("pigeon", "Galamb", "Pigeon"),
  animal("turkey", "Pulyka", "Turkey"),
  animal("ostrich", "Strucc", "Ostrich"),
  animal("toucan", "Tukán", "Toucan"),
  animal("peacock", "Páva", "Peacock"),
  animal("snail", "Csiga", "Snail"),
  animal("ladybug", "Katica", "Ladybug"),
  animal("butterfly", "Pillangó", "Butterfly"),
  animal("bee", "Méh", "Bee"),
  animal("spider", "Pók", "Spider"),
  animal("crab", "Rák", "Crab"),
  animal("octopus", "Polip", "Octopus"),
  animal("goldfish", "Aranyhal", "Goldfish"),
  {
    key: "tree",
    label: "Fa",
    group: "Növények",
    src: "/village/Outdoor decoration/Oak_Tree.png",
    sheet: [64, 80],
    sx: 0,
    sy: 0,
    w: 64,
    h: 80,
    solid: true,
  },
  {
    key: "small-tree",
    label: "Kis fa",
    group: "Növények",
    src: "/village/Outdoor decoration/Oak_Tree_Small.png",
    sheet: [96, 48],
    sx: 32,
    sy: 0,
    w: 32,
    h: 48,
    solid: true,
  },
  plant("pine", "Fenyőfa", "Pine", 30, 46, true),
  plant("snow-pine", "Havas fenyő", "SnowPine", 30, 46, true),
  plant("birch", "Nyírfa", "Birch", 32, 42, true),
  plant("cherry", "Cseresznyefa", "Cherry", 32, 42, true),
  plant("autumn-tree", "Őszi fa", "Autumn", 32, 42, true),
  plant("apple-tree", "Almafa", "Apple", 32, 42, true),
  plant("palm", "Pálmafa", "Palm", 34, 46, true),
  plant("cactus", "Kaktusz", "Cactus", 18, 26, true),
  plant("bush", "Bokor", "Bush", 24, 18),
  plant("berry-bush", "Áfonyabokor", "BerryBush", 24, 18),
  plant("rose-bush", "Rózsabokor", "RoseBush", 24, 18),
  plant("sunflower", "Napraforgó", "Sunflower", 14, 20),
  plant("tulip", "Tulipán", "Tulip", 14, 20),
  plant("lavender", "Levendula", "Lavender", 16, 20),
  plant("fern", "Páfrány", "Fern", 20, 16),
  plant("reeds", "Nád", "Reeds", 16, 24),
  plant("pumpkin", "Tök", "Pumpkin", 18, 14),
  decor("flower-red", "Piros virág", "Növények", 0, 128),
  decor("flower-yellow", "Sárga virág", "Növények", 16, 128),
  decor("flower-pot", "Cserepes", "Növények", 32, 128),
  decor("mushroom", "Gomba", "Növények", 32, 112),
  decor("rock", "Kő", "Tárgyak", 0, 48),
  decor("stump", "Tuskó", "Tárgyak", 0, 32),
  decor("log", "Rönk", "Tárgyak", 0, 112, 32, 16),
  decor("lamp", "Lámpa", "Tárgyak", 64, 64, 16, 48),
  {
    key: "chest",
    label: "Láda",
    group: "Tárgyak",
    src: "/village/Outdoor decoration/Chest.png",
    sheet: [16, 16],
    sx: 0,
    sy: 0,
    w: 16,
    h: 16,
  },
];

const BY_KEY = new Map(ITEMS.map((item) => [item.key, item]));

/** Egy lerakott elem; `x`, `y` csempében, a talppontja. Az állat ide tér vissza. */
export interface PlacedItem {
  kind: string;
  x: number;
  y: number;
  // Csak az állatok mozgásához, nem mentjük.
  homeX?: number;
  homeY?: number;
  tx?: number;
  ty?: number;
  waitUntil?: number;
  moving?: boolean;
  facingRight?: boolean;
  /** A jobb oldali listában kijelölve: nyíl jelöli a térképen. */
  marked?: boolean;
}

export function loadItems(): PlacedItem[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(
      (item): item is PlacedItem =>
        BY_KEY.has(item?.kind) &&
        Number.isFinite(item?.x) &&
        Number.isFinite(item?.y),
    );
  } catch {
    return [];
  }
}

export function saveItems(items: PlacedItem[]): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        items.map((item) => ({
          kind: item.kind,
          x: item.homeX ?? item.x,
          y: item.homeY ?? item.y,
        })),
      ),
    );
  } catch {
    // Privát ablakban nincs tároló — ilyenkor csak a lap bezárásáig marad meg.
  }
}

/** A látható rét: a talppont ezen belül marad, hogy az állat ne lógjon ki. */
export interface Bounds {
  /** A megengedett talppontok tartománya csempében (a világ széle). */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Amit az állatok a térképről tudnak: falak, a látható rész és a terepek. */
export interface World {
  /** Mindenkit megállít. */
  fences: Set<string>;
  /** Kerítés + házak: a nem repülőket állítja meg. */
  walls: Set<string>;
  bounds: Bounds;
  /** Festett terep csempénként (`x,y` → terep); ami nincs benne, az fű. */
  biomes: Map<string, BiomeKey>;
}

const EMPTY = new Set<string>();

/** A legközelebbi `biome` csempe közepe `radius` csempén belül, vagy null. */
function nearestBiome(
  biomes: Map<string, BiomeKey>,
  biome: BiomeKey,
  x: number,
  y: number,
  radius = 10,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (biomes.get(`${cx + dx},${cy + dy}`) !== biome) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: cx + dx + 0.5, y: cy + dy + 0.5 };
      }
    }
  }
  return best;
}

/**
 * Az állat lődörög az otthona körül: elsétál egy közeli pontra, ott áll egy
 * kicsit. Fal-csempére (kerítés, ház, képernyőszél) nem lép: ott megáll, és
 * később másfelé indul. Akinek saját terepe van (jegesmedve: jég, hal: víz),
 * az a közeli ilyen terepre költözik, és onnan nem lép le.
 */
function wander(
  item: PlacedItem,
  kind: ItemKind,
  now: number,
  dt: number,
  world: World,
  plants: Set<string>,
) {
  const { bounds, biomes } = world;
  const walls = kind.flies ? world.fences : world.walls;
  // A lerakott fák is falak a négylábúaknak.
  const trees = kind.flies ? EMPTY : plants;
  item.homeX ??= item.x;
  item.homeY ??= item.y;
  if (item.waitUntil && now < item.waitUntil) {
    item.moving = false;
    return;
  }
  const biomeAt = (x: number, y: number) =>
    biomes.get(`${Math.floor(x)},${Math.floor(y)}`);
  const home = kind.biome;
  const inHome = home !== undefined && biomeAt(item.x, item.y) === home;
  if (item.tx === undefined || item.ty === undefined) {
    if (home && !inHome) {
      const spot = nearestBiome(biomes, home, item.x, item.y);
      if (spot) {
        item.homeX = spot.x;
        item.homeY = spot.y;
      }
    }
    // A cél mindig a képernyőn belül: ami kint rekedt (pl. átméretezés), visszasétál.
    item.tx = Math.min(
      bounds.maxX,
      Math.max(bounds.minX, item.homeX + (Math.random() - 0.5) * 6),
    );
    item.ty = Math.min(
      bounds.maxY,
      Math.max(bounds.minY, item.homeY + (Math.random() - 0.5) * 4),
    );
    if (home && !inHome && biomeAt(item.homeX, item.homeY) === home) {
      // Egyenesen a terepére megy, nem mellé.
      item.tx = item.homeX;
      item.ty = item.homeY;
    }
  }
  const dx = item.tx - item.x;
  const dy = item.ty - item.y;
  const distance = Math.hypot(dx, dy);
  const step = (dt / 1000) * 1.2;
  if (distance <= step) {
    item.x = item.tx;
    item.y = item.ty;
    item.tx = item.ty = undefined;
    item.waitUntil = now + 1500 + Math.random() * 4000;
    item.moving = false;
    return;
  }
  const nx = item.x + (dx / distance) * step;
  const ny = item.y + (dy / distance) * step;
  const fenced = (x: number, y: number) =>
    x < bounds.minX ||
    y < bounds.minY ||
    x > bounds.maxX ||
    y > bounds.maxY ||
    walls.has(`${Math.floor(x)},${Math.floor(y)}`) ||
    trees.has(`${Math.floor(x)},${Math.floor(y)}`) ||
    // A saját terepéről nem lép le.
    (inHome && biomeAt(x, y) !== home) ||
    // Vízbe csak a vízi állatok és a kétéltűek mennek.
    (!kind.swims && biomeAt(x, y) === "water");
  // Ha épp falon áll (oda rakták), leléphet róla.
  if (fenced(nx, ny) && !fenced(item.x, item.y)) {
    item.tx = item.ty = undefined;
    item.waitUntil = now + 500 + Math.random() * 1500;
    item.moving = false;
    return;
  }
  item.x = nx;
  item.y = ny;
  item.moving = true;
  if (Math.abs(dx) > 0.05) item.facingRight = dx > 0;
}

/** A kijelölt állat: sárga gyűrű a lábánál, fölötte ugráló nyíl. */
function drawMarker(
  ctx: CanvasRenderingContext2D,
  item: PlacedItem,
  now: number,
) {
  const px = Math.round(item.x * T);
  const py = Math.round(item.y * T);
  const bob = Math.sin(now / 200) * 2;
  ctx.strokeStyle = "#ffd23f";
  ctx.fillStyle = "#ffd23f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(px, py + 1, 12, 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px - 5, py - 38 + bob);
  ctx.lineTo(px + 5, py - 38 + bob);
  ctx.lineTo(px, py - 31 + bob);
  ctx.closePath();
  ctx.fill();
}

/** Az elemek kirajzolása, fentről lefelé, hogy a lentebbi takarja a fentebbit. */
export function drawItems(
  ctx: CanvasRenderingContext2D,
  images: Map<string, HTMLImageElement>,
  items: PlacedItem[],
  now: number,
  dt: number,
  world: World,
): void {
  // A kézzel lerakott fák törzse (húzhatók, ezért képkockánként számoljuk).
  const plants = new Set<string>();
  for (const item of items) {
    if (!BY_KEY.get(item.kind)?.solid) continue;
    const x = Math.floor(item.x);
    const y = Math.floor(item.y);
    for (let dx = -1; dx <= 0; dx++) {
      plants.add(`${x + dx},${y - 1}`);
      plants.add(`${x + dx},${y - 2}`);
    }
  }
  for (const item of [...items].sort((a, b) => a.y - b.y)) {
    const kind = BY_KEY.get(item.kind);
    const image = kind && images.get(kind.src);
    if (!kind || !image) continue;
    if (kind.animal) {
      wander(item, kind, now, dt, world, plants);
      const row = item.moving ? 1 : 0;
      const col = Math.floor(now / (item.moving ? 180 : 600)) % 2;
      ctx.save();
      ctx.translate(Math.round(item.x * T), Math.round(item.y * T));
      // A lapon balra néznek; jobbra menet tükrözzük.
      if (item.facingRight) ctx.scale(-1, 1);
      ctx.drawImage(image, col * 32, row * 32, 32, 32, -16, -28, 32, 32);
      ctx.restore();
      if (item.marked) drawMarker(ctx, item, now);
    } else {
      ctx.drawImage(
        image,
        kind.sx,
        kind.sy,
        kind.w,
        kind.h,
        Math.round(item.x * T - kind.w / 2),
        Math.round(item.y * T - kind.h),
        kind.w,
        kind.h,
      );
    }
  }
}

/** Ugyanaz a kivágás CSS-háttérként, a gombok előnézetéhez. */
export function previewStyle(kind: ItemKind, box = 28): React.CSSProperties {
  const scale = Math.min(box / kind.w, box / kind.h, 2);
  return {
    width: kind.w * scale,
    height: kind.h * scale,
    backgroundImage: `url("${encodeURI(kind.src)}")`,
    backgroundPosition: `${-kind.sx * scale}px ${-kind.sy * scale}px`,
    backgroundSize: `${kind.sheet[0] * scale}px ${kind.sheet[1] * scale}px`,
    imageRendering: "pixelated",
  };
}

/* ------------------------------------------------------------------ */
/* A falu kézi elrendezése: házhelyek, ki hol lakik, rajzolt utak        */
/* ------------------------------------------------------------------ */

const EDITS_KEY = "melodia:village:layout";
const EMPTY_EDITS =
  '{"order":[],"pos":{},"painted":[],"erased":[],"fences":[],"biomes":{},"kinds":{},"extra":[]}';

export interface VillageEdits {
  /** Sender-azonosítók házhelyenként: az `i`. házban `order[i]` lakik. */
  order: string[];
  /** Kézzel áthelyezett házak bal felső sarka, házhelyenként (csempében). */
  pos: Record<number, { x: number; y: number }>;
  /** Kézzel rajzolt és kiradírozott útcsempék (`x,y`). */
  painted: string[];
  erased: string[];
  /** Kerítéscsempék (`x,y`): az állatok nem lépnek át rajtuk. */
  fences: string[];
  /** Festett terep csempénként (`x,y` → víz / homok / jég); a többi fű. */
  biomes: Record<string, BiomeKey>;
  /** A bővített világ mérete csempében (görgetéskor nő jobbra és lefelé). */
  world?: { cols: number; rows: number; left?: number; top?: number };
  /** Háztípus házhelyenként (`HOUSE_KINDS` kulcsa). */
  kinds: Record<number, string>;
  /**
   * A bal panelből lerakott további házak (pl. egy fiók Lekérő vagy Válasz
   * háza a küldő háza mellett). `account` a fiók azonosítója, `x`, `y` a ház
   * bal felső sarka csempében.
   */
  extra: { id: string; kind: string; account: string; x: number; y: number }[];
}

const editListeners = new Set<() => void>();

function subscribeEdits(onChange: () => void): () => void {
  editListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    editListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function editsSnapshot(): string {
  try {
    return localStorage.getItem(EDITS_KEY) ?? EMPTY_EDITS;
  } catch {
    return EMPTY_EDITS;
  }
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

function parseEdits(raw: string): VillageEdits {
  try {
    const data = JSON.parse(raw) as Partial<VillageEdits>;
    const pos: VillageEdits["pos"] = {};
    for (const [slot, at] of Object.entries(data.pos ?? {})) {
      if (Number.isFinite(at?.x) && Number.isFinite(at?.y)) {
        pos[Number(slot)] = { x: Math.round(at.x), y: Math.round(at.y) };
      }
    }
    return {
      order: strings(data.order),
      pos,
      painted: strings(data.painted),
      erased: strings(data.erased),
      fences: strings(data.fences),
      world:
        Number.isFinite(data.world?.cols) && Number.isFinite(data.world?.rows)
          ? {
              cols: Math.min(512, Math.round(data.world!.cols)),
              rows: Math.min(512, Math.round(data.world!.rows)),
              left: Math.min(
                512,
                Math.max(0, Math.round(data.world!.left ?? 0)),
              ),
              top: Math.min(512, Math.max(0, Math.round(data.world!.top ?? 0))),
            }
          : undefined,
      biomes: Object.fromEntries(
        Object.entries(data.biomes ?? {}).filter(([, biome]) =>
          BIOMES.some((item) => item.key === biome),
        ),
      ) as Record<string, BiomeKey>,
      extra: (Array.isArray(data.extra) ? data.extra : []).filter(
        (house) =>
          typeof house?.id === "string" &&
          typeof house.account === "string" &&
          HOUSE_KINDS.some((kind) => kind.key === house.kind) &&
          Number.isFinite(house.x) &&
          Number.isFinite(house.y),
      ),
      kinds: Object.fromEntries(
        Object.entries(data.kinds ?? {}).filter(([, kind]) =>
          HOUSE_KINDS.some((item) => item.key === kind),
        ),
      ),
    };
  } catch {
    return JSON.parse(EMPTY_EDITS) as VillageEdits;
  }
}

/**
 * A mentett elrendezés ebből a böngészőből. useSyncExternalStore: a szerveren
 * és a hidratáláskor az üres elrendezés, utána a tárolt — effektben állított
 * állapot nélkül.
 */
export function useVillageEdits(): [
  VillageEdits,
  (next: VillageEdits) => void,
] {
  const raw = useSyncExternalStore(
    subscribeEdits,
    editsSnapshot,
    () => EMPTY_EDITS,
  );
  const edits = useMemo(() => parseEdits(raw), [raw]);
  const save = useCallback((next: VillageEdits) => {
    try {
      localStorage.setItem(EDITS_KEY, JSON.stringify(next));
    } catch {
      // Privát ablakban nincs tároló — ilyenkor nem marad meg.
    }
    for (const listener of editListeners) listener();
  }, []);
  return [edits, save];
}

/* ------------------------------------------------------------------ */
/* Tetőszínek: a csomag egyetlen házát színezzük át                      */
/* ------------------------------------------------------------------ */

export interface Roof {
  key: string;
  label: string;
  /** Cél-árnyalat fokban; `null` = az eredeti kékeszöld. */
  hue: number | null;
  saturation: number;
  lightness: number;
  swatch: string;
}

/** A ház szerepe a faluban: mit csinál a lakója. A tető színe a típust jelzi (`ROOFS` kulcsa). */
export const HOUSE_KINDS = [
  { key: "sender", label: "Küldő ház", roof: "red" },
  { key: "fetch", label: "Lekérő ház", roof: "teal" },
  { key: "reply", label: "Válasz ház", roof: "green" },
  // Itt nem lakik senki: ide hordja a Válasz ház a kész Gmail-piszkozatokat.
  { key: "storage", label: "Raktár", roof: "brown" },
] as const;

export const ROOFS: Roof[] = [
  {
    key: "teal",
    label: "Kékeszöld",
    hue: null,
    saturation: 1,
    lightness: 1,
    swatch: "#255e5f",
  },
  {
    key: "red",
    label: "Piros",
    hue: 2,
    saturation: 1.4,
    lightness: 1.25,
    swatch: "#8f2d1f",
  },
  {
    key: "green",
    label: "Zöld",
    hue: 105,
    saturation: 1.1,
    lightness: 1.1,
    swatch: "#3d7a2a",
  },
  {
    key: "brown",
    label: "Barna",
    hue: 28,
    saturation: 0.8,
    lightness: 1.15,
    swatch: "#6b4a2b",
  },
  {
    key: "purple",
    label: "Lila",
    hue: 275,
    saturation: 1,
    lightness: 1.2,
    swatch: "#5b3a7a",
  },
  {
    key: "gray",
    label: "Pala",
    hue: 220,
    saturation: 0.25,
    lightness: 1.2,
    swatch: "#4a4f57",
  },
];

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const roofCache = new Map<string, HTMLCanvasElement>();

/**
 * A ház a kért tetőszínnel. Csak a tető kékeszöld árnyalatai változnak
 * (150–225°, nem telített, sötét); az ablak telített kékje és a fa marad.
 * Az eredeti árnyalattól való eltérést megtartjuk, így a cserepek rajzolata látszik.
 */
export function roofed(
  house: HTMLImageElement,
  key: string,
): CanvasImageSource {
  const roof = ROOFS.find((item) => item.key === key);
  if (!roof || roof.hue === null) return house;
  const cached = roofCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = house.naturalWidth;
  canvas.height = house.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return house;
  ctx.drawImage(house, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (h < 150 || h > 225 || s > 0.7 || l > 0.4) continue;
    const [r, g, b] = hslToRgb(
      (roof.hue + (h - 190) + 360) % 360,
      Math.min(1, s * roof.saturation),
      Math.min(0.9, l * roof.lightness),
    );
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  ctx.putImageData(image, 0, 0);
  roofCache.set(key, canvas);
  return canvas;
}

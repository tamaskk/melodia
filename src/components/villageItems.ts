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
}

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
  },
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

/** Az állat lődörög az otthona körül: elsétál egy közeli pontra, ott áll egy kicsit. */
function wander(item: PlacedItem, now: number, dt: number) {
  item.homeX ??= item.x;
  item.homeY ??= item.y;
  if (item.waitUntil && now < item.waitUntil) {
    item.moving = false;
    return;
  }
  if (item.tx === undefined || item.ty === undefined) {
    item.tx = item.homeX + (Math.random() - 0.5) * 6;
    item.ty = item.homeY + (Math.random() - 0.5) * 4;
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
  item.x += (dx / distance) * step;
  item.y += (dy / distance) * step;
  item.moving = true;
  if (Math.abs(dx) > 0.05) item.facingRight = dx > 0;
}

/** Az elemek kirajzolása, fentről lefelé, hogy a lentebbi takarja a fentebbit. */
export function drawItems(
  ctx: CanvasRenderingContext2D,
  images: Map<string, HTMLImageElement>,
  items: PlacedItem[],
  now: number,
  dt: number,
): void {
  for (const item of [...items].sort((a, b) => a.y - b.y)) {
    const kind = BY_KEY.get(item.kind);
    const image = kind && images.get(kind.src);
    if (!kind || !image) continue;
    if (kind.animal) {
      wander(item, now, dt);
      const row = item.moving ? 1 : 0;
      const col = Math.floor(now / (item.moving ? 180 : 600)) % 2;
      ctx.save();
      ctx.translate(Math.round(item.x * T), Math.round(item.y * T));
      // A lapon balra néznek; jobbra menet tükrözzük.
      if (item.facingRight) ctx.scale(-1, 1);
      ctx.drawImage(image, col * 32, row * 32, 32, 32, -16, -28, 32, 32);
      ctx.restore();
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
  '{"order":[],"pos":{},"painted":[],"erased":[],"kinds":{},"extra":[]}';

export interface VillageEdits {
  /** Sender-azonosítók házhelyenként: az `i`. házban `order[i]` lakik. */
  order: string[];
  /** Kézzel áthelyezett házak bal felső sarka, házhelyenként (csempében). */
  pos: Record<number, { x: number; y: number }>;
  /** Kézzel rajzolt és kiradírozott útcsempék (`x,y`). */
  painted: string[];
  erased: string[];
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

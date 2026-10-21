"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  drawItems,
  ITEMS,
  loadItems,
  HOUSE_KINDS,
  previewStyle,
  roofed,
  ROOFS,
  saveItems,
  useVillageEdits,
  type PlacedItem,
  type VillageEdits,
} from "./villageItems";

export interface VillageHouse {
  id: string;
  label: string;
}

const T = 16; // a csomag csempemérete (px)
const COLS = 96; // széles képernyőhöz: ~2,2 : 1, mint egy laptop böngészőablaka
const B = 3; // az út szélessége csempében
const MAIN_SCALE = 2; // a főház 2× nagyítva, 12×16 csempe
const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const SPRITES = {
  grass: "/village/Tiles/Grass_Middle.png",
  path: "/village/Tiles/Path_Tile.png",
  house: "/village/Outdoor decoration/House_1_Wood_Base_Blue.png",
  tree: "/village/Outdoor decoration/Oak_Tree.png",
  decor: "/village/Outdoor decoration/Outdoor_Decor_Free.png",
  player: "/village/Player/Player.png",
  smallTree: "/village/Outdoor decoration/Oak_Tree_Small.png",
};

type Sprites = Record<keyof typeof SPRITES, HTMLImageElement>;

interface Point {
  x: number;
  y: number;
}

interface Placed {
  id: string;
  label: string;
  x: number;
  y: number;
  main?: boolean;
  /** Tetőszín (`ROOFS` kulcsa). */
  roof?: string;
  /** Háztípus (`HOUSE_KINDS` kulcsa); alapból küldő ház. */
  kind?: string;
  /** A fiók, akinek a munkáját a ház mutatja; a küldő házaknál az `id`. */
  account?: string;
  /** A bal panelből lerakott ház (`edits.extra`) — törölhető. */
  extra?: boolean;
  /** Hányadik házhely — ehhez kötődik a mentett pozíció. */
  slot?: number;
  /** A lakó útja csempében: az ajtó elől a főház ajtaja elé, csak a kanyarokkal. */
  walk?: Point[];
}

type VillageLayout = ReturnType<typeof layout>;

/** Egy size×size-os útblokk csempéi, a bal felső sarkától. */
function blockCells(x: number, y: number, size = B): string[] {
  const cells: string[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) cells.push(`${x + dx},${y + dy}`);
  }
  return cells;
}

/**
 * Legolcsóbb út a ház ajtajától a térig (Dijkstra, vödrös sorral). A kanyar
 * drága, a meglévő úton járni olcsó — így egyenes utak lesznek, és összefutnak.
 */
function findRoute(
  startX: number,
  startY: number,
  rows: number,
  isBlocked: (x: number, y: number) => boolean,
  plaza: Set<string>,
  path: Set<string>,
  size = B,
  stepCost?: (x: number, y: number) => number,
): [number, number][] | null {
  const fits = (x: number, y: number) => {
    if (x < 0 || y < 0 || x + size > COLS || y + size > rows) return false;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++)
        if (isBlocked(x + dx, y + dy)) return false;
    }
    return true;
  };
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const buckets: number[][] = [];
  const push = (state: number, cost: number, from: number) => {
    if ((dist.get(state) ?? Infinity) <= cost) return;
    dist.set(state, cost);
    prev.set(state, from);
    (buckets[cost] ??= []).push(state);
  };
  if (!fits(startX, startY)) return null;
  push((startY * COLS + startX) * 4 + 1, 0, -1); // lefelé indul az ajtóból

  for (let cost = 0; cost < buckets.length; cost++) {
    for (const state of buckets[cost] ?? []) {
      if (dist.get(state) !== cost) continue;
      const dir = state % 4;
      const cell = (state - dir) / 4;
      const x = cell % COLS;
      const y = (cell - x) / COLS;
      // Teljesen a téren álljon, különben lépcsős lesz a csatlakozás széle.
      if (blockCells(x, y, size).every((key) => plaza.has(key))) {
        // Az ajtótól a térig tartó blokksor (bal felső sarkok).
        const route: [number, number][] = [];
        for (let at = state; at !== -1; at = prev.get(at) ?? -1) {
          const c = (at - (at % 4)) / 4;
          route.unshift([c % COLS, Math.floor(c / COLS)]);
        }
        return route;
      }
      DIRS.forEach(([dx, dy], next) => {
        if (next === (dir + 2) % 4) return;
        const nx = x + dx;
        const ny = y + dy;
        if (!fits(nx, ny)) return;
        const step =
          stepCost?.(nx, ny) ??
          (blockCells(nx, ny).every((key) => path.has(key)) ? 1 : 3);
        push(
          (ny * COLS + nx) * 4 + next,
          cost + step + (next === dir ? 0 : 10),
          state,
        );
      });
    }
  }
  return null;
}

/**
 * Középen a főház a térrel, körülötte a küldő házak, mindegyikből út
 * vezet a térre. A véletlen a fiók-azonosítókból indul: amíg a fiókok nem
 * változnak, a falu ugyanúgy néz ki.
 */
function layout(houses: VillageHouse[], fit: number, edits: VillageEdits) {
  // Az ablakhoz igazítva, de a házaknak legalább ennyi sor kell.
  // A falu magja (főház, házak) az ablaktól független méretben áll, hogy
  // átméretezéskor ne csússzon el a rajzolt utaktól; magasabb ablakban csak lent nő a rét.
  const base = 48 + Math.max(0, houses.length - 8) * 3;
  const rows = Math.max(fit, base);
  const mx = COLS / 2 - 6;
  const my = Math.floor((base - 16) / 2) - 1;
  const placed: Placed[] = [
    { id: "main", label: "Főhadiszállás", x: mx, y: my, main: true },
  ];

  const blocked = new Set<string>();
  const block = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) blocked.add(`${x + dx},${y + dy}`);
    }
  };
  block(mx - 1, my, 14, 14); // a főház és a két lámpa

  const plaza = new Set<string>();
  for (let y = my + 14; y < my + 17; y++) {
    for (let x = mx - 2; x < mx + 14; x++) plaza.add(`${x},${y}`);
  }
  const path = new Set(plaza);

  let seed = 7;
  // Rendezve: a ház–sender csere ne rendezze át a falut.
  for (const char of houses
    .map((house) => house.id)
    .sort()
    .join("|")) {
    seed = (seed * 31 + char.charCodeAt(0)) % 4294967296;
  }
  const random = rng(seed);

  // Körben a főház körül: minden ház a saját szögén, kis véletlen eltéréssel;
  // ha ott nem fér el, a próbálkozásokkal egyre jobban szóródik.
  const cx = mx + 6;
  const cy = my + 8;
  // A kézzel áthelyezett házak (helyenként, `slot` szerint) előre foglalnak.
  const fixed = houses.map((_, index) => {
    const at = edits.pos[index];
    return at && houseFits(at.x, at.y, rows) ? at : null;
  });
  for (const at of fixed) if (at) block(at.x, at.y, 6, 7);
  houses.forEach((house, index) => {
    const at = fixed[index];
    for (let attempt = 0; attempt < (at ? 1 : 600); attempt++) {
      const spread = 0.3 + attempt / 200;
      const angle =
        -Math.PI / 2 +
        (2 * Math.PI * index) / houses.length +
        (random() - 0.5) * spread;
      const radius = 0.85 + random() * 0.25;
      const x =
        at?.x ??
        Math.min(
          COLS - 7,
          Math.max(1, Math.round(cx + Math.cos(angle) * 26 * radius - 3)),
        );
      const y =
        at?.y ??
        Math.min(
          base - 11,
          Math.max(1, Math.round(cy + Math.sin(angle) * 14 * radius - 4)),
        );
      // A ház, az ajtó előtti hely és két csempe szegély legyen szabad
      // (a kézzel lerakottnál ezt a lerakáskor néztük meg).
      let clear = true;
      for (let dy = -2; !at && dy < 11 && clear; dy++) {
        for (let dx = -2; dx < 8 && clear; dx++) {
          const key = `${x + dx},${y + dy}`;
          if (blocked.has(key) || path.has(key)) clear = false;
        }
      }
      if (!clear) continue;
      const route = findRoute(
        x + 1,
        y + 7,
        rows,
        (cx, cy) =>
          blocked.has(`${cx},${cy}`) ||
          (cx >= x && cx < x + 6 && cy >= y && cy < y + 7),
        plaza,
        path,
      );
      if (!route) {
        // Kézzel lerakott háznál nincs másik próbálkozás: áll, csak út nélkül.
        if (at) placed.push({ ...house, x, y, slot: index });
        continue;
      }
      if (!at) block(x, y, 6, 7);
      for (const [rx, ry] of route) {
        for (const key of blockCells(rx, ry)) path.add(key);
      }
      // A lakó útja a végén számolódik, a kézi utakkal együtt.
      placed.push({ ...house, x, y, slot: index });
      break;
    }
  });

  // Kézzel rajzolt és kiradírozott út; házra nem kerülhet út.
  for (const key of edits.painted) if (!blocked.has(key)) path.add(key);
  for (const key of edits.erased) path.delete(key);

  for (const house of placed) {
    if (!house.main && house.slot !== undefined) {
      house.kind = edits.kinds[house.slot] ?? "sender";
      house.account = house.id;
    }
  }

  // A bal panelből lerakott házak: a helyük kézi, az útjuk a főházig ugyanúgy épül.
  const labels = new Map(houses.map((house) => [house.id, house.label]));
  for (const extra of edits.extra) {
    const { x, y } = extra;
    if (!houseFits(x, y, rows)) continue;
    let clear = true;
    for (let dy = 0; dy < 7 && clear; dy++) {
      for (let dx = 0; dx < 6 && clear; dx++) {
        if (blocked.has(`${x + dx},${y + dy}`)) clear = false;
      }
    }
    if (!clear) continue;
    const route = findRoute(
      x + 1,
      y + 7,
      rows,
      (cx, cy) =>
        blocked.has(`${cx},${cy}`) ||
        (cx >= x && cx < x + 6 && cy >= y && cy < y + 7),
      plaza,
      path,
    );
    block(x, y, 6, 7);
    for (const [rx, ry] of route ?? []) {
      for (const key of blockCells(rx, ry)) path.add(key);
    }
    placed.push({
      id: extra.id,
      label:
        extra.kind === "storage"
          ? "Raktár"
          : (labels.get(extra.account) ?? extra.account),
      x,
      y,
      kind: extra.kind,
      account: extra.account,
      extra: true,
    });
  }

  // A tető színe a háztípust jelzi — külön nem állítható.
  for (const house of placed) {
    if (house.main) continue;
    house.roof = HOUSE_KINDS.find((kind) => kind.key === house.kind)?.roof;
  }

  // A lakó a ténylegesen meglévő úton jár: rajzolt út is jó, kiradírozott nem.
  for (const house of placed) {
    if (house.main) continue;
    house.walk = walkOnPath(house, path, plaza, rows, {
      x: mx + 4.8,
      y: my + 15.5,
    }) ?? [{ x: house.x + 2.5, y: house.y + 8.5 }];
  }
  return { placed, path, height: rows, main: { x: mx, y: my } };
}

/** Csak a kanyarpontok maradnak: az egyenes szakaszok közbülső pontjai kiesnek. */
function corners(walk: Point[]): Point[] {
  return walk.filter((point, i) => {
    const before = walk[i - 1];
    const after = walk[i + 1];
    if (!before || !after) return true;
    return !(
      (before.x === point.x && point.x === after.x) ||
      (before.y === point.y && point.y === after.y)
    );
  });
}

/**
 * Az ajtó elől a térig a meglévő útcsempéken, lehetőleg az út közepén (a szélső
 * csempe drágább) és kevés kanyarral. Ha nincs összefüggő út, `undefined`.
 */
function walkOnPath(
  house: Placed,
  path: Set<string>,
  plaza: Set<string>,
  rows: number,
  door: Point,
): Point[] | undefined {
  const startX = house.x + 2;
  const startY = house.y + 8;
  if (!path.has(`${startX},${startY}`)) return undefined;
  const edge = (x: number, y: number) =>
    DIRS.some(([dx, dy]) => !path.has(`${x + dx},${y + dy}`));
  const route = findRoute(
    startX,
    startY,
    rows,
    (x, y) => !path.has(`${x},${y}`),
    plaza,
    path,
    1,
    (x, y) => (edge(x, y) ? 4 : 1),
  );
  if (!route) return undefined;
  const walk = route.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));
  // A tér szélén már térnek számít; onnan a közepére lép, és úgy megy az ajtóhoz.
  walk.push({ x: walk[walk.length - 1].x, y: door.y }, door);
  return corners(walk);
}

/**
 * Két ház között a legrövidebb út a meglévő útcsempéken, ajtótól ajtóig — nem
 * kell a főházon át kerülni. `undefined`, ha nem összefüggő az út.
 */
function walkBetween(
  from: Placed,
  to: Placed,
  path: Set<string>,
  rows: number,
): Point[] | undefined {
  const start = `${from.x + 2},${from.y + 8}`;
  const target = `${to.x + 2},${to.y + 8}`;
  if (!path.has(start) || !path.has(target) || start === target) return;
  const edge = (x: number, y: number) =>
    DIRS.some(([dx, dy]) => !path.has(`${x + dx},${y + dy}`));
  const route = findRoute(
    from.x + 2,
    from.y + 8,
    rows,
    (x, y) => !path.has(`${x},${y}`),
    new Set([target]),
    path,
    1,
    (x, y) => (edge(x, y) ? 4 : 1),
  );
  return route
    ? corners(route.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })))
    : undefined;
}

/** Elfér-e itt egy ház a térképen (az ajtó előtti hellyel együtt). */
function houseFits(x: number, y: number, rows: number): boolean {
  return x >= 1 && x <= COLS - 7 && y >= 1 && y <= rows - 11;
}

/** A felső sáv magassága; a szerveren a szokásos érték. */
function navHeight(): number {
  if (typeof document === "undefined") return 57;
  return document.querySelector("nav")?.offsetHeight ?? 57;
}

/** Hány sor kell, hogy a térkép a sáv alatti teljes ablakot kitöltse. */
function fitRows(): number {
  const width = Math.max(1, window.innerWidth);
  // Felfelé kerekít: inkább lógjon ki fél csempe, mint maradjon üres sáv alul.
  return Math.ceil((COLS * (window.innerHeight - navHeight())) / width);
}

function subscribeResize(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** Determinisztikus véletlen: újrarajzoláskor ugyanott maradnak a fák. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function draw(
  canvas: HTMLCanvasElement,
  sprites: Sprites,
  { placed, path, height }: VillageLayout,
) {
  const main = placed[0];
  canvas.width = COLS * T;
  canvas.height = height * T;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const tile = (
    img: HTMLImageElement,
    sx: number,
    sy: number,
    x: number,
    y: number,
  ) => ctx.drawImage(img, sx, sy, T, T, x * T, y * T, T, T);
  const isPath = (x: number, y: number) => path.has(`${x},${y}`);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < COLS; x++) tile(sprites.grass, 0, 0, x, y);
  }

  // Út-autotile: a felső 3×3 a külső szél, alatta a belső sarkok.
  for (const key of path) {
    const [x, y] = key.split(",").map(Number);
    const n = isPath(x, y - 1);
    const s = isPath(x, y + 1);
    const w = isPath(x - 1, y);
    const e = isPath(x + 1, y);
    const col = !w ? 0 : !e ? 2 : 1;
    const row = !n ? 0 : !s ? 2 : 1;
    tile(sprites.path, col * T, row * T, x, y);
    if (col === 1 && row === 1) {
      if (!isPath(x + 1, y + 1)) tile(sprites.path, 0, 3 * T, x, y);
      else if (!isPath(x - 1, y + 1)) tile(sprites.path, T, 3 * T, x, y);
      else if (!isPath(x + 1, y - 1)) tile(sprites.path, 0, 4 * T, x, y);
      else if (!isPath(x - 1, y - 1)) tile(sprites.path, T, 4 * T, x, y);
    }
  }

  // Foglalt csempék: házak, utak és egy csempényi szegély — ide nem jön díszítés.
  const taken = new Set(path);
  for (const house of placed) {
    const size = house.main ? MAIN_SCALE : 1;
    for (let dy = -1; dy <= 8 * size; dy++) {
      for (let dx = -1; dx <= 6 * size; dx++)
        taken.add(`${house.x + dx},${house.y + dy}`);
    }
  }
  const free = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (taken.has(`${x + dx},${y + dy}`)) return false;
      }
    }
    return true;
  };

  const random = rng(7);
  // Fű- és virágcsomók: a díszlap első két sora és a virágsor.
  const tufts = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [0, 8],
    [1, 8],
    [2, 7],
    [0, 9],
    [1, 9],
  ];
  for (let i = 0; i < COLS * height * 0.12; i++) {
    const x = Math.floor(random() * COLS);
    const y = Math.floor(random() * height);
    // A sorsolás a foglaltság előtt: így egy új úttól nem rendeződik át az egész rét.
    const [sx, sy] = tufts[Math.floor(random() * tufts.length)];
    if (!free(x, y, 1, 1)) continue;
    tile(sprites.decor, sx * T, sy * T, x, y);
  }

  // Lámpák a főház két oldalán.
  for (const x of [main.x - 1, main.x + 12]) {
    ctx.drawImage(
      sprites.decor,
      4 * T,
      4 * T,
      T,
      3 * T,
      x * T,
      (main.y + 11) * T,
      T,
      3 * T,
    );
  }

  for (const house of placed) {
    const size = house.main ? MAIN_SCALE : 1;
    ctx.drawImage(
      roofed(sprites.house, house.roof ?? "teal"),
      house.x * T,
      house.y * T,
      96 * size,
      128 * size,
    );
  }

  // Fák a szabad helyekre: nagy (4×5) és kis (2×3) vegyesen, fentről lefelé
  // rajzolva, hogy a lentebbi takarja a fentebbit. Egymásba kicsit belóghatnak.
  const trees: [number, number, boolean][] = [];
  const target = Math.round((COLS * height) / 40);
  for (let i = 0; i < 4000 && trees.length < target; i++) {
    const small = random() < 0.35;
    const [w, h] = small ? [2, 3] : [4, 5];
    const x = Math.floor(random() * (COLS - w));
    const y = Math.floor(random() * (height - h)) - 1;
    if (!free(x, Math.max(0, y + 1), w, h - 1)) continue;
    trees.push([x, y, small]);
    for (let dy = 1; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) taken.add(`${x + dx},${y + dy}`);
    }
  }
  trees.sort((a, b) => a[1] - b[1]);
  for (const [x, y, small] of trees) {
    if (small) {
      ctx.drawImage(sprites.smallTree, 32, 0, 32, 48, x * T, y * T, 32, 48);
    } else {
      ctx.drawImage(sprites.tree, x * T, y * T);
    }
  }
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Nem tölthető be: ${src}`));
    img.src = encodeURI(src);
  });
}

const SPEED = 3; // csempe / mp
const THROW_MS = 1400;
const LETTER_AT_MS = 450; // ekkor engedi el a levelet a dobás közben
const POLL_MS = 10_000;
const FIG = 1.5; // a lakók nagyítása a csomag 32×32-es kockáihoz képest

interface Sender {
  status: string;
  nextAt: string | null;
  lastSentAt: string | null;
}

/** Az út egy szakasza: merre megy, mit visz, és mit csinál a végén. */
interface Leg {
  route: Point[];
  length: number;
  /** Hány levél van nála útközben. */
  carry: number;
  /** A szakasz végén: feldobja, az égből elkapja, vagy leteszi a levelet. */
  act: "throw" | "catch" | "drop" | null;
  /** `catch`: hány levél hull le. */
  count: number;
}

/** Egy út fajtája: küldés, lekérés (onnan a Válasz házba), piszkozat a Raktárba. */
type TripKind = "send" | "fetch" | "store";

interface Person {
  walk: Point[];
  length: number;
  phase: "work" | "walk" | "act";
  since: number;
  thrown: boolean;
  /** A mostani út szakaszai, és hogy hányadiknál tart. */
  legs: Leg[];
  leg: number;
  /** Amíg úton van, a következő utak sorban várnak. */
  pending: { kind: TripKind; count: number }[];
  /** A saját fiókja Válasz házának és a Raktárnak az útja — ide visz levelet. */
  replyWalk: Point[] | null;
  storageWalk: Point[] | null;
  /** Egyenes út a házától a Raktárig, és a Válasz háztól haza (nem a főházon át). */
  toStorage: Point[] | null;
  replyToHome: Point[] | null;
  /** Melyik `nextAt`-hez indult már el — egy küldéshez egy út. */
  tripFor: string | null;
  lastTripAt: number;
  lastSentAt: string | null | undefined;
  /** A fiók, akinek a munkáját végzi. */
  account: string;
  /** A háza típusa (`HOUSE_KINDS`): ettől függ, mit csinál. */
  kind: string;
  /** A legutóbb látott beérkezés / kiment válasz / lekérő kör / piszkozatszám. */
  lastInAt: string | null | undefined;
  lastReplyAt: string | null | undefined;
  lastRunAt: string | null | undefined;
  lastDrafted: number | undefined;
  /** Hol áll most (csempében) — ide kerül alá a visszaszámláló. */
  pos?: Point;
}

/** Egy fiók munkája a három háztípus szerint (`/api/village`). */
interface Work {
  inboxCount: number;
  lastInAt: string | null;
  repliesWaiting: number;
  repliesSent: number;
  lastReplyAt: string | null;
  fetchRunAt: string | null;
  fetchFound: number;
  drafted: number;
  /** Épp ezt a céget írja a Válasz ház (Gmail-piszkozat). */
  writing: string | null;
}

type DayReport =
  | {
      kind: "sender";
      sent: { company: string; email: string; at: string; error?: string }[];
      upcoming: { company: string; email: string }[];
    }
  | {
      kind: "fetch";
      count: number;
      items: { company: string; from: string; subject: string; at: string }[];
    }
  | {
      kind: "reply";
      waiting: { company: string; status: string }[];
      sent: { company: string; at: string }[];
      drafts: AutoDraftRow[];
    }
  | { kind: "storage"; runAt: string | null; drafts: AutoDraftRow[] };

interface AutoDraftRow {
  company: string;
  subject: string;
  accountId: string;
  to: string;
  messageId?: string;
  attachment: string | null;
  status: "iras" | "kesz" | "hiba";
  note: string | null;
  draftedAt: string;
}

const FETCH_EVERY_MS = 10 * 60_000;
/** Egy levél ennyi idő alatt hull le a lekérő kezébe. */
const CATCH_MS = 650;

const REPLY_STATUS: Record<string, string> = {
  generalas: "piszkozat készül",
  atnezendo: "átnézendő",
  jovahagyva: "jóváhagyva",
  kuldes: "megy…",
};

/** A lakó alatti felirat a háza típusa szerint. */
function workLabel(
  kind: string,
  sender: Sender | undefined,
  work: Work | undefined,
  now: number,
): string {
  if (!work) return "…";
  if (kind === "fetch") {
    if (!work.fetchRunAt) return `ma ${work.inboxCount} bejött`;
    const seconds = Math.round(
      (Date.parse(work.fetchRunAt) + FETCH_EVERY_MS - now) / 1000,
    );
    return seconds > 0
      ? `lekérés ${Math.floor(seconds / 60)} p ${String(seconds % 60).padStart(2, "0")} mp`
      : "lekérés…";
  }
  if (kind === "reply") {
    return work.writing
      ? `ír: ${work.writing.slice(0, 18)}…`
      : `${work.drafted} piszkozat ma`;
  }
  return countdown(sender, now);
}

interface Letter {
  x: number;
  y: number;
  since: number;
}

function walkLength(walk: Point[]): number {
  let length = 0;
  for (let i = 1; i < walk.length; i++) {
    length +=
      Math.abs(walk[i].x - walk[i - 1].x) + Math.abs(walk[i].y - walk[i - 1].y);
  }
  return length;
}

/** Hol tart és merre néz, ha `distance` csempét ment az úton. */
function along(
  walk: Point[],
  distance: number,
): Point & { dx: number; dy: number } {
  let left = distance;
  for (let i = 1; i < walk.length; i++) {
    const a = walk[i - 1];
    const b = walk[i];
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    const span = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (left <= span) return { x: a.x + dx * left, y: a.y + dy * left, dx, dy };
    left -= span;
  }
  const last = walk[walk.length - 1];
  return { ...last, dx: 0, dy: 0 };
}

/** Mennyi van hátra a fiók következő leveléig, rövid felirattal. */
function countdown(sender: Sender | undefined, now: number): string {
  if (!sender) return "…";
  if (sender.status === "done") return "mára kész";
  if (sender.status !== "running" || !sender.nextAt) return "nem küld";
  const seconds = Math.round((Date.parse(sender.nextAt) - now) / 1000);
  if (seconds <= 0) return "küldés…";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  if (h > 0) return `${h} ó ${String(m).padStart(2, "0")} p`;
  return m > 0 ? `${m} p ${String(sec).padStart(2, "0")} mp` : `${sec} mp`;
}

const reversed = (route: Point[]) => [...route].reverse();

function leg(route: Point[], carry: number, act: Leg["act"], count = 0): Leg {
  return { route, length: walkLength(route), carry, act, count };
}

/** Az út szakaszai. Minden ház útja az ajtajától a főház ajtajáig tart. */
function plan(person: Person, kind: TripKind, count: number): Leg[] {
  const { walk } = person;
  if (kind === "fetch") {
    // A főháznál az égből hull a levél; ha van mit, átviszi a Válasz házba.
    // `count < 0`: még nem tudni, mennyi — a főháznál vár a lekérés végére.
    const legs = [leg(walk, 0, "catch", count)];
    return count < 0 ? legs : [...legs, ...fetchReturn(person, count)];
  }
  if (kind === "store") {
    // A legrövidebb úton, ha van; különben a főházon át.
    const route =
      person.toStorage ??
      (person.storageWalk ? [...walk, ...reversed(person.storageWalk)] : null);
    if (!route) return [];
    return [leg(route, 1, "drop"), leg(reversed(route), 0, null)];
  }
  return [leg(walk, 1, "throw"), leg(reversed(walk), 0, null)];
}

/** A lekérés utáni út: a hozott levelekkel a Válasz házba, vagy üres kézzel haza. */
function fetchReturn(person: Person, count: number): Leg[] {
  if (count > 0 && person.replyWalk) {
    return [
      leg(reversed(person.replyWalk), count, "drop"),
      leg(
        person.replyToHome ?? [...person.replyWalk, ...reversed(person.walk)],
        0,
        null,
      ),
    ];
  }
  return [leg(reversed(person.walk), 0, null)];
}

/**
 * Megjött a lekérés eredménye. Ha a lakó a főháznál vár rá, ott hullanak a
 * levelek; ha még úton van, odaérve; ha már nem erre a körre vár, új út indul.
 */
function deliverFetch(person: Person, count: number, now: number) {
  const waiting = person.legs.findIndex(
    (item) => item.act === "catch" && item.count < 0,
  );
  if (person.phase === "work" || waiting < 0) {
    startTrip(person, now, "fetch", count);
    return;
  }
  person.legs[waiting].count = count;
  person.legs.splice(waiting + 1, Infinity, ...fetchReturn(person, count));
  // A hullás a megérkezéstől számít.
  if (person.leg === waiting && person.phase === "act") person.since = now;
}

/** Útra kel; ha épp úton van, az út sorba áll (legfeljebb tíz). */
function startTrip(
  person: Person,
  now: number,
  kind: TripKind = "send",
  count = 0,
) {
  // Akinek a házától nem vezet út a térre, otthon marad.
  if (person.length <= 0) return;
  if (person.phase !== "work") {
    if (person.pending.length < 10) person.pending.push({ kind, count });
    return;
  }
  const legs = plan(person, kind, count);
  if (!legs.length) return;
  person.legs = legs;
  person.leg = 0;
  person.phase = "walk";
  person.since = now;
  person.thrown = false;
  person.lastTripAt = now;
}

/** Ennyi ideig tart a szakasz végi mozdulat. */
function actMs(current: Leg): number {
  // Amíg nem jött meg a lekérés, a főháznál vár.
  if (current.act === "catch") {
    return current.count < 0 ? Infinity : 500 + current.count * CATCH_MS;
  }
  if (current.act === "drop") return 700;
  return THROW_MS;
}

/** Pixeles boríték, bal felső sarkával (x, y)-on. */
function envelope(ctx: CanvasRenderingContext2D, x: number, y: number) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = "#5a2a1c";
  ctx.fillRect(x - 1, y - 1, 12, 9);
  ctx.fillStyle = "#fff7e6";
  ctx.fillRect(x, y, 10, 7);
  ctx.fillStyle = "#c8553d";
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(x + i, y + i, 1, 1);
    ctx.fillRect(x + 9 - i, y + i, 1, 1);
  }
}

/** Egy kocka a Player.png-ből (32×32, hat oszlop); balra a jobbra nézőt tükrözzük. */
function figure(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  row: number,
  frame: number,
  x: number,
  y: number,
  flip = false,
) {
  const px = Math.round(x * T);
  const py = Math.round(y * T);
  ctx.save();
  ctx.translate(px, py - 26 * FIG);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(
    sheet,
    frame * 32,
    row * 32,
    32,
    32,
    -16 * FIG,
    0,
    32 * FIG,
    32 * FIG,
  );
  ctx.restore();
}

/** Egy képkocka: háttér, lerakott elemek, lakók, repülő levelek. */
function frame(
  ctx: CanvasRenderingContext2D,
  background: HTMLCanvasElement,
  sheet: HTMLImageElement,
  people: Map<string, Person>,
  letters: Letter[],
  now: number,
  underPeople: () => void,
) {
  ctx.drawImage(background, 0, 0);
  underPeople();
  const tick = (ms: number, frames: number) => Math.floor(now / ms) % frames;

  for (const person of people.values()) {
    // Állapotváltás: a szakasz végén a mozdulat, utána a következő szakasz.
    const current = person.legs[person.leg];
    const elapsed = now - person.since;
    if (person.phase === "walk" && current) {
      if ((elapsed / 1000) * SPEED >= current.length) {
        person.phase = current.act ? "act" : "walk";
        person.since = now;
        person.thrown = false;
        if (!current.act) person.leg++;
      }
    } else if (person.phase === "act" && current && elapsed >= actMs(current)) {
      person.phase = "walk";
      person.since = now;
      person.leg++;
    }
    if (person.phase !== "work" && person.leg >= person.legs.length) {
      person.phase = "work";
      const next = person.pending.shift();
      if (next) startTrip(person, now, next.kind, next.count);
    }

    const legNow = person.legs[person.leg];
    if (person.phase === "work" || !legNow) {
      // Az ajtó előtt áll; a buborék mutatja, min dolgozik:
      // küldő — gépel (pöttyök), lekérő — a postát lesi (lefelé nyíl),
      // válasz — választ ír (visszafelé kanyarodó nyíl).
      const home = person.walk[0];
      person.pos = home;
      figure(ctx, sheet, 0, tick(150, 6), home.x, home.y);
      if (person.kind !== "fetch") {
        envelope(ctx, home.x * T - 4, home.y * T - 12);
      }
      const bx = Math.round(home.x * T + 5);
      const by = Math.round(home.y * T - 46);
      ctx.fillStyle = "#5a2a1c";
      ctx.fillRect(bx - 1, by - 1, 15, 8);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(bx, by, 13, 6);
      ctx.fillStyle = "#5a2a1c";
      if (person.kind === "fetch") {
        const bob = tick(300, 2);
        ctx.fillRect(bx + 6, by + 1 + bob, 1, 3);
        ctx.fillRect(bx + 4, by + 3 + bob, 5, 1);
        ctx.fillRect(bx + 5, by + 4 + bob, 3, 1);
      } else if (person.kind === "reply") {
        const shift = tick(350, 2);
        ctx.fillRect(bx + 4 + shift, by + 1, 6, 1);
        ctx.fillRect(bx + 9 + shift, by + 1, 1, 3);
        ctx.fillRect(bx + 3 + shift, by + 3, 7, 1);
        ctx.fillRect(bx + 2 + shift, by + 2, 1, 3);
      } else {
        for (let i = 0; i < tick(350, 4); i++)
          ctx.fillRect(bx + 2 + i * 4, by + 2, 2, 2);
      }
      continue;
    }

    const spent = now - person.since;
    if (person.phase === "act") {
      const end = legNow.route[legNow.route.length - 1];
      person.pos = end;
      if (legNow.act === "throw") {
        // Háttal áll a főház felé, és a dobás pillanatában felugrik.
        const hop =
          spent >= LETTER_AT_MS && spent < LETTER_AT_MS + 250 ? 3 / T : 0;
        figure(ctx, sheet, 2, 0, end.x, end.y - hop);
        if (!person.thrown && spent >= LETTER_AT_MS) {
          person.thrown = true;
          letters.push({ x: end.x * T - 5, y: end.y * T - 48, since: now });
        } else if (!person.thrown) {
          envelope(ctx, end.x * T - 5, end.y * T - 18 - spent / 15);
        }
      } else if (legNow.act === "catch") {
        // Fölfelé néz, és várja; aztán egyesével hullanak a levelek, és a
        // kezében gyűlnek (a köteg fölött a darabszám).
        figure(ctx, sheet, 2, 0, end.x, end.y);
        if (legNow.count < 0) {
          const bx = Math.round(end.x * T + 5);
          const by = Math.round(end.y * T - 46);
          ctx.fillStyle = "#5a2a1c";
          ctx.fillRect(bx - 1, by - 1, 15, 8);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(bx, by, 13, 6);
          ctx.fillStyle = "#5a2a1c";
          for (let i = 0; i < tick(350, 4); i++)
            ctx.fillRect(bx + 2 + i * 4, by + 2, 2, 2);
        } else {
          const caught = Math.min(legNow.count, Math.floor(spent / CATCH_MS));
          if (caught > 0) {
            envelope(ctx, end.x * T - 4, end.y * T - 12);
            ctx.fillStyle = "#5a2a1c";
            ctx.font = "bold 8px monospace";
            ctx.fillText(String(caught), end.x * T + 8, end.y * T - 14);
          }
          if (caught < legNow.count) {
            const fall = (spent % CATCH_MS) / CATCH_MS;
            envelope(
              ctx,
              end.x * T - 4 + Math.sin(fall * 9) * 6 * (1 - fall),
              end.y * T - 12 - (1 - fall) * end.y * T,
            );
          }
        }
      } else {
        // Leteszi: a levél a lába elé csúszik, és eltűnik a házban.
        figure(ctx, sheet, 0, 0, end.x, end.y);
        const t = Math.min(1, spent / 500);
        if (t < 1) envelope(ctx, end.x * T - 4, end.y * T - 12 + t * 14);
      }
      continue;
    }

    const at = along(
      legNow.route,
      Math.min((spent / 1000) * SPEED, legNow.length),
    );
    const row = at.dx !== 0 ? 4 : at.dy < 0 ? 5 : 3;
    person.pos = at;
    figure(ctx, sheet, row, tick(100, 6), at.x, at.y, at.dx < 0);
    // Több levélnél kis köteg: a második kicsit feljebb látszik.
    if (legNow.carry > 1) envelope(ctx, at.x * T - 2, at.y * T - 15);
    if (legNow.carry > 0) envelope(ctx, at.x * T - 4, at.y * T - 12);
  }

  // A levél gyorsulva száll fel, kicsit himbálózva, amíg ki nem ér a képből.
  for (let i = letters.length - 1; i >= 0; i--) {
    const letter = letters[i];
    const t = (now - letter.since) / 1000;
    const y = letter.y - (30 * t + 45 * t * t);
    if (y < -20) {
      letters.splice(i, 1);
      continue;
    }
    envelope(ctx, letter.x + Math.sin(t * 6) * 6 + t * 25, y);
  }
}

type Drag =
  | {
      type: "paint";
      last?: Point;
      erase: boolean;
      painted: Set<string>;
      erased: Set<string>;
    }
  | { type: "click"; startX: number; startY: number }
  | {
      type: "item";
      item: PlacedItem;
      startX: number;
      startY: number;
      moved: boolean;
    }
  | {
      type: "house";
      id: string;
      /** Küldő háznál a házhely; a bal panelből lerakottnál nincs. */
      slot?: number;
      offX: number;
      offY: number;
      x: number;
      y: number;
      startX: number;
      startY: number;
      moved: boolean;
    };

const DRAG_START = 0.4; // ennyi csempe elmozdulás után húzás, előtte kattintás

/** Két ház (az ajtó előtti hellyel együtt) túl közel van-e egymáshoz. */
function housesOverlap(a: Point, b: Point): boolean {
  return a.x < b.x + 7 && b.x < a.x + 7 && a.y < b.y + 10 && b.y < a.y + 10;
}

/**
 * A falu pixeles térképe a Cute Fantasy csempéiből. Minden házhoz egy lakó:
 * az ajtó előtt levelet ír, és amikor a fiókja következő küldése jön, elsétál
 * a főházhoz, és feldobja a levelet az égbe. A ház, az állat és a tárgy
 * megfogható és áthelyezhető, utat lehet rajzolni, és a házra kattintva
 * kiválasztható, melyik sender lakjon benne. Az elrendezés ebben a böngészőben marad.
 */
export default function VillageMap({ houses }: { houses: VillageHouse[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fit = useSyncExternalStore(subscribeResize, fitRows, () => 48);
  // A sáv alatti szabad magasság: a felfelé kerekített utolsó sor ennél nem lóghat túl.
  const room = useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight - navHeight(),
    () => null,
  );
  const [edits, saveEdits] = useVillageEdits();
  // A mentett sorrend szerint, az új senderek a végén.
  const ordered = useMemo(() => {
    const byId = new Map(houses.map((house) => [house.id, house]));
    const list = edits.order.flatMap((id) => byId.get(id) ?? []);
    for (const house of houses) if (!list.includes(house)) list.push(house);
    return list;
  }, [houses, edits.order]);
  const map = useMemo(() => layout(ordered, fit, edits), [ordered, fit, edits]);
  const { placed, height } = map;
  const mapRef = useRef(map);
  const people = useRef(new Map<string, Person>());
  const senders = useRef(new Map<string, Sender>());
  const work = useRef(new Map<string, Work>());
  const timers = useRef(new Map<string, HTMLSpanElement>());
  const items = useRef<PlacedItem[]>([]);
  const assets = useRef<{
    sprites: Sprites;
    items: Map<string, HTMLImageElement>;
  } | null>(null);
  const background = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const [ready, setReady] = useState(false);
  // A kiválasztott eszköz: elem kulcsa, út, radír, vagy semmi (ekkor fogni és kattintani lehet).
  const [tool, setTool] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // Teljes képernyőn csak a térkép látszik: a panelek elrejtve.
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  // A Lekérő és a Válasz ház leállítva (a szerver tárolja, minden géphez közös).
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    pausedRef.current = next;
    fetch("/api/village", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: next ? "pause" : "resume" }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error);
        setNote(
          next
            ? "Leállítva: a Lekérő és a Válasz ház nem csinál semmit."
            : "Újra fut a Lekérő és a Válasz ház.",
        );
      })
      .catch((error: Error) => {
        setPaused(!next);
        pausedRef.current = !next;
        setNote(`Nem sikerült: ${error.message}`);
      });
  };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen().catch(() => undefined);
  };
  const [note, setNote] = useState<string | null>(null);
  const [report, setReport] = useState<{
    id: string;
    data: DayReport | null;
    error: string | null;
  } | null>(null);

  // A lerakott elemek ebből a böngészőből.
  useEffect(() => {
    items.current = loadItems();
  }, []);

  // A lakók a térképből. Akinek nem változott az útja, az ott folytatja, ahol tart.
  useEffect(() => {
    mapRef.current = map;
    const next = new Map<string, Person>();
    // A Raktár közös: az első lerakott. A Válasz ház fiókonként.
    const storageHouse = map.placed.find((house) => house.kind === "storage");
    const storage = storageHouse?.walk ?? null;
    const replyHouseOf = (account: string) =>
      map.placed.find(
        (house) => house.kind === "reply" && house.account === account,
      );
    const replyOf = (account: string) => replyHouseOf(account)?.walk ?? null;
    const between = (from?: Placed, to?: Placed) =>
      (from && to && walkBetween(from, to, map.path, map.height)) || null;
    for (const house of map.placed) {
      // A Raktárban nem lakik senki.
      if (!house.walk || house.kind === "storage") continue;
      const account = house.account ?? house.id;
      const old = people.current.get(house.id);
      const same =
        old && JSON.stringify(old.walk) === JSON.stringify(house.walk);
      const person: Person = same
        ? old
        : {
            walk: house.walk,
            length: walkLength(house.walk),
            phase: "work",
            since: 0,
            thrown: false,
            legs: [],
            leg: 0,
            pending: [],
            replyWalk: null,
            storageWalk: null,
            toStorage: null,
            replyToHome: null,
            tripFor: old?.tripFor ?? null,
            lastTripAt: old?.lastTripAt ?? 0,
            lastSentAt: old?.lastSentAt,
            kind: "sender",
            account,
            lastInAt: old?.lastInAt,
            lastReplyAt: old?.lastReplyAt,
            lastRunAt: old?.lastRunAt,
            lastDrafted: old?.lastDrafted,
          };
      person.kind = house.kind ?? "sender";
      person.account = account;
      person.replyWalk = replyOf(account);
      person.storageWalk = storage;
      person.toStorage = between(house, storageHouse);
      person.replyToHome = between(replyHouseOf(account), house);
      next.set(house.id, person);
    }
    people.current = next;
  }, [map]);

  // Fiókállapot: mikor megy a következő levél, és ment-e közben egy.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/village", { cache: "no-store" });
        const data = (await response.json()) as {
          senders?: (Sender & { id: string })[];
          work?: (Work & { id: string })[];
          paused?: boolean;
        };
        if (cancelled || !data.senders) return;
        pausedRef.current = data.paused === true;
        setPaused(data.paused === true);
        const now = performance.now();
        for (const item of data.work ?? []) {
          work.current.set(item.id, item);
          for (const person of people.current.values()) {
            if (person.account !== item.id) continue;
            // Lefutott a tízperces kör: a lekérő elmegy a főházhoz, és annyi
            // levelet hoz, ahányat a kör talált — a Válasz házba viszi.
            if (
              person.kind === "fetch" &&
              // A kattintásra indult lakó már a főháznál várja ezt a kört.
              !person.legs.some(
                (item) => item.act === "catch" && item.count < 0,
              ) &&
              person.lastRunAt !== undefined &&
              item.fetchRunAt !== person.lastRunAt
            ) {
              startTrip(person, now, "fetch", item.fetchFound);
            }
            if (person.kind === "reply") {
              // Elkészült egy piszkozat: egyesével viszi a Raktárba.
              const fresh =
                person.lastDrafted === undefined
                  ? 0
                  : item.drafted - person.lastDrafted;
              for (let i = 0; i < Math.min(fresh, 10); i++) {
                startTrip(person, now, "store");
              }
              // Kiment egy válasz a válasz-queue-ból: feldobja.
              if (
                person.lastReplyAt !== undefined &&
                item.lastReplyAt !== person.lastReplyAt
              ) {
                startTrip(person, now);
              }
            }
            person.lastInAt = item.lastInAt;
            person.lastReplyAt = item.lastReplyAt;
            person.lastRunAt = item.fetchRunAt;
            person.lastDrafted = item.drafted;
          }
        }
        for (const sender of data.senders) {
          senders.current.set(sender.id, sender);
          for (const person of people.current.values()) {
            if (person.account !== sender.id) continue;
            // Kiment egy levél, de a lakó nem járt bent (pl. most nyílt meg az oldal).
            if (
              person.kind === "sender" &&
              person.lastSentAt !== undefined &&
              sender.lastSentAt !== person.lastSentAt &&
              now - person.lastTripAt > 60_000
            ) {
              startTrip(person, now);
            }
            person.lastSentAt = sender.lastSentAt;
          }
        }
      } catch {
        // A falu díszlet: ha most nem jön adat, a következő lekérdezés pótolja.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // A képek egyszer töltődnek be; a térkép változásakor csak a háttér rajzolódik újra.
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(SPRITES) as [keyof Sprites, string][];
    const itemSources = [...new Set(ITEMS.map((item) => item.src))];
    const itemImages = new Map<string, HTMLImageElement>();
    Promise.all([
      Promise.all(entries.map(([, src]) => load(src))),
      ...itemSources.map((src) =>
        load(src).then((image) => itemImages.set(src, image)),
      ),
    ])
      .then(([images]) => {
        if (cancelled) return;
        assets.current = {
          sprites: Object.fromEntries(
            entries.map(([key], index) => [key, images[index]]),
          ) as Sprites,
          items: itemImages,
        };
        setReady(true);
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!ready || !assets.current || !canvas) return;
    const next = document.createElement("canvas");
    draw(next, assets.current.sprites, map);
    background.current = next;
    canvas.width = next.width;
    canvas.height = next.height;
  }, [ready, map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const loaded = assets.current;
    if (!ready || !ctx || !loaded) return;
    const letters: Letter[] = [];
    let last = performance.now();
    let raf = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const bg = background.current;
      if (!bg) return;
      // Úgy indul el, hogy a küldés pillanatára érjen a főházhoz.
      const wall = Date.now();
      for (const person of people.current.values()) {
        const sender = senders.current.get(person.account);
        if (
          person.kind !== "sender" ||
          !sender?.nextAt ||
          sender.status !== "running"
        ) {
          continue;
        }
        const due = Date.parse(sender.nextAt);
        const leave = due - (person.length / SPEED) * 1000;
        if (
          person.tripFor !== sender.nextAt &&
          wall >= leave &&
          wall - due < 60_000
        ) {
          person.tripFor = sender.nextAt;
          startTrip(person, now);
        }
      }
      const dt = Math.min(100, now - last);
      last = now;
      // A vászon átméretezése visszaállítja a simítást.
      ctx.imageSmoothingEnabled = false;
      frame(ctx, bg, loaded.sprites.player, people.current, letters, now, () =>
        drawItems(ctx, loaded.items, items.current, now, dt),
      );
      // Az épp húzott ház áttetszően, a leendő helyén.
      const held = drag.current;
      if (held?.type === "house" && held.moved) {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(
          loaded.sprites.house,
          Math.round(held.x) * T,
          Math.round(held.y) * T,
        );
        ctx.globalAlpha = 1;
      }
      // A visszaszámlálók a lakókat követik; DOM-ot írunk, nem állapotot,
      // hogy ne renderelődjön újra a komponens képkockánként.
      for (const [id, person] of people.current) {
        const label = timers.current.get(id);
        if (!label || !person.pos) continue;
        label.style.left = `${(person.pos.x / COLS) * 100}%`;
        label.style.top = `${((person.pos.y + 0.5) / mapRef.current.height) * 100}%`;
        const stopped =
          pausedRef.current &&
          (person.kind === "fetch" || person.kind === "reply");
        const text = stopped
          ? "■ leállítva"
          : workLabel(
              person.kind,
              senders.current.get(person.account),
              work.current.get(person.account),
              wall,
            );
        if (label.textContent !== text) label.textContent = text;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  /** A ház paneljének megnyitása: `requested` a ház, az adat a fiókjáé. */
  const openReport = (
    requested: string,
    kind = placed.find((house) => house.id === requested)?.kind ?? "sender",
    account = placed.find((house) => house.id === requested)?.account ??
      requested,
  ) => {
    setReport({ id: requested, data: null, error: null });
    fetch(
      `/api/village?accountId=${encodeURIComponent(account)}&kind=${kind}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Nem jött adat.");
        // Közben másik lakóra kattintott: az a frissebb.
        setReport((current) =>
          current?.id === requested
            ? {
                id: requested,
                data: { ...data, kind } as DayReport,
                error: null,
              }
            : current,
        );
      })
      .catch((error: Error) =>
        setReport((current) =>
          current?.id === requested
            ? { id: requested, data: null, error: error.message }
            : current,
        ),
      );
  };

  /** Ki lakjon a házban: a két ház lakója helyet cserél. */
  const assign = (slot: number, id: string) => {
    const order = ordered.map((house) => house.id);
    const from = order.indexOf(id);
    if (from < 0 || from === slot) return;
    [order[slot], order[from]] = [order[from], order[slot]];
    saveEdits({ ...edits, order });
    openReport(id);
  };

  const toTile = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * COLS,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
  };

  /** A legfelül látszó elem a pont alatt (a lentebbi takarja a fentebbit). */
  const itemAt = (x: number, y: number) =>
    [...items.current]
      .sort((a, b) => b.y - a.y)
      .find((item) => {
        const kind = ITEMS.find((entry) => entry.key === item.kind);
        if (!kind) return false;
        const w = kind.w / T / 2;
        const h = (kind.animal ? 28 : kind.h) / T;
        return (
          Math.abs(x - item.x) <= w && y >= item.y - h && y <= item.y + 0.2
        );
      });

  const personAt = (x: number, y: number) =>
    [...people.current].find(
      ([, person]) =>
        person.pos &&
        Math.abs(x - person.pos.x) < 1.2 &&
        y > person.pos.y - 2.6 &&
        y < person.pos.y + 0.6,
    )?.[0];

  const houseAt = (x: number, y: number) =>
    placed.find(
      (house) =>
        !house.main &&
        x >= house.x &&
        x < house.x + 6 &&
        y >= house.y &&
        y < house.y + 8,
    );

  /** 3×3-as ecset: rajzol vagy radíroz, és rögtön ment. */
  const paint = (
    held: Extract<Drag, { type: "paint" }>,
    x: number,
    y: number,
  ) => {
    let changed = false;
    const [add, remove] = held.erase
      ? [held.erased, held.painted]
      : [held.painted, held.erased];
    // Gyors húzásnál az egér átugrik csempéket: a két pont közét is kifestjük.
    const from = held.last ?? { x, y };
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(x - from.x, y - from.y) * 2),
    );
    for (let i = 0; i <= steps; i++) {
      const px = from.x + ((x - from.x) * i) / steps;
      const py = from.y + ((y - from.y) * i) / steps;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const key = `${Math.floor(px) + dx},${Math.floor(py) + dy}`;
          if (!add.has(key)) changed = true;
          add.add(key);
          remove.delete(key);
        }
      }
    }
    held.last = { x, y };
    if (changed) {
      saveEdits({
        ...edits,
        painted: [...held.painted],
        erased: [...held.erased],
      });
    }
  };

  /** Elfér-e itt egy ház; ha nem, a bal panel alján megírja, miért. */
  const roomFor = (at: Point, ignore: string | null) => {
    const main = map.main;
    const nearMain =
      at.x < main.x + 13 &&
      main.x - 2 < at.x + 6 &&
      at.y < main.y + 17 &&
      main.y - 1 < at.y + 10;
    const fits =
      houseFits(at.x, at.y, height) &&
      !nearMain &&
      !placed.some(
        (house) =>
          !house.main && house.id !== ignore && housesOverlap(at, house),
      );
    if (!fits) {
      setNote(
        "Ide nem fér a ház: túl közel van egy másik házhoz vagy a szélhez.",
      );
    }
    return fits;
  };

  /**
   * Lekérés most: a lakó elindul a főházhoz, és annyi levél hull a kezébe,
   * ahányat a lekérés hozott (legfeljebb 10). A hozott leveleket a Válasz házba viszi.
   */
  const fetchNow = (houseId: string) => {
    const person = people.current.get(houseId);
    if (!person) return;
    if (pausedRef.current) {
      setNote("Le van állítva — a ▶ Indítás gombbal indítsd újra.");
      return;
    }
    // Rögtön elindul; a főháznál megvárja, mennyi levél jön.
    startTrip(person, performance.now(), "fetch", -1);
    setNote("A Lekérő ház elindult lekérni…");
    fetch("/api/village", { method: "POST" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "A lekérés nem sikerült.");
        const result = data as { runAt: string; found: Record<string, number> };
        // A lekérdezés ne indítsa el még egyszer ugyanezért a körért.
        person.lastRunAt = result.runAt;
        const count = result.found[person.account.toLowerCase()] ?? 0;
        deliverFetch(person, count, performance.now());
        setNote(
          count
            ? `${count} levél jött, a Válasz házba viszi.`
            : "Nincs új levél, amire válaszolni kell.",
        );
      })
      .catch((error: Error) => {
        // Nem jött semmi: üres kézzel hazamegy.
        deliverFetch(person, 0, performance.now());
        setNote(error.message);
      });
  };

  /** Az új elrendezésben vezet-e út a háztól a főházig. */
  const reachesMain = (next: VillageEdits, id: string) => {
    const house = layout(ordered, fit, next).placed.find(
      (item) => item.id === id,
    );
    if (house?.walk && house.walk.length >= 2) return true;
    setNote("Innen nem vezet út a főházhoz — tedd máshova.");
    return false;
  };

  /** A bal panelből lerakott ház egy mezőjének átírása. */
  const editExtra = (
    id: string,
    change: Partial<VillageEdits["extra"][number]>,
  ) =>
    saveEdits({
      ...edits,
      extra: edits.extra.map((extra) =>
        extra.id === id ? { ...extra, ...change } : extra,
      ),
    });

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toTile(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setNote(null);
    if (tool === "path" || tool === "path-erase") {
      const held: Drag = {
        type: "paint",
        erase: tool === "path-erase",
        painted: new Set(edits.painted),
        erased: new Set(edits.erased),
      };
      drag.current = held;
      paint(held, x, y);
      return;
    }
    if (tool) {
      drag.current = { type: "click", startX: x, startY: y };
      return;
    }
    const item = itemAt(x, y);
    if (item) {
      drag.current = { type: "item", item, startX: x, startY: y, moved: false };
      return;
    }
    if (personAt(x, y)) {
      drag.current = { type: "click", startX: x, startY: y };
      return;
    }
    const house = houseAt(x, y);
    drag.current =
      house && !house.main
        ? {
            type: "house",
            id: house.id,
            slot: house.slot,
            offX: x - house.x,
            offY: y - house.y,
            x: house.x,
            y: house.y,
            startX: x,
            startY: y,
            moved: false,
          }
        : null;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const held = drag.current;
    if (!held || held.type === "click") return;
    const { x, y } = toTile(event);
    if (held.type === "paint") {
      paint(held, x, y);
      return;
    }
    if (
      !held.moved &&
      Math.hypot(x - held.startX, y - held.startY) < DRAG_START
    ) {
      return;
    }
    held.moved = true;
    if (held.type === "item") {
      const item = held.item;
      item.x = item.homeX = x;
      item.y = item.homeY = y + 0.5;
      item.tx = item.ty = undefined;
      item.waitUntil = performance.now() + 1500;
    } else {
      held.x = x - held.offX;
      held.y = y - held.offY;
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const held = drag.current;
    drag.current = null;
    if (!held || held.type === "paint") return;
    const { x, y } = toTile(event);

    if (held.type === "item") {
      if (held.moved) saveItems(items.current);
      return;
    }

    if (held.type === "house") {
      if (!held.moved) {
        openReport(held.id);
        const house = placed.find((item) => item.id === held.id);
        if (house?.kind === "fetch") fetchNow(held.id);
        return;
      }
      const at = { x: Math.round(held.x), y: Math.round(held.y) };
      if (!roomFor(at, held.id)) return;
      let next: VillageEdits;
      if (held.slot === undefined) {
        next = {
          ...edits,
          extra: edits.extra.map((extra) =>
            extra.id === held.id ? { ...extra, ...at } : extra,
          ),
        };
      } else {
        // Minden küldő ház helyét rögzítjük, hogy a többi ne rendeződjön át.
        const pos: VillageEdits["pos"] = {};
        for (const house of placed) {
          if (house.slot !== undefined) {
            pos[house.slot] = { x: house.x, y: house.y };
          }
        }
        pos[held.slot] = at;
        next = { ...edits, order: ordered.map((house) => house.id), pos };
      }
      if (!reachesMain(next, held.id)) return;
      saveEdits(next);
      return;
    }

    // Kattintás: eszközzel lerakás/radír, eszköz nélkül a lakó napja.
    if (Math.hypot(x - held.startX, y - held.startY) >= DRAG_START) return;
    if (tool === "erase") {
      const target = itemAt(x, y);
      if (target) {
        items.current.splice(items.current.indexOf(target), 1);
        saveItems(items.current);
      }
      return;
    }
    if (tool?.startsWith("house:")) {
      // A kattintás a ház közepe; a ház bal felső sarkát mentjük.
      const at = { x: Math.round(x - 3), y: Math.round(y - 4) };
      if (!roomFor(at, null)) return;
      const kind = tool.slice("house:".length);
      const account = houses[0]?.id;
      if (!account) return;
      const id = `extra-${Date.now().toString(36)}`;
      const next = {
        ...edits,
        extra: [...edits.extra, { id, kind, account, ...at }],
      };
      if (!reachesMain(next, id)) return;
      saveEdits(next);
      setTool(null);
      setNote(
        "Kész. A házra kattintva válaszd ki, melyik fiók munkáját mutassa.",
      );
      openReport(id, kind, account);
      return;
    }
    if (tool) {
      items.current.push({ kind: tool, x, y: y + 0.5 });
      saveItems(items.current);
      return;
    }
    const id = personAt(x, y);
    if (id) openReport(id);
  };

  const reportHouse = report && placed.find((item) => item.id === report.id);
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("hu-HU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const toolButton = (key: string, label: string) => (
    <button
      type="button"
      aria-pressed={tool === key}
      onClick={() => setTool((current) => (current === key ? null : key))}
      className={`rounded-sm border px-1 py-1 ${
        tool === key
          ? "border-[#5a2a1c] bg-[#e2b97a]"
          : "border-[#7a4a1c] hover:bg-[#ead0a0]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={frameRef}
      className="relative mx-auto bg-[#3e8948]"
      style={
        full
          ? // Teljes képernyőn a térkép egészben, középen.
            { display: "flex", alignItems: "center", justifyContent: "center" }
          : {
              width: "100%",
              // Alacsony ablakban a rét alja kilóg — levágjuk, görgetősáv helyett.
              maxHeight: room ?? undefined,
              overflow: "hidden",
            }
      }
    >
      <div className="absolute right-3 top-3 z-20 flex gap-2 font-mono text-xs text-[#5a2a1c]">
        <button
          type="button"
          onClick={togglePause}
          aria-pressed={paused}
          title="A Lekérő és a Válasz ház leállítása / indítása"
          className={`flex h-9 items-center gap-1.5 rounded-md border-2 px-3 font-bold shadow-xl ${
            paused
              ? "border-[#2b5d1f] bg-[#bfe3a8] hover:bg-[#a9d68e]"
              : "border-[#7a1c1c] bg-[#f4c4b8] hover:bg-[#eeb0a1]"
          }`}
        >
          {paused ? "▶ Indítás" : "■ Stop"}
        </button>
        <button
          type="button"
          onClick={toggleFull}
          title={
            full
              ? "Kilépés a teljes képernyőből (Esc)"
              : "Csak a térkép, teljes képernyőn"
          }
          className="flex h-9 items-center gap-1.5 rounded-md border-2 border-[#7a4a1c] bg-[#f4d9a6] px-3 font-bold shadow-xl hover:bg-[#ead0a0]"
        >
          {full ? "✕ Kilépés" : "⛶ Teljes képernyő"}
        </button>
      </div>
      {/* A feliratok a vászonhoz igazodnak, nem a levágott kerethez. */}
      <div
        className="relative"
        style={
          full
            ? { width: `min(100vw, calc(100vh * ${COLS} / ${height}))` }
            : undefined
        }
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
          }}
          title={
            tool
              ? "Kattints vagy húzd a térképen"
              : "Fogd meg és húzd: ház, állat, tárgy. Kattints egy házra vagy lakóra."
          }
          className={`block h-auto w-full touch-none ${tool ? "cursor-crosshair" : "cursor-pointer"}`}
          style={{
            imageRendering: "pixelated",
            aspectRatio: `${COLS} / ${height}`,
          }}
        />
        {placed.map((house) => (
          <span
            key={house.id}
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-sm border-2 border-[#7a4a1c] bg-[#f4d9a6] px-2 py-0.5 font-mono text-[#5a2a1c] shadow ${
              house.main ? "text-sm font-bold" : "text-xs"
            }`}
            style={{
              left: `${((house.x + (house.main ? 6 : 3)) / COLS) * 100}%`,
              top: `${(house.y / height) * 100}%`,
            }}
          >
            {house.label}
            {house.kind && house.kind !== "sender" ? (
              <span className="block text-center text-[10px] opacity-70">
                {HOUSE_KINDS.find((kind) => kind.key === house.kind)?.label}
              </span>
            ) : null}
          </span>
        ))}
        {placed
          .filter((house) => !house.main)
          .map((house) => (
            <span
              key={`timer-${house.id}`}
              ref={(element) => {
                if (element) timers.current.set(house.id, element);
                else timers.current.delete(house.id);
              }}
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/60 px-1.5 font-mono text-[11px] tabular-nums text-white empty:hidden"
            />
          ))}
      </div>
      <aside className="absolute left-3 top-3 w-44 [:fullscreen_&]:hidden rounded-md border-2 border-[#7a4a1c] bg-[#f4d9a6]/95 p-2 font-mono text-[11px] text-[#5a2a1c] shadow-xl">
        <p className="mb-1 font-bold">Hozzáadás</p>
        {(["Állatok", "Növények", "Tárgyak"] as const).map((group) => (
          <div key={group} className="mb-2">
            <p className="mb-1 opacity-70">{group}</p>
            <div className="grid grid-cols-2 gap-1">
              {ITEMS.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={tool === item.key}
                  onClick={() =>
                    setTool((current) =>
                      current === item.key ? null : item.key,
                    )
                  }
                  className={`flex h-10 items-center gap-1 rounded-sm border px-1 text-left leading-tight ${
                    tool === item.key
                      ? "border-[#5a2a1c] bg-[#e2b97a]"
                      : "border-transparent hover:border-[#7a4a1c]"
                  }`}
                >
                  <span className="flex w-7 shrink-0 justify-center">
                    <span style={previewStyle(item)} />
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="mb-1 opacity-70">Házak</p>
        <div className="mb-2 grid grid-cols-2 gap-1">
          {HOUSE_KINDS.filter((kind) => kind.key !== "sender").map((kind) => (
            <button
              key={kind.key}
              type="button"
              aria-pressed={tool === `house:${kind.key}`}
              onClick={() =>
                setTool((current) =>
                  current === `house:${kind.key}` ? null : `house:${kind.key}`,
                )
              }
              className={`flex items-center gap-1 rounded-sm border px-1 py-1 text-left leading-tight ${
                tool === `house:${kind.key}`
                  ? "border-[#5a2a1c] bg-[#e2b97a]"
                  : "border-[#7a4a1c] hover:bg-[#ead0a0]"
              }`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-sm border border-[#7a4a1c]"
                style={{
                  background: ROOFS.find((roof) => roof.key === kind.roof)
                    ?.swatch,
                }}
              />
              {kind.label}
            </button>
          ))}
        </div>
        <p className="mb-1 opacity-70">Út</p>
        <div className="mb-2 grid grid-cols-2 gap-1">
          {toolButton("path", "Út rajzolás")}
          {toolButton("path-erase", "Út radír")}
        </div>
        <div className="grid grid-cols-2 gap-1 border-t border-[#7a4a1c] pt-2">
          {toolButton("erase", "Radír")}
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("Minden lerakott elem törlődik. Mehet?"))
                return;
              items.current = [];
              saveItems([]);
            }}
            className="rounded-sm border border-[#7a4a1c] px-1 py-1 hover:bg-[#ead0a0]"
          >
            Mind törlése
          </button>
        </div>
        <p className="mt-2 opacity-70">
          {note ??
            (tool === "path" || tool === "path-erase"
              ? "Húzd az egeret a térképen. Újra a gombra: kész."
              : tool?.startsWith("house:")
                ? "Kattints a térképre, ahova a házat tennéd."
                : tool
                  ? "Kattints a térképre. Újra a gombra: kész."
                  : "Fogd meg és húzd a házat, állatot, tárgyat. Házra kattintva: ki lakjon benne.")}
        </p>
      </aside>
      {report && reportHouse ? (
        <aside className="absolute right-3 top-14 flex max-h-[calc(100%-68px)] [:fullscreen_&]:hidden w-80 flex-col overflow-hidden rounded-md border-2 border-[#7a4a1c] bg-[#f4d9a6] font-mono text-xs text-[#5a2a1c] shadow-xl">
          <header className="flex items-center justify-between border-b-2 border-[#7a4a1c] px-3 py-2">
            <span className="truncate font-bold">{reportHouse.label}</span>
            <button
              type="button"
              aria-label="Bezárás"
              onClick={() => setReport(null)}
              className="ml-2 px-1 text-base leading-none hover:text-black"
            >
              ×
            </button>
          </header>
          {!reportHouse.main ? (
            <label className="flex items-center gap-2 border-b-2 border-[#7a4a1c] px-3 py-2">
              <span className="shrink-0">Típus:</span>
              <span
                title="A tető színe a típust jelzi"
                className="h-4 w-4 shrink-0 rounded-sm border border-[#7a4a1c]"
                style={{
                  background: ROOFS.find(
                    (roof) => roof.key === reportHouse.roof,
                  )?.swatch,
                }}
              />
              <select
                value={reportHouse.kind ?? "sender"}
                onChange={(event) => {
                  if (reportHouse.extra) {
                    editExtra(reportHouse.id, { kind: event.target.value });
                  } else {
                    saveEdits({
                      ...edits,
                      kinds: {
                        ...edits.kinds,
                        [reportHouse.slot ?? 0]: event.target.value,
                      },
                    });
                  }
                  // A panel az új típus munkáját mutassa.
                  openReport(report.id, event.target.value);
                }}
                className="min-w-0 flex-1 rounded-sm border border-[#7a4a1c] bg-[#fff7e6] px-1 py-0.5"
              >
                {HOUSE_KINDS.map((kind) => (
                  <option key={kind.key} value={kind.key}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {reportHouse.extra ? (
            <div className="space-y-2 border-b-2 border-[#7a4a1c] px-3 py-2">
              <label
                className={`flex items-center gap-2 ${reportHouse.kind === "storage" ? "hidden" : ""}`}
              >
                <span className="shrink-0">Melyik fiók?</span>
                <select
                  value={reportHouse.account}
                  onChange={(event) => {
                    editExtra(reportHouse.id, { account: event.target.value });
                    openReport(
                      reportHouse.id,
                      reportHouse.kind,
                      event.target.value,
                    );
                  }}
                  className="min-w-0 flex-1 rounded-sm border border-[#7a4a1c] bg-[#fff7e6] px-1 py-0.5"
                >
                  {ordered.map((house) => (
                    <option key={house.id} value={house.id}>
                      {house.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  saveEdits({
                    ...edits,
                    extra: edits.extra.filter(
                      (extra) => extra.id !== reportHouse.id,
                    ),
                  });
                  setReport(null);
                }}
                className="w-full rounded-sm border border-[#7a4a1c] py-0.5 hover:bg-[#ead0a0]"
              >
                Ház lebontása
              </button>
            </div>
          ) : null}
          {reportHouse.slot !== undefined ? (
            <label className="flex items-center gap-2 border-b-2 border-[#7a4a1c] px-3 py-2">
              <span className="shrink-0">Ki lakik itt?</span>
              <select
                value={report.id}
                onChange={(event) =>
                  assign(reportHouse.slot ?? 0, event.target.value)
                }
                className="min-w-0 flex-1 rounded-sm border border-[#7a4a1c] bg-[#fff7e6] px-1 py-0.5"
              >
                {ordered.map((house) => (
                  <option key={house.id} value={house.id}>
                    {house.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="space-y-3 overflow-y-auto p-3">
            {report.error ? (
              <p className="text-red-800">{report.error}</p>
            ) : null}
            {!report.data && !report.error ? <p>Betöltés…</p> : null}
            {report.data?.kind === "sender"
              ? ((data) => (
                  <>
                    <section>
                      <h3 className="mb-1 font-bold">
                        Ma kiment ({data.sent.length})
                      </h3>
                      {data.sent.length ? (
                        <ul className="space-y-0.5">
                          {data.sent.map((item) => (
                            <li
                              key={`${item.at}-${item.email}`}
                              className="flex gap-2"
                            >
                              <span className="tabular-nums opacity-70">
                                {time(item.at)}
                              </span>
                              <span className="truncate" title={item.email}>
                                {item.company}
                                {item.error ? " — hiba" : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="opacity-70">Ma még nem ment levél.</p>
                      )}
                    </section>
                    <section>
                      <h3 className="mb-1 font-bold">
                        Ma még várható ({data.upcoming.length})
                      </h3>
                      {data.upcoming.length ? (
                        <ol className="list-decimal space-y-0.5 pl-5">
                          {data.upcoming.map((item) => (
                            <li
                              key={item.email}
                              className="truncate"
                              title={item.email}
                            >
                              {item.company}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="opacity-70">
                          Mára nincs több — a menet áll, vagy elfogyott a keret.
                        </p>
                      )}
                    </section>
                  </>
                ))(report.data)
              : null}
            {report.data?.kind === "fetch"
              ? ((data) => (
                  <section>
                    <h3 className="mb-1 font-bold">Ma bejött ({data.count})</h3>
                    {data.items.length ? (
                      <ul className="space-y-1">
                        {data.items.map((item) => (
                          <li key={`${item.at}-${item.from}`}>
                            <span className="flex gap-2">
                              <span className="tabular-nums opacity-70">
                                {time(item.at)}
                              </span>
                              <span
                                className="truncate font-bold"
                                title={item.from}
                              >
                                {item.company}
                              </span>
                            </span>
                            <span className="block truncate pl-11 opacity-70">
                              {item.subject}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="opacity-70">
                        Ma még nem jött levél erre a fiókra.
                      </p>
                    )}
                  </section>
                ))(report.data)
              : null}
            {report.data?.kind === "reply"
              ? ((data) => (
                  <>
                    <section>
                      <h3 className="mb-1 font-bold">
                        Vár ({data.waiting.length})
                      </h3>
                      {data.waiting.length ? (
                        <ul className="space-y-0.5">
                          {data.waiting.map((item, index) => (
                            <li
                              key={`${item.company}-${index}`}
                              className="flex gap-2"
                            >
                              <span className="truncate">{item.company}</span>
                              <span className="ml-auto shrink-0 opacity-70">
                                {REPLY_STATUS[item.status] ?? item.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="opacity-70">Nincs függő válasz.</p>
                      )}
                    </section>
                    <section>
                      <h3 className="mb-1 font-bold">
                        Ma kiment ({data.sent.length})
                      </h3>
                      {data.sent.length ? (
                        <ul className="space-y-0.5">
                          {data.sent.map((item) => (
                            <li
                              key={`${item.at}-${item.company}`}
                              className="flex gap-2"
                            >
                              <span className="tabular-nums opacity-70">
                                {time(item.at)}
                              </span>
                              <span className="truncate">{item.company}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="opacity-70">Ma még nem ment válasz.</p>
                      )}
                    </section>
                    <DraftList
                      title="Ma megírt Gmail-piszkozatok"
                      drafts={data.drafts}
                    />
                  </>
                ))(report.data)
              : null}
            {report.data?.kind === "storage" ? (
              <>
                <p className="opacity-70">
                  {report.data.runAt
                    ? `Utolsó lekérés: ${time(report.data.runAt)}. A piszkozatok a Gmail Piszkozatok mappájában vannak.`
                    : "Még nem futott lekérés ezen a gépen."}
                </p>
                <DraftList
                  title="Ma a Raktárba került"
                  drafts={report.data.drafts}
                />
              </>
            ) : null}
            {report.data && report.data.kind !== "storage" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const person = people.current.get(report.id);
                    if (person) {
                      startTrip(
                        person,
                        performance.now(),
                        person.kind === "fetch"
                          ? "fetch"
                          : person.kind === "reply"
                            ? "store"
                            : "send",
                        3,
                      );
                    }
                  }}
                  className="w-full rounded-sm border-2 border-[#7a4a1c] py-1 hover:bg-[#ead0a0]"
                >
                  Próbaút a főházhoz
                </button>
              </>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

/**
 * A piszkozat a Gmailben: a fiók Piszkozatok mappájában keres rá a
 * Message-ID-jére; ha az nincs meg (régi bejegyzés), a címzettre és a tárgyra.
 */
function gmailDraftUrl(draft: AutoDraftRow): string {
  const query = draft.messageId
    ? `in:drafts rfc822msgid:${draft.messageId.replace(/[<>]/g, "")}`
    : `in:drafts to:${draft.to} subject:"${draft.subject}"`;
  return `https://mail.google.com/mail/u/${encodeURIComponent(
    draft.accountId,
  )}/#search/${encodeURIComponent(query)}`;
}

/** A mai automatikus Gmail-piszkozatok: idő, cég, csatolmány, vagy hogy miért maradt ki. */
function DraftList({
  title,
  drafts,
}: {
  title: string;
  drafts: AutoDraftRow[];
}) {
  const ready = drafts.filter((draft) => draft.status === "kesz");
  const failed = drafts.filter((draft) => draft.status === "hiba");
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("hu-HU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <section>
      <h3 className="mb-1 font-bold">
        {title} ({ready.length})
      </h3>
      {ready.length ? (
        <ul className="space-y-1">
          {ready.map((draft) => (
            <li key={`${draft.draftedAt}-${draft.company}`}>
              <a
                href={gmailDraftUrl(draft)}
                target="_blank"
                rel="noreferrer"
                title="Megnyitás a Gmailben"
                className="-mx-1 block rounded-sm px-1 hover:bg-[#ead0a0]"
              >
                <span className="flex gap-2">
                  <span className="tabular-nums opacity-70">
                    {time(draft.draftedAt)}
                  </span>
                  <span className="truncate font-bold">{draft.company}</span>
                </span>
                <span className="block truncate pl-11 opacity-70">
                  {draft.attachment ?? "csatolmány nélkül"}
                  {draft.note ? ` — ${draft.note}` : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="opacity-70">Ma még nem készült piszkozat.</p>
      )}
      {failed.length ? (
        <p className="mt-1 text-red-800">
          {failed.length} levélre nem készült piszkozat:{" "}
          {failed
            .slice(0, 3)
            .map((draft) => `${draft.company} (${draft.note})`)
            .join("; ")}
        </p>
      ) : null}
    </section>
  );
}

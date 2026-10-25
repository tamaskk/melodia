"""
A falu további növényei (saját rajz, alakzatokból): fák, bokrok, virágok.
Minden növény egy külön PNG a public/village/Plants/ alatt (gitignore-olt mappa).

A körvonal a szomszédos szín sötétített változata, alul félig átlátszó árnyék —
mint a Cute Fantasy csomag elemein.

Futtatás: python3 scripts/village-plants.py
"""

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "public" / "village" / "Plants"
SHADOW = (0, 0, 0, 90)


class Canvas:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.px: dict[tuple[int, int], tuple[int, int, int]] = {}

    def fill(self, inside, base, shade=None, light=None, cx=None, cy=None):
        """Kitölti az `inside(x, y)` pontokat; jobbra-lent árnyékos, balra-fent világos."""
        cx = self.w / 2 if cx is None else cx
        cy = self.h / 2 if cy is None else cy
        for y in range(self.h):
            for x in range(self.w):
                if not inside(x, y):
                    continue
                color = base
                d = (x - cx) + (y - cy)
                if shade and d > 4:
                    color = shade
                elif light and d < -6:
                    color = light
                self.px[(x, y)] = color

    def dot(self, x, y, color):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[(x, y)] = color

    def lines(self, segments, width, color):
        """Vastag vonalak egy maszkra rajzolva, majd beírva."""
        mask = Image.new("L", (self.w, self.h))
        draw = ImageDraw.Draw(mask)
        for seg in segments:
            draw.line(seg, fill=255, width=width)
        for y in range(self.h):
            for x in range(self.w):
                if mask.getpixel((x, y)):
                    self.px[(x, y)] = color

    def image(self, shadow_y: int, shadow_w: int) -> Image.Image:
        image = Image.new("RGBA", (self.w, self.h))
        cx = self.w // 2
        for x in range(cx - shadow_w // 2, cx + shadow_w // 2):
            image.putpixel((x, shadow_y), SHADOW)
        for (x, y), color in self.px.items():
            image.putpixel((x, y), (*color, 255))
        # Körvonal: minden üres pont, amely kitöltött mellett van, a szomszéd sötétje.
        for y in range(self.h):
            for x in range(self.w):
                if (x, y) in self.px:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    near = self.px.get((x + dx, y + dy))
                    if near:
                        dark = tuple(int(c * 0.35) for c in near)
                        image.putpixel((x, y), (*dark, 255))
                        break
        return image


def bumpy(cx, cy, r, lobes=7, amp=1.3):
    """Leveles szélű kör."""
    def inside(x, y):
        a = math.atan2(y - cy, x - cx)
        return math.hypot(x - cx, y - cy) <= r + amp * math.sin(a * lobes)
    return inside


def rect(x0, y0, x1, y1):
    return lambda x, y: x0 <= x <= x1 and y0 <= y <= y1


def speckle(c: Canvas, inside, colors, count, seed):
    rnd = random.Random(seed)
    spots = [(x, y) for (x, y) in c.px if inside(x, y)]
    for x, y in rnd.sample(spots, min(count, len(spots))):
        c.dot(x, y, rnd.choice(colors))


TRUNK = ((120, 78, 46), (92, 58, 34), (150, 100, 60))


def round_tree(canopy, shade, light, trunk=TRUNK, dots=None, seed=1, birch=False):
    c = Canvas(32, 42)
    if birch:
        c.fill(rect(14, 24, 17, 39), (236, 232, 222), (200, 196, 186))
        for y in (27, 31, 35):
            c.dot(14, y, (40, 40, 40))
            c.dot(17, y + 1, (40, 40, 40))
    else:
        c.fill(rect(14, 24, 17, 39), *trunk)
    inside = bumpy(16, 15, 12)
    c.fill(inside, canopy, shade, light, 16, 15)
    if dots:
        speckle(c, inside, dots, 14, seed)
    return c.image(40, 18)


def pine(green, shade, light, snow=False):
    c = Canvas(30, 46)
    c.fill(rect(14, 38, 15, 43), *TRUNK)
    layers = []
    for i in range(4):
        apex = 3 + i * 8
        half = 5 + i * 3
        layers.append((apex, apex + 12, half))

    def inside(x, y):
        for apex, base, half in layers:
            if apex <= y <= base:
                if abs(x - 14.5) <= half * (y - apex) / (base - apex) + 0.5:
                    return True
        return False

    c.fill(inside, green, shade, light, 14.5, 22)
    if snow:
        for apex, base, half in layers:
            for x in range(30):
                for y in range(apex, apex + 3):
                    if inside(x, y):
                        c.dot(x, y, (246, 250, 255))
    return c.image(44, 14)


def palm():
    c = Canvas(34, 46)
    trunk = [(16 + int(3 * math.sin(t / 10)), 44 - t) for t in range(0, 30, 3)]
    for i, (x, y) in enumerate(trunk):
        color = (176, 128, 76) if i % 2 else (148, 104, 60)
        c.fill(rect(x - 1, y - 3, x + 1, y), color)
    top = (19, 14)
    leaves = [
        (top, (5, 18)),
        (top, (8, 8)),
        (top, (19, 4)),
        (top, (30, 9)),
        (top, (32, 19)),
    ]
    c.lines(leaves, 3, (70, 160, 70))
    c.lines([(top, (6, 17)), (top, (31, 18))], 1, (110, 200, 90))
    c.fill(rect(17, 13, 21, 16), (120, 80, 40))
    return c.image(44, 12)


def cactus():
    c = Canvas(18, 26)
    green, shade, light = (88, 168, 72), (60, 128, 56), (130, 200, 100)
    c.fill(lambda x, y: (7 <= x <= 10 and 4 <= y <= 23) or ((x - 8.5) ** 2 + (y - 4) ** 2 <= 3), green, shade, light, 8.5, 12)
    c.fill(rect(3, 11, 6, 13), green, shade, light, 5, 12)
    c.fill(rect(3, 6, 5, 12), green, shade, light, 4, 9)
    c.fill(rect(11, 14, 14, 16), green, shade, light, 12, 15)
    c.fill(rect(12, 9, 14, 15), green, shade, light, 13, 12)
    for y in range(6, 22, 3):
        c.dot(9, y, light)
    c.dot(4, 5, (240, 120, 160))
    return c.image(24, 10)


def bush(green, shade, light, dots=None, seed=3, w=24):
    c = Canvas(w, 18)
    blobs = [bumpy(7, 10, 6, 5, 0.8), bumpy(w - 8, 10, 6, 5, 0.8), bumpy(w / 2, 7, 6, 5, 0.8)]
    inside = lambda x, y: any(b(x, y) for b in blobs) and y <= 15
    c.fill(inside, green, shade, light, w / 2, 9)
    if dots:
        speckle(c, inside, dots, 9, seed)
    return c.image(16, w - 6)


def flower(stem_h, head):
    c = Canvas(14, 20)
    c.fill(rect(6, 20 - stem_h, 7, 18), (70, 150, 60))
    c.fill(rect(3, 14, 5, 15), (90, 170, 70))
    head(c)
    return c.image(19, 8)


def sunflower_head(c):
    c.fill(bumpy(6.5, 5, 4.5, 8, 1.0), (250, 200, 40), (230, 160, 30), None, 6.5, 5)
    c.fill(lambda x, y: (x - 6.5) ** 2 + (y - 5) ** 2 <= 3, (120, 70, 30))


def tulip_head(c):
    c.fill(lambda x, y: 4 <= x <= 9 and 5 <= y <= 10 and not (y == 5 and x in (5, 8)), (230, 60, 80), (190, 40, 60), (250, 120, 130), 6.5, 8)


def lavender():
    c = Canvas(16, 20)
    for i, x in enumerate((4, 7, 10, 12)):
        top = 5 + (i % 2) * 2
        c.fill(rect(x, top + 5, x, 18), (90, 150, 80))
        c.fill(rect(x - 1, top, x + 1, top + 5), (150, 110, 210), (120, 80, 180), (190, 160, 240), x, top + 2)
    return c.image(19, 12)


def fern():
    c = Canvas(20, 16)
    base = (10, 15)
    fronds = [(base, (2, 6)), (base, (6, 2)), (base, (13, 2)), (base, (18, 6)), (base, (10, 1))]
    c.lines(fronds, 2, (70, 160, 70))
    c.lines([(base, (4, 7)), (base, (16, 7))], 1, (120, 200, 100))
    return c.image(15, 14)


def reeds():
    c = Canvas(16, 24)
    for x, top in ((4, 4), (8, 2), (12, 5)):
        c.fill(rect(x, top + 6, x, 22), (100, 150, 70))
        c.fill(rect(x - 1, top, x + 1, top + 5), (130, 82, 46), (100, 60, 34))
    c.lines([((2, 22), (6, 12)), ((14, 22), (11, 14))], 1, (90, 170, 80))
    return c.image(23, 12)


def pumpkin():
    c = Canvas(18, 14)
    c.fill(bumpy(9, 8, 6, 6, 0.8), (240, 140, 40), (200, 100, 30), (255, 180, 80), 9, 8)
    for x in (6, 12):
        for y in range(4, 13):
            if (x, y) in c.px:
                c.dot(x, y, (200, 100, 30))
    c.fill(rect(8, 1, 9, 3), (90, 130, 50))
    return c.image(13, 12)


PLANTS = {
    "Pine": pine((60, 130, 70), (40, 100, 56), (90, 160, 90)),
    "SnowPine": pine((50, 120, 80), (34, 90, 62), (80, 150, 100), snow=True),
    "Birch": round_tree((150, 200, 90), (110, 160, 70), (190, 230, 120), birch=True),
    "Cherry": round_tree((246, 170, 200), (220, 130, 170), (255, 210, 228), dots=[(255, 255, 255), (230, 110, 150)], seed=4),
    "Autumn": round_tree((232, 130, 50), (196, 90, 36), (250, 180, 80), dots=[(250, 210, 90)], seed=5),
    "Apple": round_tree((80, 160, 70), (56, 124, 56), (120, 200, 90), dots=[(220, 40, 40)], seed=6),
    "Palm": palm(),
    "Cactus": cactus(),
    "Bush": bush((70, 150, 70), (50, 116, 56), (110, 190, 90)),
    "BerryBush": bush((60, 140, 70), (44, 108, 56), (100, 180, 90), dots=[(60, 80, 200), (90, 110, 230)], seed=7),
    "RoseBush": bush((60, 140, 70), (44, 108, 56), (100, 180, 90), dots=[(230, 60, 90), (250, 140, 170)], seed=8),
    "Sunflower": flower(14, sunflower_head),
    "Tulip": flower(10, tulip_head),
    "Lavender": lavender(),
    "Fern": fern(),
    "Reeds": reeds(),
    "Pumpkin": pumpkin(),
}

if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    for name, image in PLANTS.items():
        image.save(ROOT / f"{name}.png")
        print(f"kész: {name}.png {image.size}")

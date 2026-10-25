"""
A falu további állatai a Cute Fantasy állatlapok formátumában (64×64, 2×2 kocka
32 px-esek: felső sor áll, alsó sor sétál, balra néz).

- Kézzel rajzolt új állatok (saját rajz): kiskacsa, nyuszi, macska, kutya,
  medvék, majmok, róka-félék, kígyók, alpaka, vidra, kapibara, pingvin, béka,
  teknős, sün, egér — a `MORE` táblában, a felület címkéjével együtt.
- Színváltozatok a csomag állataiból (a csomag licence szerint nem adható
  tovább, ezért ezek is a gitignore-olt public/village/ alá kerülnek).

Futtatás: python3 scripts/village-animals.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "village" / "Animals"
OUTLINE = (14, 7, 27, 255)
SHADOW = (0, 0, 0, 100)

# Betű → szín. '.' átlátszó, 'o' körvonal, 'e' szem (pislogáskor 'a' lesz).
ANIMALS = {
    "Duckling": {
        "colors": {
            "a": (255, 214, 64),
            "b": (240, 166, 30),
            "c": (255, 240, 150),
            "d": (232, 112, 40),
        },
        "body": [
            "...oooo........",
            "..occaao.......",
            ".oaeaaaao......",
            "oddaaaaao......",
            "oddoaaaao......",
            ".ooaaaaaoooooo.",
            "..oaaaaaaaacaao",
            "..oaaaaabbbaao.",
            "..obaaabbbaaao.",
            "...obbaaaaabo..",
            "....obbbbbbo...",
        ],
        "legs": [
            ".....odo.odo...",
            "....odo..odo...",
            "......odoodo...",
        ],
    },
    "Bunny": {
        "colors": {
            "a": (214, 190, 168),
            "b": (176, 146, 124),
            "c": (250, 240, 228),
            "p": (246, 129, 135),
        },
        "body": [
            "..oo.oo.........",
            ".opo.opo........",
            ".opo.opo........",
            ".oao.oao........",
            "..oaaao.........",
            ".oaaaaaoo.......",
            "oaeaaaaaaoooooo.",
            "opaaaaaaaaaaaaao",
            "occaaaaaaaaaaco.",
            ".occaaaaabbacco.",
            "..obaaaaabbaaco.",
            "...obbbbbbbbbo..",
        ],
        "legs": [
            "...oco....oco...",
            "..oco......oco..",
            "....oco..oco....",
        ],
    },
    "Cat": {
        "colors": {
            "a": (236, 148, 64),
            "b": (196, 100, 40),
            "c": (252, 214, 160),
            "p": (246, 129, 135),
        },
        "body": [
            "o..o............",
            "oaoao...........",
            "oaaaao..........",
            "oeaeao.........o",
            "ocpcco........oa",
            ".occo.........oa",
            ".oaabooooooooooa",
            ".oaaabaabaabaao.",
            ".ocaaaaaaaaaaao.",
            "..occaaaaaaaaao.",
            "..obbbbbbbbbbbo.",
        ],
        "legs": [
            "..oco.oco.oco.o.",
            ".oco.oco.oco.o..",
            "...oco.oco.oco..",
        ],
    },
    "Dog": {
        "colors": {
            "a": (176, 120, 76),
            "b": (128, 82, 50),
            "c": (232, 200, 160),
            "p": (60, 36, 30),
        },
        "body": [
            "..oooo...........",
            ".obaaao..........",
            "obbaeaao.........",
            "obaaaaaaoo.....o.",
            "opcaaaaaao....oao",
            ".occaaaao.....oao",
            "..ocaaaooooooooao",
            "..occaaaaaaaaaao.",
            "..occaaaaaaaaaao.",
            "...ocaaaaaaaaaao.",
            "...obbbbbbbbbbbo.",
        ],
        "legs": [
            "...obo.obo.obo.o.",
            "..obo.obo.obo.o..",
            "....obo.obo.obo..",
        ],
    },
}


def legs(width: int, idle: list, walk_a: list, walk_b: list, piece: str = "obo") -> list:
    """Lábsorok: a megadott oszlopokon egy-egy láb (`piece`), áll / két séta-kocka."""
    rows = []
    for xs in (idle, walk_a, walk_b):
        row = ["."] * width
        for x in xs:
            for i, char in enumerate(piece):
                if x + i >= len(row):
                    row.append(".")
                if row[x + i] == "." or char == "o":
                    row[x + i] = char
        rows.append("".join(row))
    return rows


def quad(width: int, front: int, back: int, piece: str = "obo") -> list:
    """Négylábú: elöl és hátul egy-egy lábpár, sétánál szétlép."""
    return legs(
        width,
        [front, front + 2, back, back + 2],
        [front - 1, front + 2, back, back + 3],
        [front, front + 3, back - 1, back + 2],
        piece,
    )


BEAR = [
    "..oo..oo..........",
    ".okkookko.........",
    ".oaaaaaaao........",
    ".oaeaaaaaaoooooo..",
    "ooccaaaaaaaaaaaaao",
    "occcaaaaaaaaaaaaao",
    ".occaaaaaaaaaaaaao",
    "..oaaaaaaaaaaaaabo",
    "..obaaaaaaaaaaabbo",
    "...obbbbbbbbbbbbo.",
]
MONKEY = [
    "...oooo.......",
    "..obbbbo......",
    ".obccccbo.....",
    "obceccecbo....",
    "obbccccbbo....",
    ".obbccbbo.....",
    "..obbbbo...oo.",
    ".obbaabbo.o..o",
    ".obaaaabo.o..o",
    ".obbaabbo..oo.",
    "..obbbbo......",
]
FOX = [
    ".o..o..............",
    "oaooao.............",
    "oaaaao.............",
    "oeaaaaoooooooo.....",
    "ocaaaaaaaaaaaaoooo.",
    "oocaaaaaaaaaaaaaaao",
    ".occaaaaaaaaaaaoaco",
    "..oaaaaaaaaaaaoocco",
    "...obbbbbbbbbbo.oo.",
]
SNAKE = [
    "oooo................",
    "oeaao...............",
    "oaaaao..............",
    "doaaao..............",
    "..oaao.....ooooo....",
    "..oaaoooooooaaaao...",
    "..obaaaaaaaaaaaaaoo.",
]
ALPACA = [
    ".o.o..........",
    "oaoao.........",
    "oaaaao........",
    "oeaaao........",
    "ocaaao........",
    ".occao........",
    "..oaao........",
    "..oaao........",
    "..oaaoooooooo.",
    "..oaaaaaaaaaao",
    "..oaaaaaaaaaao",
    "..obaaaaaaaabo",
    "...obbbbbbbbo.",
]

MORE = {
    "BrownBear": {
        "label": "Barnamedve",
        "colors": {"a": (150, 100, 60), "b": (110, 70, 42), "c": (214, 176, 130), "k": (110, 70, 42)},
        "body": BEAR, "legs": quad(18, 3, 12),
    },
    "PolarBear": {
        "label": "Jegesmedve",
        "colors": {"a": (246, 246, 250), "b": (196, 210, 226), "c": (255, 255, 255), "k": (220, 226, 236)},
        "body": BEAR, "legs": quad(18, 3, 12),
    },
    "Panda": {
        "label": "Panda",
        "colors": {"a": (250, 250, 250), "b": (40, 40, 48), "c": (255, 255, 255), "k": (40, 40, 48)},
        "body": BEAR, "legs": quad(18, 3, 12),
    },
    "Koala": {
        "label": "Koala",
        "colors": {"a": (160, 160, 172), "b": (120, 120, 134), "c": (226, 226, 232), "k": (226, 226, 232)},
        "body": BEAR, "legs": quad(18, 3, 12),
    },
    "Capybara": {
        "label": "Kapibara",
        "colors": {"a": (164, 112, 70), "b": (118, 78, 46)},
        "body": [
            "..oo..............",
            ".oaao.............",
            "oaaaaoooooooooo...",
            "oeaaaaaaaaaaaaaao.",
            "oaaaaaaaaaaaaaaaao",
            "ooaaaaaaaaaaaaaaao",
            ".obaaaaaaaaaaaabbo",
            "..obbbbbbbbbbbbbo.",
        ],
        "legs": quad(18, 3, 12),
    },
    "Otter": {
        "label": "Vidra",
        "colors": {"a": (128, 88, 58), "b": (92, 62, 40), "c": (220, 196, 164)},
        "body": [
            "..ooo...............",
            ".oaaao..............",
            "oeaaaaoooooooooo....",
            "occaaaaaaaaaaaaaoo..",
            "occcaaaaaaaaaaaaaaoo",
            ".occaaaaaaaaaaaobbbo",
            "..obbbbbbbbbbbbo.oo.",
        ],
        "legs": quad(20, 3, 11),
    },
    "Alpaca": {
        "label": "Alpaka",
        "colors": {"a": (242, 232, 214), "b": (206, 190, 168), "c": (252, 248, 240)},
        "body": ALPACA, "legs": quad(14, 3, 8),
    },
    "Llama": {
        "label": "Láma",
        "colors": {"a": (196, 150, 104), "b": (150, 110, 74), "c": (232, 204, 164)},
        "body": ALPACA, "legs": quad(14, 3, 8),
    },
    "Monkey": {
        "label": "Majom",
        "blink": "c",
        "colors": {"a": (204, 154, 104), "b": (140, 90, 52), "c": (234, 198, 152)},
        "body": MONKEY, "legs": legs(14, [2, 5], [1, 5], [3, 5]),
    },
    "Orangutan": {
        "label": "Orángután",
        "blink": "c",
        "colors": {"a": (232, 142, 72), "b": (196, 92, 38), "c": (214, 164, 124)},
        "body": MONKEY, "legs": legs(14, [2, 5], [1, 5], [3, 5]),
    },
    "Gorilla": {
        "label": "Gorilla",
        "blink": "c",
        "colors": {"a": (96, 92, 104), "b": (56, 52, 62), "c": (120, 110, 112)},
        "body": MONKEY, "legs": legs(14, [2, 5], [1, 5], [3, 5]),
    },
    "Penguin": {
        "label": "Pingvin",
        "blink": "b",
        "colors": {"a": (40, 44, 60), "b": (40, 44, 60), "c": (245, 245, 250), "d": (240, 150, 40)},
        "body": [
            "..oooo....",
            ".obbbbo...",
            "obebbbbo..",
            "dobccbbo..",
            ".obcccbbo.",
            ".obccccbo.",
            "obbccccbbo",
            ".obccccbo.",
            "..obbbbo..",
        ],
        "legs": legs(10, [2, 5], [1, 5], [2, 6], "odo"),
    },
    "Snake": {
        "label": "Kígyó",
        "colors": {"a": (104, 184, 84), "b": (62, 132, 58), "d": (230, 60, 60)},
        "body": SNAKE,
        "legs": [
            "...oooooooooooooooo.",
            "..oooooooooooooooo..",
            "....oooooooooooooooo",
        ],
    },
    "Python": {
        "label": "Piton",
        "colors": {"a": (222, 192, 84), "b": (170, 130, 52), "d": (230, 60, 60)},
        "body": SNAKE,
        "legs": [
            "...oooooooooooooooo.",
            "..oooooooooooooooo..",
            "....oooooooooooooooo",
        ],
    },
    "Fox": {
        "label": "Róka",
        "colors": {"a": (228, 122, 42), "b": (178, 82, 30), "c": (250, 242, 232)},
        "body": FOX, "legs": quad(19, 3, 10),
    },
    "Wolf": {
        "label": "Farkas",
        "colors": {"a": (152, 152, 162), "b": (110, 110, 122), "c": (222, 222, 228)},
        "body": FOX, "legs": quad(19, 3, 10),
    },
    "Raccoon": {
        "label": "Mosómedve",
        "colors": {"a": (132, 126, 122), "b": (70, 64, 64), "c": (222, 216, 208)},
        "body": FOX, "legs": quad(19, 3, 10),
    },
    "Frog": {
        "label": "Béka",
        "colors": {"a": (104, 192, 84), "b": (62, 142, 60), "c": (204, 232, 144)},
        "body": [
            ".oo...oo....",
            "oeao.oeao...",
            "oaaaooaaao..",
            "oaaaaaaaaao.",
            "occcccccaaao",
            ".occcccaaao.",
            "..obbbbbbo..",
        ],
        "legs": legs(12, [1, 7], [0, 8], [2, 6]),
    },
    "Turtle": {
        "label": "Teknős",
        "colors": {"s": (112, 152, 62), "d": (72, 102, 42), "a": (172, 202, 112)},
        "body": [
            ".....oooooo.......",
            "....ossdssdo......",
            "...osdssdssdo.....",
            ".oo.osdssdssdso...",
            "oeaoossssssssssoo.",
            "oaaaaaaaaaaaaaaaao",
            ".oooooooooooooooo.",
        ],
        "legs": quad(18, 3, 11, "oao"),
    },
    "Hedgehog": {
        "label": "Sün",
        "colors": {"a": (232, 202, 172), "b": (190, 160, 130), "c": (232, 202, 172), "d": (112, 82, 62)},
        "body": [
            ".....o.o.o....",
            "....odododo...",
            "...oddddddddo.",
            ".oocdddddddddo",
            "oecccddddddddo",
            "occccddddddddo",
            ".occccccccccco",
            "..obbbbbbbbbo.",
        ],
        "legs": quad(14, 3, 8),
    },
    "Mouse": {
        "label": "Egér",
        "colors": {"a": (172, 172, 184), "b": (132, 132, 144), "p": (246, 129, 135)},
        "body": [
            "..oo........",
            ".opao.......",
            ".oaaaooooo..",
            "oeaaaaaaaao.",
            "paaaaaaaaaoo",
            ".obbbbbbbo.o",
        ],
        "legs": legs(12, [2, 6], [1, 6], [2, 7]),
    },
    "BlackCat": {
        "label": "Fekete cica",
        "colors": {"a": (64, 62, 74), "b": (38, 36, 46), "c": (124, 122, 134), "p": (246, 129, 135)},
        "like": "Cat",
    },
}

STILL = ["", "", ""]

# 40 további faj, mind saját rajzzal (a rövidebb sorokat a rajzoló kitölti).
WILD = {
    "Elephant": {
        "label": "Elefánt",
        "colors": {"a": (150, 150, 160), "k": (110, 110, 120), "d": (250, 248, 236)},
        "body": [
            ".....oooo",
            "...oooaaaoooooooo",
            "..oaaoaaaaaaaaaaao",
            ".oaaaoaaaaaaaaaaaao",
            ".oeaaoaaaaaaaaaaaao",
            ".oaaaoaaaaaaaaaaaaoo",
            ".odaaoaaaaaaaaaaaaoo",
            "oaaoooaaaaaaaaaaaao",
            "oao..okkkkkkkkkkkko",
            "oo....okko....okko",
            "......okko....okko",
        ],
        "legs": legs(20, [6, 14], [5, 15], [7, 13], "okko"),
    },
    "Giraffe": {
        "label": "Zsiráf",
        "colors": {"a": (240, 200, 90), "b": (170, 110, 50), "d": (120, 80, 40), "k": (210, 170, 70)},
        "body": [
            ".o.o",
            "odod",
            "oaaao",
            "oeaaao",
            "oaaaao",
            ".ooaao",
            "..obao",
            "..oaao",
            "..oabo",
            "..oaao",
            "..obao",
            "..oaaoooooooo.",
            "..oaabaaabaaao",
            "..obaaabaaabao",
            "..oaabaaabaaao",
            "...okkkkkkkkko",
            "...oao....oao.",
        ],
        "legs": quad(14, 3, 9, "oao"),
    },
    "Lion": {
        "label": "Oroszlán",
        "colors": {"a": (232, 180, 100), "b": (160, 90, 40), "c": (250, 230, 190), "k": (196, 144, 70), "d": (120, 66, 30)},
        "body": [
            "..oooo",
            ".obbbbo",
            "obbaabbo",
            "obaeaabboooooo",
            "obcaaabbaaaaaao",
            "obccaabbaaaaaaao",
            ".obbbbbaaaaaaaoo",
            "..oaaaaaaaaaaaod",
            "...okkkkkkkkko",
        ],
        "legs": quad(16, 3, 10),
    },
    "Tiger": {
        "label": "Tigris",
        "colors": {"a": (236, 140, 50), "d": (40, 30, 30), "c": (250, 240, 230), "k": (190, 100, 40)},
        "body": [
            "o..o",
            "oaoao",
            "oaaaao",
            "oeadaaooooooooo",
            "occaaadaadaadaao",
            "occcaadaadaadaaoo",
            ".occaaaaaaaaaaaod",
            "..okkkkkkkkkkkoo",
        ],
        "legs": quad(17, 3, 10),
    },
    "Cheetah": {
        "label": "Gepárd",
        "colors": {"a": (240, 200, 110), "k": (200, 160, 80), "d": (60, 40, 30), "c": (252, 246, 236)},
        "body": [
            "o..o",
            "oaoao",
            "oaaaao",
            "oedaaaooooooooo",
            "odaaadaadaadaao",
            "occaaaadaadaaaooo",
            ".occaadaadaadaaod",
            "..okkkkkkkkkkkoo",
        ],
        "legs": quad(17, 3, 10),
    },
    "Horse": {
        "label": "Ló",
        "colors": {"a": (150, 96, 56), "b": (70, 46, 30), "c": (200, 160, 120), "k": (120, 76, 44)},
        "body": [
            ".oo",
            "oaao",
            "oaaabo",
            "oeaaabo",
            "oaaaabo",
            "occaaboooooooo",
            ".ooaaaaaaaaaaaob",
            "..oaaaaaaaaaaaob",
            "..oaaaaaaaaaaaob",
            "...okkkkkkkkko.b",
            "...oko......oko",
        ],
        "legs": quad(16, 3, 11, "oko"),
    },
    "Zebra": {
        "label": "Zebra",
        "colors": {"a": (248, 248, 250), "b": (30, 30, 36), "d": (30, 30, 36), "c": (170, 170, 180), "k": (210, 210, 220)},
        "body": [
            ".oo",
            "oaao",
            "oaadbo",
            "oeadabo",
            "oaadabo",
            "occadboooooooo",
            ".ooaadaadaadaaob",
            "..oadaadaadaaaob",
            "..oaadaadaadaaob",
            "...okkkkkkkkko.b",
            "...odo......odo",
        ],
        "legs": quad(16, 3, 11, "odo"),
    },
    "Donkey": {
        "label": "Szamár",
        "colors": {"a": (150, 146, 150), "b": (80, 76, 80), "c": (226, 220, 220), "k": (120, 116, 120)},
        "body": [
            "o.o",
            "oaoo",
            "oaao",
            "oaaabo",
            "oeaaabo",
            "occaabooooooooo",
            ".ooaaaaaaaaaaaob",
            "..oaaaaaaaaaaaob",
            "...okkkkkkkkkob",
            "...oko.....oko",
        ],
        "legs": quad(16, 3, 10, "oko"),
    },
    "Goat": {
        "label": "Kecske",
        "colors": {"a": (240, 240, 240), "k": (200, 200, 200), "d": (150, 120, 90)},
        "body": [
            "..oo",
            ".o.do",
            "..oaao",
            ".oeaaaoooooooo",
            "oaaaaaaaaaaaaao",
            ".odaaaaaaaaaaao",
            "..oaaaaaaaaaao",
            "...okkkkkkkko",
        ],
        "legs": quad(15, 3, 9),
    },
    "Deer": {
        "label": "Szarvas",
        "colors": {"a": (176, 116, 66), "c": (250, 240, 226), "d": (120, 90, 60), "k": (140, 88, 48)},
        "body": [
            "o.o.o",
            "odododo",
            ".oddo",
            "..oaao",
            ".oeaaao",
            "oaaaaaoooooooo",
            "ooaaacaaacaaaoo",
            "..oaaaaaaaaaaaoc",
            "..oacaaacaaaaaoo",
            "...okkkkkkkkko",
            "...oko.....oko",
        ],
        "legs": quad(16, 3, 10, "oko"),
    },
    "Camel": {
        "label": "Teve",
        "colors": {"a": (214, 170, 110), "k": (176, 132, 80), "b": (120, 90, 60)},
        "body": [
            ".oo",
            "oaao.....ooo",
            "oeaao...oaaao",
            "oaaao..oaaaaao",
            ".ooaao.oaaaaaaoo",
            "...oaaoaaaaaaaaao",
            "...oaaaaaaaaaaaao",
            "....oaaaaaaaaaaob",
            ".....okkkkkkkkko",
            ".....oko....oko",
        ],
        "legs": quad(17, 5, 12, "oko"),
    },
    "Kangaroo": {
        "label": "Kenguru",
        "colors": {"a": (196, 130, 80), "c": (236, 200, 160), "k": (156, 96, 56), "p": (60, 40, 30)},
        "body": [
            ".oo",
            "oaao",
            "oaaao",
            "oeaaao",
            "paaaao",
            ".ooaao",
            "..oaaao",
            ".ocoaaao",
            "..occaaao",
            "..occaaaao",
            "..occaaaaoo",
            "...okkkkaaao",
            "....okkkoaao",
            "..........oo",
        ],
        "legs": legs(12, [3, 6], [2, 6], [4, 7]),
    },
    "Hippo": {
        "label": "Víziló",
        "colors": {"a": (150, 140, 170), "k": (110, 100, 130), "c": (220, 180, 190), "p": (90, 70, 90)},
        "body": [
            ".o.o",
            "oaoaoooo",
            "oeaaaaaaoooooooo",
            "oaaaaaaaaaaaaaaao",
            "opaaaaaaaaaaaaaaao",
            "oaaaaaaaaaaaaaaaao",
            "occccaaaaaaaaaaao",
            ".ooookkkkkkkkkkko",
        ],
        "legs": quad(18, 5, 12, "oko"),
    },
    "Rhino": {
        "label": "Orrszarvú",
        "colors": {"a": (160, 160, 168), "k": (120, 120, 130), "d": (232, 226, 212)},
        "body": [
            "d",
            "od.o.o",
            "oadoaoooooooooo",
            "oaaeaaaaaaaaaaao",
            "oaaaaaaaaaaaaaaao",
            "ooaaaaaaaaaaaaaaao",
            ".oaaaaaaaaaaaaaao",
            "..okkkkkkkkkkkko",
        ],
        "legs": quad(18, 3, 11, "oko"),
    },
    "Crocodile": {
        "label": "Krokodil",
        "colors": {"a": (90, 150, 70), "k": (60, 110, 50), "d": (240, 240, 230)},
        "body": [
            "...oooo",
            "oooaeaaoooooooooo",
            "odadaaaaaaaaaaaaaoo",
            "oaaaaaaaaaaaaaaaaaoo",
            ".oooookkkkkkkkkkkkko",
        ],
        "legs": quad(20, 6, 13, "oao"),
    },
    "Lizard": {
        "label": "Gyík",
        "colors": {"a": (120, 200, 100), "d": (60, 140, 80), "k": (80, 150, 70)},
        "body": [
            "..ooo",
            ".oaeao",
            "oaaaaoooooooo",
            ".ooaadaadaaaaooo",
            "...okkkkkkkkkoo",
        ],
        "legs": quad(16, 3, 9, "oao"),
    },
    "Beaver": {
        "label": "Hód",
        "colors": {"a": (140, 96, 60), "b": (110, 74, 46), "k": (80, 60, 50), "d": (250, 250, 240)},
        "body": [
            "..oo",
            ".oaao",
            "oeaaaoooooo",
            "oaaaaaaaaaao",
            "odaaaaaaaaaaoooo",
            ".oaaaaaaaaaaokkko",
            "..obbbbbbbbbokkko",
            "...........oooo",
        ],
        "legs": quad(16, 3, 8),
    },
    "Squirrel": {
        "label": "Mókus",
        "colors": {"a": (200, 110, 50), "k": (160, 80, 36), "c": (240, 220, 190)},
        "body": [
            ".........oooo",
            "........oaaaao",
            "..oo....oaaaao",
            ".oaao...oaaao",
            "oeaaao...oaao",
            "oaaaaoo..oao",
            ".ooaaaaooaao",
            "..oaacaaaaao",
            "..oaccaaaao",
            "...okkkkko",
        ],
        "legs": legs(14, [3, 6], [2, 6], [3, 7], "oko"),
    },
    "Hamster": {
        "label": "Hörcsög",
        "colors": {"a": (230, 170, 90), "c": (250, 240, 220), "p": (246, 170, 170)},
        "body": [
            "..oo..oo",
            ".oppooppo",
            ".oaaaaaaao",
            "oaeaaaaaaao",
            "occaaaaaaao",
            "occcaaaaaco",
            ".occcccccco",
            "..oooooooo",
        ],
        "legs": legs(11, [2, 6], [1, 6], [2, 7], "oco"),
    },
    "Bat": {
        "label": "Denevér",
        "colors": {"a": (90, 76, 110), "b": (60, 50, 76)},
        "body": [
            "o....o..o....o",
            "oo...oaao...oo",
            "obo.oeaaeo.obo",
            "obboaaaaaaobbo",
            "obbbaaaaaabbbo",
            ".obboaaaaobbo",
            "..oo.oaao.oo",
            "......oo",
        ],
        "legs": STILL,
    },
    "Sloth": {
        "label": "Lajhár",
        "colors": {"a": (170, 150, 120), "c": (230, 220, 190), "d": (80, 60, 50), "k": (130, 110, 90)},
        "body": [
            "..oooo",
            ".oaaaao",
            "oacdcdao",
            "oaccccaooooo",
            ".oaccaaaaaaaoo",
            "..oaaaaaaaaaaao",
            "..okkkkkkkkkkko",
        ],
        "legs": quad(15, 3, 10, "oko"),
    },
    "Seal": {
        "label": "Fóka",
        "colors": {"a": (150, 160, 180), "k": (110, 120, 140), "p": (40, 40, 50)},
        "body": [
            "..ooo",
            ".oaaao",
            "oeaaaao",
            "paaaaaoooooooo",
            ".ooaaaaaaaaaaaoo",
            "...oaaaaaaaaaaaaoo",
            "....okkkkkkkkkkkkoo",
        ],
        "legs": legs(19, [4, 15], [3, 15], [5, 15], "oko"),
    },
    "Armadillo": {
        "label": "Tatu",
        "colors": {"s": (180, 150, 130), "k": (140, 110, 96), "a": (220, 190, 170), "p": (90, 60, 60)},
        "body": [
            "......oooooo",
            "....oosksksko",
            "...osksksksksoo",
            ".ooosksksksksksoo",
            "oeaosksksksksksoo",
            "paaoooooooooooooo",
        ],
        "legs": quad(17, 4, 11, "oao"),
    },
    "Owl": {
        "label": "Bagoly",
        "colors": {"a": (150, 110, 70), "c": (230, 210, 170), "d": (240, 170, 40)},
        "body": [
            "oo.....oo",
            "oaoooooao",
            "occaaacco",
            "oecaaaeco",
            "oaccdccao",
            "oaaccccao",
            "oaaccccao",
            ".oaccccao",
            "..oooooo",
        ],
        "legs": legs(9, [2, 5], [1, 5], [2, 6], "odo"),
    },
    "Parrot": {
        "label": "Papagáj",
        "colors": {"a": (220, 50, 50), "s": (60, 110, 220), "d": (250, 220, 120), "k": (250, 200, 60)},
        "body": [
            "...ooo",
            "..oaaao",
            ".ooeaaao",
            "oddoaaao",
            "odd.oaaao",
            ".o..oassao",
            "....oasssao",
            "....oassso",
            ".....oasso",
            "......oako",
            ".......okko",
            "........oko",
        ],
        "legs": legs(11, [4, 6], [3, 6], [4, 7], "odo"),
    },
    "Flamingo": {
        "label": "Flamingó",
        "colors": {"a": (246, 150, 170), "d": (60, 40, 50), "k": (220, 110, 140)},
        "body": [
            "...oo",
            "..oaao",
            ".oeaao",
            "odaaao",
            "odo.oao",
            "o...oao",
            "....oao",
            "...oaao",
            "..oaaaooo",
            ".oaaaaaaao",
            ".oakkkaaao",
            "..oaaaaao",
            "....odo",
            "....odo",
        ],
        "legs": legs(10, [4], [3], [5], "odo"),
    },
    "Swan": {
        "label": "Hattyú",
        "colors": {"a": (252, 252, 252), "k": (200, 210, 220), "d": (240, 140, 40)},
        "body": [
            "..oo",
            ".oaao",
            "deaao",
            ".ooaao",
            "...oao",
            "...oao.oo",
            "..oaaooaao",
            ".oaaaaaaaao",
            ".oaaaaaaaao",
            "..okkkkkko",
        ],
        "legs": legs(11, [3, 6], [2, 6], [3, 7], "odo"),
    },
    "Pigeon": {
        "label": "Galamb",
        "colors": {"a": (170, 170, 184), "s": (130, 110, 170), "k": (110, 110, 124), "d": (230, 150, 150)},
        "body": [
            "..ooo",
            ".oaaao",
            "deassoooo",
            ".osssaaaao",
            "..oaaaaaaoo",
            "..oaakkkkao",
            "...okkkkoo",
        ],
        "legs": legs(11, [4, 6], [3, 6], [4, 7], "odo"),
    },
    "Turkey": {
        "label": "Pulyka",
        "colors": {"a": (140, 90, 60), "k": (200, 140, 70), "d": (110, 70, 40), "p": (220, 50, 50)},
        "body": [
            ".......oooo",
            "......okdkdo",
            "..oo.okdkdkdo",
            ".oeaookdkdkdo",
            "ppaaoaaakdkdo",
            ".poaaaaaaaoo",
            "...oaaaaaao",
            "....okkkko",
        ],
        "legs": legs(13, [4, 7], [3, 7], [4, 8], "odo"),
    },
    "Ostrich": {
        "label": "Strucc",
        "colors": {"a": (230, 190, 170), "b": (50, 46, 56), "c": (250, 250, 250), "d": (230, 180, 120)},
        "body": [
            "..ooo",
            ".oaaao",
            "ddeaao",
            "..oao",
            "..oao",
            "..oao",
            "..oao",
            ".oaaoooo",
            "obbbbbbbooo",
            "obbbbbbbbcco",
            ".obbbbbbbco",
            "..obbbbbo",
            "...oao.oao",
            "...oao.oao",
        ],
        "legs": legs(12, [3, 7], [2, 7], [3, 8], "oao"),
    },
    "Toucan": {
        "label": "Tukán",
        "colors": {"a": (250, 230, 120), "b": (40, 40, 48), "d": (250, 140, 40), "k": (220, 60, 60)},
        "body": [
            "..oooo",
            "odddddoooo",
            "oddddoaebo",
            ".ooooaabbbo",
            ".....oabbbbo",
            ".....obbbbbo",
            "......obbbbo",
            "......obbbo",
            ".......obko",
        ],
        "legs": legs(12, [6, 8], [5, 8], [6, 9], "odo"),
    },
    "Peacock": {
        "label": "Páva",
        "colors": {"a": (50, 110, 200), "k": (30, 80, 150), "s": (60, 150, 90), "d": (240, 200, 80)},
        "body": [
            ".o.o",
            "..o..........ooo",
            ".ooo......ooosssoo",
            "oaeao...oossdssdso",
            "daaao..ossdssdssso",
            ".oaaaooossssdssdso",
            "..oaaaaaossdssssso",
            "..oaaaaaaossdssdso",
            "...oaaaaaoossssoo",
            "....okkkko.oooo",
        ],
        "legs": legs(18, [5, 7], [4, 7], [5, 8], "odo"),
    },
    "Snail": {
        "label": "Csiga",
        "colors": {"a": (200, 220, 180), "s": (200, 140, 90), "d": (150, 90, 50)},
        "body": [
            "......oooo",
            ".....osssso",
            "....osddddso",
            "....osdsssdo",
            "o.o.osdsdsdo",
            "oaoaosddsso",
            "oeaaoossso",
            ".oaaaaaaaaaoo",
            "..ooooooooooo",
        ],
        "legs": STILL,
    },
    "Ladybug": {
        "label": "Katica",
        "colors": {"a": (220, 50, 50), "d": (30, 30, 36)},
        "body": [
            "....oo",
            "...oddo",
            "..oooooo",
            ".oaaoaaao",
            ".oadoadao",
            "oaaaoaaaao",
            "oadaoadaao",
            ".oaaoaaao",
            "..oooooo",
        ],
        "legs": legs(10, [2, 5, 7], [1, 4, 8], [3, 5, 6], "o"),
    },
    "Butterfly": {
        "label": "Pillangó",
        "colors": {"a": (240, 150, 50), "d": (40, 30, 30), "s": (250, 200, 80)},
        "body": [
            "oo...o...oo",
            "oaao.o.oaao",
            "oadaooooado",
            "oaaaaoaaaao",
            ".oaaaoaaao",
            "..osooosso",
            ".ossoooosso",
            ".oso.o.oso",
            "..o.....o",
        ],
        "legs": STILL,
    },
    "Bee": {
        "label": "Méh",
        "colors": {"a": (250, 210, 60), "d": (40, 34, 30), "s": (220, 240, 250)},
        "body": [
            "....oo.oo",
            "...osooso",
            "...oosso",
            ".ooaadaadao",
            "oeaadaadaado",
            "oaaadaadaaod",
            ".ooaadaadao",
            "...ooooooo",
        ],
        "legs": legs(12, [3, 6], [2, 6], [3, 7], "o"),
    },
    "Spider": {
        "label": "Pók",
        "colors": {"a": (60, 56, 70)},
        "body": [
            "o.o.oooo.o.o",
            ".o.oaaaao.o.",
            "oooaaaaaaooo",
            "..oaeaaeao",
            "oooaaaaaaooo",
            ".o.oaaaao.o.",
            "o.o.oooo.o.o",
        ],
        "legs": STILL,
    },
    "Crab": {
        "label": "Rák",
        "colors": {"a": (230, 90, 60)},
        "body": [
            "oo........oo",
            "oao......oao",
            "oaao.oo.oaao",
            ".oo.oeeo.oo",
            ".oooaaaaooo",
            "..oaaaaaao",
            ".oaaaaaaaao",
            "..oooooooo",
        ],
        "legs": legs(12, [1, 4, 7, 10], [0, 3, 8, 11], [2, 5, 6, 9], "o"),
    },
    "Octopus": {
        "label": "Polip",
        "colors": {"a": (190, 100, 200)},
        "body": [
            "...oooo",
            "..oaaaao",
            ".oaaaaaao",
            ".oaeaaeao",
            ".oaaaaaao",
            "..oaaaao",
            "..oaoaoao",
            ".oaoaoaoao",
            ".o.o.o.o.o",
        ],
        "legs": STILL,
    },
    "Goldfish": {
        "label": "Aranyhal",
        "colors": {"a": (250, 140, 40)},
        "body": [
            "....ooo",
            "..ooaaaoo.oo",
            ".oaaaaaaaoao",
            "oeaaaaaaaaao",
            "oaaaaaaaaoao",
            ".oaaaaaaaoao",
            "..ooaaaoo.oo",
            "....ooo",
        ],
        "legs": STILL,
    },
}

# Színváltozatok: forrásállat → (új név, régi szín → új szín).
RECOLORS = {
    "BrownHen": (
        "Chicken",
        {
            (255, 255, 255): (196, 120, 64),
            (249, 230, 207): (150, 86, 46),
        },
    ),
    "BrownCow": (
        "Cow",
        {
            (246, 202, 159): (150, 96, 60),
            (230, 156, 105): (112, 68, 42),
            (249, 230, 207): (190, 132, 90),
        },
    ),
    "Boar": (
        "Pig",
        {
            (249, 164, 169): (132, 96, 74),
            (246, 129, 135): (98, 68, 52),
            (200, 80, 134): (70, 46, 36),
        },
    ),
    "BlackSheep": (
        "Sheep",
        {
            (255, 255, 255): (84, 84, 96),
            (214, 214, 214): (58, 58, 70),
        },
    ),
}


def frame(spec: dict, legs: int, blink: bool, bob: int) -> Image.Image:
    """Egy 32×32-es kocka: test + lábak, alatta árnyék, a lábak a 22. soron."""
    palette = {"o": OUTLINE, **{k: (*v, 255) for k, v in spec["colors"].items()}}
    rows = spec["body"] + [spec["legs"][legs]]
    width = max(len(row) for row in rows)
    rows = [row.ljust(width, ".") for row in rows]
    image = Image.new("RGBA", (32, 32))
    left = 16 - width // 2
    top = 23 - len(rows) + bob
    for x in range(left + 2, left + width - 1):
        image.putpixel((x, 23), SHADOW)
    for y, row in enumerate(rows):
        for x, char in enumerate(row):
            if char == ".":
                continue
            if char == "e":
                char = spec.get("blink", "a") if blink else "o"
            # A lábak sora nem mozdul a test billegésével.
            py = 22 if y == len(rows) - 1 else top + y
            # A közös lábminta 'b'-je: ha nincs ilyen szín, a sötétebb ('k') vagy az alap.
            color = palette.get(char) or palette.get("k") or palette["a"]
            image.putpixel((left + x, py), color)
    return image


def draw(name: str, spec: dict) -> None:
    sheet = Image.new("RGBA", (64, 64))
    sheet.alpha_composite(frame(spec, 0, False, 0), (0, 0))
    sheet.alpha_composite(frame(spec, 0, True, 0), (32, 0))
    sheet.alpha_composite(frame(spec, 1, False, -1), (0, 32))
    sheet.alpha_composite(frame(spec, 2, False, 0), (32, 32))
    save(name, sheet)


def recolor(name: str, source: str, mapping: dict) -> None:
    sheet = Image.open(ROOT / source / f"{source}.png").convert("RGBA")
    pixels = sheet.load()
    for y in range(sheet.height):
        for x in range(sheet.width):
            r, g, b, a = pixels[x, y]
            if a == 255 and (r, g, b) in mapping:
                pixels[x, y] = (*mapping[(r, g, b)], 255)
    save(name, sheet)


def save(name: str, sheet: Image.Image) -> None:
    folder = ROOT / name
    folder.mkdir(parents=True, exist_ok=True)
    sheet.save(folder / f"{name}.png")
    print(f"kész: {folder / name}.png")


if __name__ == "__main__":
    for name, spec in {**MORE, **WILD}.items():
        if "like" in spec:
            spec = {**ANIMALS[spec["like"]], "colors": spec["colors"]}
        ANIMALS[name] = spec
    for name, spec in ANIMALS.items():
        widths = {len(row) for row in spec["body"] + spec["legs"]}
        assert max(widths) <= 30, f"{name}: túl széles"
        assert len(spec["body"]) + 1 <= 22, f"{name}: túl magas"
        draw(name, spec)
    for name, (source, mapping) in RECOLORS.items():
        recolor(name, source, mapping)

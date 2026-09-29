from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path("assets/championships")
OWEN = ROOT / "Owen"
PLATES = Image.open(OWEN / "Plates.png").convert("RGBA")
OUT = ROOT


def crop_plate(box):
    return PLATES.crop(box)


CENTER = crop_plate((760, 54, 1294, 656))
LEFT_SIDE = crop_plate((470, 206, 750, 496))
RIGHT_SIDE = crop_plate((1298, 206, 1582, 496))


def contain(image, size):
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy


def heart(draw, x, y, size, fill):
    r = size / 4
    draw.ellipse((x - r * 2, y - r, x, y + r), fill=fill)
    draw.ellipse((x, y - r, x + r * 2, y + r), fill=fill)
    draw.polygon(
        [(x - r * 2, y), (x + r * 2, y), (x, y + size * 0.55)],
        fill=fill,
    )


def strap_mask(width, height):
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    points = [
        (24, 157),
        (120, 132),
        (290, 119),
        (357, 108),
        (390, 72),
        (510, 72),
        (543, 108),
        (610, 119),
        (780, 132),
        (876, 157),
        (858, 293),
        (758, 305),
        (610, 300),
        (544, 312),
        (512, 346),
        (388, 346),
        (356, 312),
        (290, 300),
        (142, 305),
        (42, 293),
    ]
    draw.polygon(points, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(0.5))


def make_belt(name, strap_color, accent_color, heart_color):
    width, height = 900, 420
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    mask = strap_mask(width, height)

    shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(12)))
    image.alpha_composite(shadow, (0, 18))

    strap = Image.new("RGBA", (width, height), strap_color)
    strap.putalpha(mask)
    image.alpha_composite(strap)

    draw = ImageDraw.Draw(image)
    upper_edge = [
        (44, 166),
        (130, 146),
        (294, 134),
        (370, 122),
        (404, 88),
        (496, 88),
        (530, 122),
        (606, 134),
        (770, 146),
        (856, 166),
    ]
    lower_edge = [
        (56, 284),
        (150, 290),
        (290, 286),
        (362, 297),
        (402, 333),
        (498, 333),
        (538, 297),
        (610, 286),
        (750, 290),
        (844, 284),
    ]
    outline_points = upper_edge + lower_edge[::-1]
    draw.line(outline_points + [outline_points[0]], fill=accent_color, width=5, joint="curve")
    draw.line(outline_points + [outline_points[0]], fill=(24, 16, 18, 170), width=2, joint="curve")

    def place_hearts(points, y_offset):
        for left, right in zip(points, points[1:]):
            distance = ((right[0] - left[0]) ** 2 + (right[1] - left[1]) ** 2) ** 0.5
            steps = max(1, int(distance // 24))
            for step in range(steps):
                t = (step + 0.5) / steps
                x = left[0] + (right[0] - left[0]) * t
                y = left[1] + (right[1] - left[1]) * t + y_offset
                if 342 < x < 558:
                    continue
                heart(draw, x, y, 12, heart_color)

    place_hearts(upper_edge, 10)
    place_hearts(lower_edge, -10)

    center = contain(CENTER, (280, 315))
    left = contain(LEFT_SIDE, (150, 155))
    right = contain(RIGHT_SIDE, (150, 155))

    def paste_plate(plate, center_xy):
        plate_shadow = Image.new("RGBA", plate.size, (0, 0, 0, 0))
        plate_shadow.putalpha(plate.getchannel("A").filter(ImageFilter.GaussianBlur(6)))
        image.alpha_composite(plate_shadow, (center_xy[0] - plate.width // 2 + 6, center_xy[1] - plate.height // 2 + 8))
        image.alpha_composite(plate, (center_xy[0] - plate.width // 2, center_xy[1] - plate.height // 2))

    paste_plate(left, (230, 215))
    paste_plate(center, (450, 214))
    paste_plate(right, (670, 215))

    image.save(OUT / name)


make_belt(
    "aew-owen-hart-cup-women.png",
    strap_color=(192, 48, 132, 255),
    accent_color=(34, 21, 30, 255),
    heart_color=(14, 14, 16, 230),
)
make_belt(
    "aew-owen-hart-cup-men.png",
    strap_color=(18, 18, 21, 255),
    accent_color=(195, 48, 132, 255),
    heart_color=(217, 56, 151, 235),
)

print("Built Owen Hart Cup belt assets")

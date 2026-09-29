from pathlib import Path

from PIL import Image


ROOT = Path("assets/championships")
FILES = [
    "wcw-world-heavyweight.webp",
    "wcw-united-states-heavyweight.webp",
    "wcw-cruiserweight.webp",
    "wcw-tag-team.webp",
    "wcw-television.webp",
    "wcw-hardcore.webp",
    "wcw-six-man-tag.webp",
    "wcw-us-tag.webp",
    "wcw-light-heavyweight.webp",
    "wcw-womens.webp",
    "wcw-womens-cruiserweight.webp",
]
TRANSPARENT_BACKGROUND = {
    "wcw-united-states-heavyweight.webp",
    "wcw-cruiserweight.webp",
}


def remove_white_background(image):
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if r > 235 and g > 235 and b > 235:
                pixels[x, y] = (r, g, b, 0)


for name in FILES:
    source = ROOT / name
    image = Image.open(source).convert("RGBA")
    if name in TRANSPARENT_BACKGROUND:
        remove_white_background(image)

    output = ROOT / f"{source.stem}.png"
    image.save(output, optimize=True)
    print(f"{output} {image.width}x{image.height}")

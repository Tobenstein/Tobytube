from pathlib import Path

from PIL import Image


SOURCE = Path("assets/logos/fb-logo-source.jpg")
OUTPUT_DIR = Path("assets/logos/composite")

CROPS = {
    "ajpw": (25, 35, 220, 190),
    "progress": (450, 20, 650, 180),
    "gcw": (645, 675, 850, 790),
    "revpro": (870, 650, 1055, 840),
    "mlw": (215, 275, 415, 360),
    "noah": (25, 240, 195, 395),
    "nwa": (645, 235, 835, 355),
    "pwg": (875, 245, 1045, 400),
    "tna-impact": (450, 245, 640, 360),
    "stardom": (20, 450, 190, 570),
    "njpw": (235, 445, 420, 625),
    "wwe": (420, 435, 645, 630),
    "aew": (660, 445, 850, 590),
    "roh": (860, 450, 1055, 580),
    "dragon-gate": (30, 665, 185, 840),
    "aaa": (220, 685, 420, 785),
    "cmll": (440, 690, 630, 790),
    "tjpw": (220, 905, 415, 980),
    "wxw": (870, 900, 1070, 985),
}


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    image = Image.open(SOURCE)
    for slug, box in CROPS.items():
        crop = image.crop(box)
        crop.save(OUTPUT_DIR / f"{slug}.png")
    print(f"Wrote {len(CROPS)} cropped logos to {OUTPUT_DIR}.")


if __name__ == "__main__":
    main()

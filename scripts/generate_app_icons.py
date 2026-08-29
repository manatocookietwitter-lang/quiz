"""Generate Quiz Make PWA and native icon assets from the approved master image."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "public" / "icons" / "quiz-make-pencil-master.png"
WHITE = (255, 255, 255, 255)


def load_square_master() -> Image.Image:
    source = Image.open(MASTER_PATH).convert("RGBA")
    side = min(source.size)
    left = (source.width - side) // 2
    top = (source.height - side) // 2
    return source.crop((left, top, left + side, top + side))


def save_resized(source: Image.Image, path: Path, size: int, *, rgb: bool = False) -> None:
    output = source.resize((size, size), Image.Resampling.LANCZOS)
    if rgb:
        background = Image.new("RGB", output.size, "white")
        background.paste(output, mask=output.getchannel("A"))
        output = background
    path.parent.mkdir(parents=True, exist_ok=True)
    output.save(path, format="PNG", optimize=True)


def save_centered(source: Image.Image, path: Path, size: int, scale: float, *, transparent: bool) -> None:
    background = (0, 0, 0, 0) if transparent else WHITE
    canvas = Image.new("RGBA", (size, size), background)
    icon_size = max(1, round(size * scale))
    icon = source.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    offset = ((size - icon_size) // 2, (size - icon_size) // 2)
    canvas.alpha_composite(icon, offset)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, format="PNG", optimize=True)


def update_splash(source: Image.Image, path: Path) -> None:
    with Image.open(path) as current:
        width, height = current.size
    canvas = Image.new("RGBA", (width, height), WHITE)
    icon_size = round(min(width, height) * 0.34)
    icon = ImageOps.contain(source, (icon_size, icon_size), Image.Resampling.LANCZOS)
    offset = ((width - icon.width) // 2, (height - icon.height) // 2)
    canvas.alpha_composite(icon, offset)
    canvas.convert("RGB").save(path, format="PNG", optimize=True)


def main() -> None:
    master = load_square_master()
    public_icons = ROOT / "public" / "icons"
    save_resized(master, public_icons / "quiz-make-icon-1024.png", 1024, rgb=True)
    save_resized(master, public_icons / "icon-192.png", 192, rgb=True)
    save_resized(master, public_icons / "icon-512.png", 512, rgb=True)
    save_centered(master, public_icons / "maskable-512.png", 512, 0.80, transparent=False)

    ios_icon = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png"
    save_resized(master, ios_icon, 1024, rgb=True)

    android_res = ROOT / "android" / "app" / "src" / "main" / "res"
    legacy_sizes = {
        "mipmap-ldpi": 36,
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    foreground_sizes = {
        "mipmap-ldpi": 81,
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }
    for directory, size in legacy_sizes.items():
        for filename in ("ic_launcher.png", "ic_launcher_round.png"):
            save_resized(master, android_res / directory / filename, size, rgb=True)
    for directory, size in foreground_sizes.items():
        save_centered(master, android_res / directory / "ic_launcher_foreground.png", size, 0.74, transparent=True)

    ios_splash = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "Splash.imageset"
    for path in ios_splash.glob("*.png"):
        update_splash(master, path)
    for path in android_res.glob("drawable*/splash.png"):
        update_splash(master, path)


if __name__ == "__main__":
    main()

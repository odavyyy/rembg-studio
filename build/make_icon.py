"""Gera build/icon.ico (quadriculado de transparencia com borda roxa)."""
from PIL import Image, ImageDraw

S = 512
base = Image.new("RGBA", (S, S), (28, 31, 37, 255))
d = ImageDraw.Draw(base)
c = 64
for y in range(0, S, c):
    for x in range(0, S, c):
        if (x // c + y // c) % 2 == 0:
            d.rectangle([x, y, x + c - 1, y + c - 1], fill=(58, 62, 74, 255))
d.ellipse([176, 96, 336, 256], fill=(146, 133, 255, 255))
d.pieslice([96, 270, 416, 600], 180, 360, fill=(146, 133, 255, 255))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([8, 8, S - 9, S - 9], 110, fill=255)
out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
out.paste(base, (0, 0), mask)
ImageDraw.Draw(out).rounded_rectangle([16, 16, S - 17, S - 17], 102, outline=(124, 108, 255, 255), width=18)
out.resize((256, 256), Image.LANCZOS).save("build/icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])

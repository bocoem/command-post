"""Command Board app icon (1024x1024), drawn 4x and scaled down."""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 4
W = 1024 * S
F = "/tmp/fonts/bc{}.ttf"
NAVY_T, NAVY_B = (19, 41, 72), (6, 14, 26)
GOLD = (253, 184, 51)
RED = (208, 33, 41)
INDIGO = (46, 49, 146)
PAPER = (245, 243, 238)
INK = (14, 32, 51)
MAPBG = (226, 232, 238)
ROAD = (255, 255, 255)
GREEN = (46, 160, 92)


def s(v):
    return int(round(v * S))


def box(x0, y0, x1, y1):
    return [s(x0), s(y0), s(x1), s(y1)]


# background gradient
bg = Image.new("RGB", (W, W))
px = ImageDraw.Draw(bg)
for y in range(W):
    t = y / (W - 1)
    c = tuple(int(NAVY_T[i] + (NAVY_B[i] - NAVY_T[i]) * t) for i in range(3))
    px.line([(0, y), (W, y)], fill=c)
img = bg.convert("RGBA")

# board geometry
BX0, BY0, BX1, BY1 = 156, 110, 868, 600
R = 46

# shadow
sh = Image.new("RGBA", (W, W), (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle(box(BX0 + 8, BY0 + 22, BX1 + 8, BY1 + 26), s(R), fill=(0, 0, 0, 150))
sh = sh.filter(ImageFilter.GaussianBlur(s(18)))
img.alpha_composite(sh)

d = ImageDraw.Draw(img)
# board body + header
d.rounded_rectangle(box(BX0, BY0, BX1, BY1), s(R), fill=PAPER)
HY = 186
d.rounded_rectangle(box(BX0, BY0, BX1, HY + R), s(R), fill=RED)
d.rectangle(box(BX0, HY, BX1, HY + R + 2), fill=PAPER)

# header: Maltese cross (simple) + title bars + status dots
cx, cy, r = BX0 + 58, (BY0 + HY) / 2, 26
d.ellipse(box(cx - r - 6, cy - r - 6, cx + r + 6, cy + r + 6), fill=(255, 255, 255))
import math
for ang in (0, 90, 180, 270):
    a = math.radians(ang)
    ux, uy = math.cos(a), math.sin(a)      # outward
    vx, vy = -uy, ux                        # across
    def P(o, w):
        return (s(cx + ux * o + vx * w), s(cy + uy * o + vy * w))
    d.polygon([P(4, -5), P(27, -15), P(21, 0), P(27, 15), P(4, 5)], fill=RED)
d.ellipse(box(cx - 6, cy - 6, cx + 6, cy + 6), fill=RED)
d.rounded_rectangle(box(BX0 + 110, cy - 15, BX0 + 330, cy - 1), s(7), fill=(255, 255, 255))
d.rounded_rectangle(box(BX0 + 110, cy + 7, BX0 + 250, cy + 19), s(6), fill=(255, 210, 210))
for i, c in enumerate((GOLD, (255, 255, 255))):
    x = BX1 - 52 - i * 40
    d.ellipse(box(x - 12, cy - 12, x + 12, cy + 12), fill=c)

# map panel (left)
MX0, MY0, MX1, MY1 = BX0 + 30, HY + 28, BX0 + 450, BY1 - 30
d.rounded_rectangle(box(MX0, MY0, MX1, MY1), s(22), fill=MAPBG)
mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle(box(MX0, MY0, MX1, MY1), s(22), fill=255)
layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
ld = ImageDraw.Draw(layer)
ld.line([(s(MX0 - 20), s(MY0 + 250)), (s(MX1 + 20), s(MY0 + 170))], fill=ROAD, width=s(30))
ld.line([(s(MX0 + 300), s(MY0 - 20)), (s(MX0 + 250), s(MY1 + 20))], fill=ROAD, width=s(24))
# hot zone circle
ld.ellipse(box(MX0 + 70, MY0 + 40, MX0 + 290, MY0 + 260), fill=(208, 33, 41, 46), outline=(208, 33, 41, 200), width=s(5))
# building
bx, by = MX0 + 135, MY0 + 105
ld.rectangle(box(bx, by, bx + 90, by + 90), fill=(52, 68, 90))
ld.rectangle(box(bx, by + 84, bx + 90, by + 90), fill=GOLD)
img.paste(Image.alpha_composite(img.crop((0, 0, W, W)), layer), (0, 0), mask)
d = ImageDraw.Draw(img)
# unit markers on map
def unit(x, y, c, w=46, h=30):
    d.rounded_rectangle(box(x - w / 2, y - h / 2, x + w / 2, y + h / 2), s(7), fill=c, outline=(255, 255, 255), width=s(4))
unit(MX0 + 95, MY0 + 230, RED)
unit(MX0 + 330, MY0 + 95, RED)
unit(MX0 + 360, MY0 + 210, INDIGO)
# command post flag
fx, fy = MX0 + 330, MY0 + 300
d.rectangle(box(fx - 3, fy - 62, fx + 4, fy + 8), fill=INK)
d.polygon([(s(fx + 4), s(fy - 62)), (s(fx + 60), s(fy - 47)), (s(fx + 4), s(fy - 32))], fill=GREEN)
# incident pin over building
px0, py0 = bx + 45, by - 12
d.ellipse(box(px0 - 34, py0 - 84, px0 + 34, py0 - 16), fill=GOLD, outline=INK, width=s(5))
d.polygon([(s(px0 - 26), s(py0 - 38)), (s(px0 + 26), s(py0 - 38)), (s(px0), s(py0 + 10))], fill=GOLD)
d.line([(s(px0 - 26), s(py0 - 38)), (s(px0), s(py0 + 10)), (s(px0 + 26), s(py0 - 38))], fill=INK, width=s(5))
d.ellipse(box(px0 - 12, py0 - 62, px0 + 12, py0 - 38), fill=INK)

# unit column (right)
CX0, CX1 = MX1 + 26, BX1 - 30
rows = [(RED, "E"), (RED, "T"), (INDIGO, "M"), (GOLD, "B")]
y = MY0
rh = (MY1 - MY0 - 3 * 16) / 4
for c, _ in rows:
    d.rounded_rectangle(box(CX0, y, CX1, y + rh), s(16), fill=(255, 255, 255), outline=(214, 219, 226), width=s(3))
    d.rounded_rectangle(box(CX0, y, CX0 + 30, y + rh), s(16), fill=c)
    d.rectangle(box(CX0 + 16, y, CX0 + 30, y + rh), fill=c)
    d.rounded_rectangle(box(CX0 + 50, y + rh * 0.30, CX1 - 40, y + rh * 0.30 + 16), s(8), fill=INK)
    d.rounded_rectangle(box(CX0 + 50, y + rh * 0.58, CX1 - 100, y + rh * 0.58 + 12), s(6), fill=(178, 188, 200))
    y += rh + 16

# text
def text_center(t, size, weight, y, fill, track=0):
    f = ImageFont.truetype(F.format(weight), s(size))
    chars = list(t)
    widths = [d.textlength(ch, font=f) for ch in chars]
    total = sum(widths) + s(track) * (len(chars) - 1)
    x = (W - total) / 2
    for ch, w in zip(chars, widths):
        d.text((x, s(y)), ch, font=f, fill=fill, anchor="ls")
        x += w + s(track)

text_center("COMMAND", 214, 900, 838, GOLD, track=4)
text_center("BOARD", 108, 800, 948, (255, 255, 255), track=40)

out = img.convert("RGB").resize((1024, 1024), Image.LANCZOS)
out.save(sys.argv[1] if len(sys.argv) > 1 else "/home/claude/icon/cb_icon_1024.png")
print("saved")

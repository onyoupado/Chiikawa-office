"""치이카와 세탁기 애플워치(40mm, 324x394) GIF 생성기.

    python3 watch/make_gif.py --font 경로/Jua-Regular.ttf

4배 크기로 그린 뒤 줄여서 테두리가 깨지지 않게 만든다.
"""
import argparse
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 324, 394          # Apple Watch 40mm 화면 픽셀
SS = 4                   # 슈퍼샘플링 배율
FRAMES = 36              # 한 바퀴 프레임 수
DELAY = 50               # 프레임당 ms (36 x 50ms = 1.8초에 한 바퀴)

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "img")

CHARS = [
    ("chiikawa", "치이카와", (255, 182, 193)),
    ("hachiware", "하치와레", (150, 190, 230)),
    ("usagi", "우사기", (250, 215, 120)),
    ("momonga", "모몽가", (170, 215, 240)),
    ("rakko", "랏코", (200, 170, 140)),
    ("kurimanju", "쿠리만쥬", (210, 160, 110)),
    ("shisa", "시사", (240, 160, 100)),
]

BG = (24, 26, 34)
BODY = (250, 247, 240)
BODY_SHADE = (226, 221, 210)
DOOR_RING = (200, 205, 215)
DOOR_RING_DARK = (150, 156, 170)
GLASS_BACK = (40, 70, 110)
WATER = (90, 170, 230)
WATER_TOP = (150, 210, 245)

# 세탁기 문 위치 (원래 해상도 기준)
CX, CY, R_DOOR = W / 2, 238, 128
R_GLASS = 104


def s(v):
    return int(round(v * SS))


def load_char(name, size):
    im = Image.open(os.path.join(IMG, name + ".png")).convert("RGBA")
    k = size * SS / max(im.size)
    return im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)


def rounded(draw, box, r, **kw):
    draw.rounded_rectangle([s(box[0]), s(box[1]), s(box[2]), s(box[3])], radius=s(r), **kw)


def circle(draw, cx, cy, r, **kw):
    draw.ellipse([s(cx - r), s(cy - r), s(cx + r), s(cy + r)], **kw)


def draw_body(base, accent):
    d = ImageDraw.Draw(base)
    # 세탁기 몸통
    rounded(d, (6, 4, W - 6, H - 4), 46, fill=BODY)
    rounded(d, (6, 100, W - 6, H - 4), 46, fill=BODY)
    # 조작부와 문 영역 경계선
    d.line([s(26), s(100), s(W - 26), s(100)], fill=BODY_SHADE, width=s(2))
    # 조작부 램프와 다이얼 (문 아래 양쪽 모서리, 위쪽 정보 영역은 비워 둔다)
    circle(d, 30, H - 30, 6, fill=accent)
    circle(d, 46, H - 30, 6, fill=(200, 230, 200))
    circle(d, W - 36, H - 34, 13, fill=BODY_SHADE)
    circle(d, W - 36, H - 34, 9, fill=(238, 234, 226))
    d.line([s(W - 36), s(H - 34), s(W - 36), s(H - 42)], fill=(150, 145, 140), width=s(3))
    # 문 테두리
    circle(d, CX, CY + 3, R_DOOR, fill=BODY_SHADE)
    circle(d, CX, CY, R_DOOR, fill=DOOR_RING)
    circle(d, CX, CY, R_DOOR - 10, fill=DOOR_RING_DARK)
    circle(d, CX, CY, R_GLASS + 4, fill=(110, 116, 130))
    # 문 손잡이
    rounded(d, (CX + R_DOOR - 14, CY - 26, CX + R_DOOR + 2, CY + 26), 8, fill=(180, 186, 198))


def glass_layer(t, char_img, sock_col, rng_seed):
    """둥근 유리창 안쪽(드럼, 물, 거품, 캐릭터)을 그린다. t = 0..1 진행도."""
    D = s(R_GLASS * 2)
    g = Image.new("RGBA", (D, D), GLASS_BACK + (255,))
    gd = ImageDraw.Draw(g)
    c = D / 2
    ang = t * 2 * math.pi

    # 드럼 구멍 무늬 (회전)
    for ring, n in ((0.82, 18), (0.58, 12), (0.34, 7)):
        for i in range(n):
            a = ang + i * 2 * math.pi / n
            x, y = c + math.cos(a) * c * ring, c + math.sin(a) * c * ring
            r = s(2.6)
            gd.ellipse([x - r, y - r, x + r, y + r], fill=(60, 95, 140))
    # 드럼 날개 3개
    for i in range(3):
        a = ang + i * 2 * math.pi / 3
        x, y = c + math.cos(a) * c * 0.93, c + math.sin(a) * c * 0.93
        gd.ellipse([x - s(9), y - s(9), x + s(9), y + s(9)], fill=(75, 110, 155))

    # 물 (물결치는 수면)
    water = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    wd = ImageDraw.Draw(water)
    level = c + s(18)
    pts = []
    for xi in range(0, D + 1, s(2)):
        y = level + math.sin(xi / D * 2 * math.pi * 1.5 - ang * 2) * s(7) \
            + math.sin(xi / D * 2 * math.pi * 0.5 + ang) * s(5) - (xi - c) / D * s(26)
        pts.append((xi, y))
    wd.polygon(pts + [(D, D), (0, D)], fill=WATER + (190,))
    wd.line(pts, fill=WATER_TOP + (255,), width=s(3))

    # 양말 (반대 방향으로 굴러다님)
    sa = ang * 1 + math.pi
    sx, sy = c + math.cos(sa) * c * 0.55, c + math.sin(sa) * c * 0.55
    sock = Image.new("RGBA", (s(40), s(40)), (0, 0, 0, 0))
    sdd = ImageDraw.Draw(sock)
    sdd.rounded_rectangle([s(12), s(4), s(24), s(26)], radius=s(5), fill=sock_col)
    sdd.rounded_rectangle([s(12), s(20), s(34), s(32)], radius=s(6), fill=sock_col)
    sdd.rectangle([s(12), s(8), s(24), s(11)], fill=(255, 255, 255))
    sock = sock.rotate(-math.degrees(ang * 2), resample=Image.BICUBIC)
    g.alpha_composite(sock, (int(sx - sock.width / 2), int(sy - sock.height / 2)))

    # 캐릭터: 드럼과 함께 원을 그리며 돌고, 몸도 데굴데굴 회전
    orbit = c * 0.30
    px = c + math.cos(ang - math.pi / 2) * orbit
    py = c + math.sin(ang - math.pi / 2) * orbit
    rot = char_img.rotate(-math.degrees(ang), resample=Image.BICUBIC, expand=True)
    g.alpha_composite(rot, (int(px - rot.width / 2), int(py - rot.height / 2)))

    # 물은 캐릭터 앞쪽에 반투명하게 덮어 '잠긴' 느낌
    g = Image.alpha_composite(g, water)
    gd = ImageDraw.Draw(g)

    # 거품
    rng = random.Random(rng_seed)
    for i in range(16):
        bx = rng.uniform(0.08, 0.92) * D
        speed = rng.uniform(0.6, 1.4)
        phase = rng.random()
        prog = (t * speed * 2 + phase) % 1.0
        by = D * (0.95 - prog * 0.9)
        bx += math.sin(prog * 6 + i) * s(6)
        br = s(rng.uniform(3, 8)) * (0.6 + prog * 0.6)
        gd.ellipse([bx - br, by - br, bx + br, by + br], outline=(255, 255, 255, 220), width=s(1.5),
                   fill=(255, 255, 255, 50))
        gd.ellipse([bx - br * 0.45, by - br * 0.6, bx - br * 0.05, by - br * 0.2], fill=(255, 255, 255, 200))

    # 유리 반사광
    shine = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shine)
    sd.arc([s(14), s(14), D - s(14), D - s(14)], 200, 250, fill=(255, 255, 255, 150), width=s(7))
    sd.arc([s(26), s(26), D - s(26), D - s(26)], 205, 230, fill=(255, 255, 255, 90), width=s(4))
    g = Image.alpha_composite(g, shine)

    # 원형 마스크
    mask = Image.new("L", (D, D), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, D - 1, D - 1], fill=255)
    out = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    out.paste(g, (0, 0), mask)
    return out


def draw_sun(d, cx, cy, r):
    col = (245, 180, 60)
    for i in range(8):
        a = i * math.pi / 4
        d.line([s(cx + math.cos(a) * r * 1.35), s(cy + math.sin(a) * r * 1.35),
                s(cx + math.cos(a) * r * 1.85), s(cy + math.sin(a) * r * 1.85)], fill=col, width=s(1.6))
    circle(d, cx, cy, r, fill=col)


def draw_info(img, font_path, info):
    """날짜·요일·시간·날씨를 위쪽 조작부 자리에 그린다 (원래 해상도 기준 좌표).

    Jua 폰트에 °와 · 글자가 없어서 도 기호와 해 아이콘은 직접 그린다.
    """
    d = ImageDraw.Draw(img)
    f_time = ImageFont.truetype(font_path, s(46))
    f_small = ImageFont.truetype(font_path, s(16))
    ink, sub = (70, 64, 60), (125, 116, 108)
    d.text((s(CX), s(38)), info["time"], font=f_time, fill=ink, anchor="mm")

    # 아랫줄: "10월 20일 화요일   (해) 맑음 18°"
    date_txt, wx_txt, temp_txt = info["date"], info["weather"], info["temp"]
    gap, icon_w, deg_w = 12, 18, 6
    w_date = d.textlength(date_txt, font=f_small) / SS
    w_wx = d.textlength(wx_txt + " " + temp_txt, font=f_small) / SS
    total = w_date + gap + icon_w + w_wx + deg_w
    x = CX - total / 2
    y = 78
    d.text((s(x), s(y)), date_txt, font=f_small, fill=sub, anchor="lm")
    x += w_date + gap
    draw_sun(d, x + 7, y, 4.2)
    x += icon_w
    d.text((s(x), s(y)), wx_txt + " " + temp_txt, font=f_small, fill=sub, anchor="lm")
    x += w_wx
    circle(d, x + 3, y - 5, 2.2, outline=sub, width=s(1.4))


def render(name, accent, font_path=None, info=None, char_size=96):
    char_img = load_char(name, char_size)
    seed = sum(map(ord, name))
    frames = []
    for i in range(FRAMES):
        t = i / FRAMES
        canvas = Image.new("RGBA", (s(W), s(H)), BG + (255,))
        draw_body(canvas, accent)
        if font_path and info:
            draw_info(canvas, font_path, info)
        glass = glass_layer(t, char_img, accent, seed)
        canvas.alpha_composite(glass, (s(CX - R_GLASS), s(CY - R_GLASS)))
        frames.append(canvas.resize((W, H), Image.LANCZOS).convert("RGB"))
    return frames


def save_gif(frames, path):
    # 전체 프레임 공통 팔레트로 양자화해 색 번짐(깜빡임)을 줄인다
    strip = Image.new("RGB", (W, H * len(frames)))
    for i, f in enumerate(frames):
        strip.paste(f, (0, H * i))
    pal = strip.quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE)
    q = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
    q[0].save(path, save_all=True, append_images=q[1:], duration=DELAY, loop=0, optimize=False, disposal=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", required=True, help="한글 폰트 경로 (예: Jua-Regular.ttf)")
    ap.add_argument("--out", default=os.path.join(HERE, "gif"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    sample = {"time": "10:09", "date": "10월 20일 화요일", "weather": "맑음", "temp": "18"}

    preview = []
    for name, _label, accent in CHARS:
        # 워치 페이스용: 위쪽을 비워 워치가 실제 시간·날짜·날씨를 띄우게 한다
        frames = render(name, accent)
        save_gif(frames, os.path.join(a.out, f"{name}.gif"))
        # 미리보기용: 예시 정보가 찍힌 버전을 캐릭터마다 한 바퀴씩 이어 붙인다
        info_frames = render(name, accent, a.font, sample)
        preview += info_frames
        print("saved", name)
    save_gif(preview, os.path.join(a.out, "preview_all.gif"))
    preview[0].save(os.path.join(a.out, "preview_still.png"))


if __name__ == "__main__":
    main()

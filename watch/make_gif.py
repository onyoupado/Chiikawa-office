"""치이카와 세탁기 애플워치(40mm, 324x394) GIF 생성기.

세탁기 문을 가까이서 찍은 것처럼, 유리창 안에서 커다란 인형이
물·거품과 함께 데굴데굴 굴러가는 장면을 만든다.

    python3 watch/make_gif.py --font 경로/Jua-Regular.ttf

4배 크기로 그린 뒤 줄여서 테두리가 깨지지 않게 만든다.
"""
import argparse
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont

W, H = 324, 394          # Apple Watch 40mm 화면 픽셀
SS = 4                   # 슈퍼샘플링 배율
FRAMES = 40              # 한 바퀴 프레임 수
DELAY = 55               # 프레임당 ms (40 x 55ms = 2.2초에 한 바퀴)

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "img")

CHARS = [
    ("chiikawa", "치이카와"),
    ("hachiware", "하치와레"),
    ("usagi", "우사기"),
    ("momonga", "모몽가"),
    ("rakko", "랏코"),
    ("kurimanju", "쿠리만쥬"),
    ("shisa", "시사"),
]

# 문 유리 (원래 해상도 기준)
GX, GY, GR = W / 2, 222, 148


def s(v):
    return int(round(v * SS))


def ellipse(d, cx, cy, rx, ry=None, **kw):
    ry = rx if ry is None else ry
    d.ellipse([s(cx - rx), s(cy - ry), s(cx + rx), s(cy + ry)], **kw)


def radial(size, inner, outer, center=(0.5, 0.5), power=1.0):
    """크기 size의 원형 그라데이션 RGB 이미지."""
    w, h = size
    small = Image.new("RGB", (128, int(128 * h / w)))
    px = small.load()
    cx, cy = center[0] * small.width, center[1] * small.height
    m = math.hypot(max(cx, small.width - cx), max(cy, small.height - cy))
    for y in range(small.height):
        for x in range(small.width):
            k = min(1.0, (math.hypot(x - cx, y - cy) / m)) ** power
            px[x, y] = tuple(int(inner[i] + (outer[i] - inner[i]) * k) for i in range(3))
    return small.resize(size, Image.BICUBIC)


def load_plush(name, size):
    """캐릭터를 크게 키우고, 유리 너머 젖은 인형처럼 살짝 흐리고 어둡게 만든다."""
    im = Image.open(os.path.join(IMG, name + ".png")).convert("RGBA")
    k = size * SS / max(im.size)
    im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
    rgb, a = im.convert("RGB"), im.getchannel("A")
    rgb = ImageEnhance.Brightness(rgb).enhance(0.95)
    # 살짝 따뜻한 톤 (세탁기 조명)
    tint = Image.new("RGB", rgb.size, (250, 236, 215))
    rgb = Image.blend(rgb, ImageChops.multiply(rgb, tint), 0.5)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.08)
    out = rgb.convert("RGBA")
    out.putalpha(a.filter(ImageFilter.GaussianBlur(SS * 0.6)))
    return out.filter(ImageFilter.GaussianBlur(SS * 0.35))


def build_static():
    """프레임마다 변하지 않는 세탁기 앞면과 유리 위 반사광."""
    front = radial((s(W), s(H)), (215, 218, 222), (70, 72, 78), center=(0.5, 0.55), power=1.6).convert("RGBA")
    d = ImageDraw.Draw(front)
    # 크롬 문 테두리: 여러 겹의 은색 고리
    for r, col in ((GR + 46, (120, 124, 132)), (GR + 40, (232, 234, 238)), (GR + 30, (180, 184, 192)),
                   (GR + 24, (245, 246, 248)), (GR + 14, (150, 154, 162)), (GR + 6, (60, 62, 68))):
        ellipse(d, GX, GY, r, fill=col)
    front = front.filter(ImageFilter.GaussianBlur(SS * 0.8))
    d = ImageDraw.Draw(front)
    # 고리에 비친 밝은 띠
    d.arc([s(GX - GR - 36), s(GY - GR - 36), s(GX + GR + 36), s(GY + GR + 36)], 200, 330,
          fill=(255, 255, 255), width=s(4))
    d.arc([s(GX - GR - 20), s(GY - GR - 20), s(GX + GR + 20), s(GY + GR + 20)], 20, 70,
          fill=(255, 255, 255), width=s(3))

    # 유리 위 반사광 (항상 같은 자리)
    D = s(GR * 2)
    glare = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glare)
    gd.arc([s(10), s(10), D - s(10), D - s(10)], 195, 255, fill=(255, 255, 255, 110), width=s(10))
    gd.arc([s(26), s(26), D - s(26), D - s(26)], 205, 240, fill=(255, 255, 255, 70), width=s(5))
    gd.arc([s(16), s(16), D - s(16), D - s(16)], 15, 50, fill=(255, 255, 255, 60), width=s(6))
    glare = glare.filter(ImageFilter.GaussianBlur(SS * 2.5))
    # 유리 가장자리 어둡게
    edge = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    ImageDraw.Draw(edge).ellipse([0, 0, D - 1, D - 1], outline=(20, 22, 26, 200), width=s(16))
    glare = Image.alpha_composite(edge.filter(ImageFilter.GaussianBlur(SS * 6)), glare)

    mask = Image.new("L", (D, D), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, D - 1, D - 1], fill=255)
    drum_base = radial((D, D), (200, 203, 208), (95, 98, 105), power=1.3).convert("RGBA")
    return front, glare, mask, drum_base


def drum_frame(t, base):
    """스테인리스 드럼(구멍 무늬)과 물·거품. 인형 뒤에 깔리는 층."""
    D = base.width
    c = D / 2
    g = base.copy()
    d = ImageDraw.Draw(g)
    ang = -t * 2 * math.pi * 2   # 드럼은 인형보다 빠르게 돈다
    for ring in (0.92, 0.78, 0.64, 0.50, 0.36):
        n = int(46 * ring)
        for i in range(n):
            a = ang + i * 2 * math.pi / n + ring * 3
            x, y = c + math.cos(a) * c * ring, c + math.sin(a) * c * ring
            r = s(2.2)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(70, 72, 78))
    # 드럼이 돌아서 생기는 번짐
    g = g.filter(ImageFilter.GaussianBlur(SS * 1.6))
    return g


def water_layer(t, D, rng_seed, front):
    """물결·거품 층. front=True면 인형 앞에 덮이는 반투명 층."""
    lay = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    c = D / 2
    ang = -t * 2 * math.pi
    rng = random.Random(rng_seed + (1 if front else 0))
    # 소용돌이치는 물살 (흰 곡선)
    for i in range(7 if front else 5):
        r = c * rng.uniform(0.45, 0.95)
        start = math.degrees(ang * rng.choice((1, 2)) + rng.uniform(0, 6.28))
        span = rng.uniform(40, 110)
        alpha = rng.randint(50, 110) if front else rng.randint(80, 150)
        d.arc([c - r, c - r, c + r, c + r], start, start + span,
              fill=(245, 248, 252, alpha), width=s(rng.uniform(3, 8)))
    if not front:
        # 아래쪽 고인 물과 거품
        level = c + c * 0.35 + math.sin(ang * 2) * s(6)
        pts = [(x, level + math.sin(x / D * 9 + ang * 3) * s(5)) for x in range(0, D + 1, s(3))]
        d.polygon(pts + [(D, D), (0, D)], fill=(150, 160, 170, 120))
        for i in range(40):
            bx = rng.uniform(0.1, 0.9) * D + math.sin(ang * 2 + i) * s(8)
            by = level + rng.uniform(-0.04, 0.2) * D
            br = s(rng.uniform(2, 6))
            d.ellipse([bx - br, by - br, bx + br, by + br], fill=(255, 255, 255, 150))
    return lay.filter(ImageFilter.GaussianBlur(SS * (2.2 if front else 1.5)))


def plush_pose(t):
    """인형의 위치·각도·크기. 원을 그리며 구르다 위로 들렸다 툭 떨어지는 움직임."""
    p = 2 * math.pi * t
    rot = -360 * t + 28 * math.sin(2 * p)               # 데굴데굴 + 덜컹
    ox = 34 * math.sin(p) + 8 * math.sin(3 * p)
    oy = 30 * math.cos(p) - 14 * abs(math.sin(2 * p))   # 들렸다 떨어짐
    scale = 1.0 + 0.07 * math.sin(2 * p + 1)             # 앞뒤로 다가왔다 멀어짐
    return rot, ox, oy, scale


def plush_layer(t, plush, D):
    """인형 층. 빨리 구를수록 조금 더 번지게 해 움직임을 살린다."""
    rot, ox, oy, sc = plush_pose(t)
    speed = abs(plush_pose(t + 1 / FRAMES)[0] - rot)       # 프레임당 회전 각도
    im = plush.resize((int(plush.width * sc), int(plush.height * sc)), Image.BICUBIC)
    im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    lay = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    lay.alpha_composite(im, (int(D / 2 + s(ox) - im.width / 2), int(D / 2 + s(oy) - im.height / 2)))
    return lay.filter(ImageFilter.GaussianBlur(SS * min(1.6, 0.3 + speed / 12)))


def draw_info(img, font_path, info):
    """시간·날짜·요일·날씨를 위쪽에 흰 글씨로 그린다. Jua에 °가 없어 직접 그린다."""
    shade = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    f_time = ImageFont.truetype(font_path, s(50))
    f_small = ImageFont.truetype(font_path, s(16))
    line = f'{info["date"]}   {info["weather"]} {info["temp"]}'
    sd.text((s(GX), s(36)), info["time"], font=f_time, fill=(0, 0, 0, 170), anchor="mm")
    sd.text((s(GX), s(76)), line, font=f_small, fill=(0, 0, 0, 170), anchor="mm")
    img.alpha_composite(shade.filter(ImageFilter.GaussianBlur(SS * 2.2)))
    d = ImageDraw.Draw(img)
    d.text((s(GX), s(36)), info["time"], font=f_time, fill=(255, 255, 255), anchor="mm")
    d.text((s(GX), s(76)), line, font=f_small, fill=(255, 255, 255), anchor="mm")
    right = s(GX) + d.textlength(line, font=f_small) / 2
    r = s(2.2)
    cx, cy = right + s(3.5), s(70)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255), width=s(1.4))


def render(name, static, font_path=None, info=None):
    front, glare, mask, drum_base = static
    plush = load_plush(name, 235)
    seed = sum(map(ord, name))
    D = mask.width
    frames = []
    for i in range(FRAMES):
        t = i / FRAMES
        glass = drum_frame(t, drum_base)
        glass = Image.alpha_composite(glass, water_layer(t, D, seed, front=False))
        glass = Image.alpha_composite(glass, plush_layer(t, plush, D))
        glass = Image.alpha_composite(glass, water_layer(t, D, seed, front=True))
        # 유리 너머라 살짝 뿌옇게
        glass = Image.alpha_composite(glass, Image.new("RGBA", (D, D), (215, 220, 228, 18)))
        glass = Image.alpha_composite(glass, glare)
        canvas = front.copy()
        canvas.paste(glass, (s(GX - GR), s(GY - GR)), mask)
        if font_path and info:
            draw_info(canvas, font_path, info)
        frames.append(canvas.resize((W, H), Image.LANCZOS).convert("RGB"))
    return frames


def save_gif(frames, path):
    # 전체 프레임 공통 팔레트로 양자화해 색 번짐(깜빡임)을 줄인다
    strip = Image.new("RGB", (W, H * len(frames)))
    for i, f in enumerate(frames):
        strip.paste(f, (0, H * i))
    pal = strip.quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE)
    q = [f.quantize(palette=pal, dither=Image.FLOYDSTEINBERG) for f in frames]
    q[0].save(path, save_all=True, append_images=q[1:], duration=DELAY, loop=0, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", required=True, help="한글 폰트 경로 (예: Jua-Regular.ttf)")
    ap.add_argument("--out", default=os.path.join(HERE, "gif"))
    ap.add_argument("--only", help="이 캐릭터만 만들기 (시험용)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    sample = {"time": "10:09", "date": "10월 20일 화요일", "weather": "맑음", "temp": "18"}
    static = build_static()
    preview = []
    for name, _label in CHARS:
        if a.only and name != a.only:
            continue
        # 워치 페이스용: 글자 없이 (워치가 실제 시간·날짜·날씨를 띄운다)
        save_gif(render(name, static), os.path.join(a.out, f"{name}.gif"))
        # 미리보기용: 예시 정보가 찍힌 버전을 캐릭터마다 한 바퀴씩 이어 붙인다
        preview += render(name, static, a.font, sample)
        print("saved", name)
    save_gif(preview, os.path.join(a.out, "preview_all.gif"))
    preview[0].save(os.path.join(a.out, "preview_still.png"))


if __name__ == "__main__":
    main()

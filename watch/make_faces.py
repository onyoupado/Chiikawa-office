"""워치 페이스 이미지 만들기 (Apple Watch 40mm, 324x394).

watch/src 의 원본에 오른쪽 위 패널을 얹어 시간·날짜·날씨가 잘 보이게 한다.
- 세탁기 GIF: 세탁기 터치 패널처럼 어두운 유리판 + 세탁·헹굼·탈수 아이콘
- 일러스트: 뒤가 비치는 반투명 유리판 (흐림 + 살짝 어두운 빛, 흰 시간 글자가 잘 보이게)

    python3 watch/make_faces.py

결과: gif/ (움직이는 GIF), still/ (사진 페이스용 PNG), mp4/ (Live Photo 변환용)
"""
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter

W, H = 324, 394
SS = 4  # 패널 모양은 4배로 그린 뒤 줄여 테두리를 매끄럽게 한다

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")

# 패널 위치 (오른쪽 위, 화면 모서리 곡률에 맞춰 둥글게)
PX0, PY0, PX1, PY1, PR = 150, 10, 314, 112, 24

WASHERS = ["chiikawa", "usagi", "hachiware"]
ILLUSTS = ["bubble", "onsen", "meadow", "kotatsu"]


def panel_mask():
    m = Image.new("L", (W * SS, H * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [PX0 * SS, PY0 * SS, PX1 * SS, PY1 * SS], radius=PR * SS, fill=255)
    return m.resize((W, H), Image.LANCZOS)


def overlay(style):
    """패널 테두리·하이라이트·아이콘 층 (RGBA). 배경과 상관없이 늘 같다."""
    o = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(o)
    box = [PX0 * SS, PY0 * SS, PX1 * SS, PY1 * SS]
    if style == "washer":
        d.rounded_rectangle(box, radius=PR * SS, outline=(200, 205, 215, 150), width=int(1.5 * SS))
        # 위쪽 유리 반사
        d.arc([box[0] + 6 * SS, box[1] + 4 * SS, box[2] - 6 * SS, box[1] + 60 * SS], 200, 340,
              fill=(255, 255, 255, 40), width=int(1.2 * SS))
        # 아래쪽 아이콘 줄: 물방울(세탁), 물결(헹굼), 회전(탈수). 첫 번째만 켜진 것처럼.
        y = (PY1 - 13) * SS
        xs = [(PX0 + 30) * SS, (PX0 + 52) * SS, (PX0 + 74) * SS]
        on, off = (120, 200, 255, 230), (200, 205, 215, 110)
        x = xs[0]
        d.ellipse([x - 3.2 * SS, y - 1 * SS, x + 3.2 * SS, y + 5.4 * SS], fill=on)
        d.polygon([(x - 2.9 * SS, y + 1 * SS), (x + 2.9 * SS, y + 1 * SS), (x, y - 5 * SS)], fill=on)
        x = xs[1]
        for k in (-2.5, 2.5):
            d.arc([x - 5 * SS, y + (k - 2) * SS, x, y + (k + 2) * SS], 180, 360, fill=off, width=int(1.3 * SS))
            d.arc([x, y + (k - 2) * SS, x + 5 * SS, y + (k + 2) * SS], 0, 180, fill=off, width=int(1.3 * SS))
        x = xs[2]
        d.arc([x - 5 * SS, y - 5 * SS, x + 5 * SS, y + 5 * SS], 40, 330, fill=off, width=int(1.3 * SS))
        d.polygon([(x + 5.6 * SS, y - 3.6 * SS), (x + 1.8 * SS, y - 4.6 * SS), (x + 4.6 * SS, y - 0.6 * SS)], fill=off)
        # 진행 표시 점
        for i in range(4):
            cx = (PX1 - 54 + i * 10) * SS
            d.ellipse([cx - 1.6 * SS, y - 1.6 * SS, cx + 1.6 * SS, y + 1.6 * SS],
                      fill=on if i == 0 else off)
    else:
        d.rounded_rectangle(box, radius=PR * SS, outline=(255, 255, 255, 170), width=int(1.5 * SS))
        d.arc([box[0] + 6 * SS, box[1] + 4 * SS, box[2] - 6 * SS, box[1] + 60 * SS], 200, 340,
              fill=(255, 255, 255, 120), width=int(1.2 * SS))
    return o.resize((W, H), Image.LANCZOS)


def apply_panel(frame, style, mask, top):
    """frame(RGB 324x394)에 패널을 얹는다."""
    frame = frame.convert("RGB")
    glass = frame.filter(ImageFilter.GaussianBlur(7))
    if style == "washer":
        glass = Image.blend(glass, Image.new("RGB", (W, H), (14, 18, 26)), 0.55)
    else:
        # 워치 기본 시간 글자가 흰색이라, 뒤가 비치면서도 흰 글씨가 보이도록 살짝 어둡게
        glass = Image.blend(glass, Image.new("RGB", (W, H), (60, 58, 80)), 0.38)
    out = Image.composite(glass, frame, mask).convert("RGBA")
    out.alpha_composite(top)
    return out.convert("RGB")


def save_gif(frames, durations, path):
    # 모든 프레임에 같은 팔레트를 써서 정지된 부분이 깜빡이지 않게 한다
    strip = Image.new("RGB", (W, H * len(frames)))
    for i, f in enumerate(frames):
        strip.paste(f, (0, H * i))
    pal = strip.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE)
    q = [f.quantize(palette=pal, dither=Image.FLOYDSTEINBERG) for f in frames]
    q[0].save(path, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True)


def to_mp4(gif, mp4):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", gif, "-c:v", "libx264", "-preset", "slow",
                    "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], check=True)


def main():
    for sub in ("gif", "still", "mp4"):
        os.makedirs(os.path.join(HERE, sub), exist_ok=True)
    mask = panel_mask()

    top = overlay("washer")
    all_frames, all_durs = [], []
    for name in WASHERS:
        src = Image.open(os.path.join(SRC, f"washer_{name}.gif"))
        frames, durs = [], []
        for i in range(src.n_frames):
            src.seek(i)
            frames.append(apply_panel(src.convert("RGB"), "washer", mask, top))
            durs.append(src.info.get("duration", 60))
        gif = os.path.join(HERE, "gif", f"{name}.gif")
        save_gif(frames, durs, gif)
        to_mp4(gif, os.path.join(HERE, "mp4", f"{name}.mp4"))
        still = Image.open(os.path.join(SRC, f"washer_{name}.png"))
        apply_panel(still, "washer", mask, top).save(os.path.join(HERE, "still", f"{name}.png"))
        all_frames += frames
        all_durs += durs
        print("washer", name)
    save_gif(all_frames, all_durs, os.path.join(HERE, "gif", "preview_all.gif"))

    top = overlay("glass")
    for name in ILLUSTS:
        im = Image.open(os.path.join(SRC, f"{name}.png")).convert("RGB")
        im = im.resize((W, H), Image.LANCZOS)  # 원본 비율(1080x1313)이 화면 비율과 같다
        apply_panel(im, "glass", mask, top).save(os.path.join(HERE, "still", f"{name}.png"))
        print("still", name)


if __name__ == "__main__":
    main()

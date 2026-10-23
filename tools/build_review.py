#!/usr/bin/env python3
"""GPT 등 다른 AI에게 코드 검수를 받기 위한 복붙용 묶음을 만들어요.

실행: python3 tools/build_review.py
결과: review.html (파트별 복사 버튼), docs/code-review.md (한 파일로 모두)
"""
import html
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = [
    ("3d/app.js", "3D 버전의 주 로직 (건물·거리, 캐릭터, 이동, 욕구, 관계, 과업, 상점, 이벤트, 사물 상호작용, 대화, 업무, 에이전트 회의, 상태창)"),
    ("3d/core.js", "3D 렌더러·카메라·화질 설정과 물체 도우미 (합치기, InstancedMesh, dispose)"),
    ("3d/commands.js", "글 명령 해석 (순수 함수)"),
    ("3d/interactions.js", "사물 상호작용 등록 구조 (순수 함수)"),
    ("3d/persistence.js", "3D 저장 데이터 검증·이전"),
    ("3d/quests.js", "과업 진행·완료 판정"),
    ("3d/worklog.js", "에이전트 역할과 개발 일지 데이터"),
    ("shared/ai-client.js", "AI 연결 (claude.ai 샘플 / 서버 프록시 / 데모, 90초 시간 초과)"),
    ("shared/parse.js", "업무 답 해석·점수 정규화·프롬프트"),
    ("shared/storage.js", "localStorage 안전 읽기·쓰기·삭제"),
    ("shared/markdown.js", "모델 출력용 안전한 마크다운"),
    ("shared/activity-controller.js", "긴 활동 공통 잠금"),
    ("shared/actions.js", "2D·3D 공통 행동 문구"),
    ("shared/live.js", "터미널 실제 작업 동기화"),
    ("tools/live.mjs", "작업 상태를 live 브랜치에 올리는 도구"),
    ("2d/app.js", "2D 버전 로직 (업무 파이프라인, 사물 상호작용)"),
    ("3d.html", "3D 화면 구조와 CSS"),
    ("index.html", "2D 화면 구조"),
    ("2d/styles.css", "2D 스타일"),
    ("server/proxy.mjs", "선택 서버 프록시 예시"),
]
CHUNK = 18000  # 휴대폰에서도 붙여 넣기 쉬운 크기

PROMPT = """너는 시니어 프론트엔드·Three.js 코드 리뷰어야.
아래는 팬이 만든 비영리 웹 프로젝트 "치이카와 오피스"의 코드야. 바닐라 JavaScript와 Three.js r160을 쓰고, 빌드 없이 GitHub Pages에 올려서 브라우저에서 바로 실행해.
코드를 파트 1/{n}부터 {n}/{n}까지 나눠서 보낼게. 마지막 파트를 받기 전까지는 "파트 k/{n} 받음"이라고만 짧게 답해 줘.
모든 파트를 받으면, 한국어로 다음 순서대로 리뷰해 줘.
1. 버그: 실제로 일어날 수 있는 경로(어떤 조작을 하면 무엇이 잘못되는지)와 고친 코드 조각. 심각한 것부터.
2. 보안·개인정보: 특히 브라우저에서 Anthropic API 키를 localStorage에 저장하고 직접 호출하는 부분의 위험과 현실적인 대안.
3. 성능과 메모리: 특히 휴대폰에서 느려질 만한 부분, 정리되지 않는 객체.
4. 접근성과 모바일 사용성.
5. 구조 개선 제안: 파일 나누기 등, 지금 코드를 크게 바꾸지 않고 할 수 있는 것부터.
확실하지 않은 내용은 "추측"이라고 표시하고, 코드에 없는 내용을 지어내지 마."""


def chunks(text):
    out, cur = [], ""
    for line in text.splitlines(keepends=True):
        if len(cur) + len(line) > CHUNK and cur:
            out.append(cur)
            cur = ""
        cur += line
    if cur:
        out.append(cur)
    return out


def main():
    parts, overview = [], []
    for path, desc in FILES:
        text = (ROOT / path).read_text(encoding="utf-8")
        overview.append(f"- {path} ({len(text.splitlines())}줄): {desc}")
        cs = chunks(text)
        for i, c in enumerate(cs, 1):
            parts.append((path, i, len(cs), c))
    n = len(parts)
    prompt = PROMPT.format(n=n)
    body = [f"[파일 구성]\n" + "\n".join(overview)]
    msgs = []
    for k, (path, i, m, c) in enumerate(parts, 1):
        msgs.append(f"[파트 {k}/{n}] 파일: {path} ({i}/{m})\n```\n{c}```")

    # docs/code-review.md
    md = ["# 코드 검수 요청 묶음", "", "GPT 같은 AI에게 아래 요청문을 먼저 보내고, 파트를 순서대로 붙여 넣어 주세요.", "",
          "## 요청문", "", "```", prompt, "", body[0], "```", ""]
    for k, msg in enumerate(msgs, 1):
        md += [f"## 파트 {k}/{n}", "", msg, ""]
    (ROOT / "docs").mkdir(exist_ok=True)
    (ROOT / "docs/code-review.md").write_text("\n".join(md), encoding="utf-8")

    # review.html
    blocks = [("요청문 (먼저 보내기)", prompt + "\n\n" + body[0])] + [(f"파트 {k}/{n} · {p[0]}", msgs[k - 1]) for k, p in enumerate(parts, 1)]
    items = "\n".join(
        f'<section class="part"><div class="ph"><h2>{html.escape(t)}</h2><button type="button" data-i="{i}">복사</button></div>'
        f'<details><summary>내용 보기 ({len(b):,}자)</summary><pre id="t{i}">{html.escape(b)}</pre></details></section>'
        for i, (t, b) in enumerate(blocks))
    page = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>코드 검수 묶음</title>
<style>
:root{{--bg:#f4f7fc;--panel:#fff;--line:#dbe2ef;--ink:#2d3149;--muted:#6b7190;--pink:#ff8fb1;color-scheme:light}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--bg:#12162a;--panel:#1b2038;--line:#2e3555;--ink:#eef0fb;--muted:#a2a8c8;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#12162a;--panel:#1b2038;--line:#2e3555;--ink:#eef0fb;--muted:#a2a8c8;color-scheme:dark}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.6;padding:16px}}
.wrap{{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:10px}}
h1{{font-size:1.5rem;margin:0}}ol{{margin:4px 0;padding-left:1.3em}}p,li{{font-size:.92rem}}a{{color:#6f9fd8}}
.part{{background:var(--panel);border:2px solid var(--line);border-radius:14px;padding:10px 12px}}
.ph{{display:flex;justify-content:space-between;align-items:center;gap:8px}}.ph h2{{font-size:1rem;margin:0}}
button{{font:inherit;font-weight:700;border:2px solid var(--ink);background:var(--pink);color:#2d3149;border-radius:10px;padding:4px 14px;cursor:pointer;white-space:nowrap}}
button.ok{{background:#9fe3c0}}summary{{cursor:pointer;color:var(--muted);font-size:.85rem;margin-top:4px}}
pre{{white-space:pre-wrap;word-break:break-all;font-size:.72rem;max-height:320px;overflow:auto;background:var(--bg);padding:8px;border-radius:8px}}
</style></head><body><div class="wrap">
<h1>🔍 코드 검수 묶음 (GPT 복붙용)</h1>
<p>치이카와 오피스 코드를 다른 AI에게 검수받을 수 있게 나눠 두었어요. 파트는 모두 {n}개예요.</p>
<ol><li><b>요청문</b>의 복사 버튼을 누르고 GPT 대화창에 붙여 넣어요.</li><li><b>파트 1</b>부터 차례로 복사해서 붙여 넣어요. GPT는 마지막 파트 전까지 "받음"이라고만 대답해요.</li><li>마지막 파트를 보내면 리뷰가 나와요. 결과를 Claude에게 다시 보여 주면 고칠 수 있어요.</li></ol>
<p><a href="3d.html">← 3D 사무실로</a> · <a href="docs/code-review.md">한 파일로 보기 (code-review.md)</a></p>
{items}
</div><script>
document.addEventListener("click", async e => {{
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const t = document.getElementById("t" + b.dataset.i).textContent;
  try {{ await navigator.clipboard.writeText(t); }} catch (err) {{ const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); document.execCommand("copy"); a.remove(); }}
  b.textContent = "복사됨 ✓"; b.classList.add("ok"); setTimeout(() => {{ b.textContent = "복사"; b.classList.remove("ok"); }}, 1800);
}});
</script></body></html>
"""
    (ROOT / "review.html").write_text(page, encoding="utf-8")
    print(f"파트 {n}개 · review.html, docs/code-review.md 생성")


if __name__ == "__main__":
    main()

// AI 업무 응답(@제목/@구성/@결과물/@검토 형식)을 해석하는 순수 함수들
export const DEFAULT_SCORE = 4, DEFAULT_COMMENT = "야하!";

// 점수는 늘 1~5 정수. 0, 6, 9, 문자열, 빈 값도 안전하게 처리해요.
export function normalizeScore(v, def = DEFAULT_SCORE){
  const n = typeof v === "number" ? v : Number((String(v ?? "").match(/-?\d+/) || [])[0]);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.trunc(n))) : def;
}

// 스트리밍 도중에도 부르는 관대한 해석기. phase: 0 시작, 1 제목/구성, 2 결과물, 3 검토
export function parseTaskAnswer(text){
  text = String(text ?? "");
  const r = {title:"", outline:[], body:"", score:0, comment:"", phase:0, hasBody:false, hasReview:false};
  const t = text.match(/@제목\s*[:：]\s*(.+)/); if (t){ r.title = t[1].trim().slice(0, 40); r.phase = 1; }
  const iO = text.indexOf("@구성"), iB = text.indexOf("@결과물"), iR = text.indexOf("@검토");
  if (iO >= 0){ r.phase = Math.max(r.phase, 1); const end = [iB, iR].filter(i => i > iO).sort((a, b) => a - b)[0];
    r.outline = text.slice(iO + 3, end).split("\n").map(s => s.replace(/^\s*[-*•\d.)]+\s*/, "").trim()).filter(Boolean).slice(0, 6); }
  if (iB >= 0){ r.phase = 2; r.hasBody = true; r.body = text.slice(iB + 4, iR > iB ? iR : undefined).trim(); }
  if (iR >= 0){
    r.phase = 3; r.hasReview = true;
    const seg = text.slice(iR + 3);
    const s = seg.match(/점수\s*[:：]\s*(-?\d+)/); if (s) r.score = normalizeScore(s[1]);
    const c = seg.match(/한줄평\s*[:：]\s*(.+)/); if (c) r.comment = c[1].trim().slice(0, 80);
  }
  return r;
}

// 스트림이 끝난 뒤 최종 결과로 정리. 결과물이 없으면 format 오류, 검토만 없으면 기본값으로 완료.
export function finalizeAnswer(text, task = ""){
  const r = parseTaskAnswer(text);
  if (!r.body.trim()) throw { code: "format", text };
  return {
    ...r,
    title: r.title || String(task).slice(0, 14) || "업무",
    score: r.score ? normalizeScore(r.score) : DEFAULT_SCORE,
    comment: r.comment || DEFAULT_COMMENT,
  };
}

export const buildTaskPrompt = task => `너는 작은 사무실 팀이야. 아래 업무를 실제로 끝까지 해내고, 정확히 이 형식으로만 답해.

업무: """${String(task).slice(0, 4000)}"""

@제목: (업무를 14자 이내로 줄인 이름)
@구성
- (결과물의 구성 또는 작업 단계, 3~5줄, 각 25자 이내)
@결과물
(업무를 완수한 실제 결과물. 한국어. 인사말이나 서론 없이 바로 본문. 마크다운은 ##, ###, -, 1., **굵게** 만 사용. 업무 크기에 맞게 충실하게, 보통 600~1500자.)
@검토
점수: (1~5 정수, 결과물이 업무 요구를 얼마나 채우는지)
한줄평: (40자 이내, 보완하면 좋을 점 또는 칭찬)`;

export function demoAnswer(task){
  const one = String(task).replace(/\s+/g, " ").trim();
  const short = one.length > 14 ? one.slice(0, 14) + "…" : one;
  return `@제목: ${short}
@구성
- 요청 내용 정리
- 진행 순서 세우기
- 바로 쓸 체크리스트
@결과물
## ${short}

> 데모 모드라서 정해진 예시 형식으로 보여 주고 있어요. 'Claude 연결' 안내를 따라 서버 프록시를 연결하거나, '프롬프트 복사'로 Claude에 직접 물어본 뒤 답을 붙여 넣을 수 있어요.

### 요청 내용
- ${one.slice(0, 140)}

### 진행 순서
1. 원하는 결과물의 모양과 분량을 정해요.
2. 필요한 자료를 자료실에서 모아요.
3. 초안을 쓰고 우사기가 검토해요.
4. 팀장이 최종본을 전달해요.

### 체크리스트
- **목적**: 이 결과물을 누가, 어디에 쓰나요?
- **마감**: 언제까지 필요한가요?
- **형식**: 글, 표, 목록 중 무엇이 좋을까요?
@검토
점수: 3
한줄평: 연결되면 진짜로 일할 수 있어! 야하!`;
}

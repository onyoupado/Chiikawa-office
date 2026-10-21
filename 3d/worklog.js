// 개발 일지: 이 프로젝트에서 실제로 한 작업을 캐릭터(에이전트)들이 재현해요.
// 새 작업을 하면 맨 위 세션에 항목을 추가해 주세요.
export const ROLES = {
  rakko:{role:"팀장·오케스트레이터", short:"PM"},
  hachiware:{role:"프론트엔드 개발", short:"FE"},
  chiikawa:{role:"디자인·3D 모델링", short:"디자인"},
  usagi:{role:"QA·테스트", short:"QA"},
  shisa:{role:"로직·데이터", short:"BE"},
  kurimanju:{role:"배포·인프라", short:"배포"},
  momonga:{role:"문서·안내", short:"문서"},
  kani:{role:"코드 리뷰·정리", short:"리뷰"},
};

export const SESSIONS = [
  {
    date:"2026-10-21", title:"카메라 시점 · 유리 건물 · 거리 · 에이전트 회의 · 코드 검수 정리",
    request:"작업하는 모습을 치이카와들이 일하는 걸로 보여 주고, 에이전트 회의, 카메라 시점, 유리 통창 건물과 바깥 거리, GPT 코드 검수용 정리를 해 줘",
    items:[
      {who:"rakko", title:"요청 나누기와 역할 배정", plan:"오늘 요청은 다섯 가지야. 역할을 나눌게.", work:["요청 정리 중…","우선순위 정하는 중"], done:"모두에게 일을 나눠 줬어."},
      {who:"hachiware", title:"카메라 시점 바꾸기", plan:"시점 버튼이랑 따라가기, 자동 회전을 만들게!", work:["시점 프리셋 7개","부드럽게 이동하기","캐릭터 따라가기"], done:"이제 어디서든 볼 수 있어!"},
      {who:"chiikawa", title:"유리 통창 건물 외형", plan:"…유리 건물, 예쁘게 해 볼게…!", work:["유리 외벽 세우는 중…","창틀 붙이는 중…","옥상 간판…!"], done:"…완성…! 반짝반짝…!"},
      {who:"kurimanju", title:"도로·인도·가로수·버스 정류장·지하철 입구", plan:"하아… 바깥 거리는 내가 깔게~", work:["도로 포장 중~","가로수 심는 중","버스랑 지하철 입구~"], done:"캬~ 거리 완성이다~"},
      {who:"shisa", title:"에이전트 회의와 작업 보드", plan:"회의 대본이랑 할 일 보드를 만들게요!", work:["회의 대본 만들기","할 일 배정 로직","진행률 표시"], done:"회의하면 바로 일이 생겨요!"},
      {who:"momonga", title:"안내 문구와 README", plan:"안내문은 내가 쓸게! 다 쓰면 칭찬해 줘!", work:["사용법 정리 중","README 고치는 중"], done:"다 썼어! 칭찬해 줘!"},
      {who:"kani", title:"GPT 코드 검수용 정리", plan:"…코드, 파트별로 나눌게.", work:["…파일 모으는 중","…파트 나누는 중","…복사 버튼"], done:"…정리 끝."},
      {who:"usagi", title:"PC·휴대폰 화면 시험", plan:"우라! (테스트 맡겨 달라는 듯 손을 번쩍)", work:["(이리저리 눌러 봄)","하아…? (버그 냄새)","우라!"], done:"야하! (통과!)",
        bug:"(유리 앞면이 안을 가림!)", fixBy:"chiikawa", fix:"…층을 볼 땐 앞쪽 유리를 숨길게…!"},
    ],
  },
  {
    date:"2026-10-21", title:"3층 건물 · 에스컬레이터 · 관계 · 하루 흐름 · 상점 · 이벤트 · 대화",
    request:"2·3층, 관계도, 하루 흐름, 고유 특성, 나머지 기능, 에스컬레이터, 캐릭터와 대화",
    items:[
      {who:"chiikawa", title:"2·3층 3D 모델링", plan:"…기숙사랑 영화관 만들게…!", work:["침대…","영화관 좌석…"], done:"…다 됐어…!"},
      {who:"hachiware", title:"에스컬레이터와 엘리베이터", plan:"층을 오가게 해 볼게!", work:["계단 움직이기","타고 내리기"], done:"위아래로 다닐 수 있어!"},
      {who:"usagi", title:"이동 경로 시험", plan:"우라!", work:["(에스컬레이터 타 봄)"], done:"야하!", bug:"(방을 대각선으로 뚫고 지나감!)", fixBy:"shisa", fix:"복도를 따라가게 고쳤어요!"},
      {who:"kani", title:"문장 다듬기", plan:"…조사가 어색해.", work:["…'을(를)' 고치는 중"], done:"…받침 따라 고르게 했어."},
    ],
  },
  {
    date:"2026-10-19", title:"2D 사무실 · GitHub 공유 · 원작 이미지 · 3D 1단계",
    request:"GitHub 공유, 원작 이미지, 실제 구동, 3D 엔진",
    items:[
      {who:"kurimanju", title:"GitHub Pages 공유", plan:"하아… 올려 둘게~", work:["푸시 중~"], done:"캬~ 링크 나왔다~"},
      {who:"chiikawa", title:"원작 이미지 오리기", plan:"…배경 지울게…!", work:["…오리는 중"], done:"…깔끔해…!", bug:"(우사기 몸통이 투명!)", fixBy:"chiikawa", fix:"…윤곽선 안쪽을 다 채웠어…!"},
      {who:"hachiware", title:"Three.js 3D 1층", plan:"진짜 3D로 만들어 보자!", work:["카메라","캐릭터 스프라이트"], done:"돌려 볼 수 있어!"},
    ],
  },
];

// 2D와 3D가 같은 이름·이모지·대사를 쓰도록 모아 둔 행동 문구
export const ACTION_TEXT = {
  coffee:{name:"커피 마시기", emo:"☕", lines:["커피 최고…","카페인 충전!"]},
  snack:{name:"간식 먹기", emo:"🍙", lines:["냠냠","푸딩 발견!"]},
  meal:{name:"밥 먹기", emo:"🍚", lines:["잘 먹겠습니다!","든든해~"]},
  water:{name:"물 마시기", emo:"💧", lines:["꿀꺽꿀꺽","시원해~"]},
  toilet:{name:"화장실 가기", emo:"🚻", lines:["휴~ 살았다","잠깐만…!"]},
  wash:{name:"손 씻기", emo:"🫧", lines:["뽀득뽀득","깨끗해!"]},
  shower:{name:"샤워하기", emo:"🚿", lines:["샤워 중~♪","따끈따끈…"]},
  sofa:{name:"소파에서 쉬기", emo:"🛋️", lines:["푹신…","좋다~"]},
  nap:{name:"낮잠 자기", emo:"💤", lines:["Zzz…","쿨쿨…"]},
  sleep:{name:"잠자기", emo:"🌙", lines:["Zzz…","쿨쿨… (잠꼬대)"]},
  tv:{name:"TV 보기", emo:"📺", lines:["재밌다!","ㅋㅋㅋ"]},
  read:{name:"책 읽기", emo:"📚", lines:["흠흠…","하나 배웠다!"]},
  print:{name:"자료 출력하기", emo:"🖨️", lines:["위잉… 출력 중","종이 걸렸다…!","자료 완성!"]},
  work:{name:"일하기", emo:"💻", lines:["타닥타닥…","집중!","거의 다 했다"]},
  meeting:{name:"회의하기", emo:"🗣️", lines:["좋은 생각이에요!","음음"]},
  game:{name:"게임하기", emo:"🎮", lines:["이겼다!","한 판 더!"]},
  draw:{name:"그림 그리기", emo:"🎨", lines:["슥슥…","무슨 색 칠하지?"]},
  piano:{name:"피아노 치기", emo:"🎹", lines:["♪ 도레미~","♬ 띵동띵동"]},
  boardgame:{name:"보드게임", emo:"🎲", lines:["내 차례!","주사위 굴린다~"]},
  movie:{name:"영화 보기", emo:"🎬", lines:["(두근두근)","감동…","팝콘 냠냠"]},
  sunbath:{name:"일광욕", emo:"🌞", lines:["햇볕 좋다…","(꾸벅)"]},
  bbq:{name:"바비큐", emo:"🍖", lines:["지글지글~","다 익었다!"]},
  sightsee:{name:"구경하기", emo:"🔭", lines:["경치 최고!","저기 구름 봐","꽃이 예쁘다"]},
  massage:{name:"안마받기", emo:"💺", lines:["시원하다~","으으…"]},
};
// 사물 버튼 이름: "커피머신에서 커피 마시기"
export const objectActionLabel = (objName, key) => `${objName}에서 ${ACTION_TEXT[key]?.name ?? key}`;

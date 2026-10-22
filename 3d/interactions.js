// 사물 상호작용 등록 구조. Three.js에 의존하지 않아서 단독으로 테스트할 수 있어요.
// meta: {id, name, actions:[행동키], floor, spot:{f,x,y}, enabled?:()=>true|string(비활성 이유), object?}
export function createRegistry(){
  const items = new Map();
  const tag = (obj, id) => { if (obj && obj.userData) obj.userData.interactiveId = id; };
  return {
    register(meta){
      if (!meta || !meta.id || !Array.isArray(meta.actions) || !meta.actions.length) throw new Error("상호작용 정보가 올바르지 않아요");
      const item = { enabled: () => true, ...meta };
      items.set(item.id, item); tag(item.object, item.id); return item;
    },
    unregister(id){
      const item = items.get(id); if (!item) return null;
      items.delete(id); if (item.object?.userData) delete item.object.userData.interactiveId; return item;
    },
    get: id => items.get(id) || null,
    has: id => items.has(id),
    list(pred = () => true){ return [...items.values()].filter(pred); },
    get size(){ return items.size; },
    // 클릭된 객체(자식 Mesh일 수 있음)에서 부모로 올라가며 등록된 사물을 찾아요
    resolve(obj){
      for (let o = obj; o; o = o.parent){ const id = o.userData?.interactiveId; if (id && items.has(id)) return items.get(id); }
      return null;
    },
    // 비활성이면 이유 문자열, 가능하면 null
    disabledReason(item){
      try { const r = item.enabled(); return r === true || r == null ? null : (typeof r === "string" ? r : "지금은 쓸 수 없어요"); }
      catch (e) { return "지금은 쓸 수 없어요"; }
    },
  };
}

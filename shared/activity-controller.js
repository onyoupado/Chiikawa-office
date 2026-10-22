// 오래 걸리는 활동(업무 지시, 회의, 개발 일지 재생, 자체 회의)을 한 번에 하나만 실행하게 하는 공통 잠금
export class ActivityController {
  constructor(){ this.cur = null; this.listeners = new Set(); }
  get current(){ return this.cur; }
  get busy(){ return !!this.cur; }
  onChange(fn){ this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(){ for (const fn of this.listeners){ try { fn(this.cur); } catch (e) {} } }
  // 성공하면 토큰, 이미 다른 활동 중이면 null
  tryBegin(name, label = name){
    if (this.cur) return null;
    const ctrl = new AbortController();
    this.cur = { name, label, ctrl, signal: ctrl.signal, startedAt: Date.now() };
    this._emit(); return this.cur;
  }
  // 토큰이 현재 활동일 때만 끝내요 (늦게 도착한 정리 코드가 다른 활동을 끝내지 못하게)
  end(token){ if (token && this.cur === token){ this.cur = null; this._emit(); return true; } return false; }
  cancel(reason = "cancelled"){ if (this.cur && !this.cur.signal.aborted) this.cur.ctrl.abort(reason); }
  message(){ return this.cur ? `지금은 ${this.cur.label} 중이에요. 끝난 뒤에 다시 해 주세요.` : ""; }
}

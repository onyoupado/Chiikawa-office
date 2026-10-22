// 모델 출력을 안전하게 화면에 보여 주는 작은 마크다운 변환기. 모든 글자는 먼저 이스케이프해요.
export const esc = s => String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
export const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
export function md(src, noteClass = "note"){
  let out = "", list = null;
  const close = () => { if (list){ out += `</${list}>`; list = null; } };
  for (const raw of String(src).split("\n")){
    const l = raw.trimEnd(); let m;
    if (!l.trim()){ close(); continue; }
    if ((m = l.match(/^#{1,2}\s+(.*)/))){ close(); out += `<h3>${inl(m[1])}</h3>`; continue; }
    if ((m = l.match(/^#{3,6}\s+(.*)/))){ close(); out += `<h4>${inl(m[1])}</h4>`; continue; }
    if ((m = l.match(/^>\s?(.*)/))){ close(); out += `<p class="${noteClass}">${inl(m[1])}</p>`; continue; }
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))){ if (list !== "ul"){ close(); out += "<ul>"; list = "ul"; } out += `<li>${inl(m[1])}</li>`; continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))){ if (list !== "ol"){ close(); out += "<ol>"; list = "ol"; } out += `<li>${inl(m[1])}</li>`; continue; }
    close(); out += `<p>${inl(l)}</p>`;
  }
  close(); return out;
}

const VCARD = "assets/cho-jongho.vcf";
const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_SixeWn";
const KAKAO_CHAT_URL = "https://pf.kakao.com/_SixeWn/chat";

const sheets = {
  "phone-office": {actions:[["전화하기","tel:0313429354"],["연락처 저장", VCARD]]},
  "phone-mobile": {actions:[["전화하기","tel:01063419354"],["문자 보내기","sms:01063419354"],["연락처 저장", VCARD]]},
  "kakao": {actions:[["카카오 상담 시작", KAKAO_CHAT_URL],["연락처 저장", VCARD]]},
  "fax": {actions:[["번호 복사", () => copyText("0508-118-0935")],["연락처 저장", VCARD]]},
  "email": {actions:[["이메일 보내기","mailto:tax@netax.kr"],["연락처 저장", VCARD]]},
  "address": {actions:[["네이버지도 열기","https://map.naver.com/p/search/안양시%20동안구%20시민대로%20273%20효성인텔리안%20215호"],["연락처 저장", VCARD]]},
  "home": {actions:[["홈페이지 열기","https://netax.kr"],["연락처 저장", VCARD]]}
};

const backdrop = document.getElementById("sheetBackdrop");
const actionsEl = document.getElementById("sheetActions");
const cancelEl = document.getElementById("sheetCancel");

document.querySelectorAll("[data-sheet]").forEach(btn=>{
  btn.addEventListener("click",()=>openSheet(btn.dataset.sheet));
});

function openSheet(key){
  const sheet = sheets[key];
  if(!sheet) return;
  actionsEl.innerHTML = "";
  sheet.actions.forEach(([label, action])=>{
    if(typeof action === "function"){
      const button = document.createElement("button");
      button.type="button";
      button.textContent=label;
      button.addEventListener("click", async ()=>{ await action(); closeSheet(); });
      actionsEl.appendChild(button);
    }else{
      const a = document.createElement("a");
      a.textContent=label;
      a.href=action;
      if(action.startsWith("http")){ a.target="_blank"; a.rel="noopener"; }
      a.addEventListener("click",()=>setTimeout(closeSheet,160));
      actionsEl.appendChild(a);
    }
  });
  backdrop.hidden=false;
}
function closeSheet(){backdrop.hidden=true;actionsEl.innerHTML="";}
cancelEl.addEventListener("click",closeSheet);
backdrop.addEventListener("click",e=>{if(e.target===backdrop) closeSheet();});
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); }
  catch(e){
    const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
}

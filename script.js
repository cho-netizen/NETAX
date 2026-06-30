const VCARD = "assets/cho-jongho.vcf";

const sheets = {
  "phone-office": {
    title: "031-342-9354",
    actions: [
      ["전화하기", "tel:0313429354"],
      ["연락처 저장", VCARD],
      ["번호 복사", () => copyText("031-342-9354")]
    ]
  },
  "phone-mobile": {
    title: "010-6341-9354",
    actions: [
      ["전화하기", "tel:01063419354"],
      ["문자 보내기", "sms:01063419354"],
      ["연락처 저장", VCARD],
      ["번호 복사", () => copyText("010-6341-9354")]
    ]
  },
  "fax": {
    title: "0508-118-0935",
    actions: [
      ["팩스번호 복사", () => copyText("0508-118-0935")],
      ["연락처 저장", VCARD]
    ]
  },
  "email": {
    title: "tax@netax.kr",
    actions: [
      ["이메일 보내기", "mailto:tax@netax.kr"],
      ["이메일 복사", () => copyText("tax@netax.kr")],
      ["연락처 저장", VCARD]
    ]
  },
  "address": {
    title: "안양시 동안구 시민대로 273",
    actions: [
      ["네이버지도 열기", "https://map.naver.com/p/search/안양시%20동안구%20시민대로%20273%20효성인텔리안%20215호"],
      ["주소 복사", () => copyText("안양시 동안구 시민대로 273 효성인텔리안 215호")],
      ["연락처 저장", VCARD]
    ]
  },
  "home": {
    title: "netax.kr",
    actions: [
      ["홈페이지 열기", "https://netax.kr"],
      ["주소 복사", () => copyText("https://netax.kr")],
      ["연락처 저장", VCARD]
    ]
  }
};

const backdrop = document.getElementById("sheetBackdrop");
const titleEl = document.getElementById("sheetTitle");
const actionsEl = document.getElementById("sheetActions");
const cancelEl = document.getElementById("sheetCancel");

document.querySelectorAll("[data-sheet]").forEach(btn => {
  btn.addEventListener("click", () => openSheet(btn.dataset.sheet));
});

function openSheet(key){
  const data = sheets[key];
  if(!data) return;
  titleEl.textContent = data.title;
  actionsEl.innerHTML = "";
  data.actions.forEach(([label, action]) => {
    const el = typeof action === "string" ? document.createElement("a") : document.createElement("button");
    el.textContent = label;
    if(typeof action === "string"){
      el.href = action;
      if(action.startsWith("http")) {
        el.target = "_blank";
        el.rel = "noopener";
      }
    } else {
      el.type = "button";
      el.addEventListener("click", action);
    }
    el.addEventListener("click", () => {
      if(typeof action === "string") closeSheet();
    });
    actionsEl.appendChild(el);
  });
  backdrop.hidden = false;
}

function closeSheet(){
  backdrop.hidden = true;
}

function copyText(text){
  if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(closeSheet);
  } else {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    document.body.removeChild(t);
    closeSheet();
  }
}

cancelEl.addEventListener("click", closeSheet);
backdrop.addEventListener("click", e => {
  if(e.target === backdrop) closeSheet();
});
document.addEventListener("keydown", e => {
  if(e.key === "Escape") closeSheet();
});

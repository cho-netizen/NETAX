// ===== my.netax.kr 공통 설정 =====
// Code.gs 배포 후 나오는 웹앱 URL을 여기에 붙여넣으세요.
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyFbvXiV6rSzCvhtc_T2WrzNF5ZxhOFWtSSsgzSavzPbjv4LBGhjXhu_Q2_8m-PDj8s/exec';
// [2026.08] 통합 백엔드 인증 비밀값 — 서버(gs-backend)의 스크립트 속성 API_SECRET과 같은 값.
const GAS_API_KEY = 'c235d6c3e3fd0eb7567da6e58849c61eeeb8d904497f5f1d41729d705208330e';

// SHA-256 해시 (rpt.netax.kr과 동일 방식 — 서버로는 평문 비밀번호를 보내지 않음)
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function callGas(payload) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // GAS doPost 호환을 위해 text/plain 사용
    body: JSON.stringify(Object.assign({ _key: GAS_API_KEY }, payload))
  });
  return res.json();
}

// 세션 저장 헬퍼 — 로그인 상태를 /my/report, /my/upload 페이지가 공유해서 씀
function saveSession(session) {
  sessionStorage.setItem('my_netax_session', JSON.stringify(session));
}
function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem('my_netax_session') || 'null');
  } catch (e) {
    return null;
  }
}
function requireSessionOrRedirect() {
  const s = loadSession();
  if (!s || !s.report_id || !s.password_hash) {
    location.href = '/my/';
    return null;
  }
  return s;
}

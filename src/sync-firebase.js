/* 로그인 없이 쓰는 실시간 공유 (GitHub Pages 판 전용)
   firebase-config.js 에 window.FIREBASE_CONFIG 가 있으면, 앱이 쓰는 claude.use('db' | 'user' | 'room') 자리를 Firebase Firestore로 채운다.
   설정이 없으면 아무것도 하지 않는다 — 앱은 이 기기에만 저장하고, 제출 코드로 모은다.
   Firestore 문서: teams/t{n} · control/room · presence/{기기 id} */
(function () {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.projectId || window.claude) return;
  window.OPEN_SYNC = true;
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const load = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  let ready = null;
  const fs = () => ready || (ready = load(SDK + 'firebase-app-compat.js').then(() => load(SDK + 'firebase-firestore-compat.js')).then(() => {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
    return app.firestore();
  }));
  const snapDoc = (d) => ({ id: d.id, exists: d.exists, data: () => d.data() });
  const code = (e) => { const err = new Error(e?.message || 'firestore'); err.code = e?.code === 'permission-denied' ? 'invalid_argument' : 'unavailable'; throw err; };

  function makeDb(db) {
    return {
      doc(path) {
        const ref = db.doc(path);
        return {
          set: (d) => ref.set(d).catch(code),
          /* 앱은 중첩 필드를 합치는 update를 기대한다 — merge set으로 맞춘다 */
          update: (d) => ref.set(d, { merge: true }).catch(code),
          delete: () => ref.delete().catch(code),
          onSnapshot: (fn, onErr) => ref.onSnapshot((d) => fn(snapDoc(d)), (e) => onErr && onErr(e)),
        };
      },
      collection(c) {
        return { onSnapshot: (fn, onErr) => db.collection(c).onSnapshot((q) => fn({ docs: q.docs.map(snapDoc) }), (e) => onErr && onErr(e)) };
      },
    };
  }

  /* 접속 표시 — 기기마다 presence 문서를 두고 20초마다 갱신, 60초 넘게 조용하면 나간 것으로 본다 */
  function makeRoom(db) {
    let me = '';
    try { me = sessionStorage.getItem('lab-device') || ''; } catch (e) { /* 저장소 없음 */ }
    if (!me) { me = 'd' + Math.random().toString(36).slice(2, 12); try { sessionStorage.setItem('lab-device', me); } catch (e) { /* 저장소 없음 */ } }
    const ref = db.collection('presence').doc(me);
    let mine = {}; let last = [];
    const listeners = [];
    const beat = () => ref.set({ p: mine, seen: Date.now() }).catch(() => {});
    setInterval(beat, 20000);
    const bye = () => { ref.delete().catch(() => {}); };
    window.addEventListener('pagehide', bye);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat(); });
    let docs = [];
    const emit = () => {
      const now = Date.now();
      const peers = docs.filter((d) => now - (d.seen || 0) < 60000).map((d) => Object.freeze({ peer: d.id, by: null, isMe: d.id === me, sameTab: d.id === me, kind: 'viewer', guest: false, presence: d.p || {}, updatedAt: d.seen }));
      const ids = (a) => a.map((x) => x.peer).join(',');
      if (ids(peers) + JSON.stringify(peers.map((x) => x.presence)) === ids(last) + JSON.stringify(last.map((x) => x.presence))) return;
      last = peers;
      listeners.forEach((f) => f({ peers, joined: [], left: [], updated: [] }));
    };
    db.collection('presence').onSnapshot((q) => { docs = q.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, () => {});
    setInterval(emit, 15000);
    return {
      presence: (patch) => { mine = { ...mine, ...patch }; Object.keys(mine).forEach((k) => mine[k] == null && delete mine[k]); return beat(); },
      onPeers: (fn) => { listeners.push(fn); setTimeout(() => fn({ peers: last, joined: [], left: [], updated: [] }), 0); return () => {}; },
    };
  }

  let room = null;
  window.claude = {
    use: async (name) => {
      if (name === 'user') return { canEdit: async () => true, isOwner: () => false };
      if (name !== 'db' && name !== 'room') return null;
      try {
        const db = await fs();
        if (name === 'db') return makeDb(db);
        return room || (room = makeRoom(db));
      } catch (e) { return null; }
    },
  };
})();

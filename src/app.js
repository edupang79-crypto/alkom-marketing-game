(() => {
  'use strict';

  const STORE_KEY = 'campaign-lab-v3';
  const INSTRUCTOR_CODE = '0000'; // 강사 비밀번호 — 바꾸려면 이 값을 고친 뒤 ./build.sh
  const MISSION = 'X'; // 모든 조가 같은 케이스(20~30대 신규 고객 확보)
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => {
    if (v === undefined || v === null) return NaN;
    const s = String(v).replace(/[,\s원명%평]/g, '').replace('−', '-');
    if (s === '') return NaN;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  };
  const fmt = (n, d = 0) => Number.isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—';
  const won = (n) => {
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1e8) return fmt(n / 1e8, 2) + '억원';
    if (Math.abs(n) >= 1e4) return fmt(n / 1e4, 1) + '만원';
    return fmt(n) + '원';
  };
  const ext = (href, text, cls = 'site-chip') => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}<span class="ext" aria-hidden="true">↗</span></a>`;

  /* ---------- 상태 ---------- */
  let state = { view: 'home', course: 'campaign', mission: MISSION, sheet: { campaign: 's1', promo: 'c1' }, team: '', teamId: '', author: '', instructor: false, kw: {}, data: {}, imports: {}, roomSel: { mode: 'round', sid: '' }, game: { stage: 0, q: -1, picked: {} }, localExample: null, resetSeen: '', joinedAt: '', clearSeen: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state = { ...state, ...s, sheet: { ...state.sheet, ...(s.sheet || {}) }, data: s.data || {}, kw: s.kw || {}, imports: s.imports || {}, roomSel: s.roomSel || state.roomSel, game: { ...state.game, ...(s.game || {}), picked: (s.game && s.game.picked) || {} } };
    }
  } catch (e) { /* 저장소를 못 쓰면 이번 세션 메모리로만 동작 */ }
  state.mission = MISSION;
  if (!state.instructor) state.course = 'campaign';

  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { flash('이 브라우저에는 저장되지 않습니다 · 백업 코드를 복사해 두세요'); }
    }, 350);
  };

  const course = () => COURSES[state.course];
  const isCampaign = () => state.course === 'campaign';
  /* 강사방에서 다른 조의 시트를 그리거나 예시 답안을 보여 줄 때는 viewCtx가 데이터를 대신한다 */
  let viewCtx = null;
  let RO = false;
  const cs = () => CASES[MISSION];
  const scopeOf = (teamId) => `${teamId || '_'}/m-${MISSION}`;
  const scope = () => isCampaign() ? scopeOf(state.teamId) : 'promo';
  const D = () => viewCtx ? viewCtx.data : (state.data[scope()] ||= {});
  const val = (key) => D()[key] ?? '';
  const setVal = (key, v) => { if (v === '' || v == null) delete D()[key]; else D()[key] = v; queueSync(key, v); };

  const fkey = (sid, id) => `${sid}.${id}`;
  const ckey = (sid, tid, r, c) => `${sid}.${tid}.${r}.${c}`;
  const V = (sid, id) => val(fkey(sid, id));
  const N = (sid, id) => num(V(sid, id));
  const C = (sid, tid, r, c) => val(ckey(sid, tid, r, c));
  const CN = (sid, tid, r, c) => num(C(sid, tid, r, c));

  /* 표: 라벨 열(0번)이 없으면 noLabel. 'fixed' 열은 원본에 인쇄된 글(row.fx)이라 입력하지 않는다.
     row.a · row.ex · row.nudge · row.fx 배열은 라벨 열을 뺀 열 순서(c - off)에 맞춘다. */
  const off = (b) => b.noLabel ? 0 : 1;
  const editCols = (b) => b.cols.map((col, c) => ({ col, c })).filter(({ col, c }) => c >= off(b) && col.t !== 'fixed');
  const cellType = (row, col) => row.t ? { t: row.t, opts: row.opts } : { t: col.t, opts: col.opts };

  /* ---------- 사이트 링크 ---------- */
  const kwFor = (id) => state.kw[id] || (id === 'blackkiwi' ? '신세계백화점' : '롯데백화점');
  function siteUrl(id) {
    const s = SITES[id];
    if (s.kw) return `https://blackkiwi.net/service/keyword-analysis?keyword=${encodeURIComponent(kwFor(id))}&platform=naver`;
    if (s.news) return `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(kwFor(id))}`;
    return s.url;
  }
  const siteChips = (ids) => (ids || []).filter((id) => SITES[id]).map((id) => ext(siteUrl(id), esc(SITES[id].name))).join('');

  const findSheet = (sid) => course().sheets.find((s) => s.id === sid);
  const findBlock = (sid, id) => ((findSheet(sid) || { blocks: [] }).blocks).find((b) => b.id === id);

  /* ---------- 진행 상황 ---------- */
  function sheetKeys(sheet) {
    const keys = [];
    sheet.blocks.forEach((b) => {
      if (b.type === 'field' || b.type === 'q') keys.push(fkey(sheet.id, b.id));
      if (b.type === 'table') b.rows.forEach((row, r) => editCols(b).forEach(({ c }) => keys.push(ckey(sheet.id, b.id, r, c))));
    });
    return keys;
  }
  function progress(sheet) {
    const keys = sheetKeys(sheet);
    const filled = keys.filter((k) => String(D()[k] ?? '').trim() !== '').length;
    return { filled, total: keys.length, ratio: keys.length ? filled / keys.length : 0 };
  }
  /* 시트의 예시 답안을 입력 칸과 같은 키로 모은다 */
  function exampleData(sheet) {
    const d = {};
    sheet.blocks.forEach((b) => {
      if ((b.type === 'field' || b.type === 'q') && b.a) d[fkey(sheet.id, b.id)] = b.a;
      if (b.type === 'table') b.rows.forEach((row, r) => editCols(b).forEach(({ c }) => { const a = row.a?.[c - off(b)]; if (a) d[ckey(sheet.id, b.id, r, c)] = a; }));
    });
    return d;
  }
  function exampleAll() {
    const d = {};
    course().sheets.forEach((s) => Object.assign(d, exampleData(s)));
    return d;
  }

  /* ---------- 자동 계산 · 점검 ---------- */
  const chip = (kind, text) => `<span class="chip chip-${kind}">${esc(text)}</span>`;
  const line = (kind, text) => text ? `<li class="chk chk-${kind}"><span class="dot" aria-hidden="true"></span><span>${text}</span></li>` : '';
  const list = (items) => `<ul class="chks">${items.join('')}</ul>`;
  const bars = (items, max = 100, unit = '%') => `<div class="bars">${items.map((it) => `
      <div class="bar-row"><span class="bar-label">${esc(it.label)}</span>
        <span class="bar-track"><span class="bar-fill ${it.cls || ''}" style="width:${Math.max(0, Math.min(100, ((it.value || 0) / max) * 100))}%"></span></span>
        <span class="bar-val">${Number.isFinite(it.value) ? fmt(it.value, 1) + unit : '—'}</span></div>`).join('')}</div>`;
  const stat = (big, small) => `<div class="stat"><b>${big}</b><span>${small}</span></div>`;
  const stats = (arr) => `<div class="stats">${arr.join('')}</div>`;
  const pickRow = () => ({ A: 0, B: 1, C: 2 }[V('s4', 'pick')]);
  const chosenSlogan = () => { const r = pickRow(); return r === undefined ? '' : C('s4', 'opts', r, 2); };
  const chosenName = () => { const r = pickRow(); return r === undefined ? '' : C('s4', 'opts', r, 1); };
  const chosenTrend = () => TREND_NAMES.find((k) => C('s1', 'dir', 0, 1).includes(k)) || '';

  function tableSum(sid, tid, c) {
    const b = findBlock(sid, tid); if (!b) return NaN;
    let s = 0, any = false;
    b.rows.forEach((_, r) => { const n = CN(sid, tid, r, c); if (Number.isFinite(n)) { s += n; any = true; } });
    return any ? s : NaN;
  }
  const sumOf = (vals) => vals.reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0);

  const CALC = {
    sigCheck() {
      const b = findBlock('s1', 'sig');
      const rows = b.rows.map((_, r) => ({ k: C('s1', 'sig', r, 0), st: C('s1', 'sig', r, 4) }));
      const picked = rows.filter((x) => x.k);
      if (!picked.length) return `<p class="muted">트렌드 키워드를 고르면 케이스 ② 에서 그 키워드의 신호를 바로 보여 줍니다.</p>`;
      const dup = picked.map((x) => x.k).filter((k, i, a) => a.indexOf(k) !== i);
      const strong = rows.filter((x) => x.st === '강').length;
      const sig = [...new Set(picked.map((x) => x.k))].map((k) => {
        const hits = CASE2.filter((c) => c[0] === k);
        return `<div class="sig"><b>${esc(k)}</b>${hits.length ? `<ul>${hits.map((h) => `<li>${esc(h[1])} <b>${esc(h[2])}</b> <span class="muted">(${esc(h[3])})</span></li>`).join('')}</ul>` : '<p class="muted">케이스 ②에 이 키워드의 데이터가 없습니다</p>'}</div>`;
      }).join('');
      return `<p class="calc-sub">케이스 ② 에서 고른 키워드의 신호</p><div class="sigs">${sig}</div>` + list([
        line(strong === 1 ? 'ok' : strong > 1 ? 'warn' : 'idle', strong === 1 ? '신호 강도 "강"을 하나로 좁혔습니다' : strong > 1 ? `"강"이 ${strong}개입니다 — 가장 강한 하나만 "강"으로 두십시오` : '가장 강한 신호 하나에 "강"을 표시하십시오'),
        dup.length ? line('warn', `같은 키워드를 두 번 골랐습니다 · ${esc(dup[0])}`) : '',
      ]);
    },
    dirCheck() {
      const tr = chosenTrend(), type = C('s1', 'dir', 1, 1), sentence = C('s1', 'dir', 4, 1);
      const t = TRENDS.find((x) => x.k === tr);
      const items = [];
      if (!tr) items.push(line('idle', '"선택한 트렌드" 칸에 키워드 이름을 적으면 어울리는 유형을 알려 줍니다'));
      else if (t) items.push(line(type && t.type.includes(type) ? 'ok' : 'info', `${esc(tr)} → 교안의 어울리는 유형 · <b>${esc(t.type)}</b>${type ? (t.type.includes(type) ? ' — 고른 유형과 같습니다' : ` — ${esc(type)}을(를) 고른 이유를 설명할 수 있어야 합니다`) : ''}`));
      else items.push(line('info', `${esc(tr)} — 캠페인명과 메시지가 한 문장으로 요약될 만큼 단순해야 한다는 시사점입니다`));
      if (type) { const ty = TYPES.find((x) => x.k === type); if (ty) items.push(line('info', `${esc(type)} · 설계 공식 ${esc(ty.formula)} · 대표 사례 ${esc(ty.case)}`)); }
      if (sentence) {
        const miss = [!(type && sentence.includes(type.replace('형', ''))) && '[캠페인 유형]', !/(5,000|5000|신규|도달|매출|만족)/.test(sentence) && '[목표]'].filter(Boolean);
        items.push(line(miss.length ? 'warn' : 'ok', miss.length ? `방향 한 문장에 ${miss.join(' · ')}이(가) 보이지 않습니다` : '방향 한 문장이 형식을 갖췄습니다'));
      }
      return list(items);
    },
    mainSub() {
      const b = findBlock('s2', 'goals');
      const picks = b.rows.map((_, r) => C('s2', 'goals', r, 4));
      const m = picks.filter((p) => p === '주').length, s = picks.filter((p) => p === '부').length;
      return list([
        line(m === 1 ? 'ok' : 'bad', `주 목표 ${m}개 ${m === 1 ? '— 좋습니다' : '— 주 목표는 하나만 고르십시오'}`),
        line(s === 1 ? 'ok' : 'bad', `부 목표 ${s}개 ${s === 1 ? '— 좋습니다' : '— 부 목표도 하나만 고르십시오'}`),
        line('info', '직전 캠페인 신규 회원 2,300명 → 목표 5,000명 (2.2배) · SNS 도달 6.5만 → 10만 (1.5배)'),
      ]);
    },
    insight() {
      const b = findBlock('s3', 'ins');
      const re = /(때|는데|은데|서 |어서|아서|면서)/;
      const items = b.rows.map((_, r) => {
        const t = C('s3', 'ins', r, 1).trim(), ty = C('s3', 'ins', r, 3), src = C('s3', 'ins', r, 2).trim();
        if (!t) return line('idle', `${r + 1}번 — 아직 비어 있습니다`);
        const miss = [!re.test(t) && '상황', !src && '근거', !ty && '유형'].filter(Boolean);
        const hasNum = /\d/.test(src);
        return line(miss.length ? 'warn' : 'ok', `${r + 1}번 — ${miss.length ? `${miss.join(' · ')}이(가) 보이지 않습니다` : '상황 · 근거 · 유형을 갖췄습니다'}${src && !hasNum ? ' · 근거에 케이스 ② 수치를 넣으면 더 강해집니다' : ''}`);
      });
      const types = new Set(b.rows.map((_, r) => C('s3', 'ins', r, 3)).filter(Boolean));
      items.push(line(types.size >= 2 ? 'ok' : 'idle', `유형 ${types.size}가지 사용 (경험 · 가치 · 혜택)`));
      return list(items);
    },
    slogan() {
      const r = pickRow();
      if (r === undefined) return `<p class="muted">최종 선택안을 고르면 여기에 캠페인명과 슬로건이 나란히 보입니다.</p>`;
      const name = chosenName(), sl = chosenSlogan();
      const len = (s) => s.replace(/\s/g, '').length;
      const ok = findBlock('s4', 'crit').rows.filter((_, i) => C('s4', 'crit', i, 1) === '충족').length;
      return `<div class="poster"><span class="poster-eyebrow">${esc(V('s4', 'pick'))}안 · ${esc(state.team || '우리 조')}</span><strong>${esc(name || '캠페인명 미입력')}</strong><em>${esc(sl || '슬로건 미입력')}</em></div>` +
        list([
          line(sl && len(sl) <= 20 ? 'ok' : 'warn', `슬로건 ${len(sl)}자 (공백 제외) ${len(sl) <= 20 ? '' : '— 20자를 넘으면 한 문장 요약이 어렵습니다 (제로클릭)'}`),
          line(ok === 4 ? 'ok' : 'idle', `네 조건 충족 ${ok}/4 · 간결 · 기억 · 감성 · 브랜드`),
          /최고|프리미엄|만나보세요|최대/.test(sl) ? line('warn', '브랜드 자랑처럼 들립니다 — 고객의 변화를 말하고 있습니까?') : '',
        ]);
    },
    story() {
      const parts = ['p1', 'p2', 'p3', 'p4'].map((id) => V('s5', id).trim());
      const labels = ['문제', '해결', '고객 경험', '브랜드 가치'];
      return `<p class="calc-sub">네 칸을 이어 읽기 · ${parts.filter(Boolean).length}/4칸 — 소리 내어 읽어 한 문단으로 들리는지 확인하십시오</p>` +
        `<div class="readaloud">${parts.map((p, i) => p ? `<span class="ra ra-${i}">${esc(p)}</span>` : `<span class="ra ra-empty">[${labels[i]} 비어 있음]</span>`).join(' ')}</div>`;
    },
    channel() {
      const b = findBlock('s6', 'ch');
      const rows = b.rows.map((row, r) => ({ label: row.l.replace(/\s*\(.*\)/, ''), use: C('s6', 'ch', r, 1), value: CN('s6', 'ch', r, 4) }));
      const sum = sumOf(rows.map((x) => x.value));
      const wrong = rows.filter((x) => x.use === '미사용' && x.value > 0);
      const app = rows[5].value;
      const organic = 120000 * 0.08;
      const dig6 = sumOf([rows[0].value, rows[1].value, rows[5].value]), inf6 = sumOf([rows[3].value, rows[4].value]);
      const dig9 = CN('s9', 'bud', 2, 1), inf9 = CN('s9', 'bud', 3, 1);
      return bars(rows.map((x) => ({ label: x.label, value: x.value, cls: x.use === '미사용' ? 'off' : '' }))) +
        stats([stat(fmt(organic), '인스타 오가닉 도달 · 12만 × 8%'), stat(fmt(100000 - organic), '목표 10만까지 모자라는 도달 · 광고 · 인플루언서로')]) +
        list([
          line(sum > 0 && sum <= 100 ? 'info' : sum > 100 ? 'bad' : 'idle', `채널 비중 합계 ${fmt(sum, 1)}%${sum > 0 && sum < 100 ? ` · 나머지 ${fmt(100 - sum, 1)}%는 ⑨ 예산의 콘텐츠 · 혜택 · 인력 · 예비비` : sum > 100 ? ' — 100%를 넘었습니다' : ''}`),
          Number.isFinite(app) && app > 5 ? line('warn', `앱 푸시 · 멤버십 ${fmt(app)}% — 이미 우리 회원에게만 닿습니다. 신규 고객 확보가 목표라면 줄이십시오`) : '',
          ...wrong.map((x) => line('warn', `${esc(x.label)} — 미사용인데 예산 ${fmt(x.value)}%가 잡혀 있습니다`)),
          Number.isFinite(dig9) ? line(dig6 === dig9 ? 'ok' : 'warn', `인스타 + 유튜브 + 앱 ${fmt(dig6)}% ↔ ⑨ 디지털 광고 · SNS ${fmt(dig9)}% ${dig6 === dig9 ? '일치' : '— 맞추십시오'}`) : '',
          Number.isFinite(inf9) ? line(inf6 === inf9 ? 'ok' : 'warn', `인플루언서 + 라이브 ${fmt(inf6)}% ↔ ⑨ 인플루언서 · 라이브커머스 ${fmt(inf9)}% ${inf6 === inf9 ? '일치' : '— 맞추십시오'}`) : '',
        ]);
    },
    imc() {
      const src = V('s7', 'repeat') || chosenSlogan();
      const kws = src.split(/[,，·\s]+/).map((s) => s.replace(/[^가-힣A-Za-z0-9]/g, '')).filter((s) => s.length >= 2);
      if (!kws.length) return `<p class="muted">반복 메시지를 적거나 ④에서 슬로건을 고르면, 단계마다 핵심어가 이어지는지 봅니다.</p>`;
      const b = findBlock('s7', 'imc');
      const items = b.rows.map((row, r) => {
        const msg = C('s7', 'imc', r, 2);
        if (!msg.trim()) return line('idle', `${esc(row.l)} — 메시지 비어 있음`);
        const hit = kws.filter((k) => msg.includes(k));
        return line(hit.length ? 'ok' : 'warn', `${esc(row.l)} — ${hit.length ? hit.map((h) => chip('ok', h)).join(' ') : '핵심어가 보이지 않습니다 · 여기서 끊기지 않는지 확인하십시오'}`);
      });
      const noBridge = b.rows.map((row, r) => (!C('s7', 'imc', r, 4).trim() && C('s7', 'imc', r, 2).trim()) ? row.l : null).filter(Boolean);
      return `<p class="calc-sub">핵심어 ${kws.map((k) => chip('info', k)).join(' ')}</p>` + list([...items, noBridge.length ? line('warn', `다음 단계로 넘기는 장치가 빈 단계 · ${noBridge.map(esc).join(', ')}`) : '']);
    },
    weeks() {
      const v = [1, 2, 3].map((c) => CN('s8', 'wk', 2, c));
      const total = sumOf(v);
      if (!v.some(Number.isFinite)) return `<p class="muted">주차별 예상 방문객을 적으면 합계와 피크 주를 계산합니다.</p>`;
      const peak = v.indexOf(Math.max(...v.map((x) => (Number.isFinite(x) ? x : -1))));
      return stats([stat(fmt(total) + '명', '3주 예상 방문객 합계'), stat(`${peak + 1}주차`, '방문이 가장 많은 주')]) +
        list([
          line(peak === 1 ? 'ok' : 'info', peak === 1 ? '2주차(피크)에 방문이 가장 많습니다' : '피크 주와 가장 큰 이벤트가 같은 주인지 확인하십시오'),
          line(total >= 35000 ? 'info' : 'idle', `가입 목표 5,000명이면 방문객의 ${total ? fmt(5000 / total * 100, 1) : '—'}%가 가입해야 합니다`),
        ]);
    },
    budget() {
      const b = findBlock('s9', 'bud');
      const rows = b.rows.map((row, r) => ({ label: row.l, p: CN('s9', 'bud', r, 1) }));
      const sum = sumOf(rows.map((x) => x.p));
      const ch = (r) => CN('s6', 'ch', r, 4);
      const dig6 = sumOf([ch(0), ch(1), ch(5)]), inf6 = sumOf([ch(3), ch(4)]), off6 = ch(6);
      const any6 = Number.isFinite(tableSum('s6', 'ch', 4));
      const table = `<div class="tbl-wrap"><table class="mini"><thead><tr><th>항목</th><th>비중</th><th>금액</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${esc(x.label)}</td><td class="n">${Number.isFinite(x.p) ? fmt(x.p, 1) + '%' : '—'}</td><td class="n">${Number.isFinite(x.p) ? fmt(BUDGET * x.p / 100) + '원' : '—'}</td></tr>`).join('')}
        <tr class="sum"><td>합계</td><td class="n">${fmt(sum, 1)}%</td><td class="n">${fmt(BUDGET * sum / 100)}원</td></tr></tbody></table></div>`;
      return table + stats([stat(won(BUDGET / GOAL_MEMBERS), '1인당 획득 비용 · 5억 ÷ 5,000명'), stat(won(BUDGET / 2300), '직전 캠페인 · 5억 ÷ 2,300명')]) + list([
        line(Math.abs(sum - 100) < 0.01 ? 'ok' : 'bad', `비중 합계 ${fmt(sum, 1)}% ${Math.abs(sum - 100) < 0.01 ? '' : '— 100%가 되도록 맞추십시오'}`),
        any6 ? line(dig6 === rows[2].p ? 'ok' : 'warn', `⑥ 인스타 + 유튜브 + 앱 ${fmt(dig6)}% ↔ 디지털 광고 · SNS ${fmt(rows[2].p)}% ${dig6 === rows[2].p ? '일치' : '— 맞추십시오'}`) : line('idle', '⑥ 채널 비중을 넣으면 교차 점검합니다'),
        any6 ? line(inf6 === rows[3].p ? 'ok' : 'warn', `⑥ 인플루언서 + 라이브 ${fmt(inf6)}% ↔ 인플루언서 · 라이브커머스 ${fmt(rows[3].p)}% ${inf6 === rows[3].p ? '일치' : '— 맞추십시오'}`) : '',
        any6 && Number.isFinite(off6) ? line(off6 === sumOf([rows[0].p, rows[1].p]) ? 'ok' : 'info', `⑥ 오프라인 ${fmt(off6)}% ↔ 공간 + 콘텐츠 ${fmt(sumOf([rows[0].p, rows[1].p]))}%`) : '',
      ]);
    },
    kpiMain() {
      const b = findBlock('s10', 'kpi');
      const mains = b.rows.map((row, r) => C('s10', 'kpi', r, 1) === '주' ? row.l.split(' ')[0] : null).filter(Boolean);
      const good = mains.includes('인지') || mains.includes('행동');
      const noHow = b.rows.filter((_, r) => C('s10', 'kpi', r, 2).trim() && !C('s10', 'kpi', r, 5).trim()).length;
      return list([
        line(mains.length ? (good ? 'ok' : 'warn') : 'idle', mains.length ? `주 지표 · ${mains.join(', ')}${good ? '' : ' — 신규 고객 확보가 목표라면 인지 · 행동을 주 지표로 두는 것이 교안의 기준입니다'}` : '주 지표를 고르십시오'),
        noHow ? line('warn', `측정 방법 · 시점이 빈 줄이 ${noHow}개 있습니다 — 재는 방법까지 정해야 KPI입니다`) : '',
      ]);
    },
    onepage(sid) {
      const b = findBlock(sid, 'one');
      const title = isCampaign() ? chosenName() : C('c5', 'cp', 0, 1);
      const sub = isCampaign() ? chosenSlogan() : C('c5', 'cp', 1, 1);
      return `<div class="onepage">
        <div class="op-head"><span class="op-eyebrow">${esc(course().code)} · ${esc(state.team || '팀명')} · ${esc(state.author || '작성자')}</span>
        <h3>${esc(title || '캠페인명')}</h3><p>${esc(sub || '슬로건')}</p></div>
        <dl>${b.rows.map((row, i) => `<div><dt>${esc(row.l)}</dt><dd>${esc(C(sid, 'one', i, 1)) || '<span class="muted">비어 있음</span>'}</dd></div>`).join('')}</dl></div>`;
    },
    presTime(sid, blk) {
      const sum = tableSum(sid, 'pres', 2);
      const ok = Number.isFinite(sum) && sum <= blk.limit;
      return list([line(!Number.isFinite(sum) ? 'idle' : ok ? 'ok' : 'bad', `발표 시간 합계 ${fmt(sum)}${blk.unit} / 제한 ${blk.limit}${blk.unit}${Number.isFinite(sum) && !ok ? ' — 줄이십시오' : ''}`)]);
    },
    evalSum3(sid, blk) {
      const b = findBlock(sid, 'ev');
      const max = blk.max * b.rows.length;
      const names = [V(sid, 'teamA') || '팀 ①', V(sid, 'teamB') || '팀 ②', V(sid, 'teamC') || '팀 ③'];
      const over = [];
      b.rows.forEach((row, r) => [1, 2, 3].forEach((c) => { const n = CN(sid, 'ev', r, c); if (n > blk.max || n < 0) over.push(`${row.l} · ${names[c - 1]}`); }));
      return stats([1, 2, 3].map((c) => stat(`${fmt(tableSum(sid, 'ev', c))}<small> / ${max}</small>`, esc(names[c - 1])))) +
        (over.length ? list(over.map((o) => line('bad', `${esc(o)} — 0~${blk.max}점 사이로 적으십시오`))) : '');
    },
    evalSum(sid, blk) {
      const b = findBlock(sid, 'ev');
      const max = blk.max * b.rows.length;
      const names = ['자체 평가', V(sid, 'teamA') || '팀 A', V(sid, 'teamB') || '팀 B'];
      return stats([1, 2, 3].map((c) => stat(`${fmt(tableSum(sid, 'ev', c))}<small> / ${max}</small>`, esc(names[c - 1]))));
    },
    sourceTag() {
      const b = findBlock('c1', 'c3');
      const n = b.rows.filter((_, r) => /\[[^\]]+\]/.test(C('c1', 'c3', r, 1))).length;
      const j = b.rows.filter((_, r) => /\[기획 판단\]/.test(C('c1', 'c3', r, 2))).length;
      return list([
        line(n === b.rows.length ? 'ok' : 'warn', `사실 칸 ${n}/${b.rows.length}곳에 출처 종류가 붙어 있습니다`),
        line(j === b.rows.length ? 'ok' : 'idle', `판단 칸 ${j}/${b.rows.length}곳이 [기획 판단]으로 구분돼 있습니다`),
      ]);
    },
    emotion() {
      const map = { '+': 1, '0': 0, '−': -1 };
      const vals = [1, 2, 3, 4, 5].map((c) => map[C('c3', 'emo', 0, c)]);
      const heads = findBlock('c3', 'jm').cols.slice(1).map((c) => c.h);
      const W = 520, H = 150, px = (i) => 40 + i * ((W - 80) / 4), py = (v) => 30 + (1 - v) * 45;
      const pts = vals.map((v, i) => v === undefined ? null : [px(i), py(v)]);
      const path = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
      const known = vals.filter((v) => v !== undefined);
      const min = known.length ? Math.min(...known) : NaN;
      const lows = vals.map((v, i) => v === min ? heads[i] : null).filter(Boolean);
      const svg = `<svg class="emo" viewBox="0 0 ${W} ${H}" role="img" aria-label="단계별 감정 곡선">
        ${[1, 0, -1].map((v) => `<line x1="30" x2="${W - 30}" y1="${py(v)}" y2="${py(v)}" class="grid"/><text x="14" y="${py(v) + 4}" class="axis">${v > 0 ? '+' : v < 0 ? '−' : '0'}</text>`).join('')}
        ${path ? `<path d="${path}" class="curve" fill="none"/>` : ''}
        ${pts.map((p, i) => p ? `<circle cx="${p[0]}" cy="${p[1]}" r="6" class="${vals[i] === min ? 'pt low' : 'pt'}"/>` : '').join('')}
        ${heads.map((h, i) => `<text x="${px(i)}" y="${H - 8}" text-anchor="middle" class="axis">${esc(h)}</text>`).join('')}
      </svg>`;
      return `<div class="tbl-wrap">${svg}</div>` + (lows.length ? list([line(min < 0 ? 'warn' : 'info', `가장 낮은 단계 · ${lows.map((l) => esc(l)).join(', ')}`)]) : '<p class="muted">단계별 감정을 고르면 곡선이 그려집니다.</p>');
    },
    smartCap() {
      const cap = N('c4', 'staff') * N('c4', 'perDay') * N('c4', 'days');
      const g1 = N('c4', 'g1'), g2 = N('c4', 'g2'), g3 = N('c4', 'g3');
      return stats([
        stat(fmt(cap) + '건', `상담 수용량 · ${fmt(N('c4', 'staff'))}명 × ${fmt(N('c4', 'perDay'))}건 × ${fmt(N('c4', 'days'))}일`),
        stat(Number.isFinite(g1 / cap) ? fmt(g1 / cap * 100, 0) + '%' : '—', '목표 1 ÷ 수용량'),
        stat(Number.isFinite(g2 / g1) ? fmt(g2 / g1 * 100, 0) + '%' : '—', '구매 전환 (목표 2 ÷ 목표 1)'),
        stat(Number.isFinite(g3 / g1) ? fmt(g3 / g1 * 100, 0) + '%' : '—', '재방문 (목표 3 ÷ 목표 1)'),
      ]);
    },
    five() {
      const b = findBlock('c5', 'five');
      const cnt = {}; b.rows.map((_, r) => C('c5', 'five', r, 2)).filter(Boolean).forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; });
      return `<p class="calc-sub">${Object.keys(cnt).length ? Object.entries(cnt).map(([k, v]) => chip(k === '충족' ? 'ok' : k === '미흡' ? 'bad' : 'info', `${k} ${v}`)).join(' ') : '<span class="muted">충족 여부를 고르십시오</span>'}</p>`;
    },
    space() {
      const b = findBlock('c6', 'pg');
      const prog = tableSum('c6', 'pg', 5), aisle = N('c6', 'aisle'), hall = N('c6', 'hall');
      const tot = (prog || 0) + (aisle || 0);
      const stages = new Set(b.rows.map((_, r) => C('c6', 'pg', r, 3)).filter(Boolean));
      const missing = ['유입', '체류', '전환', '재방문'].filter((s) => !stages.has(s));
      return bars([...b.rows.map((row, r) => ({ label: C('c6', 'pg', r, 1) || `프로그램 ${row.l}`, value: CN('c6', 'pg', r, 5) })), { label: '통로·대기·지원', value: aisle, cls: 'off' }], hall || 200, '평') +
        list([
          line(!Number.isFinite(hall) ? 'idle' : tot <= hall ? 'ok' : 'bad', `프로그램 ${fmt(prog)}평 + 통로 ${fmt(aisle)}평 = ${fmt(tot)}평 / 행사장 ${fmt(hall)}평${tot > hall ? ` — ${fmt(tot - hall)}평 초과` : ''}`),
          line(missing.length ? 'warn' : 'ok', missing.length ? `빠진 여정 단계 · ${missing.join(', ')}` : '유입 · 체류 · 전환 · 재방문을 모두 다룹니다'),
        ]);
    },
    grid() {
      const b = findBlock('c7', 'sch');
      return `<div class="tbl-wrap"><table class="heat"><thead><tr><th></th>${b.cols.slice(1).map((c) => `<th>${esc(c.h.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>${b.rows.map((row, r) => `<tr><th>${esc(row.l)}</th>${b.cols.slice(1).map((_, c) => C('c7', 'sch', r, c + 1).trim() ? '<td class="on">●</td>' : '<td>·</td>').join('')}</tr>`).join('')}</tbody></table></div>` +
        `<p class="calc-sub">빈 칸(·)은 그 시기에 해당 채널이 멈춰 있다는 뜻입니다.</p>`;
    },
    budget2() {
      const total = N('c8', 'total'); const b = findBlock('c8', 'bud');
      const rows = b.rows.map((row, r) => ({ label: row.l, ref: CN('c8', 'bud', r, 1), p: CN('c8', 'bud', r, 2) }));
      const sum = rows.reduce((a, x) => a + (x.p || 0), 0);
      return `<div class="tbl-wrap"><table class="mini"><thead><tr><th>항목</th><th>원본</th><th>배분</th><th>변화</th><th>금액</th></tr></thead><tbody>${rows.map((x) => {
        const d = x.p - x.ref;
        return `<tr><td>${esc(x.label)}</td><td class="n">${fmt(x.ref)}%</td><td class="n">${fmt(x.p, 1)}%</td><td class="n ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${Number.isFinite(d) ? (d > 0 ? '▲' : d < 0 ? '▼' : '') + fmt(Math.abs(d)) : '—'}</td><td class="n">${Number.isFinite(total) && Number.isFinite(x.p) ? fmt(total * x.p / 100) + '원' : '—'}</td></tr>`;
      }).join('')}<tr class="sum"><td>합계</td><td class="n">${fmt(tableSum('c8', 'bud', 1))}%</td><td class="n">${fmt(sum, 1)}%</td><td></td><td class="n">${Number.isFinite(total) ? fmt(total * sum / 100) + '원' : '—'}</td></tr></tbody></table></div>` +
        list([line(Math.abs(sum - 100) < 0.01 ? 'ok' : 'bad', `배분 비중 합계 ${fmt(sum, 1)}%`)]);
    },
    cut() {
      const total = N('c8', 'total'), cut = tableSum('c8', 'cut', 1), target = total * 0.2;
      return stats([stat(won(target), '20% 삭감 목표'), stat(won(cut), '적어 넣은 삭감액'), stat(won(total - (cut || 0)), '삭감 후 예산')]) +
        list([Number.isFinite(cut) ? line(Math.abs(cut - target) < 1 ? 'ok' : 'warn', Math.abs(cut - target) < 1 ? '삭감액이 정확히 20%입니다' : `${won(Math.abs(target - cut))} ${cut < target ? '더 줄여야 합니다' : '초과 삭감입니다'}`) : line('idle', '항목별 삭감액을 적으십시오')]);
    },
    roi() {
      const cost = Number.isFinite(N('c9', 'cost')) ? N('c9', 'cost') : N('c8', 'total');
      const gp = N('c9', 'gp') / 100, buyers = N('c9', 'buyers'), inc = N('c9', 'inc');
      const be = cost / gp;
      const out = [stat(won(cost), '프로모션 총 비용'), stat(won(be), `손익분기 증분 매출 · 비용 ÷ GP ${fmt(gp * 100)}%`), stat(won(be / buyers), `구매자 1인당 필요한 증분 매출 · ${fmt(buyers)}명`)];
      if (Number.isFinite(inc)) out.push(stat(fmt((inc * gp - cost) / cost * 100, 1) + '%', 'ROI · (증분 매출 × GP − 비용) ÷ 비용'));
      return stats(out);
    },
  };

  /* ---------- ⑪ 초안 불러오기 ---------- */
  function composeDraft() {
    const j = (...xs) => xs.filter((x) => x && String(x).trim()).join(' · ');
    const first = (s) => (s || '').split(/(?<=[.다요])\s/)[0];
    if (isCampaign()) {
      const g = findBlock('s2', 'goals');
      const main = g.rows.findIndex((_, i) => C('s2', 'goals', i, 4) === '주');
      const strong = findBlock('s1', 'sig').rows.findIndex((_, i) => C('s1', 'sig', i, 4) === '강');
      const ch = findBlock('s6', 'ch').rows.map((row, i) => C('s6', 'ch', i, 1) === '사용' ? `${row.l.replace(/\s*\(.*\)/, '')} ${C('s6', 'ch', i, 4)}%` : null).filter(Boolean).join(' · ');
      const bud = findBlock('s9', 'bud').rows.map((row, i) => { const p = C('s9', 'bud', i, 1); return p ? `${row.l.split(' ')[0]} ${p}` : null; }).filter(Boolean).join(' · ');
      const kpiMain = findBlock('s10', 'kpi').rows.map((row, i) => C('s10', 'kpi', i, 1) === '주' ? `${C('s10', 'kpi', i, 2)} ${C('s10', 'kpi', i, 4)}` : null).filter(Boolean).join(' · ');
      return [
        j(chosenTrend() || C('s1', 'sig', Math.max(strong, 0), 0), strong >= 0 && C('s1', 'sig', strong, 1), C('s1', 'dir', 1, 1) && `→ ${C('s1', 'dir', 1, 1)}`),
        j(main >= 0 && `주 목표 ${g.rows[main].fx?.[0] || ''}`, C('s2', 'seg', 0, 1) && `타깃 ${C('s2', 'seg', 0, 1)}`, first(C('s3', 'ins', 0, 1))),
        chosenName() ? `${chosenName()} — "${chosenSlogan()}"` : '',
        ['p1', 'p2', 'p3', 'p4'].map((id) => first(V('s5', id))).filter(Boolean).join(' → '),
        j(ch, V('s7', 'repeat') && `반복 메시지 "${V('s7', 'repeat')}"`),
        j(C('s8', 'ops', 0, 1), C('s8', 'wk', 2, 1) && `방문 ${[1, 2, 3].map((c) => C('s8', 'wk', 2, c)).filter(Boolean).join(' / ')}`),
        bud ? `5억 — ${bud} (%)` : '',
        j(kpiMain, '1인당 획득 비용 10만원'),
      ];
    }
    const pg = findBlock('c6', 'pg').rows.map((_, i) => C('c6', 'pg', i, 1)).filter(Boolean).join(' → ');
    const bud = findBlock('c8', 'bud').rows.map((row, i) => `${row.l.split(' ')[0]} ${C('c8', 'bud', i, 2)}%`).join(' · ');
    return [
      j(C('c5', 'cp', 0, 1) && `${C('c5', 'cp', 0, 1)} — ${C('c5', 'cp', 1, 1)}`, V('c4', 'period')),
      j(C('c1', 'imp', 0, 1), C('c1', 'imp', 1, 1)),
      j(V('c2', 'core'), C('c2', 'per', 0, 1), first(C('c2', 'needs', 0, 1))),
      j(pg, Number.isFinite(N('c4', 'staff')) && `상담원 ${fmt(N('c4', 'staff'))}명`),
      j(Number.isFinite(N('c4', 'g1')) && `첫 상담 ${fmt(N('c4', 'g1'))}명`, Number.isFinite(N('c4', 'g2')) && `7일 내 구매 ${fmt(N('c4', 'g2'))}명`, Number.isFinite(N('c4', 'g3')) && `30일 내 재방문 ${fmt(N('c4', 'g3'))}명`),
      findBlock('c7', 'sch').rows.map((row) => row.l).join(' · '),
      j(Number.isFinite(N('c8', 'total')) && won(N('c8', 'total')), bud),
      j(Number.isFinite(N('c9', 'gp')) && `GP ${fmt(N('c9', 'gp'))}% 조건 손익분기 ${won((Number.isFinite(N('c9', 'cost')) ? N('c9', 'cost') : N('c8', 'total')) / (N('c9', 'gp') / 100))}`),
    ];
  }

  /* ---------- 렌더링: 입력 칸 ---------- */
  const app = $('#app');

  function inputHTML(key, t, opts, labelId) {
    const v = val(key);
    if (RO) return `<div class="ro ${v ? '' : 'ro-empty'}">${v ? esc(v).replace(/\n/g, '<br>') : '—'}</div>`;
    const aria = labelId ? `aria-labelledby="${labelId}"` : '';
    if (t === 'pick') return `<select id="f-${key}" data-k="${key}" ${aria}><option value="">선택</option>${opts.map((o) => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (t === 'area') return `<textarea id="f-${key}" data-k="${key}" rows="2" ${aria}>${esc(v)}</textarea>`;
    const n = t === 'num' || t === 'pct';
    return `<span class="inwrap ${t === 'pct' ? 'pct' : ''}"><input id="f-${key}" data-k="${key}" class="${n ? 'n' : ''}" ${n ? 'inputmode="decimal"' : ''} value="${esc(v)}" ${aria} autocomplete="off"></span>`;
  }
  const exHTML = (ex) => ex && !RO ? `<div class="ex"><span>예)</span> ${esc(ex)}</div>` : '';
  const nudgeHTML = (n) => n && !RO ? `<details class="nudge"><summary>막히면 힌트</summary><p>${esc(n)}</p></details>` : '';

  function renderBlock(sheet, b, i) {
    const sid = sheet.id;
    if (b.type === 'note') return `<p class="note">${esc(b.text)}</p>`;
    if (b.type === 'field') {
      const key = fkey(sid, b.id);
      return `<div class="field ${b.t === 'num' || b.t === 'pick' ? 'field-short' : ''}"><label id="l-${key}" for="f-${key}">${esc(b.label)}</label>${b.hint ? `<span class="hint">${esc(b.hint)}</span>` : ''}${inputHTML(key, b.t, b.opts)}${exHTML(b.ex)}${nudgeHTML(b.nudge)}</div>`;
    }
    if (b.type === 'q') {
      const key = fkey(sid, b.id);
      return `<div class="field q"><label for="f-${key}"><span class="qmark">Q</span><span>${esc(b.q)}</span></label>${inputHTML(key, 'area')}${exHTML(b.ex)}${nudgeHTML(b.nudge)}</div>`;
    }
    if (b.type === 'table') {
      const o = off(b);
      const head = `<tr>${b.cols.map((c, ci) => `<th scope="col" class="col-${c.t || 'label'}" id="h-${sid}-${b.id}-${ci}">${esc(c.h)}</th>`).join('')}</tr>`;
      const body = b.rows.map((row, r) => (row.hideInForm && !RO) ? '' : `<tr>${o ? `<th scope="row">${esc(row.l)}${row.sub ? `<span class="row-sub">${esc(row.sub)}</span>` : ''}</th>` : ''}${b.cols.slice(o).map((col, k) => {
        const c = k + o;
        if (col.t === 'fixed') return `<td class="col-fixed">${esc(row.fx?.[c - o] || '')}</td>`;
        const { t, opts } = cellType(row, col);
        const key = ckey(sid, b.id, r, c);
        return `<td class="col-${t}">${inputHTML(key, t, opts, `h-${sid}-${b.id}-${c}`)}${exHTML(row.ex?.[c - o])}${nudgeHTML(row.nudge?.[c - o])}</td>`;
      }).join('')}</tr>`).join('');
      return `<div class="tbl-wrap sheet-table"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    }
    if (b.type === 'calc') {
      if (RO) { let h = ''; try { h = CALC[b.id](sid, b); } catch (e) { h = '<p class="muted">값이 비어 있습니다.</p>'; } return `<section class="calc"><h4>자동 점검</h4><div class="calc-body">${h}</div></section>`; }
      return `<section class="calc" data-calc="${b.id}" data-i="${i}" aria-live="polite"><h4>자동 점검</h4><div class="calc-body"></div></section>`;
    }
    if (b.type === 'typePicker') return typePickerHTML(sid);
    if (b.type === 'draft') return RO ? '' : `<div class="draft"><p>앞 워크시트에 적은 내용으로 아래 표의 <b>빈 칸</b>을 채웁니다. 채운 뒤 문장을 다듬으십시오.</p><button type="button" class="btn" data-act="draft">초안 불러오기</button></div>`;
    return '';
  }

  /* 실습 ① 캠페인 유형 선택 — 인사이트 확인 → 유형 카드 5개(하나만) → 사례 줄과 우리 캠페인 줄 → 참고 예시(정답 아님) */
  const TYPE_KEY = (sid) => ckey(sid, 'dir', 1, 1);
  const tpKey = (sid, ti, i) => `${sid}.tp.${ti}.${i}`;
  function typePickerHTML(sid) {
    const chosen = val(TYPE_KEY(sid));
    const ui = state.tp || {};
    const openK = RO ? chosen : (ui.preview || chosen);
    const ti = TYPE_PICK.findIndex((t) => t.k === openK);
    const ins = C('s3', 'ins', 0, 1) || (() => { const b = findBlock('s1', 'sig'); const r = b ? b.rows.findIndex((_, i) => C('s1', 'sig', i, 4) === '강') : -1; return r >= 0 ? C('s1', 'sig', r, 2) : ''; })();
    if (RO) {
      if (ti < 0) return '';
      const t = TYPE_PICK[ti];
      const ours = t.slots.map((_, i) => val(tpKey(sid, ti, i)));
      return `<section class="tp tp-ro"><h4>캠페인 유형 · <b>${esc(t.k)}</b> <small>${esc(t.case)} · ${esc(t.formula)}</small></h4>${ours.some(Boolean) ? `<p class="tp-line">${t.slots.map((sl, i) => `<span><em>${esc(sl)}</em>${esc(ours[i] || '—')}</span>`).join('<i>→</i>')}</p>` : ''}</section>`;
    }
    const cards = TYPE_PICK.map((t, i) => `<article class="tp-card ${chosen === t.k ? 'sel' : ''} ${openK === t.k ? 'open' : ''}">
        <span class="tp-no">0${i + 1}</span><h5>${esc(t.k)}</h5>
        <p class="tp-when"><small>이럴 때 고른다</small>${esc(t.pick)}</p>
        <div class="tp-btns">
          <button type="button" class="btn ${chosen === t.k ? '' : 'ghost'}" data-tppick="${esc(t.k)}" aria-pressed="${chosen === t.k}">${chosen === t.k ? '✓ 고른 유형' : '이 유형 고르기'}</button>
          <button type="button" class="linkish" data-tpview="${esc(t.k)}">참고 사례 보기</button>
        </div></article>`).join('');
    let panel = '';
    if (ti >= 0) {
      const t = TYPE_PICK[ti];
      const applied = !!(ui.applied?.[t.k]) || t.slots.some((_, i) => val(tpKey(sid, ti, i)));
      const showEx = !!(ui.ex?.[t.k]);
      const head = `<tr><th scope="col"></th>${t.slots.map((sl) => `<th scope="col">${esc(sl)}</th>`).join('')}</tr>`;
      const caseRow = `<tr class="tp-case"><th scope="row">사례에서는<small>${esc(t.case)} · 참고 사례</small></th>${t.caseRow.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
      const ourRow = applied ? `<tr class="tp-our"><th scope="row">우리 캠페인<small>${esc(state.team || '우리 조')}</small></th>${t.slots.map((sl, i) => { const k = tpKey(sid, ti, i); return `<td><textarea id="f-${k}" data-k="${k}" rows="2" aria-label="우리 캠페인 · ${esc(sl)}" placeholder="${esc(sl)} 칸 — 우리 고객 이야기로">${esc(val(k))}</textarea></td>`; }).join('')}</tr>` : '';
      const exRow = showEx ? `<tr class="tp-ex"><th scope="row">참고 예시<small>정답이 아니라 참고 예시 · ${esc(t.exLabel)}</small></th>${t.exRow.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>` : '';
      panel = `<div class="tp-panel">
        <div class="tp-panel-head"><div><small>${chosen === t.k ? '고른 유형' : '미리 보는 유형'}</small><b>${esc(t.k)}</b></div><div><small>대표 사례</small><b>${esc(t.case)}</b></div><div><small>빌려 올 공식</small><b class="tp-formula">${esc(t.formula)}</b></div></div>
        ${t.note ? `<p class="tp-note">${esc(t.note)}</p>` : ''}
        <div class="tbl-wrap"><table class="tp-table"><thead>${head}</thead><tbody>${caseRow}${ourRow}${exRow}</tbody></table></div>
        <p class="tp-say">사례의 내용을 가져오는 게 아니라 <b>칸의 순서(공식)</b>만 가져옵니다. 칸 이름은 그대로 두고, 칸 안은 우리 고객 이야기로 채우십시오.</p>
        <div class="tp-actions">
          ${chosen === t.k ? '' : `<button type="button" class="btn" data-tppick="${esc(t.k)}">이 유형 고르기</button>`}
          ${applied ? '' : `<button type="button" class="btn ${chosen === t.k ? '' : 'ghost'}" data-act="tpApply" data-type="${esc(t.k)}">우리 캠페인에 적용</button>`}
          <button type="button" class="btn ghost" data-act="tpEx" data-type="${esc(t.k)}">${showEx ? '참고 예시 숨기기' : '참고 예시 보기'}</button>
          ${applied && chosen === t.k ? `<button type="button" class="btn ghost" data-act="tpBench" data-type="${esc(t.k)}">"벤치마킹 사례와 가져올 요소" 칸에 넣기</button>` : ''}
        </div></div>`;
    }
    return `<section class="tp">
      <h4 class="tp-title">캠페인 유형 고르기 <small>유형 → 대표 사례 → 가져올 공식이 한 줄로 이어집니다</small></h4>
      <p class="tp-ins"><b>우리 고객 인사이트</b>${ins ? esc(ins) : '<span class="muted">실습 ③ 인사이트(또는 위 표에서 "강"으로 고른 신호의 고객 상황)가 여기에 보입니다</span>'}</p>
      <div class="tp-cards">${cards}</div>
      ${panel}
    </section>`;
  }

  function whyHTML(sheet) {
    const w = sheet.why; if (!w) return '';
    return `<details class="why" ${state.whyClosed?.[sheet.id] ? '' : 'open'} data-why="${sheet.id}">
      <summary><span>왜 이 단계를 하나요</span><small>핵심 인사이트 · 다음 단계로</small></summary>
      <div class="why-grid">
        <div class="why-main"><h4>이 단계를 하는 이유</h4><p>${esc(w.why)}</p></div>
        <div class="why-ins"><h4>핵심 인사이트</h4><ul>${w.insight.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      </div>
      <p class="why-next"><b>다음 단계로</b> ${esc(w.next)}</p>
    </details>`;
  }

  /* ---------- 렌더링: 화면 ---------- */
  function renderTop() {
    $('#instructorBar').hidden = !state.instructor;
    document.querySelectorAll('[data-course]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.course === state.course));
    $('#instrState').textContent = state.instructor ? '강사 모드가 켜져 있습니다. 강사방 · 예시 보여 주기 · 다시 시작을 쓸 수 있습니다.' : '강사 비밀번호를 넣으면 강사방 · 예시 보여 주기 · 3-1 케이스 C 참고 답안이 열립니다.';
    $('#instrLogin').hidden = state.instructor;
    $('#instrOn').hidden = state.instructor; $('#instrCode').hidden = state.instructor; $('#instrOff').hidden = !state.instructor;
  }

  function renderNav() {
    const items = [];
    if (isCampaign() && roomAllowed()) items.push(navBtn('room', '▦', '강사방', null, state.view === 'room'));
    if (isCampaign()) {
      items.push(navBtn('home', '◎', state.team ? `${state.team} · 시작` : '시작 · 조 선택', null, state.view === 'home'));
      items.push(navBtn('game', '★', '트렌드 게임 · 용어', null, state.view === 'game'));
      items.push(navBtn('case', '▤', '케이스 자료 ① ②', null, state.view === 'case'));
    }
    course().sheets.forEach((s) => {
      const p = progress(s);
      items.push(navBtn(s.id, s.no, s.title, p, state.view === 'sheet' && state.sheet[state.course] === s.id, isCampaign() && !unlocked(s.id), isCampaign() && !!val(`done.${s.id}`), isCampaign() && control?.example === s.id));
    });
    items.push(navBtn('sites', '↗', '자료 찾기 · 참고 사이트', null, state.view === 'sites'));
    $('#nav').innerHTML = items.join('');
    const all = course().sheets.reduce((a, s) => { const p = progress(s); return [a[0] + p.filled, a[1] + p.total]; }, [0, 0]);
    $('#overall').textContent = isCampaign() && !state.teamId ? '우리 조를 고르면 작성 내용이 강사방에 모입니다' : `전체 ${all[1] ? Math.round(all[0] / all[1] * 100) : 0}% 작성`;
    const side = $('#case');
    side.innerHTML = isCampaign()
      ? `<span class="case-code">3-2 캠페인 기획 실습${state.team ? ` · ${esc(state.team)}` : ''}</span><strong>20~30대 신규 고객</strong><span>롯데백화점 · 3주 · 5억 · 신규 회원 5,000명</span>`
      : `<span class="case-code">강사 참고 · 3-1 프로모션 기획</span><strong>${esc(course().caseTitle)}</strong><span>${esc(course().caseSub)}</span>`;
  }
  function navBtn(id, no, title, p, cur, locked = false, done = false, showing = false) {
    const st = !p ? '' : p.filled === 0 ? 'empty' : p.ratio >= 0.8 ? 'done' : 'doing';
    const target = ['home', 'sites', 'room', 'game', 'case'].includes(id) ? `data-view="${id}"` : `data-sheet="${id}"`;
    const tag = showing ? ' <small class="ex-tag">예시</small>' : locked ? ' <small>잠김</small>' : done ? ' <small class="ok">제출</small>' : '';
    return `<li><button type="button" ${target} class="nav-item ${cur ? 'cur' : ''} ${p ? '' : 'nav-util'} ${locked ? 'locked' : ''}" ${cur ? 'aria-current="page"' : ''}>
      <span class="nav-no">${no}</span><span class="nav-title">${esc(title)}${tag}</span>
      ${p ? `<span class="nav-st st-${st}" title="${p.filled}/${p.total}칸"><span style="width:${Math.round(p.ratio * 100)}%"></span></span>` : ''}</button></li>`;
  }

  function render() {
    if (state.view === 'room' && !roomAllowed()) state.view = 'home';
    if (['room', 'game', 'case', 'home'].includes(state.view)) state.course = 'campaign';
    renderTop();
    if (state.view === 'home') renderHome();
    else if (state.view === 'sites') renderSites();
    else if (state.view === 'room') renderRoom();
    else if (state.view === 'game') renderGame();
    else if (state.view === 'case') renderCase();
    else renderSheet();
    renderNav();
    if (ROOM) updatePresence();
  }

  function renderHome() {
    app.innerHTML = `
      <header class="sheet-head">
        <p class="sheet-eyebrow">3-2. 캠페인 기획 실습</p>
        <h2>롯데백화점 20~30대 신규 고객 확보 캠페인</h2>
        <p class="lead">고객 트렌드 분석에서 출발해 캠페인명 · 슬로건 · 컨셉 · 운영계획 · 홍보 전략 · KPI를 기획합니다. 모든 조가 같은 가상 데이터(케이스 ① ②)로 실습하고, 결과를 비교합니다.</p>
        ${roundBarHTML()}
      </header>
      <section class="teampick ${state.teamId ? 'set' : ''}">
        <h3>${state.teamId ? `우리 조 · ${esc(state.team)}` : '1단계 · 우리 조를 고르십시오'}</h3>
        <p class="muted">${state.teamId ? '같은 조 조원이 같은 번호를 고르면 한 시트를 함께 씁니다. 작성 내용은 강사방에 바로 보입니다.' : '같은 조 조원은 모두 같은 번호를 고릅니다.'}</p>
        <div class="team-grid">${Array.from({ length: TEAM_COUNT }, (_, i) => i + 1).map((n) => `<button type="button" class="team-btn ${state.teamId === 't' + n ? 'cur' : ''}" data-team="${n}">${n}조</button>`).join('')}</div>
      </section>
      <h3 class="step-h">오늘의 순서</h3>
      <ol class="flow">
        <li><span class="flow-no">1</span><div><b>트렌드 게임 · 용어</b><p>2026 소비 트렌드와 캠페인 유형을 문제로 익힙니다. 답할 때마다 "왜 그런지"가 나옵니다.</p><button type="button" class="btn ghost" data-view="game">게임 시작</button></div></li>
        <li><span class="flow-no">2</span><div><b>케이스 자료 읽기</b><p>케이스 ① 조건 · 현황과 케이스 ② 트렌드 신호. 모든 실습의 근거입니다.</p><button type="button" class="btn ghost" data-view="case">케이스 자료</button></div></li>
        <li><span class="flow-no">3</span><div><b>실습 ① ~ ⑫ 라운드</b><p>강사가 여는 라운드마다 시트를 쓰고 제출합니다. 강사가 예시를 보여 주면 비교한 뒤 다시 씁니다.</p><button type="button" class="btn" data-sheet="s1">실습 ① 시작</button></div></li>
        <li><span class="flow-no">4</span><div><b>발표와 상호 평가</b><p>⑪ 1페이지로 8분 발표, 다른 세 조를 평가합니다.</p></div></li>
      </ol>
      <h3 class="step-h">캠페인 설계 5단계 — 실습이 어디에 해당하나</h3>
      <ol class="steps5">${STEPS5.map((s, i) => `<li><span>STEP ${i + 1}</span><b>${esc(s[0])}</b><p>${esc(s[1])}</p><em>실습 ${esc(s[2])}</em></li>`).join('')}</ol>
      <p class="note">캠페인은 할인 행사(프로모션)가 아닙니다. 캠페인이라는 우산 아래 여러 프로모션이 들어갑니다. 목표가 신규 고객 확보 · 인지도이므로 스토리와 경험을 중심에 둡니다.</p>`;
  }

  function renderCase() {
    const sec = (id, title, why, body) => `<section class="case-sec" id="case-${id}"><h3>${title}</h3>${why ? `<p class="case-why"><b>왜 보나요</b> ${esc(why)}</p>` : ''}${body}</section>`;
    const tbl = (head, rows, cls = '') => `<div class="tbl-wrap"><table class="facts ${cls}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 && c ? `<b>${esc(c)}</b>` : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    app.innerHTML = `
      <header class="sheet-head">
        <p class="sheet-eyebrow">실습 자료</p>
        <h2>케이스 자료</h2>
        <p class="lead">모든 실습은 이 자료와 고객 트렌드 신호를 근거로 진행합니다. 목표는 이미 정해져 있습니다.</p>
        <div class="jump">${[['c1', '케이스 ①'], ['goal', '주어진 목표'], ['c2', '케이스 ②'], ['trend', '2026 트렌드'], ['type', '캠페인 유형 5'], ['cases', '대표 사례 5'], ['vs', '캠페인 · 프로모션']].map(([id, t]) => `<a href="#case-${id}" data-jump="case-${id}">${t}</a>`).join('')}</div>
      </header>
      ${sec('c1', '실습 케이스 ① · 캠페인 조건과 현황 자료', '기간 · 예산 · 공간 · 보유 채널이 정해져 있습니다. ⑥ 채널, ⑧ 운영, ⑨ 예산의 한계와 근거가 여기서 나옵니다.', tbl(['구분', '항목', '현황 · 조건', '참고'], CASE1))}
      ${sec('goal', '주어진 목표', '', `<div class="targets">${TARGETS.map((t) => `<span>${esc(t)}</span>`).join('')}</div><p class="warnline">직전 캠페인 실적은 신규 회원 2,300명 · SNS 도달 6.5만입니다. 목표는 두 배가 넘습니다. 같은 방식으로는 도달할 수 없습니다.</p>`)}
      ${sec('c2', '실습 케이스 ② · 20~30대 고객 트렌드 신호', '트렌드 키워드가 우리 고객에게 실제로 나타나는지 보여 줍니다. 신호가 강하고 목표(20~30대 신규 고객 확보)에 가까운 것을 ①에서 고릅니다. 두 개의 신호가 같은 상황을 가리키면 가장 믿을 만한 근거입니다.', tbl(['트렌드 키워드', '우리 고객 지표 (20~30대)', '현황', '전년 대비', '생각해 볼 질문'], CASE2))}
      ${sec('trend', '2026 소비 트렌드와 리테일 캠페인 기회', '『트렌드 코리아 2026』 10대 키워드 중 백화점 캠페인과 관계가 깊은 여섯 가지입니다. 고객 모습 · 캠페인 기회 · 유형 연결은 교육용 해석입니다.', tbl(['트렌드 키워드', '핵심 의미', '백화점 고객에게 나타나는 모습', '캠페인 기회', '어울리는 유형'], TRENDS.map((t) => [t.k, t.mean, t.look, t.chance, t.type]))) + `<p class="note">함께 볼 키워드 · 제로클릭 — ${esc(ZERO_CLICK)}</p>`}
      ${sec('type', '캠페인 유형 5가지', '트렌드가 고객이 처한 상황을 알려 준다면, 캠페인 유형은 그 상황에 어떻게 응답할지를 알려 줍니다. ①에서 하나를 고릅니다.', `<div class="types">${TYPES.map((t, i) => `<article><span>0${i + 1}</span><h4>${esc(t.k)}</h4><dl><dt>대표 사례</dt><dd>${esc(t.case)}</dd><dt>설계 공식</dt><dd>${esc(t.formula)}</dd><dt>이럴 때 쓴다</dt><dd>${esc(t.when)}</dd></dl></article>`).join('')}</div>`)}
      ${sec('cases', '국내 대표 리테일 캠페인 5가지', "사례를 볼 때는 '무엇을 했나'보다 '고객을 어떤 순서로 움직였나'를 보십시오. 그 순서가 우리 캠페인의 설계도가 됩니다.", `<div class="cases5">${CASES5.map((c) => `<article><header><b>${esc(c.co)} 「${esc(c.name)}」</b><span>${esc(c.type)}</span></header><p class="flowline">${c.flow.map(esc).join(' <i>→</i> ')}</p><p><b>핵심 방식</b> ${esc(c.how)} · <b>MD 포인트</b> ${esc(c.md)}</p><p class="muted">${esc(c.apply)}</p></article>`).join('')}</div>`)}
      ${sec('vs', '캠페인과 프로모션', '둘은 대립하는 개념이 아닙니다. 캠페인이라는 우산 아래 프로모션이 들어갑니다.', tbl(['구분', '캠페인', '프로모션'], CAMP_VS_PROMO))}
      <p class="muted">케이스 ① ② 는 교육용으로 구성한 가상 데이터입니다.</p>`;
  }

  /* 트렌드 게임 */
  function gameScore(si) {
    const st = GAME[si]; let ok = 0, done = 0;
    st.qs.forEach((q, qi) => { const p = state.game.picked[`${si}.${qi}`]; if (p !== undefined) { done++; if (p === q.a) ok++; } });
    return { ok, done, total: st.qs.length };
  }
  function renderGame() {
    const g = state.game;
    const si = Math.min(g.stage, GAME.length);
    const totals = GAME.map((_, i) => gameScore(i));
    const allOk = totals.reduce((a, x) => a + x.ok, 0), allN = totals.reduce((a, x) => a + x.total, 0);
    const chips = `<div class="g-stages">${GAME.map((st, i) => `<button type="button" class="g-stage ${i === si ? 'cur' : ''} ${totals[i].done === totals[i].total ? 'done' : ''}" data-gstage="${i}"><span>${i + 1}</span>${esc(st.title)}<small>${totals[i].ok}/${totals[i].total}</small></button>`).join('')}<button type="button" class="g-stage ${si === GAME.length ? 'cur' : ''}" data-gstage="${GAME.length}"><span>✓</span>정리<small>${allOk}/${allN}</small></button></div>`;
    let body = '';
    if (si === GAME.length) {
      body = `<div class="g-card g-end"><p class="g-eyebrow">게임 정리</p><h3>${allOk} / ${allN} 정답</h3>
        <p>문제를 풀며 알게 된 것을 실습과 연결하면 이렇습니다.</p>
        <ol class="takeaways">${GAME_TAKEAWAYS.map((t) => `<li><b>${esc(t[0])}</b><span>${esc(t[1])}</span></li>`).join('')}</ol>
        <div class="row"><button type="button" class="btn" data-view="case">케이스 자료 보기</button><button type="button" class="btn ghost" data-sheet="s1">실습 ①로</button><button type="button" class="btn ghost danger" data-act="gameReset">처음부터 다시</button></div></div>`;
    } else {
      const st = GAME[si];
      if (g.q < 0) {
        body = `<div class="g-card g-intro"><p class="g-eyebrow">${si + 1}단계 · 문제 ${st.qs.length}개</p><h3>${esc(st.title)}</h3><div class="g-why"><b>왜 이걸 하나요</b><p>${esc(st.why)}</p></div><button type="button" class="btn" data-act="gameGo">시작</button></div>`;
      } else {
        const qi = Math.min(g.q, st.qs.length - 1), q = st.qs[qi];
        const pick = g.picked[`${si}.${qi}`];
        const answered = pick !== undefined;
        body = `<div class="g-card"><p class="g-eyebrow">${si + 1}단계 ${esc(st.title)} · ${qi + 1} / ${st.qs.length}</p><h3 class="g-q">${esc(q.q)}</h3>
          <div class="g-opts">${q.o.map((o, oi) => `<button type="button" class="g-opt ${answered ? (oi === q.a ? 'right' : oi === pick ? 'wrong' : 'dim') : ''}" data-gpick="${oi}" ${answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>
          ${answered ? `<div class="g-why ${pick === q.a ? 'ok' : 'no'}"><b>${pick === q.a ? '정답입니다' : `정답은 "${esc(q.o[q.a])}"`} · 왜 그런가</b><p>${esc(q.why)}</p></div>
            <div class="row"><button type="button" class="btn" data-act="gameNext">${qi + 1 < st.qs.length ? '다음 문제' : si + 1 < GAME.length ? '다음 단계' : '게임 정리'}</button></div>` : ''}
        </div>`;
      }
    }
    app.innerHTML = `
      <header class="sheet-head">
        <p class="sheet-eyebrow">실습 준비 · 게임</p>
        <h2>2026 소비 트렌드와 리테일 캠페인 기회</h2>
        <p class="lead">캠페인과 프로모션, 2026 트렌드 키워드, 캠페인 유형, 케이스 데이터 읽기를 다섯 단계 문제로 익힙니다. 답을 고르면 바로 "왜 그런가"가 나옵니다.</p>
      </header>
      ${chips}
      ${body}
      <section class="glossary"><h3>용어 사전</h3><p class="muted">실습에서 쓰는 말과, 어느 실습에서 쓰는지입니다.</p>
        <div class="tbl-wrap"><table class="facts"><thead><tr><th>용어</th><th>뜻</th><th>쓰는 곳</th></tr></thead><tbody>${GLOSSARY.map((gl) => `<tr><td><b>${esc(gl[0])}</b></td><td>${esc(gl[1])}</td><td class="nowrap">${esc(gl[2])}</td></tr>`).join('')}</tbody></table></div>
      </section>`;
  }

  function renderSites() {
    const cats = {};
    Object.entries(SITES).forEach(([id, s]) => { (cats[s.cat] ||= []).push([id, s]); });
    const kwBox = (id, label) => `<div class="kwbox"><label for="kw-${id}">${label}</label><div class="kwrow"><input id="kw-${id}" data-kw="${id}" value="${esc(kwFor(id))}" autocomplete="off"><a id="kwgo-${id}" class="btn" href="${esc(siteUrl(id))}" target="_blank" rel="noopener noreferrer">열기 ↗</a></div></div>`;
    app.innerHTML = `
      <header class="sheet-head">
        <p class="sheet-eyebrow">참고 사이트</p>
        <h2>자료 찾기</h2>
        <p class="lead">케이스 ① ② 는 가상 데이터입니다. 실제 트렌드를 더 확인하고 싶을 때 아래 사이트를 쓰십시오. 사이트 이름을 누르면 새 탭에서 열립니다.</p>
      </header>
      ${Object.entries(cats).map(([cat, arr]) => `
        <section class="site-cat"><h3>${esc(cat)}</h3>
          <div class="site-grid">${arr.map(([id, s]) => `
            <article class="site">
              <h4>${ext(siteUrl(id), esc(s.name), 'site-name')}</h4>
              <p class="site-what">${esc(s.what)}</p>
              <ol class="site-how">${s.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>
              ${s.kw ? kwBox(id, '분석할 키워드') : s.news ? kwBox(id, '뉴스 검색어') : ''}
              <p class="site-url">${esc(s.kw || s.news ? s.url.split('?')[0] : s.url)}</p>
            </article>`).join('')}</div>
        </section>`).join('')}`;
  }

  /* 예시 보기: 강사가 켜면(control.example) 모든 조 화면이 그 시트의 예시 답안을 같은 모양으로 보여 준다 */
  const showingExample = (sid) => !isCampaign() || control?.example === sid || state.localExample === sid;
  function toggleExample(sid) {
    const on = !(control?.example === sid || state.localExample === sid);
    if (DB && isAdmin()) { setControl({ example: on ? sid : null }); state.localExample = null; }
    else { state.localExample = on ? sid : null; flash(on ? '이 화면에서 예시를 보여 줍니다 · 조 화면까지 보내려면 앱 소유자 계정으로 누르십시오' : '예시를 닫았습니다'); }
    save(); render();
  }

  function renderSheet() {
    const c = course();
    const sheet = findSheet(state.sheet[state.course]) || c.sheets[0];
    state.sheet[state.course] = sheet.id;
    const idx = c.sheets.indexOf(sheet);
    const prev = c.sheets[idx - 1], next = c.sheets[idx + 1];
    const siteIds = isCampaign() ? SHEET_SITES[sheet.id] : null;
    const exMode = showingExample(sheet.id);
    const locked = isCampaign() && !unlocked(sheet.id) && !exMode;
    let blocksHTML;
    if (exMode) {
      const prevCtx = [viewCtx, RO];
      viewCtx = { data: exampleData(sheet) }; RO = true;
      try { blocksHTML = sheet.blocks.map((b, i) => renderBlock(sheet, b, i)).join(''); } finally { [viewCtx, RO] = prevCtx; }
    } else blocksHTML = sheet.blocks.map((b, i) => renderBlock(sheet, b, i)).join('');
    const exBanner = exMode && isCampaign() ? `<div class="ex-banner"><b>강사 예시 답안 · 예시 팀 MOOD SHIFT</b><span>우리 조가 쓴 내용은 그대로 있습니다. ${state.instructor ? '다시 누르면 조 화면이 작성 칸으로 돌아갑니다.' : '강사가 예시를 닫으면 작성 칸으로 돌아갑니다.'}</span></div>` : '';
    app.innerHTML = `
      <header class="sheet-head">
        <p class="sheet-eyebrow">실습 ${sheet.no}${sheet.min ? ` · ${sheet.min}분` : ''}</p>
        <h2>${esc(sheet.title)}</h2>
        <p class="lead">${esc(sheet.lead)}</p>
        <p class="byline">팀명 <u>${exMode && isCampaign() ? 'MOOD SHIFT (예시 팀)' : esc(state.team) || '&nbsp;'.repeat(14)}</u> 작성자 <u>${exMode && isCampaign() ? '강사 예시' : esc(state.author) || '&nbsp;'.repeat(14)}</u></p>
        ${isCampaign() ? roundBarHTML(sheet.id) : ''}
        ${siteIds && !exMode ? `<div class="sheet-sites"><span>이 시트에 쓸 자료</span><button type="button" class="linkish" data-view="case">케이스 자료 ① ②</button>${siteChips(siteIds)}</div>` : ''}
        ${state.instructor && isCampaign() ? `<div class="sheet-tools">
          <button type="button" class="btn ${exMode ? 'ex-on' : 'btn-ex'}" data-act="example" data-sid="${sheet.id}">${exMode ? '예시 닫기 · 다시 쓰기' : '예시 답안 보여 주기'}</button>
          ${exMode ? '' : '<button type="button" class="btn ghost" data-act="fill">이 시트에 예시 답안 채우기</button><button type="button" class="btn ghost danger" data-act="clear">이 시트 비우기</button>'}
        </div>` : ''}
      </header>
      ${whyHTML(sheet)}
      ${exBanner}
      ${locked ? lockedHTML(sheet) : `<div class="blocks ${exMode ? 'ex-mode' : ''}">${blocksHTML}</div>
      ${isCampaign() && !exMode ? `<div id="submitBox" class="submit">${submitHTML(sheet)}</div>` : ''}`}
      <nav class="pager" aria-label="워크시트 이동">
        ${prev ? `<button type="button" class="btn ghost" data-sheet="${prev.id}">← ${prev.no} ${esc(prev.title)}</button>` : isCampaign() ? '<button type="button" class="btn ghost" data-view="case">← 케이스 자료</button>' : '<span></span>'}
        ${next ? `<button type="button" class="btn" data-sheet="${next.id}">${next.no} ${esc(next.title)} →</button>` : '<span></span>'}
      </nav>`;
    app.querySelectorAll('textarea').forEach(autosize);
    if (!exMode) runCalcs();
  }

  /* 유형 선택 영역만 다시 그린다 (다른 칸의 입력 · 스크롤을 건드리지 않게) */
  function rerenderPicker() {
    const el = app.querySelector('.tp'); if (!el) { render(); return; }
    const sid = state.sheet.campaign;
    const wrap = document.createElement('div'); wrap.innerHTML = typePickerHTML(sid);
    el.replaceWith(wrap.firstElementChild);
    app.querySelectorAll('.tp textarea').forEach(autosize);
    runCalcs(); renderNavLite();
  }

  function runCalcs() {
    if (state.view !== 'sheet') return;
    const sheet = findSheet(state.sheet[state.course]);
    if (!sheet || showingExample(sheet.id)) return;
    app.querySelectorAll('[data-calc]').forEach((el) => {
      const blk = sheet.blocks[+el.dataset.i];
      let html = '';
      try { html = CALC[blk.id](sheet.id, blk); } catch (e) { html = '<p class="muted">값을 채우면 계산합니다.</p>'; }
      el.querySelector('.calc-body').innerHTML = html;
    });
  }

  function autosize(t) { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight + 2, 44) + 'px'; }

  function fillSheet(sheet) { Object.entries(exampleData(sheet)).forEach(([k, v]) => setVal(k, v)); }
  function clearSheet(sheet) { sheetKeys(sheet).forEach((k) => setVal(k, '')); }

  /* ---------- 내보내기 ---------- */
  function exportText() {
    const c = course();
    const out = [`# ${c.code}. ${c.name} — 롯데백화점 20~30대 신규 고객 확보 캠페인`, `팀명: ${state.team || '-'} / 작성자: ${state.author || '-'}`, ''];
    c.sheets.forEach((s) => {
      out.push(`## 실습 ${s.no} ${s.title}`);
      s.blocks.forEach((b) => {
        if (b.type === 'field') out.push(`- ${b.label}: ${V(s.id, b.id) || '(빈 칸)'}`);
        if (b.type === 'q') out.push(`- Q. ${b.q}\n  ${V(s.id, b.id) || '(빈 칸)'}`);
        if (b.type === 'table') {
          const o = off(b);
          out.push('', `| ${b.cols.map((x) => x.h).join(' | ')} |`, `|${b.cols.map(() => '---').join('|')}|`);
          b.rows.forEach((row, r) => out.push(`| ${[...(o ? [row.l] : []), ...b.cols.slice(o).map((col, k) => (col.t === 'fixed' ? (row.fx?.[k] || '') : C(s.id, b.id, r, k + o)).replace(/\n/g, ' ').replace(/\|/g, '/'))].join(' | ')} |`));
          out.push('');
        }
      });
      out.push('');
    });
    return out.join('\n');
  }
  const backupCode = () => btoa(unescape(encodeURIComponent(JSON.stringify({ v: 4, teamId: state.teamId, team: state.team, author: state.author, mission: MISSION, data: state.data }))));
  const decodeCode = (code) => JSON.parse(decodeURIComponent(escape(atob(code.trim()))));

  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); flash(okMsg); }
    catch (e) { const o = $('#copyOut'); o.value = text; o.hidden = false; o.focus(); o.select(); flash('자동 복사가 막혀 있습니다 · 아래 칸에서 직접 복사하십시오'); }
  }

  let toastTimer;
  function flash(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- 라운드 · 실시간 공유 · 강사방 ----------
     db 문서
       teams/t{n}   { name, mission, author, updatedAt, missions: { X: { data: { "s1|sig|0|0": "…", "done|s1": "ISO" } } } }
       control/room { round: -1~11, all, endsAt, example: 시트 id | null, resetAt }  — 소유자 · 편집자만 쓴다 */
  const TEAM_COUNT = 4;
  const ROUNDS = COURSES.campaign.sheets.map((s) => s.id);
  const roundMin = (sid) => COURSES.campaign.sheets.find((s) => s.id === sid)?.min || 30;
  let DB = null, canAdmin = false, control = null, teamsLive = {}, teamUnsub = null, teamsUnsub = null, teamExists = false, syncState = 'off';
  let writing = Promise.resolve(), flushT = null, controlReady = false, announce = false, ROOM = null, peersLive = [], peersT = null, presT = null;
  const pending = {};
  const enc = (k) => k.replace(/\./g, '|');
  const dec = (k) => k.replace(/\|/g, '.');
  const encAll = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [enc(k), v]));
  const decAll = (d) => Object.fromEntries(Object.entries(d || {}).map(([k, v]) => [dec(k), v]));
  const roomAllowed = () => state.instructor || canAdmin;
  /* 로그인 없는 공개 저장소(Firebase)에서는 누구나 쓸 수 있으므로, 강사 비밀번호를 넣은 화면만 강사 권한을 쓴다 */
  const isAdmin = () => canAdmin && (!window.OPEN_SYNC || state.instructor);
  const sheetNo = (sid) => COURSES.campaign.sheets.find((s) => s.id === sid)?.no ?? '';
  const sheetTitle = (sid) => COURSES.campaign.sheets.find((s) => s.id === sid)?.title ?? '';
  const sidFull = (sid) => `실습 ${sheetNo(sid)} · ${sheetTitle(sid)}`;
  const hhmm = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  /* 강사가 라운드를 열기 전(round < 0)에는 모든 시트가 열려 있다 */
  function unlocked(sid) {
    if (!control || control.all || !(control.round >= 0)) return true;
    return ROUNDS.indexOf(sid) <= control.round;
  }
  function remaining() { return control?.endsAt ? Math.max(0, Date.parse(control.endsAt) - Date.now()) : null; }
  const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  function roundBarHTML(sid) {
    if (!control || !(control.round >= 0)) return '';
    const cur = ROUNDS[control.round];
    if (control.all) return `<p class="roundbar"><b>모든 라운드가 열려 있습니다</b></p>`;
    const here = !sid || sid === cur;
    return `<p class="roundbar ${here ? 'live' : ''}"><b>라운드 ${sheetNo(cur)} ${esc(sheetTitle(cur))}</b>${control.endsAt ? `<span>남은 시간 <b class="js-timer">${mmss(remaining())}</b></span>` : '<span>시간 제한 없음</span>'}${sid && !here ? `<button type="button" class="linkish" data-sheet="${cur}">지금 라운드로 가기</button>` : ''}</p>`;
  }
  function lockedHTML(sheet) {
    return `<div class="locked-panel"><strong>라운드 ${sheet.no} · ${esc(sheet.title)}</strong><p>강사가 이 라운드를 열면 작성할 수 있습니다. 제한 시간 ${sheet.min}분.</p></div>`;
  }
  function submitHTML(sheet) {
    const d = val(`done.${sheet.id}`);
    return d
      ? `<p><b class="ok">라운드 ${sheet.no} 제출됨 · ${hhmm(d)}</b> 제출한 뒤에도 고칠 수 있고, 고친 내용도 강사방에 바로 보입니다. 제출하면 이 시트 한 장이 PPT로 내려받아지고, 12개를 모두 제출하면 전체 12장이 내려받아집니다.</p><div class="row"><button type="button" class="btn ghost" data-act="pptSheet" data-sid="${sheet.id}">실습 ${sheet.no} PPT 받기</button>${allDone(state.data[scopeOf(state.teamId)]) ? '<button type="button" class="btn" data-act="pptOwn">전체 12장 PPT 받기</button>' : ''}<button type="button" class="btn ghost" data-act="submit" data-sid="${sheet.id}">다시 제출</button></div>`
      : `<p>이 시트를 다 썼으면 제출하십시오. ${DB ? '강사방에 제출 표시가 뜨고, 이 시트 PPT가 이 기기에 내려받아집니다.' : '실시간 공유가 꺼져 있으면 내보내기 · 백업에서 백업 코드를 복사해 강사에게 보냅니다.'}</p><button type="button" class="btn" data-act="submit" data-sid="${sheet.id}">라운드 ${sheet.no} 제출하기</button>`;
  }
  function tickTimers() {
    const r = remaining();
    document.querySelectorAll('.js-timer').forEach((el) => { el.textContent = r === null ? '—' : mmss(r); el.classList.toggle('late', r === 0); });
  }
  function setSync(st) {
    syncState = st;
    const el = $('#syncState'); if (!el) return;
    el.hidden = st === 'off';
    el.className = `sync sync-${st}`;
    el.textContent = { ok: '강사방과 연결됨', saving: '저장 중', err: '저장 안 됨 · 권한 확인', ro: '보기 전용 · 강사방에 안 모임 (공유 권한 필요)' }[st] || '';
  }

  function chooseTeam(n) {
    if (!n) return;
    state.teamId = `t${n}`; state.team = `${n}조`; state.joinedAt = new Date().toISOString();
    $('#team').value = state.teamId;
    announce = true;
    save(); subscribeTeam(); render(); updatePresence();
    flash(`${state.team}을 골랐습니다 · 강사방에 입장이 표시됩니다`);
  }
  /* 강사가 조를 조 선택 화면으로 돌려보낸다 (control.kick) · 조 기록을 지운다 (control.cleared) */
  function leaveTeam(msg) {
    state.teamId = ''; state.team = ''; $('#team').value = '';
    Object.keys(pending).forEach((k) => delete pending[k]); clearTimeout(flushT);
    if (state.view === 'sheet') state.view = 'home';
    save(); subscribeTeam(); render(); updatePresence(); flash(msg);
  }
  function applyKick() {
    const cleared = control?.cleared || {};
    let wipedMine = false;
    Object.entries(cleared).forEach(([tid, at]) => {
      if ((state.clearSeen || {})[tid] === at) return;
      state.clearSeen = { ...(state.clearSeen || {}), [tid]: at };
      if (state.data[scopeOf(tid)]) delete state.data[scopeOf(tid)];
      if (tid === state.teamId && at > (state.joinedAt || '')) wipedMine = true;
      save();
    });
    if (state.instructor || !state.teamId) return false;
    if (wipedMine) { leaveTeam('강사가 우리 조 기록을 지웠습니다 · 우리 조를 다시 고르십시오'); return true; }
    const k = control?.kick?.[state.teamId];
    if (k && k > (state.joinedAt || '')) { leaveTeam('강사가 조 선택 화면으로 돌려보냈습니다 · 우리 조를 다시 고르십시오'); return true; }
    return false;
  }

  function queueSync(k, v) {
    if (!DB || viewCtx || !state.teamId || !isCampaign()) return;
    pending[k] = v ?? '';
    clearTimeout(flushT); flushT = setTimeout(flush, 700);
  }
  function flush() {
    const keys = Object.keys(pending); if (!keys.length) return;
    const data = {}; keys.forEach((k) => { data[enc(k)] = pending[k]; delete pending[k]; });
    writing = writing.then(() => writeTeam({ missions: { [MISSION]: { data } } })).catch(() => {});
  }
  async function writeTeam(patch) {
    if (!DB || !state.teamId) return;
    const body = { name: state.team, mission: MISSION, author: state.author, updatedAt: new Date().toISOString(), ...patch };
    const ref = DB.doc(`teams/${state.teamId}`);
    const full = () => ({ ...body, missions: { [MISSION]: { data: encAll(state.data[scopeOf(state.teamId)] || {}) } } });
    setSync('saving');
    try {
      if (teamExists) await ref.update(body);
      else { await ref.set(full()); teamExists = true; }
      setSync('ok');
    } catch (e) {
      if (e?.code === 'invalid_argument' && teamExists) {
        try { await ref.set(full()); teamExists = true; setSync('ok'); } catch (e2) { setSync('ro'); }
      } else if (e?.code === 'invalid_argument') setSync('ro');
      else setSync('err');
    }
  }
  function subscribeTeam() {
    if (teamUnsub) { teamUnsub(); teamUnsub = null; }
    teamExists = false;
    if (!DB || !state.teamId) return;
    teamUnsub = DB.doc(`teams/${state.teamId}`).onSnapshot((snap) => {
      teamExists = snap.exists;
      if (announce && controlReady) { announce = false; writing = writing.then(() => writeTeam({ joinedAt: state.joinedAt })).catch(() => {}); if (!snap.exists) return; }
      if (!snap.exists) { if (controlReady && Object.keys(state.data[scopeOf(state.teamId)] || {}).length) writing = writing.then(() => writeTeam({})).catch(() => {}); return; }
      const d = snap.data();
      const remote = decAll(d.missions?.[MISSION]?.data);
      const act = document.activeElement?.dataset?.k;
      const changed = [];
      const local = state.data[scopeOf(state.teamId)] ||= {};
      Object.entries(remote).forEach(([k, v]) => {
        if (k in pending || k === act) return;
        if ((v ?? '') !== (local[k] ?? '')) { if (v === '' || v == null) delete local[k]; else local[k] = v; changed.push(k); }
      });
      if (changed.length) { save(); applyRemote(changed); }
      if (syncState !== 'saving') setSync('ok');
    }, () => setSync('err'));
  }
  function applyRemote(keys) {
    if (state.view === 'sheet' && isCampaign() && !showingExample(state.sheet.campaign)) {
      keys.forEach((k) => {
        const el = document.getElementById(`f-${k}`);
        if (el && el !== document.activeElement) { el.value = val(k); if (el.tagName === 'TEXTAREA') autosize(el); }
      });
      const sid = state.sheet.campaign;
      if (keys.includes(`done.${sid}`) && $('#submitBox')) $('#submitBox').innerHTML = submitHTML(findSheet(sid));
      runCalcs();
    }
    renderNavLite();
  }
  /* 강사가 다시 시작하면 control.resetAt이 바뀐다. 처음 보는 기록이면 이 브라우저의 조 작성 내용을 지운다 */
  function applyReset() {
    const at = control?.resetAt;
    if (!at || at === state.resetSeen) return false;
    const first = !state.resetSeen && !Object.keys(state.data).some((k) => k !== 'promo');
    state.resetSeen = at;
    if (first) { save(); return false; }
    Object.keys(state.data).forEach((k) => { if (k !== 'promo') delete state.data[k]; });
    Object.keys(pending).forEach((k) => delete pending[k]); clearTimeout(flushT);
    if (!state.instructor) { state.teamId = ''; state.team = ''; state.author = ''; $('#team').value = ''; $('#author').value = ''; state.game = { stage: 0, q: -1, picked: {} }; }
    state.sheet.campaign = 's1'; state.imports = {};
    if (state.view !== 'room') state.view = 'home';
    save(); subscribeTeam();
    if (!state.instructor) flash('강사가 실습을 다시 시작했습니다 · 우리 조부터 다시 고르십시오');
    return true;
  }
  async function resetAll() {
    if (!DB) {
      state.imports = {}; Object.keys(state.data).forEach((k) => { if (k !== 'promo') delete state.data[k]; });
      save(); render(); flash('이 브라우저의 조 기록을 지웠습니다'); return;
    }
    const at = new Date().toISOString();
    try { await DB.doc('control/room').set({ round: -1, all: false, endsAt: null, example: null, resetAt: at }); control = { round: -1, all: false, endsAt: null, example: null, resetAt: at }; applyReset(); }
    catch (e) { flash('다시 시작은 이 앱의 소유자 · 편집자만 할 수 있습니다'); return; }
    const ids = new Set([...Object.keys(teamsLive), ...Array.from({ length: TEAM_COUNT }, (_, i) => `t${i + 1}`)]);
    let failed = 0;
    for (const id of ids) { try { await DB.doc(`teams/${id}`).delete(); } catch (e) { failed++; } }
    state.imports = {}; teamsLive = {}; save();
    if (state.view === 'room') renderRoom();
    flash(failed ? `다시 시작했지만 ${failed}개 조 기록을 지우지 못했습니다 · 한 번 더 눌러 주십시오` : '모든 조의 내용을 지우고 다시 시작했습니다');
  }
  async function setControl(patch) {
    if (!DB) { flash('실시간 공유가 꺼져 있어 조 화면에 보낼 수 없습니다'); return; }
    const next = { round: -1, all: false, endsAt: null, example: null, ...(control || {}), ...patch };
    try {
      await DB.doc('control/room').set(next);
      if ('example' in patch && Object.keys(patch).length === 1) flash(patch.example ? `모든 조 화면에 실습 ${sheetNo(patch.example)} 예시를 보여 줍니다` : '예시를 닫았습니다 · 조 화면이 작성 칸으로 돌아갑니다');
      else if ('round' in patch) flash(next.all ? '모든 라운드를 열었습니다' : next.round < 0 ? '라운드를 처음으로 되돌렸습니다' : `라운드 ${sheetNo(ROUNDS[next.round])}을 시작했습니다`);
    } catch (e) { flash('바꿀 권한이 없습니다 · 이 앱의 소유자 · 편집자만 바꿀 수 있습니다'); }
  }
  function subscribeRoom() {
    if (teamsUnsub || !DB) return;
    teamsUnsub = DB.collection('teams').onSnapshot((q) => {
      teamsLive = {};
      q.docs.forEach((doc) => {
        const x = doc.data(); if (!x) return;
        teamsLive[doc.id] = { id: doc.id, name: String(x.name || doc.id), mission: MISSION, author: String(x.author || ''), updatedAt: x.updatedAt, data: decAll(x.missions?.[MISSION]?.data), live: true };
      });
      if (state.view === 'room') renderRoomBody();
    }, () => {});
  }
  async function connect() {
    const claude = window.claude;
    if (!claude?.use) return;
    try { const u = await claude.use('user'); if (u) canAdmin = !!(await u.canEdit()); } catch (e) { canAdmin = false; }
    try { DB = await claude.use('db'); } catch (e) { DB = null; }
    if (!DB) { renderNav(); return; }
    setSync('ok');
    DB.doc('control/room').onSnapshot((snap) => {
      const before = control ? JSON.stringify(control) : '';
      const exBefore = control?.example || null;
      control = snap.exists ? snap.data() : null;
      const wiped = applyReset() || applyKick();
      if (!controlReady) { controlReady = true; subscribeTeam(); }
      if (!wiped && before === (control ? JSON.stringify(control) : '')) return;
      const exChanged = exBefore !== (control?.example || null);
      if (exChanged && !state.instructor && control?.example) flash(`강사가 실습 ${sheetNo(control.example)} 예시를 보여 줍니다`);
      const typing = document.activeElement?.dataset?.k;
      if (state.view === 'room') { renderRoomControls(); renderRoomBody(); renderNav(); }
      else if (wiped || exChanged || !typing) render();
      else renderNav();
    }, () => { controlReady = true; subscribeTeam(); });
    if (state.view === 'room') subscribeRoom();
    render();
    try { ROOM = await claude.use('room'); } catch (e) { ROOM = null; }
    if (ROOM) {
      ROOM.onPeers((ch) => {
        peersLive = ch.peers;
        clearTimeout(peersT); peersT = setTimeout(() => { if (state.view === 'room') renderPresence(); }, 300);
      }, () => { ROOM = null; peersLive = []; if (state.view === 'room') renderPresence(); });
      updatePresence();
    }
  }
  /* 지금 이 앱을 연 기기 — 조 · 작성자 · 보고 있는 화면 (닫으면 플랫폼이 지운다) */
  function updatePresence() {
    if (!ROOM) return;
    const where = state.view === 'sheet' && isCampaign() ? state.sheet.campaign : state.view;
    ROOM.presence({ role: state.instructor ? 'instructor' : 'team', team: state.teamId || null, author: (state.author || '').slice(0, 20), where, at: state.joinedAt || null }).catch(() => {});
  }
  const APP_URL = window.APP_URL || 'https://claude.ai/artifact/LqX7f24Fz6odBzYPaSJrax';
  function qrSVG(size) {
    try { const q = qrcode(0, 'M'); q.addData(APP_URL); q.make(); return q.createSvgTag({ cellSize: size, margin: 2, scalable: true, alt: '실습 앱 입장 QR 코드' }); }
    catch (e) { return ''; }
  }
  const whereLabel = (w) => ROUNDS.includes(w) ? `실습 ${sheetNo(w)}` : { home: '처음 화면', game: '트렌드 게임', case: '케이스 자료', sites: '참고 사이트', room: '강사방' }[w] || '';
  function renderPresence() {
    const el = $('#roomPresence'); if (!el) return;
    const devs = peersLive.filter((p) => p.kind === 'viewer' && p.presence?.role !== 'instructor');
    const teamIds = Array.from({ length: TEAM_COUNT }, (_, i) => `t${i + 1}`);
    const slot = (tid) => {
      const here = devs.filter((p) => p.presence?.team === tid);
      const doc = teamsLive[tid];
      const names = [...new Set(here.map((p) => String(p.presence?.author || '').trim()).filter(Boolean))];
      const wh = [...new Set(here.map((p) => whereLabel(p.presence?.where)).filter(Boolean))];
      const st = here.length ? 'on' : doc ? 'away' : 'none';
      return `<article class="pslot ${st}"><h4>${tid.slice(1)}조 <span class="pdot"></span><small>${here.length ? `접속 ${here.length}대` : doc ? '지금 접속 없음 · 기록 있음' : '아직 안 들어옴'}</small></h4>
        <p>${names.length ? esc(names.join(' · ')) : here.length ? '작성자 이름 미입력' : '&nbsp;'}</p>
        <p class="muted">${wh.length ? '보는 화면 · ' + esc(wh.join(', ')) : doc?.updatedAt ? '최근 입력 ' + hhmm(doc.updatedAt) : '&nbsp;'}</p>
        ${isAdmin() && DB && (here.length || doc) ? `<div class="pslot-btns"><button type="button" class="linkish" data-act="kickTeam" data-id="${tid}">조 선택으로 돌려보내기</button><button type="button" class="linkish danger" data-act="clearTeam" data-id="${tid}">이 조 기록 지우기</button></div>` : ''}</article>`;
    };
    const lobby = devs.filter((p) => !p.presence?.team).length;
    el.innerHTML = `<div class="presence-head"><h3>입장 현황 <small>${ROOM ? `지금 접속 ${devs.length}대${lobby ? ` · 조 고르는 중 ${lobby}대` : ''}` : '실시간 접속 표시는 공유받아 로그인한 사람에게만 보입니다'}</small></h3></div>
      <div class="pslots">${teamIds.map(slot).join('')}</div>`;
  }
  async function kickTeam(tid, clear) {
    if (!DB || !isAdmin()) { flash('이 앱의 소유자 · 편집자만 할 수 있습니다'); return; }
    const at = new Date().toISOString();
    const patch = clear ? { cleared: { ...(control?.cleared || {}), [tid]: at }, kick: { ...(control?.kick || {}), [tid]: at } } : { kick: { ...(control?.kick || {}), [tid]: at } };
    const next = { round: -1, all: false, endsAt: null, example: null, ...(control || {}), ...patch };
    try { await DB.doc('control/room').set(next); control = next; }
    catch (e) { flash('바꿀 권한이 없습니다'); return; }
    if (clear) {
      try { await DB.doc(`teams/${tid}`).delete(); delete teamsLive[tid]; } catch (e) { flash('기록을 지우지 못했습니다 · 한 번 더 눌러 주십시오'); return; }
      if (state.data[scopeOf(tid)]) { delete state.data[scopeOf(tid)]; save(); }
      state.clearSeen = { ...(state.clearSeen || {}), [tid]: at }; save();
    }
    renderRoomBody();
    flash(clear ? `${tid.slice(1)}조 기록을 지우고 조 선택 화면으로 돌려보냈습니다` : `${tid.slice(1)}조를 조 선택 화면으로 돌려보냈습니다 · 쓴 내용은 남아 있습니다`);
  }

  /* 강사방 */
  function roomTeams() {
    const all = { ...state.imports, ...teamsLive };
    return Object.values(all).sort((a, b) => (parseInt(a.name, 10) || 99) - (parseInt(b.name, 10) || 99) || a.name.localeCompare(b.name));
  }
  function withTeam(team, fn) {
    const prev = [viewCtx, RO];
    viewCtx = { data: team.data || {} }; RO = true;
    try { return fn(); } finally { [viewCtx, RO] = prev; }
  }
  const campaignSheet = (sid) => COURSES.campaign.sheets.find((s) => s.id === sid);
  function roSheetHTML(team, sid) {
    return withTeam(team, () => {
      const sheet = campaignSheet(sid);
      return sheet.blocks.filter((b) => b.type !== 'draft' && b.type !== 'note').map((b, i) => renderBlock(sheet, b, i)).join('');
    });
  }
  const exampleOn = (sid) => control?.example === sid || state.localExample === sid;
  function renderRoom() {
    subscribeRoom();
    app.innerHTML = `
      <header class="sheet-head">
        <p class="sheet-eyebrow">강사용</p>
        <h2>강사방</h2>
        <p class="lead">조별로 라운드마다 쓴 시트가 이곳에 모입니다. 칸을 누르면 그 조의 시트를 보고, 라운드를 고르면 모든 조의 같은 시트를 나란히 봅니다.</p>
        <p class="room-conn ${DB ? 'on' : 'off'}">${DB ? '실시간 연결됨 · 조가 입력하면 몇 초 안에 반영됩니다' : '실시간 공유가 꺼져 있습니다 · 아래 "제출 코드로 모으기"로 조별 결과를 받으십시오'}</p>
      </header>
      <section class="join-card">
        <button type="button" class="join-qr" data-act="qrBig" aria-label="입장 QR 크게 보기">${qrSVG(4)}</button>
        <div><h3>교육생 입장 QR</h3><p>휴대폰 카메라로 찍으면 이 앱이 열립니다. 조를 고르는 순간 아래 입장 현황과 표에 그 조가 나타나고, 앱을 닫으면 "접속 중" 표시가 사라집니다.</p>
          <p class="join-url">${APP_URL}</p>
          <div class="row"><button type="button" class="btn" data-act="qrBig">QR 크게 띄우기</button><button type="button" class="btn ghost" data-act="copyUrl">주소 복사</button></div>
          ${window.OPEN_SYNC ? `<details class="join-help"><summary>교육생 화면에 내용이 안 모일 때 확인할 것</summary>
            <ol><li>로그인이나 가입은 필요 없습니다. QR로 열고 우리 조만 고르면 됩니다.</li>
            <li>조 화면 위에 "강사방과 연결됨"이 보이면 정상입니다. "저장 안 됨"이 뜨면 와이파이 · 데이터 연결을 확인하십시오.</li>
            <li>회사 보안망에서 막히면 휴대폰 데이터로 접속하거나, 아래 "제출 코드로 모으기"를 쓰십시오.</li></ol></details>` : `<details class="join-help"><summary>교육생 화면에 내용이 안 모일 때 확인할 것</summary>
            <ol><li>교육생은 claude.ai에 <b>로그인</b>한 상태여야 합니다.</li>
            <li>이 앱 오른쪽 위 <b>공유</b> 메뉴에서 교육생을 초대하고, 권한을 <b>보기(Viewer)보다 높은 참여 · 편집 권한</b>으로 주어야 조가 쓴 칸이 강사방에 저장됩니다. 보기 권한이면 조 화면 위에 "보기 전용"이 뜨고, 쓴 내용은 그 휴대폰에만 남습니다.</li>
            <li>로그인 없이 공개 링크로만 연 사람은 입장 현황에 보이지 않고 강사방에도 저장되지 않습니다. 그때는 아래 "제출 코드로 모으기"를 쓰십시오.</li></ol></details>`}</div>
      </section>
      <section id="roomPresence" class="room-presence"></section>
      <section id="roomControls" class="room-controls"></section>
      <section id="roomMatrix"></section>
      <section id="roomView" class="room-view"></section>
      <details class="import" ${DB ? '' : 'open'}>
        <summary>제출 코드로 모으기 (실시간 공유가 안 될 때)</summary>
        <p class="muted">조는 "내보내기 · 백업 → 백업 코드 복사"로 코드를 보내고, 강사는 여기에 붙여 넣습니다. 이 브라우저에만 저장됩니다.</p>
        <textarea id="importIn" aria-label="제출 코드 붙여 넣기" placeholder="조가 보낸 코드를 붙여 넣으십시오"></textarea>
        <div class="row"><button type="button" class="btn ghost" data-act="importAdd">제출 코드 추가</button></div>
        <ul id="importList" class="import-list"></ul>
      </details>`;
    renderRoomControls(); renderRoomBody();
  }
  function renderRoomControls() {
    const el = $('#roomControls'); if (!el) return;
    const cur = control && control.round >= 0 ? ROUNDS[control.round] : null;
    const sel = state.roomSel.sid || cur || 's1';
    const status = !control || !(control.round >= 0) ? '아직 라운드를 열지 않았습니다 · 조는 모든 시트를 쓸 수 있습니다' : control.all ? '모든 라운드가 열려 있습니다' : `지금 라운드 ${sheetNo(cur)} ${sheetTitle(cur)}`;
    el.innerHTML = `
      <div class="rc-status"><b>${esc(status)}</b>${control?.endsAt && !control.all ? `<span>남은 시간 <b class="js-timer">${mmss(remaining())}</b></span>` : ''}${control?.example ? `<span class="ex-tag">예시 공개 중 · 실습 ${sheetNo(control.example)}</span>` : ''}</div>
      <div class="round-chips">${ROUNDS.map((sid) => `<button type="button" class="rchip ${sid === sel ? 'sel' : ''} ${sid === cur ? 'live' : ''} ${control && !control.all && control.round >= 0 && ROUNDS.indexOf(sid) > control.round ? 'future' : ''}" data-roundpick="${sid}"><span>${sheetNo(sid)}</span>${esc(sheetTitle(sid))}<small>${roundMin(sid)}분${control?.example === sid ? ' · 예시' : ''}</small></button>`).join('')}</div>
      <div class="rc-actions">
        ${isAdmin() && DB ? `<button type="button" class="btn" data-act="roundStart" data-sid="${sel}">실습 ${sheetNo(sel)} 시작 · ${roundMin(sel)}분 타이머</button>
        <button type="button" class="btn ghost" data-act="roundPlus" ${control?.endsAt ? '' : 'disabled'}>+5분</button>
        <button type="button" class="btn ghost" data-act="roundStop" ${control?.endsAt ? '' : 'disabled'}>타이머 끄기</button>` : ''}
        <button type="button" class="btn ${exampleOn(sel) ? 'ex-on' : 'btn-ex'}" data-act="roomExample" data-sid="${sel}">${exampleOn(sel) ? `실습 ${sheetNo(sel)} 예시 닫기 · 다시 쓰기` : `실습 ${sheetNo(sel)} 예시 답안 보여 주기`}</button>
        ${isAdmin() && DB ? `<button type="button" class="btn ghost" data-act="roundAll">모든 라운드 열기</button>
        <button type="button" class="btn ghost" data-act="roundReset">라운드 처음으로</button>` : ''}
      </div>
      <p class="muted">${isAdmin() && DB ? '라운드를 시작하면 그 라운드까지만 조 화면에서 열립니다. "예시 답안 보여 주기"를 누르면 모든 조 화면에 예시 팀 답안이 같은 시트 모양으로 뜨고, 다시 누르면 조가 쓰던 칸으로 돌아갑니다.' : DB ? '라운드 · 타이머 · 조 화면 예시 공개는 이 앱의 소유자와 편집자만 할 수 있습니다. 이 화면에서는 예시를 강사 화면에만 띄웁니다.' : '실시간 공유가 꺼져 있어 예시는 이 화면(프로젝터)에만 뜹니다.'}</p>
      <div class="reset-box"><div><b>다시 시작</b><p class="muted">모든 조의 작성 내용과 라운드를 지우고 처음부터 시작합니다. 조원 화면도 조 선택부터 다시 시작합니다. 되돌릴 수 없으니, 필요하면 먼저 "모든 조 PPT 내려받기"로 보관하십시오.</p></div>
        <button type="button" class="btn danger-solid" data-act="resetAll">다시 시작 · 모든 조 내용 지우기</button></div>`;
    tickTimers();
  }
  function renderRoomBody() {
    const el = $('#roomMatrix'); if (!el) return;
    const teams = roomTeams();
    const cur = control && control.round >= 0 && !control.all ? ROUNDS[control.round] : null;
    const tools = `<div class="matrix-tools"><button type="button" class="btn" data-act="pptAll" ${teams.length ? '' : 'disabled'}>모든 조 PPT 내려받기 (zip)</button><button type="button" class="btn ghost" data-act="pptExample">예시 팀 PPT 내려받기</button><span class="muted">3-2 원본 빈 시트에 조가 쓴 내용을 채운 파일입니다</span></div>`;
    el.innerHTML = tools + (teams.length ? `<div class="tbl-wrap"><table class="matrix"><thead><tr><th>조</th>${ROUNDS.map((sid) => `<th class="${sid === cur ? 'live' : ''}">${sheetNo(sid)}</th>`).join('')}<th>최근 입력</th><th>PPT</th></tr></thead><tbody>${teams.map((t) => {
      const cells = withTeam(t, () => ROUNDS.map((sid) => {
        const p = progress(campaignSheet(sid)); const d = t.data?.[`done.${sid}`];
        const cls = d ? 'done' : p.filled ? 'doing' : 'empty';
        return `<td class="${sid === cur ? 'live' : ''}"><button type="button" class="mcell ${cls}" data-cell="${esc(t.id)}|${sid}" title="${esc(t.name)} · 실습 ${sheetNo(sid)} · ${p.filled}/${p.total}칸${d ? ' · 제출 ' + hhmm(d) : ''}">${d ? '✓' : p.filled ? Math.round(p.ratio * 100) + '%' : '·'}</button></td>`;
      }).join(''));
      return `<tr><th scope="row">${esc(t.name)}${t.author ? ` <small>${esc(t.author)}</small>` : ''}${t.imported ? ' <small>코드</small>' : ''}</th>${cells}<td class="when">${t.updatedAt ? hhmm(t.updatedAt) : ''}</td><td><button type="button" class="linkish" data-act="pptTeam" data-id="${esc(t.id)}">받기</button></td></tr>`;
    }).join('')}</tbody></table></div><p class="legend"><span class="mcell done">✓</span> 제출 <span class="mcell doing">40%</span> 작성 중 <span class="mcell empty">·</span> 아직 없음 — 칸을 누르면 그 조의 시트가 아래에 열립니다</p>`
      : `<div class="empty-room"><b>아직 들어온 조가 없습니다.</b><p>조가 앱에서 우리 조를 고르고 쓰기 시작하면 여기에 한 줄씩 생깁니다.</p></div>`);
    const il = $('#importList');
    renderPresence();
    if (il) il.innerHTML = Object.values(state.imports).map((t) => `<li>${esc(t.name)} <button type="button" class="linkish" data-act="importDel" data-id="${esc(t.id)}">빼기</button></li>`).join('');
    renderRoomView();
  }
  function renderRoomView() {
    const el = $('#roomView'); if (!el) return;
    const teams = roomTeams();
    const sel = state.roomSel;
    const tabs = `<div class="seg" role="group" aria-label="보기"><button type="button" data-act="roomMode" data-mode="round" aria-pressed="${sel.mode === 'round'}">라운드별 모든 조</button><button type="button" data-act="roomMode" data-mode="team" aria-pressed="${sel.mode === 'team'}">한 조의 모든 시트</button></div>`;
    if (!teams.length) { el.innerHTML = ''; return; }
    if (sel.mode === 'team') {
      const t = teams.find((x) => x.id === sel.tid) || teams[0];
      const sids = sel.sid && ROUNDS.includes(sel.sid) ? [sel.sid, ...ROUNDS.filter((s) => s !== sel.sid)] : ROUNDS;
      el.innerHTML = `<div class="rv-head">${tabs}<h3>${esc(t.name)}${t.author ? ` <small>작성 ${esc(t.author)}</small>` : ''}</h3>
        <div><button type="button" class="btn ghost" data-act="pptTeam" data-id="${esc(t.id)}">${esc(t.name)} 원본 시트 PPT 내려받기</button></div>
        <div class="team-tabs">${teams.map((x) => `<button type="button" class="${x.id === t.id ? 'cur' : ''}" data-cell="${esc(x.id)}|${sel.sid || ''}">${esc(x.name)}</button>`).join('')}</div></div>
        ${sids.map((sid) => cardHTML(t, sid, true)).join('')}`;
    } else {
      const sid = ROUNDS.includes(sel.sid) ? sel.sid : (control && control.round >= 0 && !control.all ? ROUNDS[control.round] : 's1');
      el.innerHTML = `<div class="rv-head">${tabs}<h3>${esc(sidFull(sid))} <small>조 ${teams.length}개</small></h3></div>
        <div class="cards">${teams.map((t) => cardHTML(t, sid, false)).join('')}</div>`;
    }
    tickTimers();
  }
  function cardHTML(t, sid, showSheetName) {
    const d = t.data?.[`done.${sid}`];
    const p = withTeam(t, () => progress(campaignSheet(sid)));
    return `<article class="rcard">
      <header><b>${showSheetName ? esc(sidFull(sid)) : esc(t.name)}</b>
        <span class="rstate ${d ? 'done' : p.filled ? 'doing' : 'empty'}">${d ? `제출 ${hhmm(d)}` : p.filled ? `작성 중 ${Math.round(p.ratio * 100)}%` : '아직 없음'}</span></header>
      <div class="rbody">${p.filled ? roSheetHTML(t, sid) : '<p class="muted">아직 쓴 내용이 없습니다.</p>'}</div>
    </article>`;
  }

  /* ---------- 원본 시트 PPT 내려받기 ----------
     templates/worksheet-3-2.pptx(3-2 교안의 실습 ①~⑫ 빈 시트 12장)를 JSZip으로 열어 표 칸과 답 칸에 조가 쓴 내용을 넣는다.
     원본의 디자인 · 서체 · 레이아웃은 그대로 두고 글자만 채운다. */
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const EMU = 914400;

  function slideKit(doc) {
    const byTag = (el, ns, tag) => Array.from(el.getElementsByTagNameNS(ns, tag));
    const kids = (el, tag) => Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.localName === tag);
    const tables = byTag(doc, NS_A, 'tbl');
    const shape = (name) => { const c = byTag(doc, NS_P, 'cNvPr').find((n) => n.getAttribute('name') === name); return c ? c.parentNode.parentNode : null; };
    const textOf = (el) => byTag(el, NS_A, 't').map((t) => t.textContent).join('');
    function makeRun(src, text, sz) {
      const r = doc.createElementNS(NS_A, 'a:r');
      const rPr = doc.createElementNS(NS_A, 'a:rPr');
      if (src) { Array.from(src.attributes).forEach((a) => rPr.setAttribute(a.name, a.value)); Array.from(src.childNodes).forEach((n) => rPr.appendChild(n.cloneNode(true))); }
      rPr.setAttribute('lang', 'ko-KR');
      if (sz) rPr.setAttribute('sz', String(sz));
      if (!kids(rPr, 'solidFill').length) { const f = doc.createElementNS(NS_A, 'a:solidFill'); const c = doc.createElementNS(NS_A, 'a:srgbClr'); c.setAttribute('val', '131313'); f.appendChild(c); rPr.insertBefore(f, rPr.firstChild); }
      const t = doc.createElementNS(NS_A, 'a:t'); t.textContent = text;
      r.appendChild(rPr); r.appendChild(t);
      return r;
    }
    /* txBody 안의 글을 text로 바꾼다. 줄바꿈마다 문단을 새로 만든다. */
    function setBodyText(body, text, sz) {
      const ps = kids(body, 'p'); if (!ps.length) return;
      const src = byTag(body, NS_A, 'rPr')[0] || byTag(body, NS_A, 'endParaRPr')[0] || null;
      const proto = ps[0].cloneNode(true);
      Array.from(proto.childNodes).forEach((n) => { if (n.nodeType === 1 && ['r', 'br', 'fld'].includes(n.localName)) proto.removeChild(n); });
      ps.forEach((p) => body.removeChild(p));
      String(text).split('\n').forEach((line) => {
        const p = proto.cloneNode(true);
        const end = kids(p, 'endParaRPr')[0];
        p.insertBefore(makeRun(src, line, sz), end || null);
        body.appendChild(p);
      });
    }
    const cellSize = (text) => text.length > 90 ? 900 : text.length > 45 ? 1000 : null;
    function cell(ti, r, c, text) {
      if (text === undefined || text === null || text === '') return;
      const tbl = tables[ti]; if (!tbl) return;
      const tr = kids(tbl, 'tr')[r]; if (!tr) return;
      const tc = kids(tr, 'tc')[c]; if (!tc) return;
      const body = kids(tc, 'txBody')[0]; if (!body) return;
      setBodyText(body, String(text), cellSize(String(text)));
    }
    const cellText = (ti, r, c) => { const tr = kids(tables[ti] || doc, 'tr')[r]; const tc = tr && kids(tr, 'tc')[c]; return tc ? textOf(tc) : ''; };
    /* "□ 주 □ 부" 같은 칸에서 고른 항목만 ■ */
    function check(ti, r, c, pick) {
      if (!pick) return;
      const base = cellText(ti, r, c);
      if (base.includes('□ ' + pick)) cell(ti, r, c, base.replace('□ ' + pick, '■ ' + pick));
    }
    function shapeText(name, text, sz) {
      const sp = shape(name); if (!sp || !text) return;
      const body = byTag(sp, NS_P, 'txBody')[0]; if (body) setBodyText(body, text, sz);
    }
    let nextId = Math.max(0, ...byTag(doc, NS_P, 'cNvPr').map((n) => +n.getAttribute('id') || 0)) + 1;
    /* 원본의 줄 친 답 칸 위에 글상자를 얹는다 (단위: 인치) */
    function box(x, y, w, h, text, sz) {
      if (!text) return;
      const size = sz || (text.length > 220 ? 900 : text.length > 120 ? 1000 : 1100);
      const paras = String(text).split('\n').map((line) => `<a:p><a:r><a:rPr lang="ko-KR" sz="${size}" dirty="0"><a:solidFill><a:srgbClr val="1F2A44"/></a:solidFill><a:latin typeface="Pretendard"/><a:ea typeface="Pretendard"/></a:rPr><a:t>${esc(line)}</a:t></a:r></a:p>`).join('');
      const id = nextId++;
      const xml = `<p:sp xmlns:p="${NS_P}" xmlns:a="${NS_A}"><p:nvSpPr><p:cNvPr id="${id}" name="Answer ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x * EMU)}" y="${Math.round(y * EMU)}"/><a:ext cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="45720" tIns="18288" rIns="45720" bIns="0" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
      const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
      byTag(doc, NS_P, 'spTree')[0].appendChild(doc.importNode(node, true));
    }
    return { cell, check, shapeText, box, cellText };
  }

  /* 실습 시트마다 앱의 칸을 원본 빈 시트의 칸에 옮긴다 (템플릿 안 파일 이름은 교안 원래 슬라이드 번호) */
  const SLIDE_FILE = { s1: 18, s2: 21, s3: 24, s4: 29, s5: 32, s6: 39, s7: 41, s8: 44, s9: 46, s10: 50, s11: 53, s12: 55 };
  const FILL = {
    s1(k) {
      for (let r = 0; r < 3; r++) { [0, 1, 2, 3].forEach((c) => k.cell(0, r + 1, c, C('s1', 'sig', r, c))); k.check(0, r + 1, 4, C('s1', 'sig', r, 4)); }
      k.cell(1, 1, 1, C('s1', 'dir', 0, 1)); k.check(1, 2, 1, C('s1', 'dir', 1, 1));
      [2, 3, 4].forEach((r) => k.cell(1, r + 1, 1, C('s1', 'dir', r, 1)));
    },
    s2(k) {
      for (let r = 0; r < 4; r++) { k.cell(0, r + 1, 2, C('s2', 'goals', r, 2)); k.cell(0, r + 1, 3, C('s2', 'goals', r, 3)); k.check(0, r + 1, 4, C('s2', 'goals', r, 4)); }
      for (let r = 0; r < 4; r++) [1, 2].forEach((c) => k.cell(1, r + 1, c, C('s2', 'seg', r, c)));
    },
    s3(k) {
      for (let r = 0; r < 3; r++) { k.cell(0, r + 1, 1, C('s3', 'ins', r, 1)); k.cell(0, r + 1, 2, C('s3', 'ins', r, 2)); k.check(0, r + 1, 3, C('s3', 'ins', r, 3)); }
      k.box(0.78, 6.07, 5.59, 0.9, V('s3', 'strong'));
      k.box(6.96, 6.07, 5.59, 0.9, V('s3', 'untouched'));
    },
    s4(k) {
      for (let r = 0; r < 3; r++) k.cell(0, r + 1, 1, C('s4', 'steps', r, 1));
      for (let r = 0; r < 3; r++) [1, 2, 3, 4].forEach((c) => k.cell(1, r + 1, c, C('s4', 'opts', r, c)));
      ['간결한가', '기억하기 쉬운가', '감성을 자극하는가', '브랜드와 연결되는가'].forEach((label, r) => { if (C('s4', 'crit', r, 1) === '충족') k.shapeText(`Text ${11 + r * 2}`, `■  ${label}`); });
      const pick = V('s4', 'pick'), reason = V('s4', 'reason');
      if (pick || reason) k.shapeText('Text 18', `최종 선택안과 이유   ${pick && !reason.startsWith(pick) ? pick + '안 — ' : ''}${reason}`, (reason || '').length > 70 ? 1000 : null);
    },
    s5(k) {
      ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => k.box(3.40, 1.99 + i * 1.22, 9.10, 1.02, V('s5', id)));
    },
    s6(k) {
      const b = findBlock('s6', 'ch');
      b.rows.forEach((row, r) => {
        const use = C('s6', 'ch', r, 1);
        if (use) k.cell(0, r + 1, 1, use === '사용' ? '■' : '□');
        k.cell(0, r + 1, 2, C('s6', 'ch', r, 2)); k.cell(0, r + 1, 3, C('s6', 'ch', r, 3));
        const pct = C('s6', 'ch', r, 4); if (pct) k.cell(0, r + 1, 4, `${pct}%`);
        k.cell(0, r + 1, 5, C('s6', 'ch', r, 5));
      });
      const sum = tableSum('s6', 'ch', 4); if (Number.isFinite(sum)) k.cell(0, 8, 4, `${fmt(sum, 1)}%`);
      const chk = V('s6', 'check'); if (chk) k.shapeText('Text 11', `확인 질문 답  ·  ${chk}`, chk.length > 120 ? 900 : 1000);
    },
    s7(k) {
      for (let r = 0; r < 7; r++) [1, 2, 3, 4].forEach((c) => k.cell(0, r + 1, c, C('s7', 'imc', r, c)));
      const rep = V('s7', 'repeat'), brk = V('s7', 'break');
      k.box(0.78, 6.21, 11.77, 0.76, [rep && `반복 메시지  ${rep}`, brk && `끊기는 지점  ${brk}`].filter(Boolean).join('\n'));
    },
    s8(k) {
      for (let r = 0; r < 4; r++) [1, 2].forEach((c) => k.cell(0, r + 1, c, C('s8', 'ops', r, c)));
      for (let r = 0; r < 3; r++) [1, 2, 3].forEach((c) => k.cell(1, r + 1, c, C('s8', 'wk', r, c)));
    },
    s9(k) {
      const b = findBlock('s9', 'bud');
      b.rows.forEach((row, r) => {
        const p = CN('s9', 'bud', r, 1);
        if (Number.isFinite(p)) { k.cell(0, r + 1, 1, `${fmt(p, 1)}%`); k.cell(0, r + 1, 2, `${fmt(BUDGET * p / 100)}원`); }
        k.cell(0, r + 1, 3, C('s9', 'bud', r, 2)); k.cell(0, r + 1, 4, C('s9', 'bud', r, 3));
      });
      const sum = tableSum('s9', 'bud', 1);
      if (Number.isFinite(sum)) { k.cell(0, 8, 1, `${fmt(sum, 1)}%`); k.cell(0, 8, 2, `${fmt(BUDGET * sum / 100)}원`); }
      k.box(0.78, 6.84, 11.77, 0.27, V('s9', 'cpa'), 900);
    },
    s10(k) {
      for (let r = 0; r < 5; r++) { k.check(0, r + 1, 1, C('s10', 'kpi', r, 1)); [2, 3, 4, 5].forEach((c) => k.cell(0, r + 1, c, C('s10', 'kpi', r, c))); }
      k.cell(1, 1, 1, C('s10', 'verify', 0, 1)); k.cell(1, 2, 1, C('s10', 'verify', 1, 1));
    },
    s11(k) {
      for (let r = 0; r < 8; r++) k.cell(0, r + 1, 1, C('s11', 'one', r, 1));
    },
    s12(k) {
      for (let r = 0; r < 4; r++) { k.cell(0, r + 1, 1, C('s12', 'pres', r, 1)); const m = C('s12', 'pres', r, 2); if (m) k.cell(0, r + 1, 2, `${m}분`); }
      ['teamA', 'teamB', 'teamC'].forEach((id, i) => { const n = V('s12', id); if (n) k.cell(1, 0, i + 1, /^팀|조$|팀$/.test(n) ? n : `팀 ${n}`); });
      for (let r = 0; r < 4; r++) [1, 2, 3, 4].forEach((c) => k.cell(1, r + 1, c, C('s12', 'ev', r, c)));
      [1, 2, 3].forEach((c) => { const s = tableSum('s12', 'ev', c); if (Number.isFinite(s)) k.cell(1, 5, c, fmt(s)); });
    },
  };

  async function buildPptx(team, only) {
    if (typeof JSZip === 'undefined') throw new Error('nozip');
    if (!window.TEMPLATE_PPTX_B64) throw new Error('notpl');
    const zip = await JSZip.loadAsync(window.TEMPLATE_PPTX_B64, { base64: true });
    const ids = Object.keys(SLIDE_FILE);
    const xmls = {};
    for (const sid of ids) xmls[sid] = await zip.file(`ppt/slides/slide${SLIDE_FILE[sid]}.xml`).async('string');
    /* viewCtx를 바꾼 동안에는 await 없이 한 번에 처리한다 (다른 화면 갱신과 섞이지 않게) */
    const prev = [viewCtx, state.course];
    viewCtx = { data: team.data || {} }; state.course = 'campaign';
    try {
      for (const sid of ids) {
        const doc = new DOMParser().parseFromString(xmls[sid], 'application/xml');
        const k = slideKit(doc);
        k.shapeText('Text 9', `팀명   ${team.name || '______________'}          작성자   ${team.author || '______________'}`);
        FILL[sid](k, team);
        xmls[sid] = new XMLSerializer().serializeToString(doc);
      }
    } finally { [viewCtx, state.course] = prev; }
    for (const sid of ids) zip.file(`ppt/slides/slide${SLIDE_FILE[sid]}.xml`, xmls[sid]);
    if (only) await keepSlides(zip, only.map((sid) => `slide${SLIDE_FILE[sid]}.xml`));
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
  /* 고른 슬라이드만 남긴다 — 목록 · 관계 · 파일 · 형식 등록 · 딸린 노트까지 지운다 */
  async function keepSlides(zip, keep) {
    const P = 'ppt/presentation.xml', PR = 'ppt/_rels/presentation.xml.rels', CT = '[Content_Types].xml';
    const parse = async (f) => new DOMParser().parseFromString(await zip.file(f).async('string'), 'application/xml');
    const ser = (d) => new XMLSerializer().serializeToString(d);
    const pres = await parse(P), rels = await parse(PR), ct = await parse(CT);
    const drop = new Set();
    Array.from(rels.getElementsByTagName('Relationship')).forEach((r) => {
      const tgt = r.getAttribute('Target') || '';
      if (/^slides\/slide\d+\.xml$/.test(tgt) && !keep.includes(tgt.split('/')[1])) { drop.add(r.getAttribute('Id')); r.parentNode.removeChild(r); }
    });
    const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    Array.from(pres.getElementsByTagNameNS('*', 'sldId')).forEach((el) => { if (drop.has(el.getAttributeNS(RNS, 'id'))) el.parentNode.removeChild(el); });
    const gone = [];
    for (const f of Object.keys(zip.files)) {
      const m = f.match(/^ppt\/slides\/(slide\d+\.xml)$/);
      if (!m || keep.includes(m[1])) continue;
      const rf = `ppt/slides/_rels/${m[1]}.rels`;
      if (zip.file(rf)) {
        const sr = await parse(rf);
        Array.from(sr.getElementsByTagName('Relationship')).forEach((r) => {
          const t = r.getAttribute('Target') || '';
          if (/notesSlides\/notesSlide\d+\.xml$/.test(t)) { const nf = 'ppt/notesSlides/' + t.split('/').pop(); gone.push(nf, nf.replace('notesSlides/', 'notesSlides/_rels/') + '.rels'); }
        });
      }
      gone.push(f, rf);
    }
    gone.forEach((f) => zip.remove(f));
    Array.from(ct.getElementsByTagName('Override')).forEach((o) => { if (gone.includes((o.getAttribute('PartName') || '').slice(1))) o.parentNode.removeChild(o); });
    zip.file(P, ser(pres)); zip.file(PR, ser(rels)); zip.file(CT, ser(ct));
  }
  const allDone = (data) => ROUNDS.every((sid) => data?.[`done.${sid}`]);
  const pptName = (team) => `3-2 캠페인 기획 실습_${team.name || '조'}.pptx`.replace(/[\\/:*?"<>|]/g, '');
  async function saveFile(filename, blob) {
    let dl = null;
    try { dl = window.claude?.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename, data: blob }); return true; }
      catch (e) { flash(e?.code === 'declined' ? '내려받기를 취소했습니다' : e?.code === 'rate_limited' ? '잠시 뒤 다시 누르십시오' : '이 화면에서는 파일을 내려받을 수 없습니다'); return false; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return true;
  }
  async function downloadTeams(teams, btn, only) {
    if (!teams.length) { flash('내려받을 조가 없습니다'); return; }
    const label = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'PPT 만드는 중…'; }
    try {
      if (teams.length === 1) {
        const blob = await buildPptx(teams[0], only);
        const name = only ? pptName(teams[0]).replace(/\.pptx$/, `_실습 ${only.map(sheetNo).join('')}.pptx`) : pptName(teams[0]).replace(/\.pptx$/, '_전체 12장.pptx');
        if (await saveFile(name, blob)) flash(only ? `실습 ${only.map(sheetNo).join('')} 시트 PPT를 내려받았습니다` : '12장 전체 PPT를 내려받았습니다');
      }
      else {
        const out = new JSZip();
        for (const t of teams) out.file(pptName(t), await buildPptx(t));
        const blob = await out.generateAsync({ type: 'blob' });
        if (await saveFile(`3-2 캠페인 기획 실습_전체 ${teams.length}개 조.zip`, blob)) flash(`${teams.length}개 조의 PPT를 zip으로 묶었습니다`);
      }
    } catch (e) {
      flash(e?.message === 'nozip' ? 'PPT 도구를 불러오지 못했습니다 · 인터넷 연결을 확인하십시오' : 'PPT를 만들지 못했습니다');
    } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = label; } }
  }
  const ownTeam = () => ({ id: state.teamId || 'me', name: state.team || '', author: state.author, mission: MISSION, data: { ...(state.data[scopeOf(state.teamId)] || {}) } });

  /* ---------- 이벤트 ---------- */
  let navT;
  const renderNavLite = () => { clearTimeout(navT); navT = setTimeout(renderNav, 150); };

  document.addEventListener('input', (e) => {
    const k = e.target.dataset?.k;
    if (k) {
      setVal(k, e.target.value);
      if (e.target.tagName === 'TEXTAREA') autosize(e.target);
      runCalcs(); renderNavLite(); save();
      return;
    }
    const kw = e.target.dataset?.kw;
    if (kw) { state.kw[kw] = e.target.value.trim(); const a = $(`#kwgo-${kw}`); if (a) a.href = siteUrl(kw); save(); return; }
    if (e.target.id === 'author') {
      state.author = e.target.value; if (ROOM) { clearTimeout(presT); presT = setTimeout(updatePresence, 600); }
      const by = app.querySelector('.byline');
      if (by && state.view === 'sheet' && !showingExample(state.sheet[state.course])) by.innerHTML = `팀명 <u>${esc(state.team) || '&nbsp;'.repeat(14)}</u> 작성자 <u>${esc(state.author) || '&nbsp;'.repeat(14)}</u>`;
      save();
      if (DB && state.teamId) { clearTimeout(flushT); flushT = setTimeout(() => { writing = writing.then(() => writeTeam({})).catch(() => {}); }, 900); }
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'team') { chooseTeam(e.target.value.replace('t', '')); return; }
    if (e.target.tagName === 'SELECT' && e.target.dataset.k) { setVal(e.target.dataset.k, e.target.value); runCalcs(); renderNavLite(); save(); }
  });
  document.addEventListener('toggle', (e) => {
    const sid = e.target?.dataset?.why; if (!sid) return;
    state.whyClosed = { ...(state.whyClosed || {}), [sid]: !e.target.open }; save();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'instrCode') { e.preventDefault(); $('#instrOn').click(); } });

  const goTop = () => { window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); };

  let clearArmed = null;
  document.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-jump]');
    if (jump) { e.preventDefault(); document.getElementById(jump.dataset.jump)?.scrollIntoView({ block: 'start' }); return; }
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.view) { state.view = t.dataset.view; save(); render(); goTop(); return; }
    if (t.dataset.sheet) { state.view = 'sheet'; state.sheet[state.course] = t.dataset.sheet; save(); render(); goTop(); return; }
    if (t.dataset.team) { chooseTeam(t.dataset.team); return; }
    if (t.dataset.tppick) {
      const sid = state.sheet.campaign; setVal(TYPE_KEY(sid), t.dataset.tppick);
      state.tp = { ...(state.tp || {}), preview: null }; save(); rerenderPicker(); return;
    }
    if (t.dataset.tpview) { state.tp = { ...(state.tp || {}), preview: t.dataset.tpview }; save(); rerenderPicker(); return; }
    if (t.dataset.gstage !== undefined) { state.game.stage = +t.dataset.gstage; state.game.q = -1; save(); renderGame(); return; }
    if (t.dataset.gpick !== undefined) { const g = state.game; g.picked[`${g.stage}.${g.q}`] = +t.dataset.gpick; save(); renderGame(); return; }
    if (t.dataset.cell) { const [tid, sid] = t.dataset.cell.split('|'); state.roomSel = { mode: 'team', tid, sid }; save(); renderRoomView(); $('#roomView').scrollIntoView({ block: 'start' }); return; }
    if (t.dataset.roundpick) { state.roomSel = { mode: 'round', sid: t.dataset.roundpick }; save(); renderRoomView(); renderRoomControls(); return; }
    if (t.dataset.course) { state.course = t.dataset.course; state.view = 'sheet'; save(); render(); goTop(); return; }
    const sheet = findSheet(state.sheet[state.course]);
    switch (t.dataset.act) {
      case 'tpApply': state.tp = { ...(state.tp || {}), applied: { ...(state.tp?.applied || {}), [t.dataset.type]: true } }; save(); rerenderPicker(); app.querySelector('.tp-our textarea')?.focus(); break;
      case 'tpEx': state.tp = { ...(state.tp || {}), ex: { ...(state.tp?.ex || {}), [t.dataset.type]: !state.tp?.ex?.[t.dataset.type] } }; save(); rerenderPicker(); break;
      case 'tpBench': {
        const sid = state.sheet.campaign; const ti = TYPE_PICK.findIndex((x) => x.k === t.dataset.type); const tp = TYPE_PICK[ti];
        const ours = tp.slots.map((sl, i) => val(tpKey(sid, ti, i)) || sl);
        const k = ckey(sid, 'dir', 2, 1);
        setVal(k, `${tp.case} — '${tp.slots.join(' → ')}' 순서를 가져와 우리 캠페인은 ${ours.join(' → ')}`);
        const el = document.getElementById(`f-${k}`); if (el) { el.value = val(k); autosize(el); }
        save(); runCalcs(); flash('벤치마킹 칸에 넣었습니다 · 문장을 다듬으십시오'); break;
      }
      case 'gameGo': state.game.q = 0; save(); renderGame(); break;
      case 'gameNext': {
        const g = state.game, st = GAME[g.stage];
        if (g.q + 1 < st.qs.length) g.q += 1; else { g.stage += 1; g.q = -1; }
        save(); renderGame(); goTop(); break;
      }
      case 'gameReset': state.game = { stage: 0, q: -1, picked: {} }; save(); renderGame(); break;
      case 'example': toggleExample(t.dataset.sid); break;
      case 'fill': fillSheet(sheet); save(); render(); flash('예시 답안을 채웠습니다'); break;
      case 'clear':
        if (clearArmed !== sheet.id) { clearArmed = sheet.id; t.textContent = '한 번 더 누르면 비웁니다'; t.classList.add('armed'); setTimeout(() => { if (t.isConnected) { t.textContent = '이 시트 비우기'; t.classList.remove('armed'); } clearArmed = null; }, 3000); break; }
        clearArmed = null; clearSheet(sheet); save(); render(); flash('이 시트를 비웠습니다'); break;
      case 'draft': {
        let n = 0;
        composeDraft().forEach((txt, r) => { const k = ckey(sheet.id, 'one', r, 1); if (!val(k) && txt) { setVal(k, txt); n++; } });
        save(); render(); flash(n ? `빈 칸 ${n}곳을 채웠습니다` : '채울 빈 칸이 없거나 앞 시트가 비어 있습니다'); break;
      }
      case 'export': { const p = $('#exportPanel'); p.hidden = !p.hidden; t.setAttribute('aria-expanded', !p.hidden); break; }
      case 'copyText': copy(exportText(), '전체 내용을 복사했습니다'); break;
      case 'copyCode': copy(backupCode(), '백업 코드를 복사했습니다'); break;
      case 'restore':
        try {
          const o = decodeCode($('#restoreIn').value);
          if (!o || !o.data) throw new Error();
          state.data = o.data; state.team = o.team || ''; state.teamId = o.teamId || state.teamId; state.author = o.author || '';
          $('#team').value = state.teamId; $('#author').value = state.author; $('#restoreIn').value = '';
          save(); subscribeTeam(); render(); flash('백업을 불러왔습니다');
        } catch (err) { flash('백업 코드를 읽지 못했습니다 · 복사한 코드 전체를 붙여 넣으십시오'); }
        break;
      case 'instrOn':
        if ($('#instrCode').value.trim() === INSTRUCTOR_CODE) { state.instructor = true; $('#instrCode').value = ''; save(); render(); flash('강사 모드를 켰습니다'); }
        else flash('강사 비밀번호가 맞지 않습니다');
        break;
      case 'instrOff': state.instructor = false; state.course = 'campaign'; state.localExample = null; if (state.view === 'room') state.view = 'home'; save(); render(); flash('강사 모드를 껐습니다'); break;
      case 'instrLogin': { const pnl = $('#exportPanel'); pnl.hidden = false; $('[data-act="export"]').setAttribute('aria-expanded', 'true'); $('#instrCode').focus(); break; }
      case 'submit': {
        const sid = t.dataset.sid;
        setVal(`done.${sid}`, new Date().toISOString()); save();
        $('#submitBox').innerHTML = submitHTML(findSheet(sid)); renderNav();
        flash(DB ? '제출했습니다 · 강사방에 표시됩니다' : '제출 표시를 했습니다 · 내보내기에서 백업 코드를 복사해 강사에게 보내십시오');
        /* 제출하면 우리 조 PPT도 이 기기에 내려받는다 (지금까지 쓴 시트가 모두 채워진 원본 시트 모양) */
        if (state.teamId && isCampaign()) {
          const me = ownTeam();
          if (allDone(me.data)) { flash('12개 실습을 모두 제출했습니다 · 전체 PPT를 내려받습니다'); downloadTeams([me], $('#submitBox [data-act="pptOwn"]')); }
          else downloadTeams([me], $('#submitBox [data-act="pptSheet"]'), [sid]);
        }
        break;
      }
      case 'roundStart': setControl({ round: ROUNDS.indexOf(t.dataset.sid), all: false, example: null, endsAt: new Date(Date.now() + roundMin(t.dataset.sid) * 60000).toISOString() }); break;
      case 'roundPlus': if (control?.endsAt) setControl({ endsAt: new Date(Math.max(Date.now(), Date.parse(control.endsAt)) + 5 * 60000).toISOString() }); break;
      case 'roundStop': if (control) setControl({ endsAt: null }); break;
      case 'roundAll': setControl({ round: ROUNDS.length - 1, all: true, endsAt: null }); break;
      case 'roundReset': setControl({ round: -1, all: false, endsAt: null, example: null }); break;
      case 'roomExample': toggleExample(t.dataset.sid); break;
      case 'resetAll':
        if (!roomAllowed()) break;
        if (clearArmed !== 'ALL') { clearArmed = 'ALL'; t.textContent = '정말 지웁니다 · 한 번 더 누르십시오'; t.classList.add('armed'); setTimeout(() => { if (t.isConnected) { t.textContent = '다시 시작 · 모든 조 내용 지우기'; t.classList.remove('armed'); } if (clearArmed === 'ALL') clearArmed = null; }, 4000); break; }
        clearArmed = null; t.disabled = true; t.textContent = '지우는 중…'; resetAll(); break;
      case 'roomMode': state.roomSel = { ...state.roomSel, mode: t.dataset.mode }; save(); renderRoomView(); break;
      case 'importAdd': {
        try {
          const o = decodeCode($('#importIn').value);
          const key = Object.keys(o.data || {}).find((k) => k === scopeOf(o.teamId)) || Object.keys(o.data || {}).find((k) => k.endsWith(`m-${MISSION}`) && Object.keys(o.data[k]).length);
          if (!key) throw new Error();
          const id = o.teamId || `x-${(o.team || 'team').replace(/[^0-9A-Za-z가-힣]/g, '')}`;
          state.imports[id] = { id, name: o.team || id, mission: MISSION, author: o.author || '', data: o.data[key], updatedAt: new Date().toISOString(), imported: true };
          $('#importIn').value = ''; save(); renderRoomBody(); flash(`${o.team || id} 제출 코드를 추가했습니다`);
        } catch (err) { flash('제출 코드를 읽지 못했습니다 · 조가 복사한 코드 전체를 붙여 넣으십시오'); }
        break;
      }
      case 'pptSheet':
        if (!state.teamId) { flash('먼저 우리 조를 고르십시오'); break; }
        downloadTeams([ownTeam()], t, [t.dataset.sid]); break;
      case 'pptOwn':
        if (!state.teamId) { flash('먼저 우리 조를 고르십시오'); break; }
        downloadTeams([ownTeam()], t); break;
      case 'pptTeam': { const tm = roomTeams().find((x) => x.id === t.dataset.id); if (tm) downloadTeams([tm], t); break; }
      case 'pptAll': downloadTeams(roomTeams(), t); break;
      case 'pptExample': downloadTeams([{ id: 'ex', name: 'MOOD SHIFT (예시 팀)', author: '강사 예시', mission: MISSION, data: exampleAll() }], t); break;
      case 'importDel': delete state.imports[t.dataset.id]; save(); renderRoomBody(); break;
      case 'qrBig': {
        const ov = document.createElement('div'); ov.className = 'qr-over'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', '입장 QR');
        ov.innerHTML = `<div class="qr-box">${qrSVG(10)}<b>휴대폰 카메라로 찍으십시오</b><p>${APP_URL}</p><p class="muted">claude.ai 로그인 → 우리 조 고르기 → 작성자 이름 쓰기</p><button type="button" class="btn" data-act="qrClose">닫기</button></div>`;
        document.body.appendChild(ov); ov.querySelector('[data-act="qrClose"]').focus(); break;
      }
      case 'qrClose': t.closest('.qr-over')?.remove(); break;
      case 'copyUrl': navigator.clipboard?.writeText(APP_URL).then(() => flash('주소를 복사했습니다'), () => flash(APP_URL)); break;
      case 'kickTeam': kickTeam(t.dataset.id, false); break;
      case 'clearTeam':
        if (clearArmed !== t.dataset.id) { clearArmed = t.dataset.id; t.textContent = '정말 지웁니다 · 한 번 더'; setTimeout(() => { if (t.isConnected) t.textContent = '이 조 기록 지우기'; if (clearArmed === t.dataset.id) clearArmed = null; }, 4000); break; }
        clearArmed = null; kickTeam(t.dataset.id, true); break;
    }
  });

  /* ---------- 시작 ---------- */
  $('#team').innerHTML = `<option value="">선택</option>${Array.from({ length: TEAM_COUNT }, (_, i) => `<option value="t${i + 1}">${i + 1}조</option>`).join('')}`;
  $('#team').value = state.teamId; $('#author').value = state.author;
  if (location.hash === '#sites') state.view = 'sites';
  render();
  setInterval(tickTimers, 1000);
  connect();
})();

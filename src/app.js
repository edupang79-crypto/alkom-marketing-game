(() => {
  'use strict';

  const STORE_KEY = 'campaign-lab-v2';
  const INSTRUCTOR_CODE = 'lift'; // 강사 모드 코드 — 바꾸려면 이 값을 고친 뒤 ./build.sh
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
  let state = { view: 'home', course: 'campaign', mission: null, sheet: { campaign: 's0', promo: 'c1' }, team: '', teamId: '', author: '', instructor: false, answers: true, kw: {}, data: {}, imports: {}, roomSel: { mode: 'round', sid: '' } };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const s = JSON.parse(raw); state = { ...state, ...s, sheet: { ...state.sheet, ...(s.sheet || {}) }, data: s.data || {}, kw: s.kw || {}, imports: s.imports || {}, roomSel: s.roomSel || { mode: 'round', sid: '' } }; }
  } catch (e) { /* 저장소를 못 쓰면 이번 세션 메모리로만 동작 */ }
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
  /* 강사방에서 다른 조의 시트를 그릴 때는 viewCtx가 그 조의 데이터와 미션을 대신한다 */
  let viewCtx = null;
  let RO = false;
  const curMission = () => viewCtx ? viewCtx.mission : state.mission;
  const cs = () => CASES[curMission()];
  const scopeOf = (teamId, mission) => `${teamId || '_'}/m-${mission || '_'}`;
  const scope = () => isCampaign() ? scopeOf(state.teamId, state.mission) : 'promo';
  const D = () => viewCtx ? viewCtx.data : (state.data[scope()] ||= {});
  const val = (key) => D()[key] ?? '';
  const setVal = (key, v) => { if (v === '' || v == null) delete D()[key]; else D()[key] = v; queueSync(key, v); };
  const showAns = () => state.instructor && state.answers;

  const fkey = (sid, id) => `${sid}.${id}`;
  const ckey = (sid, tid, r, c) => `${sid}.${tid}.${r}.${c}`;
  const V = (sid, id) => val(fkey(sid, id));
  const N = (sid, id) => num(V(sid, id));
  const C = (sid, tid, r, c) => val(ckey(sid, tid, r, c));
  const CN = (sid, tid, r, c) => num(C(sid, tid, r, c));

  /* ---------- 사이트 링크 ---------- */
  const kwFor = (id) => state.kw[id] || (cs() ? cs().kw : (id === 'blackkiwi' ? '신세계백화점' : '롯데백화점'));
  function siteUrl(id) {
    const s = SITES[id];
    if (s.kw) return `https://blackkiwi.net/service/keyword-analysis?keyword=${encodeURIComponent(kwFor(id))}&platform=naver`;
    if (s.news) return `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(kwFor(id))}`;
    return s.url;
  }
  const siteChips = (ids) => (ids || []).filter((id) => SITES[id]).map((id) => ext(siteUrl(id), esc(SITES[id].name))).join('');

  /* ---------- 케이스 시트(0번)는 고른 미션에 따라 칸이 달라짐 ---------- */
  function caseBlocks() {
    const c = cs(); if (!c) return [];
    const blocks = [
      { type: 'caseinfo' },
      { type: 'table', id: 'find', cols: [{ h: '조가 직접 찾아 채울 것' }, { h: '찾은 값 · 사실', t: 'area' }, { h: '어디서 찾았나 (사이트 · 기사 · 날짜)', t: 'area' }],
        rows: c.find.map((f) => ({ l: f[0], sub: f[1], sites: f[2], ex: f[3] })) },
      { type: 'field', id: 'goalType', t: 'pick', opts: ['고객층 확보', '인지도'], label: '캠페인 목표 유형 (조가 정함)', hint: `이 점포의 방향 · ${c.goalType}` },
      { type: 'field', id: 'period', t: 'text', label: '캠페인 기간 (1~3개월)', hint: '캠페인은 프로모션보다 기간을 길게 잡고 스토리를 중심에 둡니다', ex: '10/6(월) ~ 11/30(일) · 8주 — 가을 환절기와 결혼식 시즌을 함께 잡음' },
      { type: 'field', id: 'budget', t: 'num', label: '예산 (원 · 가정값)', hint: '점포 매출 규모에 맞게 정합니다. ⑧ 예산 배분의 총예산이 비어 있으면 이 값을 씁니다', ex: '150000000 (가정 · 점포 연매출의 ○.○% 수준)' },
      { type: 'q', id: 'value', q: curMission() === 'E' ? '이 점포가 손님에게 남길 가치를 한 단어로 쓰면?' : `이 점포의 가치는 "${c.value}"입니다. 우리 조는 손님에게 어떤 한 문장을 남기겠습니까?`, nudge: '고객이 우리 점포를 친구에게 설명할 때 쓰는 한 단어는? 그 단어를 약속하는 문장으로 바꾼다면?' },
    ];
    if (c.debate) blocks.push({ type: 'q', id: 'debate', q: `토론 · ${c.debate}`, ex: '필요하다 / 필요 없다 — 이유 한 가지와 그 근거 자료 한 가지를 함께 적습니다' });
    return blocks;
  }
  const blocksOf = (sheet) => sheet.dynamic ? caseBlocks() : sheet.blocks;
  const findSheet = (sid) => course().sheets.find((s) => s.id === sid);
  const findBlock = (sid, id) => blocksOf(findSheet(sid) || { blocks: [] }).find((b) => b.id === id);

  /* ---------- 진행 상황 ---------- */
  function sheetKeys(sheet) {
    const keys = [];
    blocksOf(sheet).forEach((b) => {
      if (b.type === 'field' || b.type === 'q') keys.push(fkey(sheet.id, b.id));
      if (b.type === 'table') b.rows.forEach((row, r) => b.cols.forEach((col, c) => { if (c > 0) keys.push(ckey(sheet.id, b.id, r, c)); }));
    });
    return keys;
  }
  function progress(sheet) {
    const keys = sheetKeys(sheet);
    const filled = keys.filter((k) => String(D()[k] ?? '').trim() !== '').length;
    return { filled, total: keys.length, ratio: keys.length ? filled / keys.length : 0 };
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
  const goalMembers = () => N('s1', 'goalNum');
  const pickRow = () => ({ A: 0, B: 1, C: 2 }[V('s3', 'pick')]);
  const campaignBudget = () => Number.isFinite(N('s8', 'total')) ? N('s8', 'total') : N('s0', 'budget');

  function tableSum(sid, tid, c) {
    const b = findBlock(sid, tid); if (!b) return NaN;
    let s = 0, any = false;
    b.rows.forEach((_, r) => { const n = CN(sid, tid, r, c); if (Number.isFinite(n)) { s += n; any = true; } });
    return any ? s : NaN;
  }

  const CALC = {
    mainSub() {
      const b = findBlock('s1', 'goals');
      const picks = b.rows.map((_, r) => C('s1', 'goals', r, 4));
      const m = picks.filter((p) => p === '주').length, s = picks.filter((p) => p === '부').length;
      return list([
        line(m === 1 ? 'ok' : 'bad', `주 목표 ${m}개 ${m === 1 ? '— 좋습니다' : '— 주 목표는 하나만 고르십시오'}`),
        line(s === 1 ? 'ok' : 'bad', `부 목표 ${s}개 ${s === 1 ? '— 좋습니다' : '— 부 목표도 하나만 고르십시오'}`),
        V('s0', 'goalType') ? line('info', `케이스 시트에서 정한 목표 유형 · ${esc(V('s0', 'goalType'))}`) : '',
      ]);
    },
    insight() {
      const b = findBlock('s2', 'ins');
      const re = /(때|는데|은데|서 |어서|아서|면서)/;
      const items = b.rows.map((_, r) => {
        const t = C('s2', 'ins', r, 1).trim(), ty = C('s2', 'ins', r, 3), src = C('s2', 'ins', r, 2).trim();
        if (!t) return line('idle', `${r + 1}번 — 아직 비어 있습니다`);
        const miss = [!re.test(t) && '상황', !src && '근거', !ty && '유형'].filter(Boolean);
        return line(miss.length ? 'warn' : 'ok', `${r + 1}번 — ${miss.length ? `${miss.join(' · ')}이(가) 보이지 않습니다` : '상황 · 근거 · 유형을 갖췄습니다'}`);
      });
      const types = new Set(b.rows.map((_, r) => C('s2', 'ins', r, 3)).filter(Boolean));
      items.push(line(types.size >= 2 ? 'ok' : 'idle', `유형 ${types.size}가지 사용 (경험 · 가치 · 혜택)`));
      return list(items);
    },
    slogan() {
      const r = pickRow();
      if (r === undefined) return `<p class="muted">최종 선택안을 고르면 여기에 캠페인명과 슬로건이 나란히 보입니다.</p>`;
      const name = C('s3', 'opts', r, 1), sl = C('s3', 'opts', r, 2), keep = V('s3', 'keep');
      const len = (s) => s.replace(/\s/g, '').length;
      return `<div class="poster"><span class="poster-eyebrow">${esc(V('s3', 'pick'))}안 · ${esc(cs() ? cs().full : '')}</span><strong>${esc(name || '캠페인명 미입력')}</strong><em>${esc(sl || '슬로건 미입력')}</em></div>` +
        list([
          line(name && len(name) <= 10 ? 'ok' : 'warn', `캠페인명 ${len(name)}자 (공백 제외) ${len(name) <= 10 ? '' : '— 10자 이내를 권합니다'}`),
          line(sl && len(sl) <= 20 ? 'ok' : 'warn', `슬로건 ${len(sl)}자 ${len(sl) <= 20 ? '' : '— 20자를 넘으면 한눈에 읽히지 않습니다'}`),
          line(keep ? 'ok' : 'idle', keep ? `남길 문장 · "${esc(keep)}"` : '남길 문장이 비어 있습니다'),
          cs() ? line('info', `이 점포의 가치 · "${esc(V('s0', 'value') || cs().value)}" — 슬로건에 이 가치가 들리는지 확인하십시오`) : '',
        ]);
    },
    story() {
      const parts = ['p1', 'p2', 'p3', 'p4'].map((id) => V('s4', id).trim());
      const labels = ['문제', '해결', '고객 경험', '브랜드 가치'];
      return `<p class="calc-sub">네 칸을 이어 읽기 · ${parts.filter(Boolean).length}/4칸</p>` +
        `<div class="readaloud">${parts.map((p, i) => p ? `<span class="ra ra-${i}">${esc(p)}</span>` : `<span class="ra ra-empty">[${labels[i]} 비어 있음]</span>`).join(' ')}</div>`;
    },
    channel() {
      const b = findBlock('s5', 'ch');
      const rows = b.rows.map((row, r) => ({ label: row.l.replace(/\s*\(.*\)/, ''), use: C('s5', 'ch', r, 1), role: C('s5', 'ch', r, 2), value: CN('s5', 'ch', r, 4) }));
      const sum = rows.reduce((a, x) => a + (Number.isFinite(x.value) ? x.value : 0), 0);
      const aw = rows.filter((x) => x.role.trim().startsWith('인지')).reduce((a, x) => a + (x.value || 0), 0);
      const wrong = rows.filter((x) => x.use === '미사용' && x.value > 0);
      return bars(rows.map((x) => ({ label: x.label, value: x.value, cls: x.use === '미사용' ? 'off' : '' }))) +
        list([
          line(Math.abs(sum - 100) < 0.01 ? 'ok' : 'bad', `예산 비중 합계 ${fmt(sum, 1)}% ${Math.abs(sum - 100) < 0.01 ? '' : '— 100%가 되도록 맞추십시오'}`),
          line('info', `역할별 비중 · 인지 ${fmt(aw, 1)}% · 관심~전환 ${fmt(sum - aw, 1)}%`),
          ...wrong.map((x) => line('warn', `${esc(x.label)} — 미사용인데 예산 ${fmt(x.value)}%가 잡혀 있습니다`)),
        ]);
    },
    households() {
      const hh = N('s5', 'hh'), aw = N('s5', 'aw');
      if (!Number.isFinite(hh) || !Number.isFinite(aw)) return `<p class="muted">세대수(또는 인구)와 인지도 목표를 넣으면 몇 명이 알아야 하는지 계산합니다.</p>`;
      return stats([stat(fmt(hh * aw / 100), `${fmt(hh)} × ${fmt(aw)}% = 캠페인을 알아야 하는 세대(명)`)]);
    },
    imc() {
      let kws = V('s6', 'kw').split(/[,，·\s]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
      if (!kws.length) kws = V('s3', 'keep').split(/[,，·\s]+/).map((s) => s.replace(/[^가-힣A-Za-z0-9]/g, '')).filter((s) => s.length >= 2);
      if (!kws.length) return `<p class="muted">핵심어를 적거나 ③에서 남길 문장을 정하면 단계별로 이어지는지 봅니다.</p>`;
      const b = findBlock('s6', 'imc');
      const items = b.rows.map((row, r) => {
        const msg = C('s6', 'imc', r, 2);
        if (!msg.trim()) return line('idle', `${esc(row.l)} — 메시지 비어 있음`);
        const hit = kws.filter((k) => msg.includes(k));
        return line(hit.length ? 'ok' : 'warn', `${esc(row.l)} — ${hit.length ? hit.map((h) => chip('ok', h)).join(' ') : '핵심어가 보이지 않습니다 · 여기서 끊기지 않는지 확인하십시오'}`);
      });
      return `<p class="calc-sub">핵심어 ${kws.map((k) => chip('info', k)).join(' ')}</p>` + list(items);
    },
    phase() {
      const cards = [1, 2, 3].map((c) => CN('s7', 'vis', 0, c)), vis = [1, 2, 3].map((c) => CN('s7', 'vis', 1, c));
      const sc = cards.reduce((a, x) => a + (x || 0), 0), sv = vis.reduce((a, x) => a + (x || 0), 0);
      const goal = goalMembers();
      const share = sc ? (cards[1] || 0) / sc * 100 : NaN;
      return stats([stat(fmt(sc), '기간 합계 · 가입(카드 발급)'), stat(fmt(sv), '기간 합계 · 방문'), stat(fmt(share, 0) + '%', '집중기 비중')]) +
        list([
          Number.isFinite(goal) ? line(sc >= goal ? 'ok' : 'warn', `① 주 목표 ${fmt(goal)}명 대비 ${sc >= goal ? '충족' : `${fmt(goal - sc)}명 부족`}`) : line('idle', '①에서 주 목표 수치를 넣으면 비교합니다'),
          line(sv && sc ? 'info' : 'idle', `방문 대비 가입률 ${sv ? fmt(sc / sv * 100, 0) : '—'}%`),
        ]);
    },
    budget() {
      const total = campaignBudget(); const b = findBlock('s8', 'bud');
      const rows = b.rows.map((row, r) => ({ label: row.l, p: CN('s8', 'bud', r, 1) }));
      const sum = rows.reduce((a, x) => a + (x.p || 0), 0);
      const goal = goalMembers();
      const direct = [2, 3, 4].reduce((a, r) => a + (rows[r].p || 0), 0);
      const dig = [0, 1, 2, 4].reduce((a, r) => a + (CN('s5', 'ch', r, 4) || 0), 0), infl = CN('s5', 'ch', 3, 4);
      const anyCh = Number.isFinite(tableSum('s5', 'ch', 4));
      const table = `<div class="tbl-wrap"><table class="mini"><thead><tr><th>항목</th><th>비중</th><th>금액</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${esc(x.label)}</td><td class="n">${Number.isFinite(x.p) ? fmt(x.p, 1) + '%' : '—'}</td><td class="n">${Number.isFinite(total) && Number.isFinite(x.p) ? fmt(total * x.p / 100) + '원' : '—'}</td></tr>`).join('')}
        <tr class="sum"><td>합계</td><td class="n">${fmt(sum, 1)}%</td><td class="n">${Number.isFinite(total) ? fmt(total * sum / 100) + '원' : '—'}</td></tr></tbody></table></div>`;
      return table + stats([
        stat(Number.isFinite(total / goal) ? won(total / goal) : '—', `1인당 획득 비용 · 총예산 ÷ ${Number.isFinite(goal) ? fmt(goal) : '?'}명`),
        stat(Number.isFinite(total / goal) ? won(total * direct / 100 / goal) : '—', `직접 획득 예산 기준 · 디지털+인플루언서·지역+멤버십 ${fmt(direct, 1)}%`),
      ]) + list([
        line(Math.abs(sum - 100) < 0.01 ? 'ok' : 'bad', `비중 합계 ${fmt(sum, 1)}%`),
        anyCh ? line(dig === rows[2].p ? 'ok' : 'warn', `⑤ 인스타·유튜브·틱톡·라이브커머스 ${fmt(dig)}% ↔ 디지털 광고 ${fmt(rows[2].p)}% ${dig === rows[2].p ? '일치' : '— 서로 맞추십시오'}`) : line('idle', '⑤ 채널 비중을 넣으면 교차 점검합니다'),
        anyCh ? line(infl === rows[3].p ? 'ok' : 'warn', `⑤ 인플루언서·지역 매체 ${fmt(infl)}% ↔ ⑧ ${fmt(rows[3].p)}% ${infl === rows[3].p ? '일치' : '— 서로 맞추십시오'}`) : '',
        !Number.isFinite(goal) ? line('idle', '①에서 주 목표 수치를 넣으면 1인당 비용을 계산합니다') : '',
      ]);
    },
    kpiMain() {
      const b = findBlock('s9', 'kpi');
      const m = b.rows.filter((_, r) => C('s9', 'kpi', r, 1) === '주').length;
      return list([line(m === 1 ? 'ok' : 'warn', `주 지표 ${m}개 ${m === 1 ? '— 한 단계에 집중했습니다' : '— 주 지표는 하나로 좁히십시오'}`)]);
    },
    capacity() {
      const cap = N('s9', 'coach') * N('s9', 'slots') * N('s9', 'days');
      const resv = N('s9', 'resv'), walk = N('s9', 'walk'), goal = goalMembers();
      const tot = (resv || 0) + (walk || 0);
      return stats([
        stat(fmt(cap), `예약 수용량 · ${fmt(N('s9', 'coach'))}명 × ${fmt(N('s9', 'slots'))}타임 × ${fmt(N('s9', 'days'))}일`),
        stat(Number.isFinite(cap) && resv ? fmt(resv / cap * 100, 0) + '%' : '—', '예약 목표 ÷ 수용량 (가동률)'),
        stat(fmt(tot), '예약 + 워크인'),
      ]) + list([
        Number.isFinite(cap) && resv > cap ? line('bad', '예약 목표가 수용량을 넘습니다 · 인력이나 운영일을 늘리십시오') : line(Number.isFinite(cap) ? 'ok' : 'idle', Number.isFinite(cap) ? '예약 목표가 수용량 안에 있습니다' : '수용량 입력값을 채우십시오'),
        Number.isFinite(goal) ? line(tot >= goal ? 'ok' : 'warn', `① 주 목표 ${fmt(goal)}명 ${tot >= goal ? '충족' : `대비 ${fmt(goal - tot)}명 부족`}`) : '',
      ]);
    },
    onepage(sid) {
      const r = pickRow();
      const title = isCampaign() ? (r === undefined ? '' : C('s3', 'opts', r, 1)) : C('c5', 'cp', 0, 1);
      const sub = isCampaign() ? (r === undefined ? '' : C('s3', 'opts', r, 2)) : C('c5', 'cp', 1, 1);
      const where = isCampaign() && cs() ? `케이스 ${curMission()} · ${cs().full}` : course().code;
      const b = findBlock(sid, 'one');
      return `<div class="onepage">
        <div class="op-head"><span class="op-eyebrow">${esc(where)} · ${esc(state.team || '팀명')} · ${esc(state.author || '작성자')}</span>
        <h3>${esc(title || '캠페인명')}</h3><p>${esc(sub || '슬로건')}</p></div>
        <dl>${b.rows.map((row, i) => `<div><dt>${esc(row.l)}</dt><dd>${esc(C(sid, 'one', i, 1)) || '<span class="muted">비어 있음</span>'}</dd></div>`).join('')}</dl></div>`;
    },
    presTime(sid, blk) {
      const sum = tableSum(sid, 'pres', 2);
      const ok = Number.isFinite(sum) && sum <= blk.limit;
      return list([line(!Number.isFinite(sum) ? 'idle' : ok ? 'ok' : 'bad', `발표 시간 합계 ${fmt(sum)}${blk.unit} / 제한 ${blk.limit}${blk.unit}${Number.isFinite(sum) && !ok ? ' — 줄이십시오' : ''}`)]);
    },
    evalSum(sid, blk) {
      const b = findBlock(sid, 'ev');
      const max = blk.max * b.rows.length;
      const names = ['자체 평가', V(sid, 'teamA') || '팀 A', V(sid, 'teamB') || '팀 B'];
      const over = [];
      b.rows.forEach((row, r) => [1, 2, 3].forEach((c) => { const n = CN(sid, 'ev', r, c); if (n > blk.max || n < 0) over.push(`${row.l} · ${names[c - 1]}`); }));
      return stats([1, 2, 3].map((c) => stat(`${fmt(tableSum(sid, 'ev', c))}<small> / ${max}</small>`, esc(names[c - 1])))) +
        (over.length ? list(over.map((o) => line('bad', `${esc(o)} — 0~${blk.max}점 사이로 적으십시오`))) : '');
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

  /* ---------- ⑩ 초안 불러오기 ---------- */
  function composeDraft() {
    const j = (...xs) => xs.filter((x) => x && String(x).trim()).join(' · ');
    const first = (s) => (s || '').split(/(?<=[.다요])\s/)[0];
    if (isCampaign()) {
      const c = cs(), r = pickRow();
      const g = findBlock('s1', 'goals');
      const main = g.rows.findIndex((_, i) => C('s1', 'goals', i, 4) === '주');
      const sub = g.rows.findIndex((_, i) => C('s1', 'goals', i, 4) === '부');
      const ch = findBlock('s5', 'ch').rows.map((row, i) => C('s5', 'ch', i, 1) === '사용' ? `${row.l.replace(/\s*\(.*\)/, '')} ${C('s5', 'ch', i, 4)}%` : null).filter(Boolean).join(' · ');
      const bud = findBlock('s8', 'bud').rows.map((row, i) => ({ l: row.l, p: CN('s8', 'bud', i, 1) })).sort((a, b) => (b.p || 0) - (a.p || 0))[0];
      const kpiMain = findBlock('s9', 'kpi').rows.findIndex((_, i) => C('s9', 'kpi', i, 1) === '주');
      const facts = c.find.map((f, i) => C('s0', 'find', i, 1)).filter(Boolean).slice(0, 2).join(' / ');
      return [
        j(c.full, c.situation !== '조가 찾음' && c.situation, facts, main >= 0 && `주 목표 — ${C('s1', 'goals', main, 2) || C('s1', 'goals', main, 1)}`, sub >= 0 && `부 목표 — ${C('s1', 'goals', sub, 1)}`),
        j(V('s1', 'persona'), C('s3', 'steps', 0, 1) || C('s2', 'ins', 0, 1)),
        r === undefined ? '' : j(`'${C('s3', 'opts', r, 1)}' — ${C('s3', 'opts', r, 2)}`, V('s3', 'keep') && `남길 문장: ${V('s3', 'keep')}`),
        ['p1', 'p2', 'p3', 'p4'].map((id) => first(V('s4', id))).filter(Boolean).join(' → '),
        j(ch, V('s3', 'keep') && `IMC 7단계 반복 메시지: '${V('s3', 'keep')}'`),
        j(V('s0', 'period'), C('s7', 'ops', 0, 1), C('s7', 'ops', 1, 1)),
        j(Number.isFinite(campaignBudget()) && `총 ${won(campaignBudget())}`, bud && Number.isFinite(bud.p) && `최대 항목 ${bud.l} ${fmt(bud.p)}%`),
        j(kpiMain >= 0 && `주 KPI ${C('s9', 'kpi', kpiMain, 2)} ${C('s9', 'kpi', kpiMain, 4)}`, Number.isFinite(N('s9', 'resv')) && `예약 ${fmt(N('s9', 'resv'))} + 워크인 ${fmt(N('s9', 'walk'))}`),
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
  const ansHTML = (a, t) => RO || !showAns() || a === undefined || a === '' ? '' : `<div class="ans">${t === 'num' && Number.isFinite(num(a)) && num(a) >= 1000 ? fmt(num(a)) : esc(a)}${t === 'pct' ? '%' : ''}</div>`;

  function renderBlock(sheet, b, i) {
    const sid = sheet.id;
    if (b.type === 'note') return `<p class="note">${esc(b.text)}</p>`;
    if (b.type === 'caseinfo') return caseInfoHTML();
    if (b.type === 'field') {
      const key = fkey(sid, b.id);
      return `<div class="field ${b.t === 'num' || b.t === 'pick' ? 'field-short' : ''}"><label id="l-${key}" for="f-${key}">${esc(b.label)}</label>${b.hint ? `<span class="hint">${esc(b.hint)}</span>` : ''}${inputHTML(key, b.t, b.opts)}${exHTML(b.ex)}${nudgeHTML(b.nudge)}${ansHTML(b.a, b.t)}</div>`;
    }
    if (b.type === 'q') {
      const key = fkey(sid, b.id);
      return `<div class="field q"><label for="f-${key}"><span class="qmark">Q</span><span>${esc(b.q)}</span></label>${inputHTML(key, 'area')}${exHTML(b.ex)}${nudgeHTML(b.nudge)}${ansHTML(b.a)}</div>`;
    }
    if (b.type === 'table') {
      const head = `<tr>${b.cols.map((c, ci) => `<th scope="col" class="col-${c.t || 'label'}" id="h-${sid}-${b.id}-${ci}">${esc(c.h)}</th>`).join('')}</tr>`;
      const body = b.rows.map((row, r) => `<tr><th scope="row">${esc(row.l)}${row.sub ? `<span class="row-sub">${esc(row.sub)}</span>` : ''}${row.sites && row.sites.length ? `<span class="row-sites">${siteChips(row.sites)}</span>` : ''}</th>${b.cols.slice(1).map((c, ci) => {
        const key = ckey(sid, b.id, r, ci + 1);
        return `<td class="col-${c.t}">${inputHTML(key, c.t, c.opts, `h-${sid}-${b.id}-${ci + 1}`)}${exHTML(row.ex?.[ci])}${nudgeHTML(row.nudge?.[ci])}${ansHTML(row.a?.[ci], c.t)}</td>`;
      }).join('')}</tr>`).join('');
      return `<div class="tbl-wrap sheet-table"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    }
    if (b.type === 'calc') {
      if (RO) { let h = ''; try { h = CALC[b.id](sid, b); } catch (e) { h = '<p class="muted">값이 비어 있습니다.</p>'; } return `<section class="calc"><h4>자동 점검</h4><div class="calc-body">${h}</div></section>`; }
      return `<section class="calc" data-calc="${b.id}" data-i="${i}" aria-live="polite"><h4>자동 점검</h4><div class="calc-body"></div></section>`;
    }
    if (b.type === 'draft') return RO ? '' : `<div class="draft"><p>앞 워크시트에 적은 내용으로 아래 표의 <b>빈 칸</b>을 채웁니다. 채운 뒤 문장을 다듬으십시오.</p><button type="button" class="btn" data-act="draft">초안 불러오기</button></div>`;
    return '';
  }

  function caseInfoHTML() {
    const c = cs();
    const facts = c.facts.length ? `<div class="tbl-wrap"><table class="facts"><thead><tr><th>구분</th><th>항목</th><th>현황 (실제 공개 수치)</th><th>출처</th></tr></thead><tbody>${c.facts.map((f) => {
      const src = SOURCES[f[4]];
      return `<tr><td>${esc(f[0])}</td><td><b>${esc(f[1])}</b></td><td>${esc(f[2])}</td><td>${src && src[1] ? ext(src[1], esc(f[3]), 'src-link') : esc(f[3])}</td></tr>`;
    }).join('')}</tbody></table></div>` : '';
    return `<div class="caseinfo">
      <div class="case-value mission-${curMission()}"><span class="cv-label">이 점포의 가치</span><strong>${esc(c.value)}</strong><p>${esc(c.valueText)}</p>
        <p class="cv-dir">${c.directions.map((d) => `<span>${esc(d)}</span>`).join('')}</p></div>
      ${facts}
      <p class="case-links">원문 확인 · ${ext(`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(c.kw)}`, `네이버 뉴스 "${esc(c.kw)}"`)}${c.namu ? ext(`https://namu.wiki/w/${encodeURIComponent(c.namu)}`, '나무위키 (2차 자료)') : ''}${ext('https://www.lotteshopping.com', '롯데쇼핑 점포 안내')}</p>
    </div>`;
  }

  /* ---------- 렌더링: 화면 ---------- */
  function renderTop() {
    const m = $('#missionChip');
    if (isCampaign() && cs()) { m.hidden = false; m.className = `mission-chip mission-${state.mission}`; m.innerHTML = `<b>${state.mission}</b>${esc(cs().store)}<span>미션 바꾸기</span>`; }
    else m.hidden = true;
    $('#instructorBar').hidden = !state.instructor;
    document.querySelectorAll('[data-course]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.course === state.course));
    const ab = $('[data-act="answers"]'); ab.setAttribute('aria-pressed', state.answers); ab.querySelector('span').textContent = state.answers ? '예시 답안 숨기기' : '예시 답안 보기';
    $('#instrState').textContent = state.instructor ? '강사 모드가 켜져 있습니다.' : '강사 코드를 넣으면 예시 답안과 3-1 케이스 C 참고 답안이 열립니다.';
    $('#instrOn').hidden = state.instructor; $('#instrCode').hidden = state.instructor; $('#instrOff').hidden = !state.instructor;
  }

  function renderNav() {
    const items = [];
    if (isCampaign() && roomAllowed()) items.push(navBtn('room', '▦', '강사방', null, state.view === 'room'));
    if (isCampaign()) items.push(navBtn('home', '◎', state.team ? `${state.team} · 미션 선택` : '조 · 미션 선택', null, state.view === 'home'));
    if (!isCampaign() || state.mission) {
      course().sheets.forEach((s) => {
        const p = progress(s);
        items.push(navBtn(s.id, s.no, s.title, p, state.view === 'sheet' && state.sheet[state.course] === s.id, isCampaign() && !unlocked(s.id), isCampaign() && !!val(`done.${s.id}`)));
      });
    }
    items.push(navBtn('sites', '↗', '자료 찾기 · 참고 사이트', null, state.view === 'sites'));
    $('#nav').innerHTML = items.join('');
    const sheets = course().sheets;
    const all = sheets.reduce((a, s) => { const p = progress(s); return [a[0] + p.filled, a[1] + p.total]; }, [0, 0]);
    $('#overall').textContent = isCampaign() && !state.mission ? '미션을 고르면 워크시트가 열립니다' : `전체 ${all[1] ? Math.round(all[0] / all[1] * 100) : 0}% 작성`;
    const side = $('#case');
    if (isCampaign() && cs()) side.innerHTML = `<span class="case-code">케이스 ${state.mission} · 3-2 캠페인 기획 실습</span><strong>${esc(cs().store)}</strong><span>${esc(cs().area)} · 가치 "${esc(cs().value)}"</span>`;
    else if (isCampaign()) side.innerHTML = `<span class="case-code">3-2 캠페인 기획 실습</span><strong>부산 4개점</strong><span>조별로 미션 하나를 고르십시오</span>`;
    else side.innerHTML = `<span class="case-code">강사 참고 · 3-1 프로모션 기획</span><strong>${esc(course().caseTitle)}</strong><span>${esc(course().caseSub)}</span>`;
    side.className = `case ${isCampaign() && state.mission ? 'mission-' + state.mission : ''}`;
  }
  function navBtn(id, no, title, p, cur, locked = false, done = false) {
    const st = !p ? '' : p.filled === 0 ? 'empty' : p.ratio >= 0.8 ? 'done' : 'doing';
    const target = ['home', 'sites', 'room'].includes(id) ? `data-view="${id}"` : `data-sheet="${id}"`;
    return `<li><button type="button" ${target} class="nav-item ${cur ? 'cur' : ''} ${p ? '' : 'nav-util'} ${locked ? 'locked' : ''}" ${cur ? 'aria-current="page"' : ''}>
      <span class="nav-no">${no}</span><span class="nav-title">${esc(title)}${locked ? ' <small>잠김</small>' : done ? ' <small class="ok">제출</small>' : ''}</span>
      ${p ? `<span class="nav-st st-${st}" title="${p.filled}/${p.total}칸"><span style="width:${Math.round(p.ratio * 100)}%"></span></span>` : ''}</button></li>`;
  }

  function render() {
    if (isCampaign() && !state.mission && state.view === 'sheet') state.view = 'home';
    if (state.view === 'room' && !roomAllowed()) state.view = 'home';
    if (state.view === 'room') state.course = 'campaign';
    document.documentElement.classList.toggle('show-ans', showAns());
    renderTop();
    if (state.view === 'home') renderHome();
    else if (state.view === 'sites') renderSites();
    else if (state.view === 'room') renderRoom();
    else renderSheet();
    renderNav();
  }

  function renderHome() {
    app.innerHTML = `
      <header class="sheet-head">
        <p class="sheet-eyebrow">3-2. 캠페인 기획 실습 · 미션 선택</p>
        <h2>롯데백화점 부산 4개점, 네 개의 다른 캠페인</h2>
        <p class="lead">같은 롯데지만 규모 · 고객 · 처한 상황이 모두 다릅니다. 조별로 한 점포를 고르고, 목표 · 기간 · 예산은 조가 정합니다.</p>
        ${roundBarHTML()}
      </header>
      <section class="teampick ${state.teamId ? 'set' : ''}">
        <h3>${state.teamId ? `우리 조 · ${esc(state.team)}` : '1단계 · 우리 조를 고르십시오'}</h3>
        <p class="muted">${state.teamId ? '같은 조 조원이 같은 조를 고르면 한 시트를 함께 씁니다. 작성 내용은 강사방에 바로 보입니다.' : '같은 조 조원은 모두 같은 번호를 고릅니다. 고른 뒤 아래에서 미션을 고르십시오.'}</p>
        <div class="team-grid">${Array.from({ length: TEAM_COUNT }, (_, i) => i + 1).map((n) => `<button type="button" class="team-btn ${state.teamId === 't' + n ? 'cur' : ''}" data-team="${n}">${n}조</button>`).join('')}</div>
      </section>
      <h3 class="step-h">${state.teamId ? '2단계 · 미션을 고르십시오' : '미션 미리 보기'}</h3>
      <div class="missions">${['A', 'B', 'C', 'D', 'E'].map((id) => {
        const c = CASES[id], cur = state.mission === id, has = Object.keys(state.data[scopeOf(state.teamId, id)] || {}).length;
        return `<article class="mission mission-${id} ${cur ? 'cur' : ''}">
          <header><span class="m-letter">${id}</span><div><h3>${esc(c.store)}</h3><span class="m-area">${esc(c.area)}</span></div></header>
          <p class="m-value">"${esc(c.value)}"</p>
          <dl>
            <div><dt>규모 · 매출</dt><dd>${esc(c.scale)}</dd></div>
            <div><dt>주 고객</dt><dd>${esc(c.customers)}</dd></div>
            <div><dt>지금 상황</dt><dd>${esc(c.situation)}</dd></div>
            <div><dt>목표 유형</dt><dd>${esc(c.goalType)}</dd></div>
          </dl>
          <button type="button" class="btn ${cur ? '' : 'ghost'}" data-mission="${id}">${cur ? '이어서 작성 →' : has ? '이 미션으로 돌아가기' : '이 미션으로 시작'}</button>
        </article>`;
      }).join('')}</div>
      <section class="howto">
        <h3>진행 방식</h3>
        <ol>
          <li><b>조별로 점포 하나를 고릅니다.</b> 케이스 E는 타 백화점 · 타 지역 롯데 점포를 자유롭게 고릅니다.</li>
          <li><b>케이스 시트의 수치는 출발점입니다.</b> 비어 있는 칸은 조가 뉴스 · 공공데이터에서 직접 찾습니다. <button type="button" class="linkish" data-view="sites">자료 찾기 사이트 보기</button></li>
          <li><b>프로세스는 3-1 프로모션과 같습니다.</b> 목표 → 타깃 → 인사이트 → 컨셉 · 스토리 → 채널 → KPI.</li>
          <li><b>결과물은 실습 ⑩ 원페이퍼 기획안 + 스토리 발표입니다.</b> 캔바 · AI PPT를 써도 됩니다.</li>
        </ol>
        <p class="note">캠페인은 매출 촉진(프로모션)이 아니라 고객층 확보와 인지도가 목표이므로 기간을 길게, 스토리를 중심에 둡니다.</p>
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
        <p class="lead">사이트 이름을 누르면 새 탭에서 바로 열립니다. 기획안에는 "어느 사이트에서 무엇을 찾았는지"를 반드시 적으십시오.</p>
      </header>
      <ol class="route">
        <li><span>1</span>행안부 인구<small>타깃 크기</small></li>
        <li><span>2</span>관광데이터랩 · 상권정보<small>누가 오는가</small></li>
        <li><span>3</span>어패럴뉴스<small>점포 규모</small></li>
        <li><span>4</span>네이버 데이터랩<small>무엇에 관심 있나</small></li>
      </ol>
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
        </section>`).join('')}
      <section class="site-cat"><h3>케이스 시트 출처 · 원문</h3>
        <p class="muted">모든 수치는 공개 기사 · 공시 기반입니다. 같은 출처를 직접 열어 최신 수치로 갱신하십시오. 나무위키 수치는 2차 정리본이므로 원 기사로 확인합니다.</p>
        <ol class="sources">${Object.entries(SOURCES).map(([n, s]) => `<li><span class="src-no">${n}</span>${s[1] ? ext(s[1], esc(s[0]), 'src-link') : `<span>${esc(s[0])} <small class="muted">(교안 출처)</small></span>`}</li>`).join('')}</ol>
      </section>`;
  }

  function renderSheet() {
    const c = course();
    const sheet = findSheet(state.sheet[state.course]) || c.sheets[0];
    state.sheet[state.course] = sheet.id;
    const idx = c.sheets.indexOf(sheet);
    const prev = c.sheets[idx - 1], next = c.sheets[idx + 1];
    const blocks = blocksOf(sheet);
    const siteIds = isCampaign() ? SHEET_SITES[sheet.id] : null;
    const ctx = isCampaign() && cs() ? `<p class="ctx mission-${state.mission}"><b>케이스 ${state.mission} · ${esc(cs().full)}</b><span>가치 "${esc(V('s0', 'value') || cs().value)}"</span><span>목표 유형 · ${esc(V('s0', 'goalType') || cs().goalType)}</span></p>` : '';
    const ansNote = showAns() ? `<p class="ans-note">빨간 글씨는 ${isCampaign() ? '3-2 동래점 「다시, 출근룩」' : '3-1 케이스 C 「가을 스타일링 페어」'} 예시 답안입니다 · 강사용</p>` : '';
    app.innerHTML = `
      <header class="sheet-head">
        ${ctx}
        <p class="sheet-eyebrow">${sheet.id === 's0' ? '실습 준비' : `실습 ${sheet.no}`}</p>
        <h2>${esc(sheet.id === 's0' && cs() ? `케이스 ${state.mission} · ${cs().full}` : sheet.title)}</h2>
        <p class="lead">${esc(sheet.id === 's0' && cs() ? cs().tagline : sheet.lead)}</p>
        ${sheet.id === 's0' ? `<p class="lead-sub">${esc(sheet.lead)}</p>` : ''}
        <p class="byline">팀명 <u>${esc(state.team) || '&nbsp;'.repeat(14)}</u> 작성자 <u>${esc(state.author) || '&nbsp;'.repeat(14)}</u></p>
        ${siteIds ? `<div class="sheet-sites"><span>이 시트에 쓸 자료</span>${siteChips(siteIds)}<button type="button" class="linkish" data-view="sites">사이트 전체와 검색 방법</button></div>` : ''}
        <div class="sheet-tools">
          ${state.instructor && !sheet.dynamic ? '<button type="button" class="btn ghost" data-act="fill">이 시트에 예시 답안 채우기</button>' : ''}
          <button type="button" class="btn ghost danger" data-act="clear">이 시트 비우기</button>
        </div>
        ${ansNote}
        ${isCampaign() ? roundBarHTML(sheet.id) : ''}
      </header>
      ${isCampaign() && !unlocked(sheet.id) ? lockedHTML(sheet) : `<div class="blocks">${blocks.map((b, i) => renderBlock(sheet, b, i)).join('')}</div>
      ${isCampaign() ? `<div id="submitBox" class="submit">${submitHTML(sheet)}</div>` : ''}`}
      <nav class="pager" aria-label="워크시트 이동">
        ${prev ? `<button type="button" class="btn ghost" data-sheet="${prev.id}">← ${prev.no} ${esc(prev.title)}</button>` : isCampaign() ? '<button type="button" class="btn ghost" data-view="home">← 미션 선택</button>' : '<span></span>'}
        ${next ? `<button type="button" class="btn" data-sheet="${next.id}">${next.no} ${esc(next.title)} →</button>` : '<span></span>'}
      </nav>`;
    app.querySelectorAll('textarea').forEach(autosize);
    runCalcs();
  }

  function runCalcs() {
    if (state.view !== 'sheet') return;
    const sheet = findSheet(state.sheet[state.course]);
    const blocks = blocksOf(sheet);
    app.querySelectorAll('[data-calc]').forEach((el) => {
      const blk = blocks[+el.dataset.i];
      let html = '';
      try { html = CALC[blk.id](sheet.id, blk); } catch (e) { html = '<p class="muted">값을 채우면 계산합니다.</p>'; }
      el.querySelector('.calc-body').innerHTML = html;
    });
  }

  function autosize(t) { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight + 2, 44) + 'px'; }

  function fillSheet(sheet, onlyEmpty = false) {
    blocksOf(sheet).forEach((b) => {
      if ((b.type === 'field' || b.type === 'q') && b.a !== undefined) { const k = fkey(sheet.id, b.id); if (!onlyEmpty || !val(k)) setVal(k, b.a); }
      if (b.type === 'table') b.rows.forEach((row, r) => (row.a || []).forEach((a, ci) => { const k = ckey(sheet.id, b.id, r, ci + 1); if (!onlyEmpty || !val(k)) setVal(k, a); }));
    });
  }
  function clearSheet(sheet) { sheetKeys(sheet).forEach((k) => setVal(k, '')); }

  /* ---------- 내보내기 ---------- */
  function exportText() {
    const c = course();
    const head = isCampaign() && cs() ? `# 3-2. 캠페인 기획 실습 — 케이스 ${state.mission} · ${cs().full}` : `# ${c.code}. ${c.name} — ${c.caseTitle}`;
    const out = [head, `팀명: ${state.team || '-'} / 작성자: ${state.author || '-'}`, ''];
    c.sheets.forEach((s) => {
      out.push(`## ${s.id === 's0' ? '케이스 시트' : `실습 ${s.no} ${s.title}`}`);
      blocksOf(s).forEach((b) => {
        if (b.type === 'field') out.push(`- ${b.label}: ${V(s.id, b.id) || '(빈 칸)'}`);
        if (b.type === 'q') out.push(`- Q. ${b.q}\n  ${V(s.id, b.id) || '(빈 칸)'}`);
        if (b.type === 'table') {
          out.push('', `| ${b.cols.map((x) => x.h).join(' | ')} |`, `|${b.cols.map(() => '---').join('|')}|`);
          b.rows.forEach((row, r) => out.push(`| ${[row.l, ...b.cols.slice(1).map((_, ci) => C(s.id, b.id, r, ci + 1).replace(/\n/g, ' ').replace(/\|/g, '/'))].join(' | ')} |`));
          out.push('');
        }
      });
      out.push('');
    });
    return out.join('\n');
  }
  const backupCode = () => btoa(unescape(encodeURIComponent(JSON.stringify({ v: 3, teamId: state.teamId, team: state.team, author: state.author, mission: state.mission, data: state.data }))));
  const decodeCode = (code) => JSON.parse(decodeURIComponent(escape(atob(code.trim()))));

  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); flash(okMsg); }
    catch (e) { const o = $('#copyOut'); o.value = text; o.hidden = false; o.focus(); o.select(); flash('자동 복사가 막혀 있습니다 · 아래 칸에서 직접 복사하십시오'); }
  }

  let toastTimer;
  function flash(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  /* ---------- 라운드 · 실시간 공유 · 강사방 ----------
     db 문서
       teams/t{n}   { name, mission, author, updatedAt, missions: { A: { data: { "s1|goals|0|1": "…", "done|s1": "ISO" } } } }
       control/room { round: -1~11, all: bool, endsAt: ISO | null }  — 소유자 · 편집자만 쓴다 */
  const TEAM_COUNT = 4;
  const ROUNDS = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'];
  const ROUND_MIN = { s0: 30, s1: 35, s2: 35, s3: 40, s4: 30, s5: 40, s6: 35, s7: 40, s8: 30, s9: 35, s10: 45, s11: 60 };
  let DB = null, canAdmin = false, control = null, teamsLive = {}, teamUnsub = null, teamsUnsub = null, teamExists = false, syncState = 'off';
  let writing = Promise.resolve(), flushT = null;
  const pending = {};
  const enc = (k) => k.replace(/\./g, '|');
  const dec = (k) => k.replace(/\|/g, '.');
  const encAll = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [enc(k), v]));
  const decAll = (d) => Object.fromEntries(Object.entries(d || {}).map(([k, v]) => [dec(k), v]));
  const roomAllowed = () => state.instructor || canAdmin;
  const sheetNo = (sid) => COURSES.campaign.sheets.find((s) => s.id === sid)?.no ?? '';
  const sheetTitle = (sid) => COURSES.campaign.sheets.find((s) => s.id === sid)?.title ?? '';
  const hhmm = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  /* 강사가 라운드를 열기 전 시트는 잠긴다. 강사방이 한 번도 라운드를 열지 않았으면(control 없음) 모두 열림 */
  function unlocked(sid) {
    if (!control || control.all) return true;
    return ROUNDS.indexOf(sid) <= control.round;
  }
  function remaining() {
    if (!control?.endsAt) return null;
    return Math.max(0, Date.parse(control.endsAt) - Date.now());
  }
  const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  function roundBarHTML(sid) {
    if (!control || control.round < 0) return '';
    const cur = ROUNDS[control.round];
    if (control.all) return `<p class="roundbar"><b>모든 라운드가 열려 있습니다</b></p>`;
    const here = !sid || sid === cur;
    return `<p class="roundbar ${here ? 'live' : ''}"><b>라운드 ${sheetNo(cur)} ${esc(sheetTitle(cur))}</b>${control.endsAt ? `<span>남은 시간 <b class="js-timer">${mmss(remaining())}</b></span>` : '<span>시간 제한 없음</span>'}${sid && !here ? `<button type="button" class="linkish" data-sheet="${cur}">지금 라운드로 가기</button>` : ''}</p>`;
  }
  function lockedHTML(sheet) {
    return `<div class="locked-panel"><strong>라운드 ${sheet.no} · ${esc(sheet.title)}</strong><p>강사가 이 라운드를 열면 작성할 수 있습니다. 제한 시간 ${ROUND_MIN[sheet.id]}분.</p></div>`;
  }
  function submitHTML(sheet) {
    const d = val(`done.${sheet.id}`);
    const label = sheet.id === 's0' ? '케이스 시트' : `라운드 ${sheet.no}`;
    return d
      ? `<p><b class="ok">${label} 제출됨 · ${hhmm(d)}</b> 제출한 뒤에도 고칠 수 있고, 고친 내용도 강사방에 바로 보입니다.</p><button type="button" class="btn ghost" data-act="submit" data-sid="${sheet.id}">다시 제출</button>`
      : `<p>이 시트를 다 썼으면 제출하십시오. ${DB ? '강사방에 제출 표시가 뜹니다.' : '실시간 공유가 꺼져 있으면 내보내기 · 백업에서 제출 코드를 복사해 강사에게 보냅니다.'}</p><button type="button" class="btn" data-act="submit" data-sid="${sheet.id}">${label} 제출하기</button>`;
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
    el.textContent = { ok: '강사방과 연결됨', saving: '저장 중', err: '저장 안 됨 · 권한 확인', ro: '보기 전용 · 작성은 이 브라우저에만' }[st] || '';
  }

  function chooseTeam(n) {
    if (!n) return;
    state.teamId = `t${n}`; state.team = `${n}조`;
    $('#team').value = state.teamId;
    state.mission = null;
    const found = ['A', 'B', 'C', 'D', 'E'].find((m) => Object.keys(state.data[scopeOf(state.teamId, m)] || {}).length);
    if (found) state.mission = found;
    save(); subscribeTeam(); render();
    flash(`${state.team}을 골랐습니다${state.mission ? '' : ' · 이제 미션을 고르십시오'}`);
  }

  function queueSync(k, v) {
    if (!DB || viewCtx || !state.teamId || !state.mission || !isCampaign()) return;
    pending[k] = v ?? '';
    clearTimeout(flushT); flushT = setTimeout(flush, 700);
  }
  function flush() {
    const keys = Object.keys(pending); if (!keys.length) return;
    const data = {}; keys.forEach((k) => { data[enc(k)] = pending[k]; delete pending[k]; });
    writing = writing.then(() => writeTeam({ missions: { [state.mission]: { data } } })).catch(() => {});
  }
  async function writeTeam(patch) {
    if (!DB || !state.teamId || !state.mission) return;
    const body = { name: state.team, mission: state.mission, author: state.author, updatedAt: new Date().toISOString(), ...patch };
    const ref = DB.doc(`teams/${state.teamId}`);
    setSync('saving');
    try {
      if (teamExists) await ref.update(body);
      else {
        await ref.set({ ...body, missions: { [state.mission]: { data: encAll(D()) } } });
        teamExists = true;
      }
      setSync('ok');
    } catch (e) {
      if (e?.code === 'invalid_argument' && teamExists === false) setSync('ro');
      else if (e?.code === 'invalid_argument') {
        try { await ref.set({ ...body, missions: { [state.mission]: { data: encAll(D()) } } }); teamExists = true; setSync('ok'); } catch (e2) { setSync('ro'); }
      } else setSync('err');
    }
  }
  function subscribeTeam() {
    if (teamUnsub) { teamUnsub(); teamUnsub = null; }
    teamExists = false;
    if (!DB || !state.teamId) return;
    teamUnsub = DB.doc(`teams/${state.teamId}`).onSnapshot((snap) => {
      teamExists = snap.exists;
      if (!snap.exists) { if (state.mission && Object.keys(D()).length) writing = writing.then(() => writeTeam({})).catch(() => {}); return; }
      const d = snap.data();
      if (!state.mission && d.mission) { state.mission = d.mission; save(); render(); flash(`${state.team}은 케이스 ${d.mission} 미션을 하고 있습니다`); }
      const remote = decAll(d.missions?.[state.mission]?.data);
      const act = document.activeElement?.dataset?.k;
      const changed = [];
      const local = state.data[scope()] ||= {};
      Object.entries(remote).forEach(([k, v]) => {
        if (k in pending || k === act) return;
        if ((v ?? '') !== (local[k] ?? '')) { if (v === '' || v == null) delete local[k]; else local[k] = v; changed.push(k); }
      });
      if (changed.length) { save(); applyRemote(changed); }
      if (syncState !== 'saving') setSync('ok');
    }, () => setSync('err'));
  }
  function applyRemote(keys) {
    if (state.view === 'sheet' && isCampaign()) {
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
  async function setControl(next) {
    if (!DB) { flash('실시간 공유가 꺼져 있어 라운드를 열 수 없습니다'); return; }
    try { await DB.doc('control/room').set(next); flash(next.all ? '모든 라운드를 열었습니다' : next.round < 0 ? '라운드를 처음으로 되돌렸습니다' : `라운드 ${sheetNo(ROUNDS[next.round])}을 시작했습니다`); }
    catch (e) { flash('라운드를 바꿀 권한이 없습니다 · 이 앱의 소유자 · 편집자만 바꿀 수 있습니다'); }
  }
  function subscribeRoom() {
    if (teamsUnsub || !DB) return;
    teamsUnsub = DB.collection('teams').onSnapshot((q) => {
      teamsLive = {};
      q.docs.forEach((doc) => {
        const x = doc.data(); if (!x) return;
        teamsLive[doc.id] = { id: doc.id, name: String(x.name || doc.id), mission: CASES[x.mission] ? x.mission : null, author: String(x.author || ''), updatedAt: x.updatedAt, data: decAll(x.missions?.[x.mission]?.data), live: true };
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
      control = snap.exists ? snap.data() : null;
      if (before === (control ? JSON.stringify(control) : '')) return;
      const typing = document.activeElement?.dataset?.k;
      if (state.view === 'room') { renderRoomControls(); renderRoomBody(); }
      else if (!typing) render();
      else renderNav();
    }, () => {});
    subscribeTeam();
    if (state.view === 'room') subscribeRoom();
    render();
  }

  /* 강사방 */
  function roomTeams() {
    const all = { ...state.imports, ...teamsLive };
    return Object.values(all).filter((t) => t.mission).sort((a, b) => (parseInt(a.name, 10) || 99) - (parseInt(b.name, 10) || 99) || a.name.localeCompare(b.name));
  }
  function withTeam(team, fn) {
    const prev = [viewCtx, RO];
    viewCtx = { data: team.data || {}, mission: team.mission }; RO = true;
    try { return fn(); } finally { [viewCtx, RO] = prev; }
  }
  function roSheetHTML(team, sid) {
    return withTeam(team, () => {
      const sheet = findSheet(sid);
      return blocksOf(sheet).filter((b) => b.type !== 'caseinfo' && b.type !== 'draft' && b.type !== 'note').map((b, i) => renderBlock(sheet, b, i)).join('');
    });
  }
  function renderRoom() {
    subscribeRoom();
    app.innerHTML = `
      <header class="sheet-head">
        <p class="sheet-eyebrow">강사용</p>
        <h2>강사방</h2>
        <p class="lead">조별로 라운드마다 쓴 시트가 이곳에 모입니다. 칸을 누르면 그 조의 시트를 보고, 라운드를 고르면 모든 조의 같은 시트를 나란히 봅니다.</p>
        <p class="room-conn ${DB ? 'on' : 'off'}">${DB ? '실시간 연결됨 · 조가 입력하면 몇 초 안에 반영됩니다' : '실시간 공유가 꺼져 있습니다 · 아래 "제출 코드로 모으기"로 조별 결과를 받으십시오'}</p>
      </header>
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
    const sel = state.roomSel.sid || cur || 's0';
    const status = !control || control.round < 0 ? '아직 라운드를 열지 않았습니다 · 조는 모든 시트를 쓸 수 있습니다' : control.all ? '모든 라운드가 열려 있습니다' : `지금 라운드 ${sheetNo(cur)} ${sheetTitle(cur)}`;
    el.innerHTML = `
      <div class="rc-status"><b>${esc(status)}</b>${control?.endsAt && !control.all ? `<span>남은 시간 <b class="js-timer">${mmss(remaining())}</b></span>` : ''}</div>
      <div class="round-chips">${ROUNDS.map((sid) => `<button type="button" class="rchip ${sid === sel ? 'sel' : ''} ${sid === cur ? 'live' : ''} ${control && !control.all && ROUNDS.indexOf(sid) > control.round ? 'future' : ''}" data-roundpick="${sid}"><span>${sid === 's0' ? '0' : sheetNo(sid)}</span>${esc(sid === 's0' ? '케이스 시트' : sheetTitle(sid))}<small>${ROUND_MIN[sid]}분</small></button>`).join('')}</div>
      ${canAdmin && DB ? `<div class="rc-actions">
        <button type="button" class="btn" data-act="roundStart" data-sid="${sel}">${sid0(sel)} 시작 · ${ROUND_MIN[sel]}분 타이머</button>
        <button type="button" class="btn ghost" data-act="roundPlus" ${control?.endsAt ? '' : 'disabled'}>+5분</button>
        <button type="button" class="btn ghost" data-act="roundStop" ${control?.endsAt ? '' : 'disabled'}>타이머 끄기</button>
        <button type="button" class="btn ghost" data-act="roundAll">모든 라운드 열기</button>
        <button type="button" class="btn ghost danger" data-act="roundReset">처음으로</button>
      </div><p class="muted">라운드를 시작하면 그 라운드까지만 조 화면에서 열리고, 다음 시트는 잠깁니다.</p>`
      : `<p class="muted">${DB ? '라운드 시작 · 타이머는 이 앱의 소유자와 편집자만 조작할 수 있습니다.' : '라운드 진행은 실시간 공유가 켜진 화면에서만 됩니다.'}</p>`}`;
  }
  const sid0 = (sid) => sid === 's0' ? '케이스 시트' : `라운드 ${sheetNo(sid)}`;
  const sidFull = (sid) => sid === 's0' ? '케이스 시트' : `라운드 ${sheetNo(sid)} · ${sheetTitle(sid)}`;
  function renderRoomBody() {
    const el = $('#roomMatrix'); if (!el) return;
    const teams = roomTeams();
    const cur = control && control.round >= 0 && !control.all ? ROUNDS[control.round] : null;
    el.innerHTML = teams.length ? `<div class="matrix-tools"><button type="button" class="btn" data-act="pptAll">모든 조 PPT 내려받기 (zip)</button><span class="muted">첨부하신 3-2 원본 시트에 조가 쓴 내용을 채운 파일입니다</span></div><div class="tbl-wrap"><table class="matrix"><thead><tr><th>조</th><th>미션</th>${ROUNDS.map((sid) => `<th class="${sid === cur ? 'live' : ''}">${sid === 's0' ? '0' : sheetNo(sid)}</th>`).join('')}<th>최근 입력</th><th>PPT</th></tr></thead><tbody>${teams.map((t) => {
      const cells = withTeam(t, () => ROUNDS.map((sid) => {
        const p = progress(findSheet(sid)); const d = t.data?.[`done.${sid}`];
        const cls = d ? 'done' : p.filled ? 'doing' : 'empty';
        return `<td class="${sid === cur ? 'live' : ''}"><button type="button" class="mcell ${cls}" data-cell="${esc(t.id)}|${sid}" title="${esc(t.name)} · ${esc(sid0(sid))} · ${p.filled}/${p.total}칸${d ? ' · 제출 ' + hhmm(d) : ''}">${d ? '✓' : p.filled ? Math.round(p.ratio * 100) + '%' : '·'}</button></td>`;
      }).join(''));
      return `<tr><th scope="row">${esc(t.name)}${t.imported ? ' <small>코드</small>' : ''}</th><td><span class="mbadge mission-${t.mission}">${t.mission}</span> ${esc(CASES[t.mission].store)}</td>${cells}<td class="when">${t.updatedAt ? hhmm(t.updatedAt) : ''}</td><td><button type="button" class="linkish" data-act="pptTeam" data-id="${esc(t.id)}">받기</button></td></tr>`;
    }).join('')}</tbody></table></div><p class="legend"><span class="mcell done">✓</span> 제출 <span class="mcell doing">40%</span> 작성 중 <span class="mcell empty">·</span> 아직 없음 — 칸을 누르면 그 조의 시트가 아래에 열립니다</p>`
      : `<div class="empty-room"><b>아직 들어온 조가 없습니다.</b><p>조가 앱에서 우리 조와 미션을 고르고 쓰기 시작하면 여기에 한 줄씩 생깁니다.</p></div>`;
    const il = $('#importList');
    if (il) il.innerHTML = Object.values(state.imports).map((t) => `<li>${esc(t.name)} · 케이스 ${esc(t.mission)} <button type="button" class="linkish" data-act="importDel" data-id="${esc(t.id)}">빼기</button></li>`).join('');
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
      const sids = sel.sid ? [sel.sid, ...ROUNDS.filter((s) => s !== sel.sid)] : ROUNDS;
      el.innerHTML = `<div class="rv-head">${tabs}<h3>${esc(t.name)} · 케이스 ${t.mission} ${esc(CASES[t.mission].store)}${t.author ? ` <small>작성 ${esc(t.author)}</small>` : ''}</h3>
        <div><button type="button" class="btn ghost" data-act="pptTeam" data-id="${esc(t.id)}">${esc(t.name)} 원본 시트 PPT 내려받기</button></div>
        <div class="team-tabs">${teams.map((x) => `<button type="button" class="${x.id === t.id ? 'cur' : ''}" data-cell="${esc(x.id)}|${sel.sid || ''}">${esc(x.name)}</button>`).join('')}</div></div>
        ${sids.map((sid) => cardHTML(t, sid, true)).join('')}`;
    } else {
      const sid = sel.sid || (control && control.round >= 0 && !control.all ? ROUNDS[control.round] : 's0');
      el.innerHTML = `<div class="rv-head">${tabs}<h3>${esc(sidFull(sid))} <small>조 ${teams.length}개</small></h3></div>
        <div class="cards">${teams.map((t) => cardHTML(t, sid, false)).join('')}</div>`;
    }
    tickTimers();
  }
  function cardHTML(t, sid, showSheetName) {
    const d = t.data?.[`done.${sid}`];
    const p = withTeam(t, () => progress(findSheet(sid)));
    return `<article class="rcard mission-${t.mission}">
      <header><b>${showSheetName ? esc(sidFull(sid)) : esc(t.name)}</b>
        ${showSheetName ? '' : `<span class="mbadge mission-${t.mission}">${t.mission}</span><span>${esc(CASES[t.mission].store)}</span>`}
        <span class="rstate ${d ? 'done' : p.filled ? 'doing' : 'empty'}">${d ? `제출 ${hhmm(d)}` : p.filled ? `작성 중 ${Math.round(p.ratio * 100)}%` : '아직 없음'}</span></header>
      <div class="rbody">${p.filled ? roSheetHTML(t, sid) : '<p class="muted">아직 쓴 내용이 없습니다.</p>'}</div>
    </article>`;
  }

  /* ---------- 원본 시트 PPT 내려받기 ----------
     templates/worksheet-3-2.pptx(첨부 원본 빈 시트)를 JSZip으로 열어 표 칸과 답 칸에 조가 쓴 내용을 넣는다.
     원본의 디자인 · 서체 · 레이아웃은 그대로 두고 글자만 채운다. */
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const EMU = 914400;
  const PHASES = ['도입기', '집중기', '마무리기'];

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

  /* 슬라이드 번호(1~11)마다 앱의 칸을 원본 시트의 칸에 옮긴다 */
  const FILL = {
    1(k) {
      for (let r = 0; r < 4; r++) { [1, 2, 3].forEach((c) => k.cell(0, r + 1, c, C('s1', 'goals', r, c))); k.check(0, r + 1, 4, C('s1', 'goals', r, 4)); }
      for (let r = 0; r < 4; r++) [1, 2].forEach((c) => k.cell(1, r + 1, c, C('s1', 'seg', r, c)));
    },
    2(k) {
      for (let r = 0; r < 3; r++) { k.cell(0, r + 1, 1, C('s2', 'ins', r, 1)); k.cell(0, r + 1, 2, C('s2', 'ins', r, 2)); k.check(0, r + 1, 3, C('s2', 'ins', r, 3)); }
      k.box(0.78, 6.07, 5.59, 0.9, V('s2', 'strong'));
      k.box(6.96, 6.07, 5.59, 0.9, V('s2', 'untouched'));
    },
    3(k) {
      for (let r = 0; r < 3; r++) k.cell(0, r + 1, 1, C('s3', 'steps', r, 1));
      for (let r = 0; r < 3; r++) [1, 2, 3, 4].forEach((c) => k.cell(1, r + 1, c, C('s3', 'opts', r, c)));
      ['간결한가', '기억하기 쉬운가', '감성을 자극하는가', '브랜드와 연결되는가'].forEach((label, r) => { if (C('s3', 'crit', r, 1) === '충족') k.shapeText(`Text ${11 + r * 2}`, `■  ${label}`); });
      const pick = V('s3', 'pick'), reason = V('s3', 'reason');
      if (pick || reason) k.shapeText('Text 18', `최종 선택안과 이유  ${pick ? pick + '안' : ''}${pick && reason ? ' — ' : ''}${reason}`, (reason || '').length > 70 ? 1000 : null);
    },
    4(k) {
      ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => k.box(3.40, 1.99 + i * 1.22, 9.10, 1.02, V('s4', id)));
    },
    5(k) {
      const b = findBlock('s5', 'ch');
      b.rows.forEach((row, r) => {
        if (k.cellText(0, r + 1, 0).replace(/\s/g, '') !== row.l.replace(/\s/g, '')) k.cell(0, r + 1, 0, row.l);
        const use = C('s5', 'ch', r, 1);
        if (use) k.cell(0, r + 1, 1, use === '사용' ? '■' : '□');
        k.cell(0, r + 1, 2, C('s5', 'ch', r, 2)); k.cell(0, r + 1, 3, C('s5', 'ch', r, 3));
        const pct = C('s5', 'ch', r, 4); if (pct) k.cell(0, r + 1, 4, `${pct}%`);
        k.cell(0, r + 1, 5, C('s5', 'ch', r, 5));
      });
      const sum = tableSum('s5', 'ch', 4); if (Number.isFinite(sum)) k.cell(0, 8, 4, `${fmt(sum, 1)}%`);
    },
    6(k) {
      for (let r = 0; r < 7; r++) [1, 2, 3, 4].forEach((c) => k.cell(0, r + 1, c, C('s6', 'imc', r, c)));
      k.box(0.78, 6.21, 11.77, 0.76, V('s6', 'break'));
    },
    7(k) {
      for (let r = 0; r < 4; r++) [1, 2].forEach((c) => k.cell(0, r + 1, c, C('s7', 'ops', r, c)));
      [1, 2, 3].forEach((c) => {
        const d = C('s7', 'ph', 0, c);
        k.cell(1, 0, c, `${PHASES[c - 1]}${d ? ` (${d})` : ''}`);
        k.cell(1, 1, c, C('s7', 'ph', 1, c)); k.cell(1, 2, c, C('s7', 'ph', 2, c));
        const cards = C('s7', 'vis', 0, c), vis = C('s7', 'vis', 1, c);
        if (cards || vis) k.cell(1, 3, c, [cards && `가입 ${fmt(num(cards))}`, vis && `방문 ${fmt(num(vis))}`].filter(Boolean).join(' · '));
      });
      const period = V('s0', 'period'); if (period) k.shapeText('Text 6', `${period} 동안 무엇을 언제 어디서 할지 정하십시오.`);
      const focus = V('s7', 'focus'); if (focus) k.shapeText('Text 10', `집중 계획 · ${focus}`, focus.length > 90 ? 900 : 1000);
    },
    8(k) {
      const total = campaignBudget(); const b = findBlock('s8', 'bud');
      b.rows.forEach((row, r) => {
        if (k.cellText(0, r + 1, 0).replace(/\s/g, '') !== row.l.replace(/\s/g, '')) k.cell(0, r + 1, 0, row.l);
        const p = CN('s8', 'bud', r, 1);
        if (Number.isFinite(p)) { k.cell(0, r + 1, 1, `${fmt(p, 1)}%`); if (Number.isFinite(total)) k.cell(0, r + 1, 2, `${fmt(total * p / 100)}원`); }
        k.cell(0, r + 1, 3, C('s8', 'bud', r, 2)); k.cell(0, r + 1, 4, C('s8', 'bud', r, 3));
      });
      const sum = tableSum('s8', 'bud', 1);
      if (Number.isFinite(sum)) k.cell(0, 8, 1, `${fmt(sum, 1)}%`);
      if (Number.isFinite(total)) { k.cell(0, 8, 2, `${fmt(total * (Number.isFinite(sum) ? sum : 100) / 100)}원`); k.shapeText('Text 6', `총 ${won(total)}입니다. 채널 믹스(실습 ⑤)의 비중과 어긋나지 않게 맞추십시오.`); }
      const goal = goalMembers(); if (Number.isFinite(goal)) k.shapeText('Text 14', `신규 회원 ${fmt(goal)}명 목표 기준 · 1인당 획득 비용은 얼마인가`);
      k.box(0.78, 6.84, 11.77, 0.27, V('s8', 'cpa'), 900);
    },
    9(k) {
      for (let r = 0; r < 5; r++) { k.check(0, r + 1, 1, C('s9', 'kpi', r, 1)); [2, 3, 4, 5].forEach((c) => k.cell(0, r + 1, c, C('s9', 'kpi', r, c))); }
      k.cell(1, 1, 1, V('s9', 'double')); k.cell(1, 2, 1, V('s9', 'miss'));
    },
    10(k) {
      for (let r = 0; r < 8; r++) k.cell(0, r + 1, 1, C('s10', 'one', r, 1));
    },
    11(k, team) {
      for (let r = 0; r < 4; r++) { k.cell(0, r + 1, 1, C('s11', 'pres', r, 1)); const m = C('s11', 'pres', r, 2); if (m) k.cell(0, r + 1, 2, `${m}분`); }
      k.cell(1, 0, 1, `${team.name} (자체)`);
      if (V('s11', 'teamA')) k.cell(1, 0, 2, `팀 ${V('s11', 'teamA')}`);
      if (V('s11', 'teamB')) k.cell(1, 0, 3, `팀 ${V('s11', 'teamB')}`);
      for (let r = 0; r < 4; r++) [1, 2, 3, 4].forEach((c) => k.cell(1, r + 1, c, C('s11', 'ev', r, c)));
      [1, 2, 3].forEach((c) => { const s = tableSum('s11', 'ev', c); if (Number.isFinite(s)) k.cell(1, 5, c, fmt(s)); });
    },
  };

  let tplZip = null;
  async function buildPptx(team) {
    if (typeof JSZip === 'undefined') throw new Error('nozip');
    if (!window.TEMPLATE_PPTX_B64) throw new Error('notpl');
    const zip = await JSZip.loadAsync(window.TEMPLATE_PPTX_B64, { base64: true });
    const xmls = {};
    for (let i = 1; i <= 11; i++) xmls[i] = await zip.file(`ppt/slides/slide${i}.xml`).async('string');
    /* viewCtx를 바꾼 동안에는 await 없이 한 번에 처리한다 (다른 화면 갱신과 섞이지 않게) */
    const prev = viewCtx;
    viewCtx = { data: team.data || {}, mission: team.mission };
    try {
      for (let i = 1; i <= 11; i++) {
        const doc = new DOMParser().parseFromString(xmls[i], 'application/xml');
        const k = slideKit(doc);
        k.shapeText('Text 9', `팀명   ${team.name || '______________'}          작성자   ${team.author || '______________'}`);
        FILL[i](k, team);
        xmls[i] = new XMLSerializer().serializeToString(doc);
      }
    } finally { viewCtx = prev; }
    for (let i = 1; i <= 11; i++) zip.file(`ppt/slides/slide${i}.xml`, xmls[i]);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
  const pptName = (team) => `3-2 캠페인 기획 실습_${team.name || '조'}_${team.mission ? CASES[team.mission].store : ''}.pptx`.replace(/[\\/:*?"<>|]/g, '');
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
  async function downloadTeams(teams, btn) {
    if (!teams.length) { flash('내려받을 조가 없습니다'); return; }
    const label = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'PPT 만드는 중…'; }
    try {
      if (teams.length === 1) { const blob = await buildPptx(teams[0]); if (await saveFile(pptName(teams[0]), blob)) flash('원본 시트 모양의 PPT를 만들었습니다'); }
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
  const ownTeam = () => ({ id: state.teamId || 'me', name: state.team || '', author: state.author, mission: state.mission, data: { ...D() } });

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
      state[e.target.id] = e.target.value;
      const by = app.querySelector('.byline');
      if (by) by.innerHTML = `팀명 <u>${esc(state.team) || '&nbsp;'.repeat(14)}</u> 작성자 <u>${esc(state.author) || '&nbsp;'.repeat(14)}</u>`;
      runCalcs(); save();
    }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'team') { chooseTeam(e.target.value.replace('t', '')); return; } if (e.target.tagName === 'SELECT' && e.target.dataset.k) { setVal(e.target.dataset.k, e.target.value); runCalcs(); renderNavLite(); save(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'instrCode') { e.preventDefault(); $('#instrOn').click(); } });

  const goTop = () => { window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); };

  let clearArmed = null;
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.view) { state.view = t.dataset.view; save(); render(); goTop(); return; }
    if (t.dataset.sheet) { state.view = 'sheet'; state.sheet[state.course] = t.dataset.sheet; save(); render(); goTop(); return; }
    if (t.dataset.team) { chooseTeam(t.dataset.team); return; }
    if (t.dataset.cell) { const [tid, sid] = t.dataset.cell.split('|'); state.roomSel = { mode: 'team', tid, sid }; save(); renderRoomView(); $('#roomView').scrollIntoView({ block: 'start' }); return; }
    if (t.dataset.roundpick) { state.roomSel = { mode: 'round', sid: t.dataset.roundpick }; save(); renderRoomView(); renderRoomControls(); return; }
    if (t.dataset.mission) {
      if (!state.teamId) { flash('먼저 우리 조를 고르십시오'); $('.teampick')?.scrollIntoView({ block: 'center' }); return; }
      const changed = state.mission !== t.dataset.mission;
      state.mission = t.dataset.mission; state.view = 'sheet';
      if (changed) { state.sheet.campaign = 's0'; if (DB && state.teamId) writing = writing.then(() => writeTeam({})).catch(() => {}); }
      save(); render(); goTop(); flash(`케이스 ${state.mission} · ${cs().store} 미션을 시작합니다`); return;
    }
    if (t.dataset.course) { state.course = t.dataset.course; state.view = state.course === 'promo' ? 'sheet' : (state.mission ? 'sheet' : 'home'); save(); render(); goTop(); return; }
    if (t.id === 'missionChip') { state.view = 'home'; save(); render(); goTop(); return; }
    const sheet = findSheet(state.sheet[state.course]);
    switch (t.dataset.act) {
      case 'answers': state.answers = !state.answers; save(); render(); break;
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
      case 'copyText':
        if (isCampaign() && !state.mission) { flash('먼저 미션을 고르십시오'); break; }
        copy(exportText(), '전체 내용을 복사했습니다'); break;
      case 'copyCode': copy(backupCode(), '백업 코드를 복사했습니다'); break;
      case 'restore':
        try {
          const o = decodeCode($('#restoreIn').value);
          if (!o || !o.data) throw new Error();
          state.data = o.data; state.team = o.team || ''; state.teamId = o.teamId || state.teamId; state.author = o.author || ''; state.mission = o.mission || state.mission;
          $('#team').value = state.teamId; $('#author').value = state.author; $('#restoreIn').value = '';
          subscribeTeam();
          save(); render(); flash('백업을 불러왔습니다');
        } catch (err) { flash('백업 코드를 읽지 못했습니다 · 복사한 코드 전체를 붙여 넣으십시오'); }
        break;
      case 'instrOn':
        if ($('#instrCode').value.trim().toLowerCase() === INSTRUCTOR_CODE) { state.instructor = true; state.answers = true; $('#instrCode').value = ''; save(); render(); flash('강사 모드를 켰습니다'); }
        else flash('강사 코드가 맞지 않습니다');
        break;
      case 'submit': {
        const sid = t.dataset.sid;
        setVal(`done.${sid}`, new Date().toISOString()); save();
        $('#submitBox').innerHTML = submitHTML(findSheet(sid)); renderNav();
        flash(DB ? '제출했습니다 · 강사방에 표시됩니다' : '제출 표시를 했습니다 · 내보내기에서 제출 코드를 복사해 강사에게 보내십시오');
        break;
      }
      case 'roundStart': setControl({ round: ROUNDS.indexOf(t.dataset.sid), all: false, endsAt: new Date(Date.now() + ROUND_MIN[t.dataset.sid] * 60000).toISOString() }); break;
      case 'roundPlus': if (control?.endsAt) setControl({ ...control, endsAt: new Date(Math.max(Date.now(), Date.parse(control.endsAt)) + 5 * 60000).toISOString() }); break;
      case 'roundStop': if (control) setControl({ ...control, endsAt: null }); break;
      case 'roundAll': setControl({ round: ROUNDS.length - 1, all: true, endsAt: null }); break;
      case 'roundReset': setControl({ round: -1, all: false, endsAt: null }); break;
      case 'roomMode': state.roomSel = { ...state.roomSel, mode: t.dataset.mode }; save(); renderRoomView(); break;
      case 'importAdd': {
        try {
          const o = decodeCode($('#importIn').value);
          const key = Object.keys(o.data || {}).find((k) => k === scopeOf(o.teamId, o.mission)) || Object.keys(o.data || {}).find((k) => k.endsWith(`m-${o.mission}`));
          if (!o.mission || !key) throw new Error();
          const id = o.teamId || `x-${(o.team || 'team').replace(/[^0-9A-Za-z가-힣]/g, '')}`;
          state.imports[id] = { id, name: o.team || id, mission: o.mission, author: o.author || '', data: o.data[key], updatedAt: new Date().toISOString(), imported: true };
          $('#importIn').value = ''; save(); renderRoomBody(); flash(`${o.team || id} 제출 코드를 추가했습니다`);
        } catch (err) { flash('제출 코드를 읽지 못했습니다 · 조가 복사한 코드 전체를 붙여 넣으십시오'); }
        break;
      }
      case 'pptOwn':
        if (!state.mission) { flash('먼저 미션을 고르십시오'); break; }
        downloadTeams([ownTeam()], t); break;
      case 'pptTeam': { const tm = roomTeams().find((x) => x.id === t.dataset.id); if (tm) downloadTeams([tm], t); break; }
      case 'pptAll': downloadTeams(roomTeams(), t); break;
      case 'importDel': delete state.imports[t.dataset.id]; save(); renderRoomBody(); break;
      case 'instrOff': state.instructor = false; state.course = 'campaign'; if (!state.mission) state.view = 'home'; save(); render(); flash('강사 모드를 껐습니다'); break;
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

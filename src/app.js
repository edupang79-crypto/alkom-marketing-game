(() => {
  'use strict';

  const STORE_KEY = 'campaign-lab-v1';
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

  /* ---------- 상태 ---------- */
  let state = { course: 'campaign', sheet: { campaign: 's1', promo: 'c1' }, team: '', author: '', answers: true, data: { campaign: {}, promo: {} } };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state = { ...state, ...s, sheet: { ...state.sheet, ...(s.sheet || {}) }, data: { campaign: {}, promo: {}, ...(s.data || {}) } };
    }
  } catch (e) { /* 저장소를 못 쓰면 이번 세션 메모리로만 동작 */ }

  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); flash('저장됨'); } catch (e) { flash('이 브라우저에는 저장되지 않습니다 · 백업 코드를 복사해 두세요'); }
    }, 350);
  };

  const course = () => COURSES[state.course];
  const D = () => state.data[state.course];
  const val = (key) => D()[key] ?? '';
  const setVal = (key, v) => { if (v === '' || v == null) delete D()[key]; else D()[key] = v; };

  /* 키 규칙 — 필드: 시트.필드 / 표 칸: 시트.표.행.열 */
  const fkey = (sid, id) => `${sid}.${id}`;
  const ckey = (sid, tid, r, c) => `${sid}.${tid}.${r}.${c}`;

  const V = (sid, id) => val(fkey(sid, id));
  const N = (sid, id) => num(V(sid, id));
  const C = (sid, tid, r, c) => val(ckey(sid, tid, r, c));
  const CN = (sid, tid, r, c) => num(C(sid, tid, r, c));

  const findSheet = (sid) => course().sheets.find((s) => s.id === sid);
  const findBlock = (sid, id) => (findSheet(sid)?.blocks || []).find((b) => b.id === id);

  /* ---------- 진행 상황 ---------- */
  function sheetKeys(sheet) {
    const keys = [];
    sheet.blocks.forEach((b) => {
      if (b.type === 'field' || b.type === 'q') keys.push(fkey(sheet.id, b.id));
      if (b.type === 'table') b.rows.forEach((row, r) => b.cols.forEach((col, c) => { if (c > 0) keys.push(ckey(sheet.id, b.id, r, c)); }));
    });
    return keys;
  }
  function progress(sheet, data = D()) {
    const keys = sheetKeys(sheet);
    const filled = keys.filter((k) => String(data[k] ?? '').trim() !== '').length;
    return { filled, total: keys.length, ratio: keys.length ? filled / keys.length : 0 };
  }

  /* ---------- 자동 계산 · 점검 ---------- */
  const chip = (kind, text) => `<span class="chip chip-${kind}">${esc(text)}</span>`;
  const line = (kind, text) => `<li class="chk chk-${kind}"><span class="dot" aria-hidden="true"></span><span>${text}</span></li>`;
  const list = (items) => `<ul class="chks">${items.join('')}</ul>`;
  const bars = (items, max = 100, unit = '%') => `<div class="bars">${items.map((it) => `
      <div class="bar-row"><span class="bar-label">${esc(it.label)}</span>
        <span class="bar-track"><span class="bar-fill ${it.cls || ''}" style="width:${Math.max(0, Math.min(100, (it.value / max) * 100))}%"></span></span>
        <span class="bar-val">${Number.isFinite(it.value) ? fmt(it.value, 1) + unit : '—'}</span></div>`).join('')}</div>`;
  const stat = (big, small) => `<div class="stat"><b>${big}</b><span>${small}</span></div>`;
  const stats = (arr) => `<div class="stats">${arr.join('')}</div>`;

  const goalMembers = () => { const g = N('s1', 'goalNum'); return Number.isFinite(g) ? g : NaN; };

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
      ]);
    },
    insight() {
      const b = findBlock('s2', 'ins');
      const re = /(때|는데|은데|ㄴ데|서 |어서|아서|면서)/;
      const items = b.rows.map((_, r) => {
        const t = C('s2', 'ins', r, 1).trim(), ty = C('s2', 'ins', r, 3), src = C('s2', 'ins', r, 2).trim();
        if (!t) return line('idle', `${r + 1}번 — 아직 비어 있습니다`);
        const sit = re.test(t);
        const miss = [!sit && '상황', !src && '근거', !ty && '유형'].filter(Boolean);
        return line(miss.length ? 'warn' : 'ok', `${r + 1}번 — ${miss.length ? `${miss.join(' · ')}이(가) 보이지 않습니다` : '상황 · 근거 · 유형을 갖췄습니다'}`);
      });
      const types = new Set(b.rows.map((_, r) => C('s2', 'ins', r, 3)).filter(Boolean));
      items.push(line(types.size >= 2 ? 'ok' : 'idle', `유형 ${types.size}가지 사용 (경험 · 가치 · 혜택)`));
      return list(items);
    },
    slogan() {
      const p = V('s3', 'pick'); const r = { A: 0, B: 1, C: 2 }[p];
      if (r === undefined) return `<p class="muted">최종 선택안을 고르면 여기에 캠페인명과 슬로건이 나란히 보입니다.</p>`;
      const name = C('s3', 'opts', r, 1), sl = C('s3', 'opts', r, 2), keep = V('s3', 'keep');
      const len = (s) => s.replace(/\s/g, '').length;
      return `<div class="poster"><span class="poster-eyebrow">${esc(p)}안 · 캠페인명</span><strong>${esc(name || '캠페인명 미입력')}</strong><em>${esc(sl || '슬로건 미입력')}</em></div>` +
        list([
          line(name && len(name) <= 10 ? 'ok' : 'warn', `캠페인명 ${len(name)}자 (공백 제외) ${len(name) <= 10 ? '' : '— 10자 이내를 권합니다'}`),
          line(sl && len(sl) <= 20 ? 'ok' : 'warn', `슬로건 ${len(sl)}자 ${len(sl) <= 20 ? '' : '— 20자를 넘으면 게시판에서 읽히지 않습니다'}`),
          line(keep ? 'ok' : 'idle', keep ? `남길 문장 · "${esc(keep)}"` : '남길 문장이 비어 있습니다'),
        ]);
    },
    story() {
      const parts = ['p1', 'p2', 'p3', 'p4'].map((id) => V('s4', id).trim());
      const labels = ['문제', '해결', '고객 경험', '브랜드 가치'];
      const filled = parts.filter(Boolean).length;
      return `<p class="calc-sub">네 칸을 이어 읽기 · ${filled}/4칸</p>` +
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
      if (!Number.isFinite(hh) || !Number.isFinite(aw)) return `<p class="muted">세대수와 인지도 목표를 넣으면 몇 세대가 알아야 하는지 계산합니다.</p>`;
      const n = hh * aw / 100;
      return stats([stat(fmt(n) + '세대', `${fmt(hh)}세대 × ${fmt(aw)}% = 캠페인을 알아야 하는 세대`), stat(fmt(n / 12) + '세대', '단지 12곳 기준 한 단지당')]);
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
      return stats([stat(fmt(sc), '8주 카드 발급 합계'), stat(fmt(sv), '8주 방문 합계'), stat(fmt(share, 0) + '%', '집중기 비중')]) +
        list([
          Number.isFinite(goal) ? line(sc >= goal ? 'ok' : 'warn', `① 주 목표 ${fmt(goal)}명 대비 ${sc >= goal ? '충족' : `${fmt(goal - sc)}명 부족`}`) : line('idle', '①에서 주 목표 수치를 넣으면 비교합니다'),
          line(sv && sc ? 'info' : 'idle', `방문 대비 카드 발급률 ${sv ? fmt(sc / sv * 100, 0) : '—'}%`),
        ]);
    },
    budget() {
      const total = N('s8', 'total'); const b = findBlock('s8', 'bud');
      const rows = b.rows.map((row, r) => ({ label: row.l.replace(/\s*※.*/, ''), p: CN('s8', 'bud', r, 1) }));
      const sum = rows.reduce((a, x) => a + (x.p || 0), 0);
      const goal = goalMembers();
      const direct = [2, 3, 4].reduce((a, r) => a + (rows[r].p || 0), 0);
      const insta = CN('s5', 'ch', 0, 4), apt = CN('s5', 'ch', 3, 4);
      const table = `<div class="tbl-wrap"><table class="mini"><thead><tr><th>항목</th><th>비중</th><th>금액</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${esc(x.label)}</td><td class="n">${Number.isFinite(x.p) ? fmt(x.p, 1) + '%' : '—'}</td><td class="n">${Number.isFinite(total) && Number.isFinite(x.p) ? fmt(total * x.p / 100) + '원' : '—'}</td></tr>`).join('')}
        <tr class="sum"><td>합계</td><td class="n">${fmt(sum, 1)}%</td><td class="n">${Number.isFinite(total) ? fmt(total * sum / 100) + '원' : '—'}</td></tr></tbody></table></div>`;
      return table + stats([
        stat(Number.isFinite(total / goal) ? won(total / goal) : '—', `1인당 획득 비용 · 총예산 ÷ ${Number.isFinite(goal) ? fmt(goal) : '?'}명`),
        stat(Number.isFinite(total / goal) ? won(total * direct / 100 / goal) : '—', `직접 획득 예산 기준 · 디지털+지역 매체+멤버십 ${fmt(direct, 1)}%`),
      ]) + list([
        line(Math.abs(sum - 100) < 0.01 ? 'ok' : 'bad', `비중 합계 ${fmt(sum, 1)}%`),
        Number.isFinite(insta) ? line(insta === rows[2].p ? 'ok' : 'warn', `⑤ 인스타 ${fmt(insta)}% ↔ 디지털 광고 ${fmt(rows[2].p)}% ${insta === rows[2].p ? '일치' : '— 서로 맞추십시오'}`) : line('idle', '⑤ 채널 비중을 넣으면 교차 점검합니다'),
        Number.isFinite(apt) ? line(apt === rows[3].p ? 'ok' : 'warn', `⑤ 아파트 게시판 ${fmt(apt)}% ↔ 지역 매체 ${fmt(rows[3].p)}% ${apt === rows[3].p ? '일치' : '— 서로 맞추십시오'}`) : '',
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
        stat(fmt(cap), `예약 피팅 수용량 · ${fmt(N('s9', 'coach'))}명 × ${fmt(N('s9', 'slots'))}타임 × ${fmt(N('s9', 'days'))}일`),
        stat(Number.isFinite(cap) && resv ? fmt(resv / cap * 100, 0) + '%' : '—', '예약 목표 ÷ 수용량 (가동률)'),
        stat(fmt(tot), '예약 + 워크인'),
      ]) + list([
        Number.isFinite(cap) && resv > cap ? line('bad', '예약 목표가 수용량을 넘습니다 · 코디나 운영일을 늘리십시오') : line(Number.isFinite(cap) ? 'ok' : 'idle', '예약 목표가 수용량 안에 있습니다'),
        Number.isFinite(goal) ? line(tot >= goal ? 'ok' : 'warn', `① 주 목표 ${fmt(goal)}명 ${tot >= goal ? '충족' : `대비 ${fmt(goal - tot)}명 부족`}`) : '',
      ]);
    },
    onepage(sid) {
      const isC = state.course === 'campaign';
      const title = isC ? (() => { const r = { A: 0, B: 1, C: 2 }[V('s3', 'pick')]; return r === undefined ? '' : C('s3', 'opts', r, 1); })() : C('c5', 'cp', 0, 1);
      const sub = isC ? (() => { const r = { A: 0, B: 1, C: 2 }[V('s3', 'pick')]; return r === undefined ? '' : C('s3', 'opts', r, 2); })() : C('c5', 'cp', 1, 1);
      const b = findBlock(sid, 'one');
      return `<div class="onepage">
        <div class="op-head"><span class="op-eyebrow">${esc(course().code)} · ${esc(state.team || '팀명')} · ${esc(state.author || '작성자')}</span>
        <h3>${esc(title || '캠페인명')}</h3><p>${esc(sub || '슬로건')}</p></div>
        <dl>${b.rows.map((row, r) => `<div><dt>${esc(row.l)}</dt><dd>${esc(C(sid, 'one', r, 1)) || '<span class="muted">비어 있음</span>'}</dd></div>`).join('')}</dl></div>`;
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
      const min = Math.min(...vals.filter((v) => v !== undefined));
      const lows = vals.map((v, i) => v === min ? heads[i] : null).filter(Boolean);
      const svg = `<svg class="emo" viewBox="0 0 ${W} ${H}" role="img" aria-label="단계별 감정 곡선">
        ${[1, 0, -1].map((v) => `<line x1="30" x2="${W - 30}" y1="${py(v)}" y2="${py(v)}" class="grid"/><text x="14" y="${py(v) + 4}" class="axis">${v > 0 ? '+' : v < 0 ? '−' : '0'}</text>`).join('')}
        ${path ? `<path d="${path}" class="curve" fill="none"/>` : ''}
        ${pts.map((p, i) => p ? `<circle cx="${p[0]}" cy="${p[1]}" r="6" class="${vals[i] === min ? 'pt low' : 'pt'}"/>` : '').join('')}
        ${heads.map((h, i) => `<text x="${px(i)}" y="${H - 8}" text-anchor="middle" class="axis">${esc(h)}</text>`).join('')}
      </svg>`;
      return `<div class="tbl-wrap">${svg}</div>` + (lows.length && Number.isFinite(min) ? list([line(min < 0 ? 'warn' : 'info', `가장 낮은 단계 · ${lows.map((l) => esc(l)).join(', ')}`)]) : '<p class="muted">단계별 감정을 고르면 곡선이 그려집니다.</p>');
    },
    smartCap() {
      const cap = N('c4', 'staff') * N('c4', 'perDay') * N('c4', 'days');
      const g1 = N('c4', 'g1'), g2 = N('c4', 'g2'), g3 = N('c4', 'g3');
      return stats([
        stat(fmt(cap) + '건', `상담 수용량 · ${fmt(N('c4', 'staff'))}명 × ${fmt(N('c4', 'perDay'))}건 × ${fmt(N('c4', 'days'))}일`),
        stat(Number.isFinite(g1 / cap) ? fmt(g1 / cap * 100, 0) + '%' : '—', '목표 1 ÷ 수용량'),
        stat(Number.isFinite(g2 / g1) ? fmt(g2 / g1 * 100, 0) + '%' : '—', '구매 전환 (목표 2 ÷ 목표 1)'),
        stat(Number.isFinite(g3 / g1) ? fmt(g3 / g1 * 100, 0) + '%' : '—', '재방문 (목표 3 ÷ 목표 1)'),
      ]) + list([
        Number.isFinite(g1 / cap) ? line(g1 > cap ? 'bad' : g1 / cap > 0.9 ? 'warn' : 'ok', g1 > cap ? '목표가 수용량을 넘습니다' : g1 / cap > 0.9 ? '여유가 10% 미만입니다 · 휴점·취소를 감안하십시오' : '수용량 안에서 여유가 있습니다') : line('idle', '수용량 입력값을 채우십시오'),
      ]);
    },
    five() {
      const b = findBlock('c5', 'five');
      const vals = b.rows.map((_, r) => C('c5', 'five', r, 2)).filter(Boolean);
      const cnt = {}; vals.forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; });
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
      const cells = b.rows.map((_, r) => b.cols.slice(1).map((__, c) => !!C('c7', 'sch', r, c + 1).trim()));
      return `<div class="tbl-wrap"><table class="heat"><thead><tr><th></th>${b.cols.slice(1).map((c) => `<th>${esc(c.h.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>${b.rows.map((row, r) => `<tr><th>${esc(row.l)}</th>${cells[r].map((f) => `<td class="${f ? 'on' : ''}">${f ? '●' : '·'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` +
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
      return stats(out) + list([line(Number.isFinite(inc) ? 'info' : 'idle', Number.isFinite(inc) ? '실제 증분 매출로 계산한 ROI입니다' : 'ROI는 실제 증분 매출을 확보한 뒤 산출합니다')]);
    },
  };

  /* ---------- ⑩ 초안 불러오기 ---------- */
  function composeDraft() {
    const j = (...xs) => xs.filter((x) => x && String(x).trim()).join(' · ');
    const first = (s) => (s || '').split(/(?<=[.다요])\s/)[0];
    if (state.course === 'campaign') {
      const r = { A: 0, B: 1, C: 2 }[V('s3', 'pick')];
      const g = findBlock('s1', 'goals');
      const main = g.rows.findIndex((_, i) => C('s1', 'goals', i, 4) === '주');
      const sub = g.rows.findIndex((_, i) => C('s1', 'goals', i, 4) === '부');
      const ch = findBlock('s5', 'ch').rows.map((row, i) => C('s5', 'ch', i, 1) === '사용' ? `${row.l.replace(/\s*\(.*\)/, '')} ${C('s5', 'ch', i, 4)}%` : null).filter(Boolean).join(' · ');
      const bud = findBlock('s8', 'bud').rows.map((row, i) => ({ l: row.l.replace(/\s*※.*/, ''), p: CN('s8', 'bud', i, 1) })).sort((a, b) => (b.p || 0) - (a.p || 0))[0];
      const kpiMain = findBlock('s9', 'kpi').rows.findIndex((_, i) => C('s9', 'kpi', i, 1) === '주');
      return [
        j(main >= 0 && `주 목표 — ${C('s1', 'goals', main, 2) || C('s1', 'goals', main, 1)}`, sub >= 0 && `부 목표 — ${C('s1', 'goals', sub, 1)}`),
        j(V('s1', 'persona'), C('s3', 'steps', 0, 1) || C('s2', 'ins', 0, 1)),
        r === undefined ? '' : j(`'${C('s3', 'opts', r, 1)}' — ${C('s3', 'opts', r, 2)}`, V('s3', 'keep') && `남길 문장: ${V('s3', 'keep')}`),
        ['p1', 'p2', 'p3', 'p4'].map((id) => first(V('s4', id))).filter(Boolean).join(' → '),
        j(ch, V('s3', 'keep') && `IMC 7단계 반복 메시지: '${V('s3', 'keep')}'`),
        j(C('s7', 'ops', 0, 1), C('s7', 'ops', 1, 1)),
        j(Number.isFinite(N('s8', 'total')) && `총 ${won(N('s8', 'total'))}`, bud && Number.isFinite(bud.p) && `최대 항목 ${bud.l} ${fmt(bud.p)}%`),
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

  /* ---------- 렌더링 ---------- */
  const app = $('#app');

  function inputHTML(key, t, opts, a, labelId) {
    const v = val(key);
    const aria = labelId ? `aria-labelledby="${labelId}"` : '';
    if (t === 'pick') return `<select id="f-${key}" data-k="${key}" ${aria}><option value="">선택</option>${opts.map((o) => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (t === 'area') return `<textarea id="f-${key}" data-k="${key}" rows="2" ${aria}>${esc(v)}</textarea>`;
    const cls = t === 'num' || t === 'pct' ? 'n' : '';
    return `<span class="inwrap ${t === 'pct' ? 'pct' : ''}"><input id="f-${key}" data-k="${key}" class="${cls}" ${t === 'num' || t === 'pct' ? 'inputmode="decimal"' : ''} value="${esc(v)}" ${aria} autocomplete="off"></span>`;
  }
  const ansHTML = (a, t) => a === undefined || a === '' ? '' : `<div class="ans" data-a>${t === 'num' && Number.isFinite(num(a)) && num(a) >= 1000 ? fmt(num(a)) : esc(a)}${t === 'pct' ? '%' : ''}</div>`;

  function renderBlock(sheet, b, i) {
    const sid = sheet.id;
    if (b.type === 'note') return `<p class="note">${esc(b.text)}</p>`;
    if (b.type === 'field') {
      const key = fkey(sid, b.id), lid = `l-${key}`;
      return `<div class="field ${b.t === 'num' || b.t === 'pick' ? 'field-short' : ''}"><label id="${lid}" for="f-${key}">${esc(b.label)}</label>${b.hint ? `<span class="hint">${esc(b.hint)}</span>` : ''}${inputHTML(key, b.t, b.opts, b.a)}${ansHTML(b.a, b.t)}</div>`;
    }
    if (b.type === 'q') {
      const key = fkey(sid, b.id);
      return `<div class="field q"><label for="f-${key}"><span class="qmark">Q</span>${esc(b.q)}</label>${inputHTML(key, 'area')}${ansHTML(b.a)}</div>`;
    }
    if (b.type === 'table') {
      const head = `<tr>${b.cols.map((c, ci) => `<th scope="col" class="col-${c.t || 'label'}" id="h-${sid}-${b.id}-${ci}">${esc(c.h)}</th>`).join('')}</tr>`;
      const body = b.rows.map((row, r) => `<tr><th scope="row">${esc(row.l)}</th>${b.cols.slice(1).map((c, ci) => {
        const key = ckey(sid, b.id, r, ci + 1);
        return `<td class="col-${c.t}">${inputHTML(key, c.t, c.opts, row.a?.[ci], `h-${sid}-${b.id}-${ci + 1}`)}${ansHTML(row.a?.[ci], c.t)}</td>`;
      }).join('')}</tr>`).join('');
      return `<div class="tbl-wrap sheet-table"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    }
    if (b.type === 'calc') return `<section class="calc" data-calc="${b.id}" data-i="${i}" aria-live="polite"><h4>자동 점검</h4><div class="calc-body"></div></section>`;
    if (b.type === 'draft') return `<div class="draft"><p>앞 워크시트에 적은 내용으로 아래 표의 <b>빈 칸</b>을 채웁니다. 채운 뒤 문장을 다듬으십시오.</p><button type="button" class="btn" data-act="draft">초안 불러오기</button></div>`;
    return '';
  }

  function renderNav() {
    const c = course();
    $('#nav').innerHTML = c.sheets.map((s) => {
      const p = progress(s);
      const st = p.filled === 0 ? 'empty' : p.ratio >= 0.8 ? 'done' : 'doing';
      const cur = s.id === state.sheet[state.course];
      return `<li><button type="button" data-sheet="${s.id}" class="nav-item ${cur ? 'cur' : ''}" ${cur ? 'aria-current="page"' : ''}>
        <span class="nav-no">${s.no}</span><span class="nav-title">${esc(s.title)}</span>
        <span class="nav-st st-${st}" title="${p.filled}/${p.total}칸"><span style="width:${Math.round(p.ratio * 100)}%"></span></span></button></li>`;
    }).join('');
    const all = c.sheets.reduce((a, s) => { const p = progress(s); return [a[0] + p.filled, a[1] + p.total]; }, [0, 0]);
    $('#overall').textContent = `전체 ${Math.round(all[0] / all[1] * 100)}% 작성`;
    document.querySelectorAll('[data-course]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.course === state.course));
  }

  function renderSheet() {
    const c = course();
    const sid = state.sheet[state.course];
    const sheet = findSheet(sid) || c.sheets[0];
    const idx = c.sheets.indexOf(sheet);
    const prev = c.sheets[idx - 1], next = c.sheets[idx + 1];
    $('#case').innerHTML = `<span class="case-code">${esc(c.code)}. ${esc(c.name)}</span><strong>${esc(c.caseTitle)}</strong><span>${esc(c.caseSub)}</span>`;
    app.innerHTML = `
      <header class="sheet-head">
        <p class="sheet-eyebrow">실습 ${sheet.no}</p>
        <h2>${esc(sheet.title)}</h2>
        <p class="lead">${esc(sheet.lead)}</p>
        <p class="byline">팀명 <u>${esc(state.team) || '&nbsp;'.repeat(14)}</u> 작성자 <u>${esc(state.author) || '&nbsp;'.repeat(14)}</u></p>
        <div class="sheet-tools">
          <button type="button" class="btn ghost" data-act="fill">이 시트에 모범답안 채우기</button>
          <button type="button" class="btn ghost danger" data-act="clear">이 시트 비우기</button>
        </div>
      </header>
      <div class="blocks">${sheet.blocks.map((b, i) => renderBlock(sheet, b, i)).join('')}</div>
      <nav class="pager" aria-label="워크시트 이동">
        ${prev ? `<button type="button" class="btn ghost" data-sheet="${prev.id}">← ${prev.no} ${esc(prev.title)}</button>` : '<span></span>'}
        ${next ? `<button type="button" class="btn" data-sheet="${next.id}">${next.no} ${esc(next.title)} →</button>` : '<span></span>'}
      </nav>`;
    app.querySelectorAll('textarea').forEach(autosize);
    runCalcs();
    renderNav();
  }

  function runCalcs() {
    const sheet = findSheet(state.sheet[state.course]);
    app.querySelectorAll('[data-calc]').forEach((el) => {
      const blk = sheet.blocks[+el.dataset.i];
      let html = '';
      try { html = CALC[blk.id](sheet.id, blk); } catch (e) { html = `<p class="muted">값을 채우면 계산합니다.</p>`; }
      el.querySelector('.calc-body').innerHTML = html;
    });
  }

  function autosize(t) { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight + 2, 44) + 'px'; }

  function fillSheet(sheet, onlyEmpty = false) {
    sheet.blocks.forEach((b) => {
      if ((b.type === 'field' || b.type === 'q') && b.a !== undefined) { const k = fkey(sheet.id, b.id); if (!onlyEmpty || !val(k)) setVal(k, b.a); }
      if (b.type === 'table') b.rows.forEach((row, r) => (row.a || []).forEach((a, ci) => { const k = ckey(sheet.id, b.id, r, ci + 1); if (!onlyEmpty || !val(k)) setVal(k, a); }));
    });
  }
  function clearSheet(sheet) { sheetKeys(sheet).forEach((k) => setVal(k, '')); }

  /* ---------- 내보내기 ---------- */
  function exportText() {
    const c = course();
    const out = [`# ${c.code}. ${c.name} — ${c.caseTitle}`, `팀명: ${state.team || '-'} / 작성자: ${state.author || '-'}`, ''];
    c.sheets.forEach((s) => {
      out.push(`## 실습 ${s.no} ${s.title}`);
      s.blocks.forEach((b) => {
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
  const backupCode = () => btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, team: state.team, author: state.author, data: state.data }))));

  async function copy(text, okMsg, fallbackEl) {
    try { await navigator.clipboard.writeText(text); flash(okMsg); }
    catch (e) {
      if (fallbackEl) { fallbackEl.value = text; fallbackEl.hidden = false; fallbackEl.focus(); fallbackEl.select(); }
      flash('자동 복사가 막혀 있습니다 · 아래 칸에서 직접 복사하십시오');
    }
  }

  let toastTimer;
  function flash(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('input', (e) => {
    const k = e.target.dataset?.k;
    if (k) {
      setVal(k, e.target.value);
      if (e.target.tagName === 'TEXTAREA') autosize(e.target);
      runCalcs(); renderNavLite(); save();
      return;
    }
    if (e.target.id === 'team' || e.target.id === 'author') {
      state[e.target.id] = e.target.value;
      app.querySelector('.byline').innerHTML = `팀명 <u>${esc(state.team) || '&nbsp;'.repeat(14)}</u> 작성자 <u>${esc(state.author) || '&nbsp;'.repeat(14)}</u>`;
      runCalcs(); save();
    }
  });
  document.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' && e.target.dataset.k) { setVal(e.target.dataset.k, e.target.value); runCalcs(); renderNavLite(); save(); } });

  let navT;
  function renderNavLite() { clearTimeout(navT); navT = setTimeout(renderNav, 150); }

  let clearArmed = null;
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.sheet) { state.sheet[state.course] = t.dataset.sheet; save(); renderSheet(); window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' }); $('#main').focus({ preventScroll: true }); return; }
    if (t.dataset.course) { state.course = t.dataset.course; save(); renderSheet(); return; }
    const sheet = findSheet(state.sheet[state.course]);
    switch (t.dataset.act) {
      case 'answers':
        state.answers = !state.answers; applyAnswers(); save(); break;
      case 'fill':
        fillSheet(sheet); save(); renderSheet(); flash('모범답안을 채웠습니다 · 우리 조의 값으로 고쳐 쓰십시오'); break;
      case 'clear':
        if (clearArmed !== sheet.id) { clearArmed = sheet.id; t.textContent = '한 번 더 누르면 비웁니다'; t.classList.add('armed'); setTimeout(() => { if (t.isConnected) { t.textContent = '이 시트 비우기'; t.classList.remove('armed'); } clearArmed = null; }, 3000); break; }
        clearArmed = null; clearSheet(sheet); save(); renderSheet(); flash('이 시트를 비웠습니다'); break;
      case 'draft': {
        const d = composeDraft(); let n = 0;
        d.forEach((txt, r) => { const k = ckey(sheet.id, 'one', r, 1); if (!val(k) && txt) { setVal(k, txt); n++; } });
        save(); renderSheet(); flash(n ? `빈 칸 ${n}곳을 채웠습니다` : '채울 빈 칸이 없거나 앞 시트가 비어 있습니다'); break;
      }
      case 'export': $('#exportPanel').hidden = !$('#exportPanel').hidden; t.setAttribute('aria-expanded', !$('#exportPanel').hidden); break;
      case 'copyText': copy(exportText(), '전체 내용을 복사했습니다', $('#copyOut')); break;
      case 'copyCode': copy(backupCode(), '백업 코드를 복사했습니다', $('#copyOut')); break;
      case 'restore': {
        try {
          const o = JSON.parse(decodeURIComponent(escape(atob($('#restoreIn').value.trim()))));
          if (!o || !o.data) throw new Error();
          state.data = { campaign: {}, promo: {}, ...o.data }; state.team = o.team || ''; state.author = o.author || '';
          $('#team').value = state.team; $('#author').value = state.author; $('#restoreIn').value = '';
          save(); renderSheet(); flash('백업을 불러왔습니다');
        } catch (err) { flash('백업 코드를 읽지 못했습니다 · 복사한 코드 전체를 붙여 넣으십시오'); }
        break;
      }
      case 'fillAll':
        course().sheets.forEach((s) => fillSheet(s, true)); save(); renderSheet(); flash('빈 칸을 모두 모범답안으로 채웠습니다'); break;
    }
  });

  function applyAnswers() {
    document.documentElement.classList.toggle('show-ans', state.answers);
    const b = $('[data-act="answers"]'); b.setAttribute('aria-pressed', state.answers); b.querySelector('span').textContent = state.answers ? '모범답안 숨기기' : '모범답안 보기';
  }

  /* ---------- 시작 ---------- */
  $('#team').value = state.team; $('#author').value = state.author;
  if (/^#(campaign|promo)$/.test(location.hash)) state.course = location.hash.slice(1);
  applyAnswers();
  renderSheet();
})();

/* Packet Tracer 逐段排查助手：按鈕、步驟切換、測試紀錄
 * 不使用 ES module 或 fetch，所以直接雙擊 index.html 也能運作。
 * 案例資料由 cases/*.js 放進 window.CASES。 */
(function () {
  'use strict';

  var cases = window.CASES || [];
  var state = { caseId: null, current: null, history: [] };

  var STATUS_TEXT = { pass: '通過', fail: '有問題', none: '待驗證' };

  function $(id) { return document.getElementById(id); }

  function h(tag, props, kids) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      if (k === 'class') el.className = props[k];
      else if (k === 'text') el.textContent = props[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), props[k]);
      else el.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (kid) {
      if (kid == null) return;
      el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    });
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function currentCase() {
    for (var i = 0; i < cases.length; i++) if (cases[i].id === state.caseId) return cases[i];
    return null;
  }

  /* ---------- 狀態推算 ---------- */
  function segmentStatus(c) {
    var result = {};
    c.segments.forEach(function (s) { result[s.id] = 'none'; });
    state.history.forEach(function (entry) {
      var opt = c.steps[entry.stepId].options[entry.optionIndex];
      var marks = opt.marks || {};
      Object.keys(marks).forEach(function (k) { if (k in result) result[k] = marks[k]; });
    });
    return result;
  }

  function overallStatus(c) {
    var step = c.steps[state.current];
    if (step.type === 'end') return step.status;
    return 'progress';
  }

  function optionTone(opt) {
    var marks = opt.marks || {};
    var vals = Object.keys(marks).map(function (k) { return marks[k]; });
    if (vals.indexOf('fail') !== -1) return 'fail';
    if (vals.indexOf('pass') !== -1) return 'pass';
    return 'pending';
  }

  /* ---------- 案例選單 ---------- */
  function renderMenu() {
    var nav = $('case-menu');
    clear(nav);
    cases.forEach(function (c) {
      nav.appendChild(h('button', {
        type: 'button',
        class: 'case-tab',
        'aria-current': c.id === state.caseId ? 'true' : 'false',
        text: c.title,
        onclick: function () { loadCase(c.id); }
      }));
    });
  }

  function renderIntro(c) {
    var box = $('case-intro');
    clear(box);
    box.appendChild(h('h2', { text: c.title }));
    box.appendChild(h('p', { text: '故障現象：' + c.symptom }));
  }

  /* ---------- 拓樸 ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, text) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text != null) el.textContent = text;
    return el;
  }

  function renderTopology(c, focus) {
    var box = $('topology');
    clear(box);
    var nodes = c.topology.nodes;
    var W = 800, NW = 120, NH = 64, TOP = 44, cy = TOP + NH / 2;
    var step = nodes.length > 1 ? (W - NW - 20) / (nodes.length - 1) : 0;
    var pos = {};
    nodes.forEach(function (n, i) { pos[n.id] = NW / 2 + 10 + i * step; });

    var svg = s('svg', { viewBox: '0 0 ' + W + ' 140', role: 'img',
      'aria-label': c.title + '的網路拓樸：' + nodes.map(function (n) { return n.label; }).join(' → ') });

    c.topology.links.forEach(function (l) {
      var x1 = pos[l.from] + NW / 2, x2 = pos[l.to] - NW / 2;
      svg.appendChild(s('line', { x1: x1, y1: cy, x2: x2, y2: cy, 'class': 'topo-link' }));
      svg.appendChild(s('text', { x: (x1 + x2) / 2, y: cy - 10, 'text-anchor': 'middle',
        'class': 'topo-link-label' }, l.label));
    });

    nodes.forEach(function (n) {
      var isFocus = focus && focus.indexOf(n.id) !== -1;
      var g = s('g', { 'class': 'topo-node' + (isFocus ? ' focus' : '') });
      g.appendChild(s('rect', { x: pos[n.id] - NW / 2, y: TOP, width: NW, height: NH, rx: 10 }));
      g.appendChild(s('text', { x: pos[n.id], y: TOP + 28, 'text-anchor': 'middle', 'class': 'n-label' }, n.label));
      g.appendChild(s('text', { x: pos[n.id], y: TOP + 48, 'text-anchor': 'middle', 'class': 'n-sub' }, n.sub));
      svg.appendChild(g);
    });

    box.appendChild(svg);
  }

  /* ---------- 複製指令 ---------- */
  function copyText(text, btn) {
    function done(ok) {
      btn.textContent = ok ? '已複製' : '請手動複製';
      setTimeout(function () { btn.textContent = '複製'; }, 1200);
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- 步驟 ---------- */
  function field(name, content) {
    return h('div', { class: 'field' }, [h('p', { class: 'field-name', text: name }), content]);
  }

  function renderStep() {
    var c = currentCase();
    var step = c.steps[state.current];
    var box = $('step');
    clear(box);
    box.className = 'step-wrap' + (step.type === 'end' ? ' end-card ' + step.status : '');

    var status = overallStatus(c);
    var pillText = { progress: '排查中', connected: '已連通', pending: '待驗證' }[status];

    var top = h('div', { class: 'step-top' }, [
      h('span', { class: 'pill ' + status, text: pillText })
    ]);
    if (step.type !== 'end') {
      top.insertBefore(h('span', { class: 'step-no', text: '第 ' + (state.history.length + 1) + ' 步' }), top.firstChild);
    }
    box.appendChild(top);
    box.appendChild(h('h3', { text: step.title }));

    // 上一步的結果與原因
    if (state.history.length) {
      var last = state.history[state.history.length - 1];
      var lastOpt = c.steps[last.stepId].options[last.optionIndex];
      box.appendChild(h('p', { class: 'why' }, [
        h('strong', { text: '你回報「' + lastOpt.label + '」。' }),
        ' ' + lastOpt.reason
      ]));
    }

    if (step.type === 'end') {
      box.appendChild(h('p', { text: step.summary }));
      if (step.points && step.points.length) {
        var ul = h('ul', {}, step.points.map(function (p) { return h('li', { text: p }); }));
        box.appendChild(field(step.status === 'connected' ? '重點整理' : '還可以再確認', ul));
      }
    } else {
      box.appendChild(field('在哪台設備操作', h('p', { text: step.where })));

      if (step.commands && step.commands.length) {
        var list = h('div', { class: 'cmd-list' }, step.commands.map(function (cmd) {
          var text = typeof cmd === 'string' ? cmd : cmd.c;
          var note = typeof cmd === 'string' ? null : cmd.n;
          var row = h('div', { class: 'cmd-row' }, [h('code', { text: text })]);
          var btn = h('button', { type: 'button', class: 'copy-btn', text: '複製',
            'aria-label': '複製指令 ' + text });
          btn.addEventListener('click', function () { copyText(text, btn); });
          row.appendChild(btn);
          return h('div', { class: 'cmd-item' }, [note ? h('small', { text: note }) : null, row]);
        }));
        box.appendChild(field('輸入的指令', list));
      }

      box.appendChild(field('要觀察什麼', h('ul', {}, step.observe.map(function (t) {
        return h('li', { text: t });
      }))));

      if (step.afterNote) box.appendChild(field('改完之後', h('p', { text: step.afterNote })));
    }

    if (step.options && step.options.length) {
      var opts = h('div', { class: 'options' });
      if (step.type !== 'end') {
        opts.appendChild(h('p', { class: 'field-name', text: '你在 Packet Tracer 看到的結果是？' }));
      }
      step.options.forEach(function (opt, i) {
        opts.appendChild(h('button', {
          type: 'button',
          class: 'btn choice',
          'data-next': opt.next,
          text: opt.label,
          onclick: function () { choose(i); }
        }));
      });
      box.appendChild(opts);
    }

    renderTopology(c, step.focus);
  }

  /* ---------- 狀態、紀錄、控制 ---------- */
  function renderSegments() {
    var c = currentCase();
    var st = segmentStatus(c);
    var ul = $('segments');
    clear(ul);
    c.segments.forEach(function (seg) {
      var v = st[seg.id];
      var text = STATUS_TEXT[v];
      var cls = v === 'none' ? 'pending' : v;
      if (seg.id === 'e2e' && v === 'pass') { text = '已連通'; cls = 'connected'; }
      ul.appendChild(h('li', {}, [
        h('span', { text: seg.label }),
        h('span', { class: 'pill ' + cls, text: text })
      ]));
    });
  }

  function renderLog() {
    var c = currentCase();
    var ol = $('log');
    clear(ol);
    if (!state.history.length) {
      ol.appendChild(h('li', { class: 'log-empty', text: '還沒有紀錄。回報第一個測試結果後，會出現在這裡。' }));
      return;
    }
    state.history.forEach(function (entry) {
      var step = c.steps[entry.stepId];
      var opt = step.options[entry.optionIndex];
      var tone = optionTone(opt);
      ol.appendChild(h('li', {}, [
        h('div', { class: 'log-head' }, [
          h('span', { class: 'log-title', text: step.title }),
          h('span', { class: 'pill ' + tone, text: opt.label })
        ]),
        h('p', { class: 'log-reason', text: opt.reason })
      ]));
    });
  }

  function renderControls() {
    $('btn-back').disabled = state.history.length === 0;
  }

  function renderAll() {
    renderStep();
    renderSegments();
    renderLog();
    renderControls();
  }

  /* ---------- 動作 ---------- */
  function choose(optionIndex) {
    var c = currentCase();
    var opt = c.steps[state.current].options[optionIndex];
    if (!c.steps[opt.next]) { return; }
    state.history.push({ stepId: state.current, optionIndex: optionIndex });
    state.current = opt.next;
    renderAll();
    $('step').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function back() {
    if (!state.history.length) return;
    var last = state.history.pop();
    state.current = last.stepId;
    renderAll();
  }

  function reset() {
    var c = currentCase();
    state.history = [];
    state.current = c.start;
    renderAll();
  }

  function loadCase(id) {
    state.caseId = id;
    var c = currentCase();
    state.history = [];
    state.current = c.start;
    renderMenu();
    renderIntro(c);
    renderAll();
  }

  function init() {
    $('btn-back').addEventListener('click', back);
    $('btn-reset').addEventListener('click', reset);
    if (!cases.length) {
      $('step').textContent = '找不到案例檔，請確認 cases/ 資料夾與 index.html 裡的 script 路徑。';
      return;
    }
    loadCase(cases[0].id);
  }

  init();
})();

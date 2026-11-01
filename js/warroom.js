/* UI and mission runner. Talks only to WarRoomModel and the DOM. */
(function () {
  "use strict";

  var M = window.WarRoomModel;
  var PHASES = [
    { id: "research", name: "洞察", en: "Research", kind: "agent" },
    { id: "creative", name: "创意", en: "Creative", kind: "agent" },
    { id: "gate", name: "闸门", en: "Human", kind: "human" },
    { id: "compliance", name: "合规", en: "Compliance", kind: "agent" },
    { id: "analyst", name: "实验", en: "Analyst", kind: "agent" }
  ];
  var PROGRESS = { IDLE: 0, RESEARCH: 14, CREATIVE: 34, HUMAN_GATE: 50, COMPLIANCE: 68, ANALYST: 84, PACK: 100 };
  var ORCH = {
    IDLE: "编排器待命。它不写文案，只决定下一张卡片交给谁。",
    RESEARCH: "编排器把简报交给洞察官。创意还不能开工。",
    CREATIVE: "洞察卡片已锁定。编排器请创意官只基于这些假设写角度。",
    HUMAN_GATE: "编排器停下。没有你的决定，合规官不会开始。",
    COMPLIANCE: "你已放行这个方向。编排器把稿子交给合规官，创意官先不再改口。",
    ANALYST: "合规结论已写入。编排器请分析官只设计实验，不新增承诺。",
    PACK: "流水线关闭。任务包是唯一可以拿走的交付物。"
  };
  var NODE_TEXT = { idle: "待命", run: "进行中", done: "完成", hold: "等待你", fail: "驳回" };

  var briefId = M.BRIEFS[0].id;
  var generation = 0;
  var startLock = false;
  var gateResolver = null;
  var serial = 0;
  var ui = {
    phase: "IDLE",
    nodes: { research: "idle", creative: "idle", gate: "idle", compliance: "idle", analyst: "idle" },
    loops: 0,
    ledger: [],
    status: "待命",
    tone: "idle",
    runLabel: ""
  };

  var els = {};

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value == null || value === false) return;
      if (key === "class") node.className = value;
      else node.setAttribute(key, value);
    });
    [].concat(children || []).forEach(function (child) {
      if (child == null || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function brief() {
    return M.BRIEFS.filter(function (item) { return item.id === briefId; })[0];
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function uiDelay(ms) {
    if (reducedMotion()) return 16;
    if (els.fast && els.fast.checked) return Math.max(28, Math.round(ms * 0.18));
    return ms;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, uiDelay(ms)); });
  }

  function fmtSec(ms) { return (ms / 1000).toFixed(1) + "s"; }

  function currentBriefIndex() {
    return M.BRIEFS.findIndex(function (item) { return item.id === briefId; });
  }

  function renderBriefs() {
    els.briefList.innerHTML = "";
    M.BRIEFS.forEach(function (item) {
      var btn = el("button", {
        type: "button",
        class: "brief" + (item.id === briefId ? " is-on" : ""),
        role: "option",
        id: "brief-" + item.id,
        "aria-selected": item.id === briefId ? "true" : "false"
      }, [
        el("span", { class: "brief-top" }, [
          el("b", {}, item.brand),
          el("span", { class: "chip sens-" + item.sensitivity }, "敏感度 " + item.sensitivity)
        ]),
        el("small", {}, item.product),
        item.recommendInject ? el("small", {}, "适合演示回环") : null
      ]);
      btn.addEventListener("click", function () { selectBrief(item.id); });
      els.briefList.appendChild(btn);
    });
    els.briefList.setAttribute("aria-activedescendant", "brief-" + briefId);
    renderDetail();
    renderSingle();
  }

  function renderDetail() {
    var item = brief();
    var kv = el("dl", { class: "kv" });
    [
      ["目标", item.objective],
      ["受众", item.audience],
      ["市场", item.market],
      ["预算", item.budget + " · " + item.flight],
      ["约束", item.constraints.join("；")]
    ].forEach(function (pair) {
      kv.appendChild(el("dt", {}, pair[0]));
      kv.appendChild(el("dd", {}, pair[1]));
    });
    var bars = el("div", { class: "bars" });
    item.channels.forEach(function (ch) {
      bars.appendChild(el("div", { class: "bar-row" }, [
        el("span", {}, ch.name),
        el("span", { class: "track" }, [el("i", { style: "width:" + ch.pct + "%" })]),
        el("span", {}, ch.pct + "%")
      ]));
    });
    els.briefDetail.innerHTML = "";
    els.briefDetail.appendChild(el("p", {}, item.sensitivityNote));
    els.briefDetail.appendChild(kv);
    els.briefDetail.appendChild(bars);
    els.briefDetail.appendChild(el("p", { class: "hint" }, "KPI：" + item.kpis.join(" · ")));
  }

  function renderSingle() {
    els.singleBody.textContent = brief().singleBlob;
  }

  function selectBrief(id) {
    if (id === briefId) return;
    var wasRunning = startLock;
    briefId = id;
    clearBoard();
    renderBriefs();
    if (wasRunning) trace("ORCH", "已切换简报，运行中的任务已停止。", "T+0.0s");
  }

  function moveBrief(delta) {
    var next = (currentBriefIndex() + delta + M.BRIEFS.length) % M.BRIEFS.length;
    selectBrief(M.BRIEFS[next].id);
    var node = $("brief-" + briefId);
    if (node) node.focus();
  }

  function paintChrome() {
    els.phaseCode.textContent = ui.phase;
    els.bar.style.width = (PROGRESS[ui.phase] || 0) + "%";
    els.runStatus.textContent = ui.runLabel ? ui.status + " · " + ui.runLabel : ui.status;
    els.runStatus.dataset.tone = ui.tone;
    els.orchText.textContent = ORCH[ui.phase] || ORCH.IDLE;
    els.pipeline.innerHTML = "";
    PHASES.forEach(function (phase, index) {
      var state = ui.nodes[phase.id];
      var li = el("li", {
        "data-kind": phase.kind,
        class: "is-" + state + (phase.id === "compliance" && ui.loops > 0 ? " was-reject" : "") + (phase.id === "compliance" && els.inject.checked && state !== "done" ? " is-armed" : ""),
        "aria-current": state === "run" || state === "hold" ? "step" : "false"
      }, [
        el("div", { class: "dot" }, phase.kind === "human" ? "人" : String(index + 1)),
        el("span", { class: "name" }, phase.name),
        el("span", { class: "en" }, phase.en),
        el("span", { class: "st" }, NODE_TEXT[state] + (phase.id === "compliance" && ui.loops > 0 && state === "done" ? " · 曾驳回" : ""))
      ]);
      els.pipeline.appendChild(li);
    });
    if (ui.loops > 0) {
      els.loopNote.hidden = false;
      els.loopNote.textContent = "合规驳回 · 已退回创意重做 · 回环 " + ui.loops + " 次";
    } else {
      els.loopNote.hidden = true;
    }
    els.runBtn.disabled = startLock;
    els.runBtn.textContent = ui.phase === "HUMAN_GATE" ? "等待闸门" : startLock ? "执行中" : ui.phase === "PACK" ? "再跑一次" : "启动任务";
    renderLedger();
  }

  function renderLedger() {
    els.ledger.innerHTML = "";
    if (!ui.ledger.length) {
      els.ledger.appendChild(el("p", { class: "hint" }, "启动之后，每一段模型花费和每一次人工停留都会记在这里。"));
      return;
    }
    var tokens = 0;
    var modelMs = 0;
    var yuan = 0;
    var humanMs = 0;
    ui.ledger.forEach(function (row) {
      var line = el("div", { class: "ledger-row" + (row.kind === "human" ? " human" : "") }, [
        el("b", {}, row.label),
        el("span", {}, row.kind === "human" ? "—" : row.tokens.toLocaleString("zh-CN") + " tok"),
        el("span", {}, fmtSec(row.ms) + (row.kind === "human" ? " 真实" : ""))
      ]);
      els.ledger.appendChild(line);
      if (row.kind === "human") humanMs += row.ms;
      else {
        tokens += row.tokens;
        modelMs += row.ms;
        yuan += row.yuan;
      }
    });
    els.ledger.appendChild(el("div", { class: "ledger-total" }, [
      el("b", {}, "合计"),
      el("span", {}, tokens.toLocaleString("zh-CN") + " tok"),
      el("span", {}, "模型 " + fmtSec(modelMs))
    ]));
    els.ledger.appendChild(el("p", { class: "money" }, M.money(yuan) + " · 人工 " + fmtSec(humanMs)));
  }

  function renderCompare() {
    var happy = M.sumPath(M.HAPPY_PATH);
    var loop = M.sumPath(M.LOOP_PATH);
    var single = M.stepCost(M.SINGLE);
    var research = M.stepCost(M.STEPS.research);
    var rows = [
      ["单 Agent 一次生成", single.tokens, single.ms, single.yuan, "无", "整段重来"],
      ["多 Agent · 条件通过", happy.tokens, happy.ms, happy.yuan, "1 次", "按角色"],
      ["多 Agent · 驳回回环一次", loop.tokens, loop.ms, loop.yuan, "2 次", "不重跑洞察"]
    ];
    els.cmpBody.innerHTML = "";
    rows.forEach(function (row) {
      els.cmpBody.appendChild(el("tr", {}, [
        el("td", {}, row[0]),
        el("td", {}, row[1].toLocaleString("zh-CN")),
        el("td", {}, fmtSec(row[2])),
        el("td", {}, M.money(row[3])),
        el("td", {}, row[4]),
        el("td", {}, row[5])
      ]));
    });
    var more = Math.round((happy.tokens - single.tokens) / single.tokens * 100);
    els.costLine.textContent = "顺利路径大约多花 " + more + "% 的 token，墙钟也更长。关键路径是串行的：创意依赖洞察，合规依赖已经批准的创意，实验依赖合规结论。一个角色内部的工具调用可以并行，演示里仍让它们先后出现，方便看清。";
    els.saveLine.textContent = "回环不会重跑洞察，因此相对「整段重写」省下洞察官的 " + research.tokens.toLocaleString("zh-CN") + " token。下面的数字和左侧账本使用同一套常数；快进只改变你等待动画的时间。";
  }

  function trace(actor, message, stamp) {
    els.traceEmpty.hidden = true;
    var item = el("li", { "data-actor": actor }, [
      el("time", {}, stamp),
      el("span", { class: "actor" }, actor),
      el("span", {}, message)
    ]);
    var box = els.trace;
    var near = box.scrollHeight - box.scrollTop - box.clientHeight < 64;
    box.appendChild(item);
    els.traceCount.textContent = String(box.children.length);
    if (near) box.scrollTop = box.scrollHeight;
  }

  function say(text) { els.live.textContent = text; }

  function emptyStory() {
    els.story.innerHTML = "";
    els.story.appendChild(el("div", { class: "empty", id: "emptyState" }, [
      el("p", { class: "eyebrow" }, "Standby"),
      el("h3", {}, "选一条简报，启动任务。"),
      el("p", {}, "流水线会在创意之后停下。你可以批准，或要求修改。打开「注入合规失败」，同一批风险句会从观察项变成驳回，并退回创意。")
    ]));
  }

  function setPhase(phase, status, tone) {
    ui.phase = phase;
    ui.status = status;
    ui.tone = tone;
    say(status);
    paintChrome();
  }

  function beginCard(kicker, title, refuses) {
    var card = el("article", { class: "card is-live" });
    card.appendChild(el("header", { class: "card-h" }, [
      el("div", {}, [el("p", { class: "eyebrow" }, kicker), el("h3", {}, title)]),
      el("p", { class: "refuses" }, refuses)
    ]));
    var live = el("p", { class: "live-line" }, "准备调用工具");
    var tools = el("div", { class: "tools" });
    card.appendChild(live);
    card.appendChild(tools);
    els.story.appendChild(card);
    card.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" });
    return { card: card, live: live, tools: tools };
  }

  function renderTool(tool) {
    return el("div", { class: "tool" }, [
      el("div", { class: "tool-h" }, [el("span", { class: "pill" }, "TOOL"), el("code", {}, tool.name)]),
      el("pre", {}, JSON.stringify(tool.args, null, 2)),
      el("p", { class: "tool-out" }, "← " + tool.result)
    ]);
  }

  async function playTools(ctx, view, stepKey, tools) {
    var step = M.STEPS[stepKey];
    var parts = tools.length + 1;
    var base = Math.floor(step.ms / parts);
    var extra = step.ms - base * parts;
    function take(index) {
      var delta = base + (index < extra ? 1 : 0);
      ctx.simMs += delta;
    }
    for (var i = 0; i < tools.length; i += 1) {
      if (!ctx.alive()) return false;
      view.live.textContent = tools[i].beat;
      await sleep(760);
      if (!ctx.alive()) return false;
      take(i);
      view.tools.appendChild(renderTool(tools[i]));
      trace(step.actor, "调用 " + tools[i].name + " · " + tools[i].result, stamp(ctx));
    }
    take(tools.length);
    var cost = M.stepCost(step);
    ui.ledger.push({
      label: step.label,
      tokens: cost.tokens,
      ms: cost.ms,
      yuan: cost.yuan,
      kind: "model"
    });
    paintChrome();
    return true;
  }

  function stamp(ctx) {
    return "T+" + (ctx.simMs / 1000).toFixed(1) + "s";
  }

  function renderAngles(angles) {
    return el("div", { class: "angles" }, angles.map(function (angle) {
      return el("article", { class: "angle" }, [
        el("div", {}, [
          angle.lead ? el("span", { class: "tag lead" }, "主推") : el("span", { class: "tag" }, "备选"),
          el("h4", {}, angle.name)
        ]),
        el("p", {}, angle.hook),
        el("p", { class: "meta-line" }, "标题 · " + angle.headline),
        el("p", {}, angle.body),
        el("p", { class: "meta-line" }, "CTA · " + angle.cta),
        el("p", { class: "hint" }, angle.why)
      ]);
    }));
  }

  function finishCard(view) {
    view.card.classList.remove("is-live");
    view.live.remove();
  }

  async function playResearch(ctx) {
    ui.nodes.research = "run";
    setPhase("RESEARCH", "洞察官工作中", "run");
    trace("ORCH", "状态 RESEARCH · 接收 " + ctx.runCode + " · " + ctx.brief.brand, stamp(ctx));
    var view = beginCard("洞察官 · Research", ctx.brief.research.summary, ctx.brief.research.refuses);
    var ok = await playTools(ctx, view, "research", M.resolveTools(ctx.brief.tools.research));
    if (!ok) return false;
    var findings = el("div", { class: "findings" });
    ctx.brief.research.hypotheses.forEach(function (item) {
      findings.appendChild(el("article", { class: "hyp" }, [
        el("span", { class: "tag " + (item.kind === "测量" ? "measure" : "infer") }, item.kind),
        el("h4", {}, item.title),
        el("p", {}, item.detail)
      ]));
    });
    findings.appendChild(el("p", {}, "空白：" + ctx.brief.research.gap));
    findings.appendChild(el("p", { class: "meta-line" }, "时机：" + ctx.brief.research.timing));
    view.card.appendChild(findings);
    finishCard(view);
    ui.nodes.research = "done";
    trace("RES", "洞察完成 · 测量 " + ctx.brief.research.hypotheses.filter(function (h) { return h.kind === "测量"; }).length + " · 推断 " + ctx.brief.research.hypotheses.filter(function (h) { return h.kind === "推断"; }).length, stamp(ctx));
    paintChrome();
    return true;
  }

  async function playCreative(ctx, key) {
    ui.nodes.creative = "run";
    ui.nodes.gate = "idle";
    if (key === "v1") ui.nodes.compliance = "idle";
    setPhase("CREATIVE", key === "v1" ? "创意官撰写初稿" : "创意官按约束修订", "run");
    var stepKey = key === "v1" ? "creative" : "revise";
    var draft = M.getDraft(ctx.brief, key);
    var view = beginCard(
      "创意官 · Creative · " + (key === "v1" ? "初稿" : "修订稿"),
      key === "v1" ? "三个角度，主推放在第一张" : "只替换命中句，其余角度保持",
      ctx.brief.creative.refuses
    );
    if (key === "v2" && ctx.notes.length) {
      view.card.appendChild(el("p", { class: "note-chip" }, "本次约束：" + ctx.notes[ctx.notes.length - 1]));
    }
    var ok = await playTools(ctx, view, stepKey, M.resolveTools(ctx.brief.tools.creative, key));
    if (!ok) return false;
    view.card.appendChild(renderAngles(draft));
    if (key === "v2") {
      view.card.appendChild(el("p", { class: "hint" }, "修订稿来自这条简报的预设安全版本。备注已写入轨迹。演示不会假装现场长出了一套全新句子。"));
    }
    finishCard(view);
    ui.nodes.creative = "done";
    trace("CRE", (key === "v1" ? "初稿" : "修订稿") + "完成 · " + draft.length + " 个角度", stamp(ctx));
    paintChrome();
    return true;
  }

  function openGate(ctx, reason) {
    ui.nodes.gate = "hold";
    var title = reason === "reject" ? "修订稿等待再次放行" : reason === "revise" ? "修订稿已返回" : "创意已提交，合规尚未开始";
    var copy = reason === "reject"
      ? "合规把命中句升成了驳回，并退回创意。请确认修订方向后再次送审。已经删掉的句子不会在下一轮被同一条规则再次击中。"
      : reason === "revise"
        ? "创意官按备注提交了修订。你批准之后，合规才会开始。"
        : "创意官提交了初稿。批准代表你接受这个方向，不代表这些句子已经可以投放。";
    setPhase("HUMAN_GATE", "等待人工决定", "hold");
    els.gateTitle.textContent = title;
    els.gateCopy.textContent = copy;
    els.gateNote.value = reason === "reject"
      ? ctx.brief.flags.map(function (flag) { return flag.fix; }).join("")
      : ctx.brief.defaultReviseNote;
    els.gate.hidden = false;
    els.gate.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    els.gateTitle.setAttribute("tabindex", "-1");
    els.gateTitle.focus();
    trace("ORCH", "状态 HUMAN_GATE · 合规审查未开始", stamp(ctx));
    var opened = performance.now();
    return new Promise(function (resolve) {
      gateResolver = function (action) {
        resolve({
          action: action,
          waited: performance.now() - opened,
          note: els.gateNote.value.trim() || ctx.brief.defaultReviseNote
        });
      };
    });
  }

  function settleGate(action) {
    if (!gateResolver) return;
    var resolve = gateResolver;
    gateResolver = null;
    els.gate.hidden = true;
    resolve(action);
  }

  function pushEvent(text) {
    els.story.appendChild(el("p", { class: "event" }, [el("strong", {}, "闸门 · "), text]));
  }

  function complianceTools(ctx, decision) {
    return M.resolveTools(ctx.brief.tools.compliance).map(function (tool) {
      if (tool.name !== "policy_threshold") return tool;
      var result = decision.verdict === "reject"
        ? "阈值已升为驳回，命中 " + decision.flags.length + " 句。"
        : decision.verdict === "conditional"
          ? "维持观察项，命中 " + decision.flags.length + " 句，任务包将替换。"
          : "未命中已知风险句，通过。";
      return Object.assign({}, tool, { result: result });
    });
  }

  function renderComplianceBody(decision, briefItem) {
    var verdictText = decision.verdict === "reject" ? "驳回 · 退回创意" : decision.verdict === "conditional" ? "条件通过 · 观察项不阻断" : "通过";
    var box = el("div", { class: "verdict " + decision.verdict }, verdictText);
    var list = el("div", { class: "findings" });
    decision.flags.forEach(function (flag) {
      list.appendChild(el("article", { class: "check" }, [
        el("span", { class: "tag" }, flag.level === "fail" ? "驳回" : "观察"),
        el("p", {}, [el("mark", { class: "risk" }, flag.quote)]),
        el("p", { class: "meta-line" }, flag.rule),
        el("p", {}, "改法：" + flag.fix)
      ]));
    });
    if (!decision.flags.length) {
      list.appendChild(el("p", {}, "已知风险句没有出现在本稿。"));
    }
    if (decision.verdict === "conditional") {
      var safe = M.getDraft(briefItem, "v2").filter(function (angle) { return angle.lead; })[0];
      list.appendChild(el("p", {}, "任务包中的主推正文将替换为：" + safe.body));
    }
    if (decision.verdict === "reject") {
      list.appendChild(el("p", {}, "编排器将退回创意官。洞察卡片继续有效，不会重跑。"));
    }
    decision.residual.forEach(function (item) {
      list.appendChild(el("p", { class: "hint" }, "残留 · " + item));
    });
    var wrap = el("div", {});
    wrap.appendChild(box);
    wrap.appendChild(list);
    return wrap;
  }

  async function playCompliance(ctx, strict) {
    ui.nodes.compliance = "run";
    ui.nodes.gate = "done";
    setPhase("COMPLIANCE", strict ? "合规官按严格阈值审查" : "合规官审查", "run");
    var draftKey = ctx.draftKey;
    var decision = M.decideCompliance(ctx.brief, draftKey, strict);
    var view = beginCard("合规官 · Compliance", "引用原句，再决定处置", ctx.brief.analyst ? "不改预算，不替创意写新口号。" : "");
    view.card.querySelector(".refuses").textContent = "不改预算，不替创意写新口号，只引用原句。";
    var ok = await playTools(ctx, view, "compliance", complianceTools(ctx, decision));
    if (!ok) return null;
    view.card.appendChild(renderComplianceBody(decision, ctx.brief));
    finishCard(view);
    if (decision.verdict === "reject") {
      ui.nodes.compliance = "fail";
      ui.loops += 1;
      trace("CMP", "驳回 · " + decision.flags.length + " 句 · 退回创意", stamp(ctx));
    } else {
      ui.nodes.compliance = "done";
      trace("CMP", (decision.verdict === "conditional" ? "条件通过" : "通过") + " · 进入实验设计", stamp(ctx));
    }
    paintChrome();
    return decision;
  }

  async function playAnalyst(ctx) {
    ui.nodes.analyst = "run";
    setPhase("ANALYST", "分析官设计实验", "run");
    var view = beginCard("分析官 · Analyst", ctx.brief.analyst.hypothesis, ctx.brief.analyst.refuses);
    var ok = await playTools(ctx, view, "analyst", M.resolveTools(ctx.brief.tools.analyst));
    if (!ok) return false;
    var body = el("div", { class: "findings" });
    body.appendChild(el("p", {}, "主指标 · " + ctx.brief.analyst.primary));
    body.appendChild(el("p", { class: "meta-line" }, "护栏 · " + ctx.brief.analyst.guardrails.join("；")));
    body.appendChild(el("div", { class: "variants" }, ctx.brief.analyst.variants.map(function (variant) {
      return el("article", { class: "variant" }, [
        el("span", { class: "tag" }, "变体 " + variant.id),
        el("h4", {}, variant.name),
        el("p", {}, variant.detail)
      ]);
    })));
    ["分流：" + ctx.brief.analyst.split, "周期：" + ctx.brief.analyst.duration, "决策：" + ctx.brief.analyst.decision, "预算：" + ctx.brief.analyst.budget, "样本：" + ctx.brief.analyst.sample].forEach(function (line) {
      body.appendChild(el("p", {}, line));
    });
    body.appendChild(el("p", { class: "hint" }, M.SAMPLE_NOTE));
    view.card.appendChild(body);
    finishCard(view);
    ui.nodes.analyst = "done";
    trace("ANL", "实验计划完成 · 主指标 " + ctx.brief.analyst.primary, stamp(ctx));
    paintChrome();
    return true;
  }

  function disposition(ctx) {
    if (ctx.loops > 0) return "严格驳回后通过";
    if (ctx.revisedByHuman) return "人工要求修改后通过";
    return "条件通过，终稿已替换观察句";
  }

  function buildPack(ctx) {
    var angles = M.getDraft(ctx.brief, "v2");
    var modelRows = ui.ledger.filter(function (row) { return row.kind !== "human"; });
    var tokens = modelRows.reduce(function (sum, row) { return sum + row.tokens; }, 0);
    var modelMs = modelRows.reduce(function (sum, row) { return sum + row.ms; }, 0);
    var yuan = modelRows.reduce(function (sum, row) { return sum + row.yuan; }, 0);
    var humanMs = ui.ledger.filter(function (row) { return row.kind === "human"; }).reduce(function (sum, row) { return sum + row.ms; }, 0);
    var shipNote = ctx.loops > 0
      ? "终稿来自驳回后的修订，并再次经过闸门与合规。"
      : ctx.revisedByHuman
        ? "终稿来自你要求的修改，合规未再发现命中句。"
        : "初稿含命中句。默认阈值没有驳回，任务包已换成安全句。轨迹和上方卡片仍保留初稿原文。";
    return {
      brand: ctx.brief.brand,
      product: ctx.brief.product,
      runCode: ctx.runCode,
      disposition: disposition(ctx),
      loops: ctx.loops,
      shipNote: shipNote,
      summary: [
        { label: "目标", value: ctx.brief.objective },
        { label: "受众", value: ctx.brief.audience },
        { label: "市场", value: ctx.brief.market },
        { label: "预算", value: ctx.brief.budget + " / " + ctx.brief.flight },
        { label: "渠道", value: ctx.brief.channels.map(function (ch) { return ch.name + " " + ch.pct + "%"; }).join("，") },
        { label: "约束", value: ctx.brief.constraints.join("；") }
      ],
      angles: angles,
      cleared: ctx.brief.flags,
      residual: ctx.brief.residual,
      ab: ctx.brief.analyst,
      ledger: ui.ledger.slice(),
      tokens: tokens,
      modelMs: modelMs,
      yuan: yuan,
      humanMs: humanMs,
      notes: ctx.notes.slice()
    };
  }

  function renderPack(pack) {
    var root = els.pack;
    root.hidden = false;
    root.innerHTML = "";
    root.appendChild(el("div", { class: "pack-head" }, [
      el("div", {}, [
        el("p", { class: "eyebrow" }, pack.runCode),
        el("h2", { id: "packTitle" }, "任务包 · " + pack.brand)
      ]),
      el("span", { class: "stamp" }, "PACK READY")
    ]));
    root.appendChild(el("p", { class: "meta-line" }, pack.disposition + " · 回环 " + pack.loops + " 次"));
    var grid = el("div", { class: "pack-grid" });
    var summary = el("div", {}, [el("h3", { class: "subhead" }, "简报摘要")]);
    var kv = el("dl", { class: "kv" });
    pack.summary.forEach(function (row) {
      kv.appendChild(el("dt", {}, row.label));
      kv.appendChild(el("dd", {}, row.value));
    });
    summary.appendChild(kv);
    var risks = el("div", {}, [el("h3", { class: "subhead" }, "风险旗标")]);
    var riskList = el("ul", { class: "plain" });
    pack.cleared.forEach(function (flag) {
      riskList.appendChild(el("li", {}, "已从终稿移除「" + flag.quote + "」。" + flag.rule + "。"));
    });
    pack.residual.forEach(function (item) {
      riskList.appendChild(el("li", {}, "残留：" + item));
    });
    risks.appendChild(riskList);
    grid.appendChild(summary);
    grid.appendChild(risks);
    root.appendChild(grid);
    root.appendChild(el("h3", { class: "subhead" }, "创意角度（终稿）"));
    root.appendChild(el("p", {}, pack.shipNote));
    root.appendChild(renderAngles(pack.angles));
    root.appendChild(el("h3", { class: "subhead" }, "A/B 测试计划"));
    var ab = el("div", { class: "findings" }, [
      el("p", {}, "假设 · " + pack.ab.hypothesis),
      el("p", {}, "主指标 · " + pack.ab.primary),
      el("p", { class: "meta-line" }, "护栏 · " + pack.ab.guardrails.join("；")),
      el("p", {}, "分流 · " + pack.ab.split),
      el("p", {}, "周期 · " + pack.ab.duration),
      el("p", {}, "决策 · " + pack.ab.decision),
      el("p", {}, "预算 · " + pack.ab.budget),
      el("p", {}, "样本 · " + pack.ab.sample),
      el("p", { class: "hint" }, M.SAMPLE_NOTE)
    ]);
    root.appendChild(ab);
    var actions = el("div", { class: "row" }, [
      el("button", { type: "button", class: "btn primary", id: "copyPack" }, "复制 Markdown"),
      el("button", { type: "button", class: "btn ghost", id: "savePack" }, "导出 .md")
    ]);
    root.appendChild(actions);
    root.appendChild(el("p", { class: "hint", id: "copyState" }, "导出的是这份任务包的文字版，仍然全部是合成内容。"));
    $("copyPack").addEventListener("click", function () { copyPack(pack); });
    $("savePack").addEventListener("click", function () { savePack(pack); });
    els.jumpPack.hidden = false;
    root.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" });
  }

  function markdown(pack) { return M.buildMarkdown(pack); }

  function copyPack(pack) {
    var text = markdown(pack);
    var state = $("copyState");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        state.textContent = "已复制任务包。";
      }).catch(function () {
        state.textContent = "复制被浏览器拦住了，请改用导出。";
      });
    } else {
      state.textContent = "当前环境不能写入剪贴板，请改用导出。";
    }
  }

  function savePack(pack) {
    var blob = new Blob([markdown(pack)], { type: "text/markdown;charset=utf-8" });
    var link = el("a", { href: URL.createObjectURL(blob), download: "任务包-" + pack.brand + "-" + pack.runCode + ".md" });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function clearBoard() {
    generation += 1;
    if (gateResolver) {
      var resolve = gateResolver;
      gateResolver = null;
      resolve("cancel");
    }
    ui.phase = "IDLE";
    ui.nodes = { research: "idle", creative: "idle", gate: "idle", compliance: "idle", analyst: "idle" };
    ui.loops = 0;
    ui.ledger = [];
    ui.status = "待命";
    ui.tone = "idle";
    ui.runLabel = "";
    els.gate.hidden = true;
    els.pack.hidden = true;
    els.pack.innerHTML = "";
    els.jumpPack.hidden = true;
    els.trace.innerHTML = "";
    els.traceCount.textContent = "0";
    els.traceEmpty.hidden = false;
    emptyStory();
    paintChrome();
  }

  async function run(my) {
    var ctx = {
      my: my,
      brief: brief(),
      simMs: 0,
      notes: [],
      loops: 0,
      draftKey: "v1",
      revisedByHuman: false,
      runCode: "",
      alive: function () { return generation === my; }
    };
    serial += 1;
    ctx.runCode = "WR-" + ctx.brief.code + "-" + String(serial).padStart(2, "0");
    ui.runLabel = ctx.runCode;
    els.story.innerHTML = "";
    if (!await playResearch(ctx)) return;
    if (!await playCreative(ctx, "v1")) return;

    var reason = "fresh";
    var guard = 0;
    var cleared = false;
    while (ctx.alive() && guard < 6) {
      guard += 1;
      var decision = await openGate(ctx, reason);
      if (!ctx.alive() || decision.action === "cancel") return;
      ui.ledger.push({ label: "人工闸门", tokens: 0, ms: decision.waited, yuan: 0, kind: "human", note: decision.action === "approve" ? "批准" : "要求修改" });
      paintChrome();
      trace("HUMAN", (decision.action === "approve" ? "批准并送审" : "要求修改") + " · 真实停留 " + fmtSec(decision.waited), "真实");
      if (decision.action === "revise") {
        ctx.revisedByHuman = true;
        ctx.notes.push(decision.note);
        ctx.draftKey = "v2";
        pushEvent("要求修改。" + decision.note);
        if (!await playCreative(ctx, "v2")) return;
        reason = "revise";
        continue;
      }
      pushEvent("已批准当前方向，送交合规。");
      var strict = els.inject.checked && M.quotesInDraft(ctx.brief, ctx.draftKey).length > 0;
      if (els.inject.checked && !strict) {
        trace("ORCH", "注入仍武装，但这份稿子没有可驳回的命中句。", stamp(ctx));
      }
      var result = await playCompliance(ctx, strict);
      if (!result || !ctx.alive()) return;
      if (result.verdict === "reject") {
        els.inject.checked = false;
        paintChrome();
        ctx.loops = ui.loops;
        ctx.draftKey = "v2";
        ctx.notes.push(ctx.brief.flags.map(function (flag) { return flag.fix; }).join(""));
        pushEvent("合规驳回，已退回创意。注入开关已消耗。");
        trace("ORCH", "回环开始 · 不重跑洞察", stamp(ctx));
        if (!await playCreative(ctx, "v2")) return;
        reason = "reject";
        continue;
      }
      ctx.loops = ui.loops;
      cleared = true;
      break;
    }

    if (!cleared) {
      if (ctx.alive()) trace("ORCH", "修改次数达到演示上限，任务在闸门前停止。", stamp(ctx));
      return;
    }
    if (!await playAnalyst(ctx)) return;
    if (!ctx.alive()) return;
    var pack = buildPack(ctx);
    renderPack(pack);
    ui.nodes.gate = "done";
    setPhase("PACK", "任务包已封装", "done");
    trace("ORCH", "状态 PACK · " + pack.disposition, stamp(ctx));
  }

  async function onStart() {
    if (startLock) return;
    startLock = true;
    clearBoard();
    var my = generation;
    try {
      await run(my);
    } catch (err) {
      console.error(err);
      if (generation === my) trace("ORCH", "演示中断。", "T+0.0s");
    } finally {
      if (generation === my) startLock = false;
      else startLock = false;
      paintChrome();
    }
  }

  function init() {
    els = {
      briefList: $("briefList"),
      briefDetail: $("briefDetail"),
      inject: $("inject"),
      fast: $("fast"),
      runBtn: $("runBtn"),
      resetBtn: $("resetBtn"),
      phaseCode: $("phaseCode"),
      bar: $("bar"),
      pipeline: $("pipeline"),
      loopNote: $("loopNote"),
      orchText: $("orchText"),
      story: $("story"),
      gate: $("gate"),
      gateTitle: $("gateTitle"),
      gateCopy: $("gateCopy"),
      gateNote: $("gateNote"),
      reviseBtn: $("reviseBtn"),
      approveBtn: $("approveBtn"),
      pack: $("pack"),
      trace: $("trace"),
      traceCount: $("traceCount"),
      traceEmpty: $("traceEmpty"),
      jumpPack: $("jumpPack"),
      ledger: $("ledger"),
      runStatus: $("runStatus"),
      cmpBody: $("cmpBody"),
      costLine: $("costLine"),
      saveLine: $("saveLine"),
      singleBody: $("singleBody"),
      live: $("live")
    };
    renderBriefs();
    renderCompare();
    emptyStory();
    paintChrome();
    els.runBtn.addEventListener("click", onStart);
    els.resetBtn.addEventListener("click", function () {
      clearBoard();
      startLock = false;
      paintChrome();
    });
    els.inject.addEventListener("change", paintChrome);
    els.approveBtn.addEventListener("click", function () { settleGate("approve"); });
    els.reviseBtn.addEventListener("click", function () { settleGate("revise"); });
    els.gateNote.addEventListener("keydown", function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        settleGate("approve");
      }
    });
    els.briefList.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") { event.preventDefault(); moveBrief(1); }
      if (event.key === "ArrowUp") { event.preventDefault(); moveBrief(-1); }
      if (event.key === "Home") { event.preventDefault(); selectBrief(M.BRIEFS[0].id); }
      if (event.key === "End") { event.preventDefault(); selectBrief(M.BRIEFS[M.BRIEFS.length - 1].id); }
    });
  }

  init();
})();

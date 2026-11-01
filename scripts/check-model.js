/* Node-only sanity check. The demo itself does not need Node. */
var fs = require("fs");
var vm = require("vm");
var path = require("path");

var sandbox = { console: console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/model.js"), "utf8"), sandbox);
var M = sandbox.WarRoomModel;
if (!M) throw new Error("WarRoomModel missing");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

var happy = M.sumPath(M.HAPPY_PATH);
var loop = M.sumPath(M.LOOP_PATH);
var single = M.stepCost(M.SINGLE);

assert(happy.tokens === 11600, "happy tokens " + happy.tokens);
assert(happy.ms === 13700, "happy ms " + happy.ms);
assert(loop.tokens === 16500, "loop tokens " + loop.tokens);
assert(loop.ms === 18900, "loop ms " + loop.ms);
assert(single.tokens === 7800, "single tokens " + single.tokens);
assert(loop.tokens - happy.tokens === M.STEPS.revise.in + M.STEPS.revise.out + M.STEPS.compliance.in + M.STEPS.compliance.out, "loop delta");
assert(happy.yuan > single.yuan, "multi costs more than single");
assert(loop.yuan > happy.yuan, "loop costs more than happy");

M.BRIEFS.forEach(function (brief) {
  var v1 = M.quotesInDraft(brief, "v1");
  var v2 = M.quotesInDraft(brief, "v2");
  assert(v1.length === brief.flags.length, brief.id + " v1 should hit every flag, got " + v1.length);
  assert(v2.length === 0, brief.id + " v2 still contains " + v2.map(function (f) { return f.quote; }).join(" / "));
  assert(M.decideCompliance(brief, "v1", false).verdict === "conditional", brief.id + " soft");
  assert(M.decideCompliance(brief, "v1", true).verdict === "reject", brief.id + " strict");
  assert(M.decideCompliance(brief, "v2", true).verdict === "pass", brief.id + " v2 strict");
  assert(M.decideCompliance(brief, "v2", false).verdict === "pass", brief.id + " v2 soft");
  assert(brief.channels.reduce(function (s, c) { return s + c.pct; }, 0) === 100, brief.id + " channels");
});

var md = M.buildMarkdown({
  brand: "澄光护肤",
  product: "屏障修护精华「澄」",
  runCode: "WR-CG-01",
  disposition: "严格驳回后通过",
  loops: 1,
  summary: [{ label: "预算", value: "¥600,000" }],
  shipNote: "终稿来自修订。",
  angles: [{ name: "不停用的那一步", lead: true, hook: "h", headline: "t", body: "b", cta: "c", why: "w" }],
  cleared: [{ quote: "敏感肌根治", rule: "绝对化功效", fix: "删除" }],
  residual: ["不收集健康状况"],
  ab: {
    hypothesis: "h",
    primary: "派样核销率",
    guardrails: ["拒审率为 0"],
    variants: [{ id: "A", name: "A", detail: "d" }],
    split: "50/50",
    duration: "10 天",
    decision: "护栏优先",
    budget: "¥120,000",
    sample: "13,000"
  },
  ledger: [{ kind: "model", label: "洞察官", tokens: 3200, ms: 4200, yuan: 0.023 }],
  tokens: 3200,
  modelMs: 4200,
  yuan: 0.023,
  humanMs: 0,
  notes: []
});
assert(md.indexOf("## 简报摘要") !== -1, "md summary");
assert(md.indexOf("## 风险旗标") !== -1, "md risk");
assert(md.indexOf("## A/B 测试计划") !== -1, "md ab");
assert(md.indexOf("敏感肌根治") !== -1, "md flag");

console.log("model ok", M.BRIEFS.length, "briefs; happy", happy.tokens, "tok; loop", loop.tokens, "tok");

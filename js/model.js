/* Synthetic mission data and pure policy. No network. No secrets. */
(function (root) {
  "use strict";

  var RATE = { inPerK: 0.004, outPerK: 0.012 };

  var STEPS = {
    research: { in: 1900, out: 1300, ms: 4200, actor: "RES", label: "洞察官" },
    creative: { in: 1700, out: 1600, ms: 3900, actor: "CRE", label: "创意官" },
    revise: { in: 1500, out: 1200, ms: 2800, actor: "CRE", label: "创意官·修订" },
    compliance: { in: 1400, out: 800, ms: 2400, actor: "CMP", label: "合规官" },
    analyst: { in: 1600, out: 1300, ms: 3200, actor: "ANL", label: "分析官" }
  };

  var SINGLE = { in: 4200, out: 3600, ms: 9000, label: "单 Agent" };
  var HAPPY_PATH = ["research", "creative", "compliance", "analyst"];
  var LOOP_PATH = ["research", "creative", "compliance", "revise", "compliance", "analyst"];

  var SAMPLE_NOTE =
    "演示粗算：双侧比例检验近似，α=0.05，把握度 0.8，希望看见 15% 的相对差异。不是上线样本量。";

  function stepCost(step) {
    return {
      tokens: step.in + step.out,
      ms: step.ms,
      yuan: (step.in / 1000) * RATE.inPerK + (step.out / 1000) * RATE.outPerK,
      in: step.in,
      out: step.out,
      label: step.label,
      actor: step.actor
    };
  }

  function sumPath(keys) {
    return keys.reduce(
      function (acc, key) {
        var cost = stepCost(STEPS[key]);
        acc.tokens += cost.tokens;
        acc.ms += cost.ms;
        acc.yuan += cost.yuan;
        acc.rows.push({ key: key, tokens: cost.tokens, ms: cost.ms, yuan: cost.yuan, label: cost.label, kind: "model" });
        return acc;
      },
      { tokens: 0, ms: 0, yuan: 0, rows: [] }
    );
  }

  function collectStrings(value, out) {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(function (item) { collectStrings(item, out); });
    else if (value && typeof value === "object") {
      Object.keys(value).forEach(function (key) { collectStrings(value[key], out); });
    }
  }

  function getDraft(brief, key) {
    return brief.creative.angles.map(function (angle) {
      var copy = Object.assign({}, angle);
      if (key === "v2") Object.assign(copy, brief.creative.revisions[angle.id] || {});
      return copy;
    });
  }

  function quotesInDraft(brief, key) {
    var bag = [];
    collectStrings(getDraft(brief, key), bag);
    var hay = bag.join("\n");
    return brief.flags.filter(function (flag) { return hay.indexOf(flag.quote) !== -1; });
  }

  function decideCompliance(brief, key, strict) {
    var hits = quotesInDraft(brief, key);
    if (!hits.length) {
      return { verdict: "pass", flags: [], residual: brief.residual.slice() };
    }
    if (strict) {
      return {
        verdict: "reject",
        flags: hits.map(function (flag) { return Object.assign({ level: "fail" }, flag); }),
        residual: brief.residual.slice()
      };
    }
    return {
      verdict: "conditional",
      flags: hits.map(function (flag) { return Object.assign({ level: "watch" }, flag); }),
      residual: brief.residual.slice()
    };
  }

  function resolveTools(list, pass) {
    return list.map(function (tool) {
      return {
        name: tool.name,
        beat: tool.beat,
        args: tool.args,
        result: pass === "v2" && tool.resultV2 ? tool.resultV2 : tool.result
      };
    });
  }

  function money(yuan) {
    return "¥" + yuan.toFixed(3);
  }

  function buildMarkdown(pack) {
    var lines = [];
    lines.push("# 投放任务包 · " + pack.brand);
    lines.push("");
    lines.push("> 合成演示数据。不是投放方案，也不是法律意见。");
    lines.push("");
    lines.push("- 编号：" + pack.runCode);
    lines.push("- 产品：" + pack.product);
    lines.push("- 处置：" + pack.disposition);
    lines.push("- 回环：" + pack.loops + " 次");
    lines.push("");
    lines.push("## 简报摘要");
    lines.push("");
    pack.summary.forEach(function (row) {
      lines.push("- " + row.label + "：" + row.value);
    });
    lines.push("");
    lines.push("## 创意角度（终稿）");
    lines.push("");
    lines.push(pack.shipNote);
    lines.push("");
    pack.angles.forEach(function (angle, index) {
      lines.push("### " + (index + 1) + ". " + angle.name + (angle.lead ? "（主推）" : ""));
      lines.push("");
      lines.push("- 钩子：" + angle.hook);
      lines.push("- 标题：" + angle.headline);
      lines.push("- 正文：" + angle.body);
      lines.push("- CTA：" + angle.cta);
      lines.push("- 依据：" + angle.why);
      lines.push("");
    });
    lines.push("## 风险旗标");
    lines.push("");
    if (!pack.cleared.length) lines.push("- 终稿未保留已知命中句。");
    pack.cleared.forEach(function (flag) {
      lines.push("- 已从终稿移除 「" + flag.quote + "」 · " + flag.rule + "。改法：" + flag.fix);
    });
    pack.residual.forEach(function (item) {
      lines.push("- 残留：" + item);
    });
    lines.push("");
    lines.push("## A/B 测试计划");
    lines.push("");
    lines.push("- 假设：" + pack.ab.hypothesis);
    lines.push("- 主指标：" + pack.ab.primary);
    lines.push("- 护栏：" + pack.ab.guardrails.join("；"));
    pack.ab.variants.forEach(function (variant) {
      lines.push("- 变体 " + variant.id + "：" + variant.name + "。" + variant.detail);
    });
    lines.push("- 分流：" + pack.ab.split);
    lines.push("- 周期：" + pack.ab.duration);
    lines.push("- 决策：" + pack.ab.decision);
    lines.push("- 预算：" + pack.ab.budget);
    lines.push("- 样本：" + pack.ab.sample);
    lines.push("- 口径：" + SAMPLE_NOTE);
    lines.push("");
    lines.push("## 账本");
    lines.push("");
    pack.ledger.forEach(function (row) {
      if (row.kind === "human") {
        lines.push("- " + row.label + " · 真实等待 " + (row.ms / 1000).toFixed(1) + "s · " + row.note);
      } else {
        lines.push("- " + row.label + " · " + row.tokens + " tok · 模型 " + (row.ms / 1000).toFixed(1) + "s · " + money(row.yuan));
      }
    });
    lines.push("");
    lines.push("模型合计 " + pack.tokens + " tok · " + (pack.modelMs / 1000).toFixed(1) + "s · " + money(pack.yuan) + "。人工等待 " + (pack.humanMs / 1000).toFixed(1) + "s，不计入模型费用。");
    lines.push("");
    if (pack.notes.length) {
      lines.push("## 人工备注");
      lines.push("");
      pack.notes.forEach(function (note) { lines.push("- " + note); });
      lines.push("");
    }
    lines.push("计价常数仅用于演示：输入 " + RATE.inPerK + " 元/千 token，输出 " + RATE.outPerK + " 元/千 token。");
    return lines.join("\n");
  }

  var BRIEFS = [
    {
      id: "lanchuan",
      code: "LC",
      brand: "岚川茶饮",
      product: "冷萃乌龙「山雾」",
      category: "新茶饮",
      sensitivity: "中",
      sensitivityNote: "食品广告，功效句一出现就越线。",
      objective: "四周内让「山雾」被记住，并把记忆换成到店核销。",
      audience: "18–26 岁，每天喝咖啡，厌烦第三杯美式带来的心跳。",
      market: "上海 / 杭州 / 成都",
      budget: "¥480,000",
      flight: "4 周",
      channels: [
        { name: "抖音信息流", pct: 55 },
        { name: "小红书", pct: 30 },
        { name: "电梯智能屏", pct: 15 }
      ],
      kpis: ["完播率 ≥ 35%", "到店券核销 CPA ≤ ¥18"],
      constraints: ["不得写保健功效", "不得点名贬低咖啡品牌"],
      defaultReviseNote: "删掉健康比较和排浊说法，保留傍晚场景。",
      recommendInject: false,
      research: {
        refuses: "不写口号，不把推断说成测量。",
        summary: "空白在咖啡因体感，不在水果特写。决策窗更像傍晚而不是午餐。",
        hypotheses: [
          { kind: "测量", title: "决策窗在傍晚", detail: "演示趋势里，18:00–21:00 占检索的 46%。到店券应绑在 17:00 之后。" },
          { kind: "测量", title: "水果特写已经饱和", detail: "竞品抽查里 82% 的素材是水果。山雾不拼果切。" },
          { kind: "推断", title: "厌烦的是心跳，不是咖啡", detail: "合成访谈口径，只够写角度，不够拿来分配预算。" }
        ],
        gap: "冷萃乌龙仍需要教育，但教育放字幕，不占前三秒。",
        timing: "入夏前三周检索上升。四周投放盖得住窗口，不适合拍长线品牌片。"
      },
      creative: {
        refuses: "不自判合规，不改洞察里的数字。",
        angles: [
          {
            id: "mist",
            name: "雾息",
            lead: true,
            hook: "第三杯美式之前，先换一口气。",
            headline: "山雾冷萃，清醒停在刚好。",
            body: "晚高峰之后，把苦换成凉。比咖啡更健康，也帮你排掉下午的浊气。",
            cta: "领一张晚间到店券",
            why: "用傍晚决策窗，不占用午餐档。"
          },
          {
            id: "counter",
            name: "晚风柜台",
            lead: false,
            hook: "柜台上的三秒。",
            headline: "下班的第一口，可以不苦。",
            body: "店员把冰杯推过来，不讲话。字幕只给地址和券。",
            cta: "看离你最近的一家",
            why: "把核销放进动作，不放进口号。"
          },
          {
            id: "thermo",
            name: "十八度",
            lead: false,
            hook: "不是更冰，是刚好的凉。",
            headline: "一杯，十八度。",
            body: "画面只有杯壁和水雾。数字放字幕，不放承诺。",
            cta: "预约一杯山雾",
            why: "避开已经拥挤的水果特写。"
          }
        ],
        revisions: {
          mist: { body: "晚高峰之后，把苦换成凉。少一杯苦，多一口雾。" }
        }
      },
      flags: [
        { quote: "比咖啡更健康", rule: "比较型健康承诺", fix: "删除和咖啡的健康比较，只留口味与场景。" },
        { quote: "排掉下午的浊气", rule: "功效暗示", fix: "删除排浊、醒脑一类表达。" }
      ],
      residual: [
        "实拍口味必须和在售单品一致。",
        "不出现医疗器具，也不表演身体不适。"
      ],
      analyst: {
        refuses: "不新增强承诺，不在实验中途改句子。",
        hypothesis: "傍晚场景剧比静物参数片更能带来到店核销。",
        primary: "到店券核销 CPA",
        guardrails: ["完播率不低于 28%", "素材负反馈不高于账户基线", "品牌搜索不下降"],
        variants: [
          { id: "A", name: "雾息 · 15 秒", detail: "晚高峰，不苦，不出现健康句。" },
          { id: "B", name: "十八度 · 6 秒", detail: "杯壁和水雾，数字只在字幕。" }
        ],
        split: "50/50，按城市分层，不先按兴趣组切开。",
        duration: "7 天看方向，14 天做取舍。测试预算占四周的 20%。",
        decision: "核销 CPA 相对差超过 15%，且完播率守住，胜出组放到 70%。否则保持对半，回看素材，不加价。",
        budget: "测试 ¥96,000；放量 ¥384,000。电梯屏不进 A/B，只做到达提醒。",
        sample: "点击到核销按 8% 粗算，每臂约 8,000 次点击。"
      },
      tools: {
        research: [
          { name: "trend_scan", beat: "读取近 90 天检索", args: { query: "冷萃乌龙", geo: ["上海", "杭州", "成都"], window: "90d" }, result: "演示指数 +38%，18:00–21:00 占 46%。" },
          { name: "competitor_ads", beat: "抽查头部茶饮素材", args: { set: "新茶饮 TOP8", days: 30 }, result: "82% 含水果特写，约 6% 提到咖啡因体感。" }
        ],
        creative: [
          { name: "angle_frame", beat: "用洞察搭角度骨架", args: { use: ["傍晚决策窗", "避开水果特写"], tone: "清冷、少字" }, result: "三个骨架：雾息、晚风柜台、十八度。尚未填承诺句。" },
          { name: "line_draft", beat: "填写标题和正文", args: { avoid: ["功效", "点名贬低"] }, result: "初稿完成。角色内不自删越线句。", resultV2: "只替换命中句，其余角度不动。" }
        ],
        compliance: [
          { name: "claim_lint", beat: "逐句扫描承诺", args: { market: "CN", category: "food" }, result: "返回命中句，不附带处置。" },
          { name: "policy_threshold", beat: "读取当前处置阈值", args: { policy: "food.claim" }, result: "观察项，条件通过。", resultV2: "观察项，条件通过。", resultStrict: "阈值已升为驳回。" }
        ],
        analyst: [
          { name: "experiment_design", beat: "只在安全句上设计对照", args: { primary: "到店券核销 CPA", arms: 2 }, result: "场景剧对静物。电梯屏排除在实验外。" },
          { name: "sample_size_sketch", beat: "粗算每臂点击", args: { baseline: 0.08, mde: 0.15, alpha: 0.05, power: 0.8 }, result: "每臂约 8,000 次点击。演示粗算。" }
        ]
      },
      singleBlob: "岚川山雾比咖啡更健康，能排掉下午的浊气，年轻人会喜欢，四十八万都投抖音，标题用排毒醒脑，CPA 做到 18 块没问题，竞品都是水果所以我们拍山，完播率按 35% 写进方案就行。"
    },
    {
      id: "beiji",
      code: "BJ",
      brand: "北境户外",
      product: "超轻硬壳「一盎司」",
      category: "服饰装备",
      sensitivity: "中",
      sensitivityNote: "防水可以说，但不能说死。",
      objective: "六周预售把「塞进通勤包」讲清楚，并换成定金。",
      audience: "25–40 岁，工作日通勤，周末短途，包已经够多。",
      market: "北京 / 上海 / 深圳",
      budget: "¥720,000",
      flight: "6 周",
      channels: [
        { name: "B站", pct: 40 },
        { name: "小红书", pct: 35 },
        { name: "视频号", pct: 25 }
      ],
      kpis: ["定金 CPA ≤ ¥90", "商品页加购率"],
      constraints: ["防水必须带口径", "不得写终身、全天候、任何暴雨"],
      defaultReviseNote: "去掉绝对化防水，参数改成带口径的实验室数字。",
      recommendInject: false,
      research: {
        refuses: "不把素材观察写成需求证明。",
        summary: "先让人看懂这是日常外套，专业参数从第四秒以后再出现。",
        hypotheses: [
          { kind: "测量", title: "收纳比参数更先被看完", detail: "演示素材里，「叠进托特包」的前三秒完播高于登山脸。数字只服务这条简报。" },
          { kind: "测量", title: "参数仍然决定信任", detail: "放到第四秒之后，演示跳出下降。人要先认出这是日常外套。" },
          { kind: "推断", title: "城市夜雨空镜少", detail: "竞品集中在雪线和笑脸。这是素材观察，不是需求规模。" }
        ],
        gap: "硬壳广告在比赛谁更像运动员。空白是工作日也穿着的壳。",
        timing: "入秋换季前。前两周只买测试，参数口径没锁定之前不放量。"
      },
      creative: {
        refuses: "不自判合规，不发明检测数字以外的新口径。",
        angles: [
          {
            id: "tote",
            name: "托特包实验",
            lead: true,
            hook: "先看它怎么进包。",
            headline: "一盎司，叠进你已经有的包。",
            body: "不用换包。折叠两次，放进通勤托特。任何暴雨都不进水，终身防水。",
            cta: "付定金，锁定预售价",
            why: "先回答收纳，再给信任状。"
          },
          {
            id: "rain",
            name: "最后八百米",
            lead: false,
            hook: "出了地铁还要走。",
            headline: "夜雨的最后八百米。",
            body: "从地铁口到家，不讲征服。只讲一件可以留在工位的壳。",
            cta: "看克重和折叠尺寸",
            why: "用城市距离，不用雪线。"
          },
          {
            id: "spec",
            name: "参数后置",
            lead: false,
            hook: "前三秒没有数字。",
            headline: "先穿上，再谈毫米。",
            body: "数字从第四秒开始。没有数字之前，不出现承诺。",
            cta: "查看参数表",
            why: "把信任状放到看懂品类之后。"
          }
        ],
        revisions: {
          tote: { body: "不用换包。折叠两次，放进通勤托特。实验室静水压 20,000 mm，接缝压胶，口径见字幕。" }
        }
      },
      flags: [
        { quote: "任何暴雨都不进水", rule: "绝对化防水", fix: "改为带测试口径的表述，或删除。" },
        { quote: "终身防水", rule: "绝对化承诺", fix: "删除「终身」。" }
      ],
      residual: [
        "静水压必须和检测报告一致，否则改成定性说法。",
        "定金规则和发货日写在落地页，不写进前三秒。"
      ],
      analyst: {
        refuses: "不在读数期间替换文案，不把参数页跳出当成创意失败。",
        hypothesis: "「折叠进包」比「夜雨情绪」更能带来定金。",
        primary: "预售定金 CPA",
        guardrails: ["加购率不下降", "评论区不聚集「虚假防水」", "参数页跳出不高于基线"],
        variants: [
          { id: "A", name: "托特包实验 · 20 秒", detail: "只展示折叠和带口径的静水压。" },
          { id: "B", name: "夜雨最后八百米 · 15 秒", detail: "城市距离，不出现绝对化防水。" }
        ],
        split: "50/50，按城市分层。",
        duration: "10 天读数。未分胜负就延长 7 天，中途不改句子。",
        decision: "定金 CPA 改善超过 15%，且评论区没有防水质疑聚集，胜出组拿 70% 预售预算。",
        budget: "测试 ¥144,000，占 20%。其余等口径确认后再释放。",
        sample: "定金转化按访问的 3% 粗算，每臂约 22,000 次访问。"
      },
      tools: {
        research: [
          { name: "trend_scan", beat: "对比通勤词和专业词", args: { queries: ["通勤 硬壳", "冲锋衣 专业"], window: "60d" }, result: "演示检索里通勤词上升，专业词持平。" },
          { name: "competitor_ads", beat: "给开口镜头分类", args: { n: 40, category: "硬壳" }, result: "31 条以山脊人脸开头，6 条是城市夜雨。" }
        ],
        creative: [
          { name: "angle_frame", beat: "先收纳，后参数", args: { lead: "折叠进包" }, result: "三个骨架：托特包、八百米、参数后置。" },
          { name: "line_draft", beat: "填写防水相关句子", args: { mustQualify: true }, result: "初稿仍写入绝对化防水，留给合规官。", resultV2: "绝对化句子已换成带口径的实验室表述。" }
        ],
        compliance: [
          { name: "claim_lint", beat: "扫描绝对化用语", args: { market: "CN", category: "apparel" }, result: "返回命中句，不附带处置。" },
          { name: "policy_threshold", beat: "读取防水表述阈值", args: { policy: "absolute.waterproof" }, result: "观察项，条件通过。", resultStrict: "阈值已升为驳回。" }
        ],
        analyst: [
          { name: "experiment_design", beat: "定金实验，不改口径", args: { primary: "定金 CPA" }, result: "折叠实验对照夜雨情绪。参数表留在落地页。" },
          { name: "sample_size_sketch", beat: "按 3% 定金率粗算", args: { baseline: 0.03, mde: 0.15 }, result: "每臂约 22,000 次访问。演示粗算。" }
        ]
      },
      singleBlob: "北境一盎司任何暴雨都不进水，终身防水，比专业品牌更适合城市人，七十二万投小红书和视频号，标题写永不进水，定金 CPA 控制在 90，登山脸的素材也一起上，参数随便放。"
    },
    {
      id: "chenguang",
      code: "CG",
      brand: "澄光护肤",
      product: "屏障修护精华「澄」",
      category: "护肤品",
      sensitivity: "高",
      sensitivityNote: "医疗化措辞会先于 ROI 出问题。适合演示回环。",
      objective: "换季五周，拦住「刺痛」相关搜索，把派样交给会员，不把病症写成承诺。",
      audience: "25–35 岁，已有护肤流程，换季会不舒服，但这个故事不消费诊断。",
      market: "全国电商，口吻按一二线城市来写",
      budget: "¥600,000",
      flight: "5 周",
      channels: [
        { name: "小红书", pct: 50 },
        { name: "天猫", pct: 30 },
        { name: "私域派样", pct: 20 }
      ],
      kpis: ["搜索进店成本", "派样核销率", "评论区不承接医疗咨询"],
      constraints: ["不得疾病治疗", "不得医生背书", "不得根治", "不得用前后对比暗示治愈"],
      defaultReviseNote: "删掉天数、皮炎、医生和根治。只留换季保湿的主观体验。",
      recommendInject: true,
      research: {
        refuses: "不把症状词检索写成患病人数。",
        summary: "意图在换季不适，不在「治好」。类目正在用医生和天数换点击。",
        hypotheses: [
          { kind: "测量", title: "症状词大于品牌词", detail: "演示检索里「换季 刺痛」高于「修护 精华」。更靠近拦截搜索，而不是先做品牌片。" },
          { kind: "测量", title: "高点击和高质疑绑在一起", detail: "合成笔记抽查：含医生、天数、根治的标题互动更高，评论质疑也更集中。" },
          { kind: "推断", title: "他们要留住原来的流程", detail: "不是再叠一个更猛的活性。这是角度，不是事实。" }
        ],
        gap: "类目在卷医疗感和前后对比。跟着卷，审核和口碑会先出事。空白是把修护说成保湿和主观舒适。",
        timing: "换季窗口五周。第一周只投已经能过审的句子。"
      },
      creative: {
        refuses: "不自判合规，不借用未授权的专家。",
        angles: [
          {
            id: "routine",
            name: "不停用的那一步",
            lead: true,
            hook: "不是更猛，是你敢继续用。",
            headline: "换季了，流程先别推倒。",
            body: "屏障精华「澄」。7 天修好皮炎。皮肤科医生私藏，敏感肌根治。",
            cta: "会员领派样",
            why: "对准保留流程，不对准疾病。"
          },
          {
            id: "diary",
            name: "十四天记录",
            lead: false,
            hook: "记录比承诺难。",
            headline: "一张不打分的换季日记。",
            body: "脚本需标明是演绎。只记录涂抹和主观感受，不出现诊断，也不做红肿对比。",
            cta: "看日记怎么拍",
            why: "用时间的具体，替换天数疗效。"
          },
          {
            id: "brick",
            name: "给墙补砖",
            lead: false,
            hook: "把成分说成人话。",
            headline: "神经酰胺，像给墙补砖。",
            body: "只解释和保湿有关的成分。不延伸到治疗，不引用未授权专家。",
            cta: "查看成分表",
            why: "科普可以建立信任，不能借科普看病。"
          }
        ],
        revisions: {
          routine: { body: "屏障精华「澄」。换季不适的日子，帮你把原来的保湿步骤做完。个人体验，非医疗建议。" }
        }
      },
      flags: [
        { quote: "7 天修好皮炎", rule: "疾病治疗承诺", fix: "删除天数和皮炎。" },
        { quote: "皮肤科医生私藏", rule: "不可证实的专业背书", fix: "删除医生形象和「私藏」。" },
        { quote: "敏感肌根治", rule: "绝对化功效", fix: "删除「根治」。" }
      ],
      residual: [
        "口播或字幕保留「个人体验，非医疗建议」。",
        "不得使用治疗前后的皮肤对比。",
        "派样页不收集健康状况。"
      ],
      analyst: {
        refuses: "护栏破了就停，不用出价去硬顶拒审。",
        hypothesis: "「保留原流程」比「成分比喻」更能带来派样核销，同时更少把医疗咨询引进评论区。",
        primary: "派样核销率",
        guardrails: ["评论区医疗咨询占比不升高", "素材拒审率为 0", "退货原因不出现「没治好」"],
        variants: [
          { id: "A", name: "不停用的那一步", detail: "只使用修订后的主观体验句。" },
          { id: "B", name: "给墙补砖", detail: "成分比喻，不延伸到治疗。" }
        ],
        split: "50/50。日记角度不进首轮，等「演绎」标注流程跑通。",
        duration: "五周里的前 10 天。任一变体被拒审，立即暂停该变体。",
        decision: "核销率差超过 15%，且医疗咨询护栏守住，才放量。护栏破了，赢的那组也停。",
        budget: "测试 ¥120,000。私域 20% 不进竞价，只承接派样。",
        sample: "核销率按 5% 粗算，每臂约 13,000 次进店。"
      },
      tools: {
        research: [
          { name: "search_intent", beat: "比较症状词和品牌词", args: { queries: ["换季刺痛", "屏障修护"], synthetic: true }, result: "症状词高于品牌词。不可当成患病人数。" },
          { name: "note_audit", beat: "抽查标题和评论质疑", args: { sample: 30, synthetic: true }, result: "含医生、天数、根治的标题互动更高，质疑也更集中。" }
        ],
        creative: [
          { name: "angle_frame", beat: "避开疾病叙事", args: { lead: "保留原流程" }, result: "三个骨架：不停用、日记、补砖。日记需标注演绎。" },
          { name: "line_draft", beat: "填写主推正文", args: { category: "cosmetics" }, result: "初稿混入治疗、背书和绝对化功效。", resultV2: "主推正文改为主观体验，并写入非医疗建议。" }
        ],
        compliance: [
          { name: "claim_lint", beat: "扫描疾病与背书", args: { market: "CN", category: "cosmetics" }, result: "返回命中句，不附带处置。" },
          { name: "policy_threshold", beat: "读取类目阈值", args: { policy: "cosmetics.medical" }, result: "观察项，条件通过。", resultStrict: "阈值已升为驳回。" }
        ],
        analyst: [
          { name: "experiment_design", beat: "护栏优先于放量", args: { primary: "派样核销率", guard: "医疗咨询" }, result: "日记不进首轮。拒审即停，不抬出价。" },
          { name: "sample_size_sketch", beat: "按 5% 核销率粗算", args: { baseline: 0.05, mde: 0.15 }, result: "每臂约 13,000 次进店。演示粗算。" }
        ]
      },
      singleBlob: "澄光精华 7 天修好皮炎，皮肤科医生都在私藏，敏感肌可以根治，预算六十万里一半小红书一半搜索，标题直接写根治，前后对比图会更好，成分是神经酰胺所以按药妆来讲，CPA 压到 40。"
    },
    {
      id: "guiji",
      code: "GJ",
      brand: "轨迹出行",
      product: "城市电动车月租",
      category: "出行订阅",
      sensitivity: "高",
      sensitivityNote: "价格和补贴句子必须能被一张账单复核。",
      objective: "八周里让刚工作不久的人完成首月订阅。比较句要能被账单复核。",
      audience: "毕业 1–3 年，单程 8–20 公里，还没打算买车。",
      market: "杭州 / 成都 / 武汉（演示开通城市）",
      budget: "¥900,000",
      flight: "8 周",
      channels: [
        { name: "抖音", pct: 45 },
        { name: "朋友圈", pct: 30 },
        { name: "校园线下", pct: 25 }
      ],
      kpis: ["首月订阅 CPA", "7 日留存", "补贴相关投诉为 0"],
      constraints: ["不得零风险", "不得无口径比价", "不得暗示政府补贴"],
      defaultReviseNote: "去掉零风险、笼统比价和补贴暗示。对比要写城市和样本周。",
      recommendInject: true,
      research: {
        refuses: "不把落地页小实验说成品牌结论。",
        summary: "能说的是一张可复核的样例账单和网点密度。说不了的是每个人都更省。",
        hypotheses: [
          { kind: "测量", title: "订阅不是买车决策", detail: "三座演示城市里，「电动车 月租」稳定，「买车 首付」波动大。" },
          { kind: "测量", title: "首屏先给价格", detail: "演示页面实验：价格在前的跳出更低。只够决定首屏。" },
          { kind: "推断", title: "身份句可能更安全", detail: "「不买车也可以」也许比省钱句更不容易违规。能不能转化，要测。" }
        ],
        gap: "出行广告爱说绝对省钱。轨迹的空白是口径，不是更响的省钱口号。",
        timing: "毕业季后八周仍覆盖入职通勤。前两周只跑带口径的对比。"
      },
      creative: {
        refuses: "不自判合规，不把样例账单说成个人收益。",
        angles: [
          {
            id: "bill",
            name: "算给你看",
            lead: true,
            hook: "先看账单，再决定爱不爱。",
            headline: "一张写得清城市的月账单。",
            body: "零风险入手，比地铁更省，还有你不知道的政府补贴。",
            cta: "按城市查看月租",
            why: "对比可以存在，但必须能复核。"
          },
          {
            id: "adult",
            name: "不买车的成年人",
            lead: false,
            hook: "还没到买车的时候。",
            headline: "通勤可以先订阅。",
            body: "不讨论资产，也不讨论身份升级。只讨论这八到二十公里。",
            cta: "看是否覆盖你的通勤",
            why: "避开金融承诺，把转化留给实验。"
          },
          {
            id: "grid",
            name: "充满再走",
            lead: false,
            hook: "网点比口号有用。",
            headline: "还车之前，先看地图。",
            body: "后半段给出开通城区和网点，不讲政策红利。",
            cta: "打开覆盖地图",
            why: "服务密度是可以检查的事实。"
          }
        ],
        revisions: {
          bill: { body: "样例账单：杭州，某一周网约车 4 次，对比月租。字幕写明日期范围。不承诺你也更省。" }
        }
      },
      flags: [
        { quote: "零风险", rule: "误导性风险承诺", fix: "删除「零风险」。" },
        { quote: "比地铁更省", rule: "无口径比较", fix: "改成指定城市、指定样本周的样例账单。" },
        { quote: "政府补贴", rule: "不存在的政策暗示", fix: "删除任何补贴表达。" }
      ],
      residual: [
        "账单过期或换城，素材必须下线。",
        "首月价格以结算页为准，字幕价格和结算页同源。",
        "校园物料和线上用同一句口径。"
      ],
      analyst: {
        refuses: "价格日历一变就停实验，不让旧句子继续花预算。",
        hypothesis: "带口径的账单比身份句更能带来首月订阅，同时更少引发补贴投诉。",
        primary: "首月订阅 CPA",
        guardrails: ["7 日留存不低于演示基线", "补贴相关投诉为 0", "结算价和字幕价一致"],
        variants: [
          { id: "A", name: "样例账单", detail: "杭州、指定一周、网约车 4 次对月租。" },
          { id: "B", name: "不买车的成年人", detail: "身份句，不出现价格比较。" }
        ],
        split: "50/50，按城市分层。校园线下不进竞价拆分。网点地图留在落地页。",
        duration: "14 天。价格一日历变化，实验停止。",
        decision: "CPA 改善超过 15% 且补贴投诉为 0 才放量。出现补贴投诉，两组都停，先改句子。",
        budget: "测试 ¥180,000。其余 80% 等首轮结论，不预支。",
        sample: "订阅转化按访问的 4% 粗算，每臂约 17,000 次访问。"
      },
      tools: {
        research: [
          { name: "geo_demand", beat: "看三座开通城市", args: { cities: ["杭州", "成都", "武汉"], q: "电动车月租" }, result: "三城都有演示需求。武汉更适合做距离样例，账单仍用杭州。" },
          { name: "page_order", beat: "比较首屏顺序", args: { variants: ["价格在前", "网点在前"], synthetic: true }, result: "价格在前的演示跳出更低。只决定首屏。" }
        ],
        creative: [
          { name: "angle_frame", beat: "把省钱收成可复核账单", args: { lead: "样例账单" }, result: "三个骨架：账单、身份、网点。" },
          { name: "line_draft", beat: "填写价格相关句子", args: { requireScope: true }, result: "初稿出现零风险、无口径比价和补贴暗示。", resultV2: "比价已收成带城市和日期的样例账单。" }
        ],
        compliance: [
          { name: "claim_lint", beat: "扫描价格与补贴", args: { market: "CN", category: "subscription" }, result: "返回命中句，不附带处置。" },
          { name: "policy_threshold", beat: "读取金融表述阈值", args: { policy: "finance.compare" }, result: "观察项，条件通过。", resultStrict: "阈值已升为驳回。" }
        ],
        analyst: [
          { name: "experiment_design", beat: "账单对照身份句", args: { primary: "首月订阅 CPA", stop: "补贴投诉" }, result: "网点不进首轮实验。投诉出现则两组都停。" },
          { name: "sample_size_sketch", beat: "按 4% 订阅率粗算", args: { baseline: 0.04, mde: 0.15 }, result: "每臂约 17,000 次访问。演示粗算。" }
        ]
      },
      singleBlob: "轨迹月租零风险，比地铁更省，还有政府补贴很多人不知道，预算九十万全投抖音，毕业生就该不买车，CPA 一定低于打车，留存以后再说，先把量做上来。"
    }
  ];

  root.WarRoomModel = {
    RATE: RATE,
    STEPS: STEPS,
    SINGLE: SINGLE,
    HAPPY_PATH: HAPPY_PATH,
    LOOP_PATH: LOOP_PATH,
    SAMPLE_NOTE: SAMPLE_NOTE,
    BRIEFS: BRIEFS,
    stepCost: stepCost,
    sumPath: sumPath,
    getDraft: getDraft,
    quotesInDraft: quotesInDraft,
    decideCompliance: decideCompliance,
    resolveTools: resolveTools,
    money: money,
    buildMarkdown: buildMarkdown
  };
})(typeof window !== "undefined" ? window : globalThis);

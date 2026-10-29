/* ══════════════════════════════════════════════════════════════
   js/rank-data.js —— 由 tools/fetch-rank.mjs 生成的快照，勿手改

   来源：https://artificialanalysis.ai/zh/leaderboards/models
   抓取：2026-10-28T21:08:55+08:00 · 原始 272 条 → 保留 37 条
   重抓：node tools/fetch-rank.mjs（会让 /#/rank 的数字换成最新一版）
   ══════════════════════════════════════════════════════════════ */
(function (root) {
  var DATA = {
    meta: {
      "source": "https://artificialanalysis.ai/zh/leaderboards/models",
      "sourceLabel": "Artificial Analysis · Model Leaderboard",
      "mode": "scraped",
      "indexVersion": "5",
      "fetchedAt": "2026-10-28T21:08:55+08:00",
      "asOf": "2026-10-28",
      "cadenceDays": 7,
      "nextDue": "2026-11-04",
      "rawModels": 272,
      "keptModels": 37,
      "coverage": "37/272",
      "mergedVariants": 39,
      "skippedNoIndex": 196,
      "skippedDeprecated": 0,
      "cnModels": 12,
      "unmappedCreators": [],
      "prevAsOf": null,
      "prevIndexVersion": "5"
    },
    models: [
    {"n":"Claude Opus 5.5","o":"Anthropic","g":"us","op":0,"r":1,"cx":1000000,"ii":58.4,"ie":null,"bs":1799.7,"fc":46.4,"tb":59.6,"cp":61,"hl":67.9,"ts":59,"gp":26.2,"ab":69.5,"oa":65.5,"on":49.7,"rt":null,"pi":4,"po":20,"nv":5,"sl":"claude-opus-5-5"},
    {"n":"GPT-6 Astra","o":"OpenAI","g":"us","op":0,"r":1,"cx":1000000,"ii":56.9,"ie":null,"bs":1568.1,"fc":42.4,"tb":59.1,"cp":70.5,"hl":63.8,"ts":63.3,"gp":31,"ab":68.5,"oa":61.6,"on":50.2,"rt":null,"pi":10,"po":50,"nv":5,"sl":"gpt-6-astra"},
    {"n":"GPT-6.1 Sol","o":"OpenAI","g":"us","op":0,"r":1,"cx":1000000,"ii":54.5,"ie":null,"bs":1555.1,"fc":40.6,"tb":56.1,"cp":68.5,"hl":58.8,"ts":58.1,"gp":31,"ab":64.9,"oa":61.8,"on":48.1,"rt":null,"pi":2,"po":10,"nv":5,"sl":"gpt-6-1-sol"},
    {"n":"Claude Sonnet 5.5","o":"Anthropic","g":"us","op":0,"r":1,"cx":1000000,"ii":54.2,"ie":null,"bs":1811.8,"fc":41.7,"tb":63.6,"cp":56,"hl":53.3,"ts":53.3,"gp":25.8,"ab":71.8,"oa":51.5,"on":56.7,"rt":null,"pi":2,"po":10,"nv":5,"sl":"claude-sonnet-5-5"},
    {"n":"GPT-6.1 Terra","o":"OpenAI","g":"us","op":0,"r":1,"cx":1000000,"ii":51,"ie":null,"bs":1401.7,"fc":42.3,"tb":55.6,"cp":64.5,"hl":47.3,"ts":57.6,"gp":28.6,"ab":60.2,"oa":47.6,"on":65.5,"rt":null,"pi":1,"po":5,"nv":6,"sl":"gpt-6-1-terra"},
    {"n":"Gemini 4 Argon","o":"Google","g":"us","op":0,"r":1,"cx":1000000,"ii":50.4,"ie":null,"bs":1483.3,"fc":25.7,"tb":57.1,"cp":52.5,"hl":56.7,"ts":52.9,"gp":21.8,"ab":77.5,"oa":48.3,"on":95.7,"rt":null,"pi":2,"po":10,"nv":1,"sl":"gemini-4-argon"},
    {"n":"Claude Fable 5.1","o":"Anthropic","g":"us","op":0,"r":1,"cx":1000000,"ii":49.7,"ie":null,"bs":1649.8,"fc":35.7,"tb":55.1,"cp":56.5,"hl":58.8,"ts":40.5,"gp":26.2,"ab":57.8,"oa":67.2,"on":30.5,"rt":null,"pi":10,"po":50,"nv":5,"sl":"claude-fable-5-1-xhigh"},
    {"n":"Muse Wonder Full","o":"Meta","g":"us","op":0,"r":1,"cx":1000000,"ii":49.7,"ie":null,"bs":1729.3,"fc":37.8,"tb":57.1,"cp":53,"hl":48.5,"ts":37.1,"gp":32.6,"ab":71.3,"oa":41,"on":82.4,"rt":null,"pi":null,"po":null,"nv":1,"sl":"muse-wonder-full"},
    {"n":"Kimi K3.1 Pro","o":"Kimi","g":"cn","op":0,"r":1,"cx":1000000,"ii":46,"ie":null,"bs":1677.8,"fc":25.5,"tb":67.2,"cp":45,"hl":37.3,"ts":34.3,"gp":31.4,"ab":73.3,"oa":48.9,"on":62.7,"rt":48.3,"pi":2,"po":10,"nv":1,"sl":"kimi-k3-1-pro"},
    {"n":"Muse Wonder","o":"Meta","g":"us","op":0,"r":1,"cx":1048576,"ii":43.3,"ie":null,"bs":1658.7,"fc":27.9,"tb":52,"cp":48,"hl":39,"ts":25.7,"gp":30.6,"ab":68.1,"oa":38,"on":79.1,"rt":9.6,"pi":4,"po":20,"nv":1,"sl":"muse-wonder"},
    {"n":"Claude Haiku 5.5","o":"Anthropic","g":"us","op":0,"r":1,"cx":1000000,"ii":36.2,"ie":null,"bs":1575.4,"fc":34.9,"tb":32.8,"cp":41,"hl":29.6,"ts":20,"gp":20.8,"ab":35.4,"oa":34.7,"on":65.8,"rt":null,"pi":0.1,"po":0.5,"nv":5,"sl":"claude-haiku-5-5"},
    {"n":"Grok 4.7","o":"SpaceXAI","g":"us","op":0,"r":1,"cx":500000,"ii":35,"ie":null,"bs":1628.8,"fc":27.8,"tb":24.7,"cp":35,"hl":23.6,"ts":9.5,"gp":23.2,"ab":63.5,"oa":41.8,"on":79.8,"rt":null,"pi":2,"po":6,"nv":3,"sl":"grok-4-7-high"},
    {"n":"Qwen3.8 Max","o":"Alibaba","g":"cn","op":0,"r":1,"cx":983616,"ii":33.6,"ie":null,"bs":1607.7,"fc":23.4,"tb":38.9,"cp":28.5,"hl":24,"ts":11.9,"gp":22.8,"ab":56.2,"oa":29.5,"on":72.9,"rt":48,"pi":2,"po":6,"nv":1,"sl":"qwen3-8-max"},
    {"n":"DeepSeek V4.1 Flash 1017","o":"DeepSeek","g":"cn","op":1,"r":1,"cx":1000000,"ii":32.5,"ie":null,"bs":1570.4,"fc":28.5,"tb":33.8,"cp":24,"hl":25.3,"ts":12.9,"gp":17.2,"ab":66.6,"oa":39.6,"on":35.9,"rt":11.5,"pi":0.3,"po":1.2,"nv":1,"sl":"deepseek-v4-1-flash-1017"},
    {"n":"GLM-5.3","o":"Z AI","g":"cn","op":1,"r":1,"cx":1000000,"ii":31.7,"ie":null,"bs":1504,"fc":21.6,"tb":41.9,"cp":33.5,"hl":17.9,"ts":9.5,"gp":11.2,"ab":62.2,"oa":32.3,"on":61.1,"rt":23.3,"pi":1.4,"po":4.4,"nv":2,"sl":"glm-5-3"},
    {"n":"Gemini 3.8 Flash","o":"Google","g":"us","op":0,"r":1,"cx":1000000,"ii":30.5,"ie":null,"bs":1202.3,"fc":18.7,"tb":19.7,"cp":43.5,"hl":33.1,"ts":10,"gp":21,"ab":59.9,"oa":50.5,"on":44.9,"rt":null,"pi":0.75,"po":3.75,"nv":3,"sl":"gemini-3-8-flash"},
    {"n":"MiMo-V2.6-Pro","o":"Xiaomi","g":"cn","op":1,"r":1,"cx":1000000,"ii":29.9,"ie":null,"bs":1510.7,"fc":24,"tb":34.8,"cp":34,"hl":15.2,"ts":5.7,"gp":19.2,"ab":58.6,"oa":34.8,"on":39.8,"rt":34.9,"pi":0.435,"po":0.87,"nv":1,"sl":"mimo-v2-6-pro"},
    {"n":"Ling 3.1 Flash 1019","o":"InclusionAI","g":"cn","op":1,"r":1,"cx":1048576,"ii":29.5,"ie":null,"bs":1521,"fc":17,"tb":32.8,"cp":37.5,"hl":17.2,"ts":4.3,"gp":12.6,"ab":67.5,"oa":26.5,"on":63.7,"rt":null,"pi":0.3,"po":0.9,"nv":1,"sl":"ling-3-1-flash-1019"},
    {"n":"MiniMax-M3.1-Flash","o":"MiniMax","g":"cn","op":0,"r":1,"cx":1000000,"ii":28.9,"ie":null,"bs":1473.4,"fc":20.8,"tb":25.8,"cp":31,"hl":28.1,"ts":3.3,"gp":20.8,"ab":72.5,"oa":45.1,"on":6.3,"rt":16.9,"pi":0.15,"po":0.6,"nv":1,"sl":"minimax-m3-1-flash"},
    {"n":"Step 5 Preview","o":"StepFun","g":"cn","op":1,"r":1,"cx":1000000,"ii":28.5,"ie":null,"bs":1422.9,"fc":12,"tb":33.3,"cp":32.5,"hl":24.3,"ts":2.4,"gp":14.8,"ab":51,"oa":36.4,"on":68.7,"rt":10.9,"pi":1,"po":2.7,"nv":1,"sl":"step-5"},
    {"n":"GPT-6 Luna","o":"OpenAI","g":"us","op":0,"r":1,"cx":1000000,"ii":27.8,"ie":null,"bs":1336.2,"fc":25.2,"tb":12.6,"cp":41.5,"hl":22.2,"ts":8.6,"gp":22.8,"ab":53.2,"oa":39.6,"on":20.7,"rt":null,"pi":0.1,"po":0.5,"nv":6,"sl":"gpt-6-luna"},
    {"n":"MiMo-V2.6-Flash","o":"Xiaomi","g":"cn","op":1,"r":1,"cx":1000000,"ii":26.7,"ie":null,"bs":1486.1,"fc":21.6,"tb":22.7,"cp":29.5,"hl":13.7,"ts":4.3,"gp":9,"ab":64.1,"oa":27.2,"on":47.8,"rt":34.4,"pi":0.14,"po":0.28,"nv":1,"sl":"mimo-v2-6-flash"},
    {"n":"Mistral Large 4 Preview","o":"Mistral","g":"fr","op":0,"r":1,"cx":524288,"ii":25.3,"ie":null,"bs":1390.8,"fc":13.6,"tb":26.8,"cp":24,"hl":15.1,"ts":4.8,"gp":18.6,"ab":59.9,"oa":23.9,"on":58.7,"rt":17.5,"pi":1.36,"po":4.18,"nv":1,"sl":"mistral-large-4"},
    {"n":"Muse Spark Open","o":"Meta","g":"us","op":1,"r":1,"cx":1048576,"ii":24.7,"ie":null,"bs":1278.4,"fc":7.6,"tb":8.1,"cp":27.5,"hl":26.3,"ts":1.9,"gp":18.6,"ab":49.7,"oa":42,"on":72,"rt":10.6,"pi":1.25,"po":4.25,"nv":1,"sl":"muse-spark-open"},
    {"n":"DeepSeek V4 Pro 0813","o":"DeepSeek","g":"cn","op":1,"r":1,"cx":1000000,"ii":23.1,"ie":null,"bs":1254.5,"fc":17.1,"tb":14.1,"cp":23.5,"hl":19.5,"ts":5.7,"gp":11.4,"ab":56.7,"oa":45.2,"on":5.9,"rt":21.8,"pi":1.32,"po":3.96,"nv":1,"sl":"deepseek-v4-pro"},
    {"n":"Qwen3.8 27B","o":"Alibaba","g":"cn","op":1,"r":1,"cx":256000,"ii":20.1,"ie":null,"bs":1392.7,"fc":14.9,"tb":5.6,"cp":4,"hl":15.3,"ts":0.5,"gp":16.4,"ab":48.2,"oa":17.3,"on":71.4,"rt":48.5,"pi":0.5,"po":3,"nv":1,"sl":"qwen3-8-27b"},
    {"n":"MiniMax-M3","o":"MiniMax","g":"cn","op":1,"r":1,"cx":1000000,"ii":18.7,"ie":null,"bs":1089.5,"fc":21.9,"tb":2,"cp":26.5,"hl":16,"ts":0.5,"gp":9.8,"ab":21.3,"oa":44.9,"on":8.6,"rt":18.4,"pi":0.3,"po":1.2,"nv":1,"sl":"minimax-m3"},
    {"n":"K2 Horizon 375B A23B","o":"Institute of Foundation Models","g":"ae","op":1,"r":1,"cx":524288,"ii":17.8,"ie":null,"bs":1293.4,"fc":11.8,"tb":1.5,"cp":11.5,"hl":10.2,"ts":0,"gp":7.4,"ab":37.2,"oa":18.6,"on":71,"rt":2.2,"pi":0,"po":0,"nv":1,"sl":"k2-horizon-375b-a23b"},
    {"n":"Beam 1.0","o":"Reflection","g":"us","op":1,"r":1,"cx":1048576,"ii":17.7,"ie":null,"bs":976.2,"fc":5.5,"tb":3,"cp":26.5,"hl":12.8,"ts":0.5,"gp":11.6,"ab":48.5,"oa":30.7,"on":59,"rt":5.4,"pi":0.4,"po":1.2,"nv":1,"sl":"reflection-beam"},
    {"n":"Nemotron 3.5 Super VL","o":"NVIDIA","g":"us","op":1,"r":1,"cx":1000000,"ii":13.6,"ie":null,"bs":998.8,"fc":6.1,"tb":0,"cp":13.5,"hl":8.8,"ts":0,"gp":8,"ab":14.8,"oa":21.2,"on":69.5,"rt":4.5,"pi":0.225,"po":0.575,"nv":1,"sl":"nemotron-3-5-super-vl"},
    {"n":"Inkling Small","o":"Thinking Machines","g":"us","op":1,"r":1,"cx":1000000,"ii":12.9,"ie":null,"bs":912.1,"fc":4.8,"tb":1,"cp":18.5,"hl":12.1,"ts":0,"gp":11.2,"ab":4.8,"oa":31.8,"on":39.5,"rt":9.6,"pi":0.3,"po":1.2,"nv":1,"sl":"inkling-small"},
    {"n":"Inkling","o":"Thinking Machines","g":"us","op":1,"r":1,"cx":1000000,"ii":12.5,"ie":null,"bs":833.1,"fc":3.9,"tb":1,"cp":18,"hl":10.6,"ts":0,"gp":12.8,"ab":5,"oa":39.3,"on":32.8,"rt":10.3,"pi":1,"po":4.05,"nv":1,"sl":"inkling"},
    {"n":"Nemotron 3 Ultra 550B A55B","o":"NVIDIA","g":"us","op":1,"r":1,"cx":262144,"ii":11.8,"ie":null,"bs":877.4,"fc":1.1,"tb":0.5,"cp":15,"hl":8.5,"ts":0,"gp":5,"ab":3,"oa":21.2,"on":77.4,"rt":11.5,"pi":0.6,"po":2.7,"nv":1,"sl":"nvidia-nemotron-3-ultra-550b-a55b"},
    {"n":"Gemini 3.5 Flash-Lite","o":"Google","g":"us","op":0,"r":1,"cx":1000000,"ii":11.7,"ie":null,"bs":651.1,"fc":6,"tb":1,"cp":3.5,"hl":9.9,"ts":0,"gp":13.6,"ab":25,"oa":26.5,"on":73.3,"rt":null,"pi":0.3,"po":2.5,"nv":1,"sl":"gemini-3-5-flash-lite"},
    {"n":"Muse Glimmer","o":"Meta","g":"us","op":1,"r":1,"cx":131072,"ii":6.3,"ie":null,"bs":477.8,"fc":1.5,"tb":0.5,"cp":7,"hl":9.1,"ts":0,"gp":10,"ab":6.8,"oa":28,"on":16.4,"rt":16,"pi":0.3,"po":1.2,"nv":1,"sl":"muse-glimmer"},
    {"n":"Command A+","o":"Cohere","g":"ca","op":1,"r":1,"cx":192000,"ii":6.2,"ie":null,"bs":356.2,"fc":0,"tb":0.5,"cp":2.5,"hl":5.1,"ts":0,"gp":1,"ab":1.8,"oa":9.8,"on":86.1,"rt":13.1,"pi":0,"po":0,"nv":1,"sl":"command-a-plus"},
    {"n":"NVIDIA Nemotron 3 Nano 4B","o":"NVIDIA","g":"us","op":1,"r":1,"cx":262000,"ii":1.8,"ie":null,"bs":0,"fc":0,"tb":0,"cp":0,"hl":2.8,"ts":0,"gp":0.4,"ab":0.4,"oa":9.5,"on":10.9,"rt":null,"pi":null,"po":null,"nv":1,"sl":"nvidia-nemotron-3-nano-4b"},
    ]
  };
  if (root) {
    root.AIRankData = DATA;
    if (typeof window !== "undefined") window.AIRankData = DATA;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

# 数问 DataPilot

面向传智杯 **AI WEB 网页开发挑战赛**“AI 数据分析与可视化”方向的可运行作品。

**让大模型理解问题，让确定性计算回答问题。** 上传 CSV，用自然语言生成可检查的分析计划；数值由浏览器中的受限聚合引擎计算，展示参与记录数、缺失排除与计算口径。

## 已实现

- CSV / TSV：UTF-8 BOM、中文编码回退、引号/逗号/换行单元格、空值、输入限制；最多 5 MB、20,000 行、80 列。
- 数据概览：实际统计、月度趋势、分组对比、构成图，可切换维度、指标、聚合与图表类型。
- 表格搜索、分页、CSV 导出。
- 质量检查：缺失、无效数值、完全重复；清洗与撤销。
- 分析助手：字段摘要检索、Function Calling、Zod/字段白名单校验、确定性执行、SSE 状态、请求取消、分析证据。
- 本机 IndexedDB 保存、最近 30 次分析、Markdown 报告导出。
- 桌面三栏、移动端助手抽屉、键盘操作与可访问标签。

## 启动

需要 Node.js >= 22.13.0。

```powershell
cd E:\chuanzhi\datapilot
npm ci
npm run dev
```

访问 http://127.0.0.1:5173/ 。如本机 Windows npm 包装器失效，可直接使用实际安装位置的入口：

```powershell
node D:\nodejs\node_modules\npm\bin\npm-cli.js ci --include=dev --include=optional --no-audit --no-fund
node scripts/run-framework.mjs dev
```

## 连接真实模型

无密钥时明确显示**演示模式**，仅匹配字段、分组、趋势、均值、计数、占比，不是大模型推理。预测和因果等未支持任务返回明确提示。

复制 `.env.example` 为 `.env.local`，在本机填写，然后重启服务：

```dotenv
DATA_MODEL_API_KEY=仅在本地填写，禁止提交
DATA_MODEL_URL=https://api.deepseek.com
DATA_MODEL_NAME=deepseek-flash
```

托管环境使用平台环境变量管理，密钥标记为 secret。适配器需要支持 `tools` / `tool_choice` 的 Chat Completions 服务。基础 URL 不含 `/chat/completions`；供应商需要 `/v1` 时包含 `/v1`。模型名可按供应商调整。

**本轮没有真实服务商密钥，真实计费 API 未实测；已验证模拟模型响应的协议、错误和非法计划处理。**

## 验证与构建

```powershell
npm run typecheck
npm test
npm run test:http # 先启动开发服务
npm run build
```

不依赖 npm 包装器的等效命令：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-core.mjs
node scripts/test-http.mjs
node scripts/run-framework.mjs build
```

## 架构与文件

```text
浏览器：文件 → 解析/剖析 → 本机 IndexedDB
                   ↓ 问题 + 字段摘要
服务端：字段检索 → LLM 工具调用 → 结构/字段校验
                   ↓ 受限 JSON 计划
浏览器：筛选/分桶/聚合 → 图表 + 统计依据 → 报告
```

使用 React、TypeScript、Vinext/Vite、Cloudflare Workers、Recharts、Zod、Lucide，保留 Sites starter 部署与认证集成。

| 文件 | 职责 |
| --- | --- |
| `app/page.tsx`、`app/globals.css` | 界面、交互、图表、响应式 |
| `app/api/analyze/route.ts` | 引擎状态与 SSE 计划接口 |
| `lib/data-engine.ts` | 解析、质量、清洗、聚合、报告 |
| `lib/agent.ts` | 摘要检索、模型工具调用、校验 |
| `lib/local-store.ts` | IndexedDB |
| `scripts/test-core.mjs`、`scripts/test-http.mjs` | 核心/接口测试 |
| `docs/技术文档.md` | 设计、实现、限制与评分对应 |
| `docs/演示脚本.md`、`docs/提交准备.md` | 录制路线与材料准备 |

## 数据与限制

- 默认数据是固定种子生成的**合成数据**，1,251 行、6 个缺失单元格、3 条完全重复记录，不是真实企业数据。
- 完整文件和历史保存在当前浏览器，不跨设备同步；清除浏览器存储或更换域名会重置。
- 模型模式发送问题、字段名、类型、统计摘要与部分分类值，不发送完整表格。常见敏感字段值会过滤，但这不等于正式脱敏。
- 不执行模型生成的代码或任意 SQL；SQL 面板仅为口径示意。
- 当前是关键词字段检索，**不宣称向量 RAG**；没有实现多模态、MCP 或多 Agent。
- 仅支持单表；不支持 Join、预测、因果推断、Excel 原生文件与多人云同步。
- 私人托管链接默认仅所有者访问，评审访问方式需另外准备。

赛道：https://www.boxuegu.com/matchTrack/detail/?id=10037

Git 如实保留开发过程，不补造最初提交前不存在的历史。视频脚本不等于已录制视频，真实模型效果需配置后实测。

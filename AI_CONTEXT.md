# AI 上下文文档

这份文档是给后续 AI 代理看的。处理这个仓库前，优先先读它。

## 项目概况

- 这是一个基于 Vite + React + TypeScript 的前端项目。
- 主要页面逻辑集中在 [src/pages/Analyze.tsx](/D:/aiBeginner/github-code-analyzer/src/pages/Analyze.tsx)。
- 这个应用的核心流程是：
  1. 从 GitHub API 读取仓库文件树
  2. 调用大模型分析项目语言、技术栈、候选入口文件
  3. 继续校验真实入口文件
  4. 基于入口文件生成函数全景图

## 当前 AI 接入方式

- 运行时代码不要再使用 Google Gemini SDK。
- 项目已经从 `@google/genai` 改成了兼容 OpenAI 风格的 HTTP API 调用。
- 当前使用的环境变量是：
  - `AI_API_KEY`
  - `BASE_URL`
  - `MODEL`
- 这些变量通过 [vite.config.ts](/D:/aiBeginner/github-code-analyzer/vite.config.ts) 注入到前端。
- 运行时代码读取方式为：
  - `process.env.AI_API_KEY`
  - `process.env.BASE_URL`
  - `process.env.MODEL`

## 请求入口

- 统一 AI 请求函数在 [src/pages/Analyze.tsx](/D:/aiBeginner/github-code-analyzer/src/pages/Analyze.tsx) 中，函数名是 `callAi`
- 当前请求地址是：
  - ``${BASE_URL}/chat/completions``
- 认证方式是：
  - `Authorization: Bearer ${AI_API_KEY}`
- 所有模型调用都应优先使用环境变量中的 `MODEL`

## 结构化输出策略

- `callAi(prompt, schema)` 会优先尝试 OpenAI 风格的结构化输出：
  - `response_format.type = "json_schema"`
- 如果当前服务商不支持这个格式，会自动回退到：
  - 通过提示词强制模型返回 JSON
- 后续如果再改 AI 接入，必须保留这些能力：
  - 严格 JSON 解析
  - 基于 schema 的结构化输出
  - API 失败时可读的错误信息

## 当前哪些地方在调用 AI

- 项目整体分析：
  - [src/pages/Analyze.tsx](/D:/aiBeginner/github-code-analyzer/src/pages/Analyze.tsx) 中的 `handleAIAnalysis`
- 入口文件校验：
  - 同一个函数内部，在初步分析完成后执行
- 猜测函数定义所在文件：
  - [src/pages/Analyze.tsx](/D:/aiBeginner/github-code-analyzer/src/pages/Analyze.tsx) 中的 `resolveFilePath`
- 提取函数子调用并生成全景图：
  - [src/pages/Analyze.tsx](/D:/aiBeginner/github-code-analyzer/src/pages/Analyze.tsx) 中的 `analyzeFunction`

## 重要约束

- 这是纯前端项目，目前没有后端代理层。
- 因此前端直连的 AI 服务必须支持浏览器侧调用，尤其是 CORS。
- 不要重新引入写死的供应商模型名，比如 Gemini 的固定模型名。
- 不要把环境变量读取方式改成 `import.meta.env`，除非你同时完整调整注入策略。
- 除非用户明确要求，否则不要变更当前 `.env` 约定：
  - `AI_API_KEY`
  - `BASE_URL`
  - `MODEL`

## 当前已知状态

- [package.json](/D:/aiBeginner/github-code-analyzer/package.json) 里还保留着 `@google/genai` 依赖，但当前业务代码已经不再使用它。
- [README.md](/D:/aiBeginner/github-code-analyzer/README.md) 仍然是旧说明，还提到了 `GEMINI_API_KEY`，目前已过时。
- 已通过的静态检查命令：
  - `npm.cmd run lint`
- `vite build` 在受限环境里可能失败并报 `spawn EPERM`，这通常是环境限制，不一定是代码问题。

## 如果以后还要改 AI 接入

1. 同步更新文档：
   - [AI_CONTEXT.md](/D:/aiBeginner/github-code-analyzer/AI_CONTEXT.md)
   - [README.md](/D:/aiBeginner/github-code-analyzer/README.md)
   - [.env.example](/D:/aiBeginner/github-code-analyzer/.env.example)
2. 除非有充分理由，否则所有 AI 请求都继续走统一的 `callAi`
3. 保留下面三类结构化输出能力：
   - 仓库整体分析
   - 入口文件校验
   - 全景图子函数提取
4. 修改后至少重新执行：
   - `npm.cmd run lint`

## 可直接贴给下一个 AI 的最小上下文

如果你下次想快速让另一个 AI 接手，可以直接把下面这段贴进去：

```text
这是一个 Vite + React + TypeScript 前端项目，核心逻辑在 src/pages/Analyze.tsx。项目运行时已经不再使用 Google Gemini SDK，而是通过统一的 callAi 函数调用兼容 OpenAI 风格的 HTTP 接口。环境变量固定为 AI_API_KEY、BASE_URL、MODEL，并由 vite.config.ts 注入。AI 请求地址是 ${BASE_URL}/chat/completions。请保持当前 .env 约定不变，除非我明确要求。结构化输出要保留，优先走 json_schema，不支持时回退到提示词约束 JSON。不要重新引入 Google 专用 SDK 或写死 Gemini 模型名。
```

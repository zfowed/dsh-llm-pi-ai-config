# AGENTS.md

本项目所有 AI 协作的唯一控制面。

本文件只描述**长期有效的协作规则与项目约束**，不记录具体任务的临时决策，不保留被废弃方案，不充当工作日志。

---

## 1. 项目与边界

DSH 插件 `dsh-llm-pi-ai-config`：在 DSH「设置」下新增一个 **「模型扩展配置」** 页面，用于编辑
`@deepseek-ai/dsh-llm-pi-ai` 的**完整**配置。

**本项目的定位是 `llm-pi-ai` 的配置管理扩展，不是为 `dsh-llm-pi-ai-config` 自身增加模型配置。**

由此推出三条不可违反的边界：

1. 所有界面操作必须作用于真实的 `llm-pi-ai` 配置，且必须走 DSH 既有机制；
2. 本插件**不注册自己的 settings 命名空间**，不自己持久化任何东西；
3. 不复制、不改写 `llm-pi-ai` 的配置解析逻辑——adapter 始终是权威。

产品规则以 `docs/requirements.md` 为准；
架构与数据流以 `docs/architecture.md` 为准；
已证实的字段清单与覆盖记录以 `docs/field-coverage.md` 为准；
开发与验证方式以 `docs/development.md` 为准；
本项目的调研证据以 `docs/research-findings.md` 为准；
模块间接口以 `docs/interface-contract.md` 为准。

**文档没有定义的业务规则，不得自行补全。** 可以依据代码、schema、官方源码确认事实，但
**不能把推断当成项目规则**。

---

## 2. 开工前必做

1. 读本文件；
2. 读 `README.md`；
3. 按任务性质读上面对应的 `docs/*.md`；
4. **先调研、再写码**：任何字段名、接口签名、参数语义，都必须从
   `@deepseek-ai/dsh-llm-pi-ai` 的 schema/源码或 DSH 客户端源码中取得证据，
   不得凭字段名猜测。证据写法见 `docs/research-findings.md`。

---

## 3. 硬性约束

### 3.1 写入路径

唯一允许的写入链路：

```
ctx.configForms.get("llm-pi-ai").mutate(ops, revision)
  -> remote.settings.mutate
  -> ctx.settings.write
  -> ctx.configEditor.edit
  -> 原子写 profile 的 cordis.patch.yml
```

- **禁止**在插件内直接读写文件、拼接 YAML、或写给 `cordis.yml`。
- **禁止**绕开 revision 校验；冲突（`SETTINGS_CONFLICT`）必须把错误交给用户，
  不得静默重试——盲目重试会覆盖另一个窗口的并发修改。
- 写目标永远是 `llm-pi-ai` 那一行，不得改动其他插件或其他行。

**配置写入之外的第二条受控通道：凭据。** `apiKeyEnv` 是**凭据引用**
（adapter schema：`z.string().role("credential-ref")`），真实密钥不属于配置。
因此允许、且仅允许：

```
ctx.remote.credentials.describe(refs)   // 读状态：configured / source / writable
ctx.remote.credentials.set(ref, secret) // 存密钥
ctx.remote.credentials.unset(ref)       // 删密钥
```

规则：
- **禁止**把密钥写进 draft / ops / YAML；配置里只有引用名。
- 凭据状态来自 `describe`；`ctx.remote.$on("credentials/record-updated" |
  "credentials/reference-updated")` 用于刷新。
- `ctx.remote.credentials` 缺席时必须降级为只读提示，不得抛错、不得自行持久化。
- **必须先 inject 再读**：`remote` 是注册表服务，每个命名空间是独立的 cordis 服务键
  （`remote.settings`、`remote.credentials`……）。读取**未注入**的键会在激活期抛错，
  导致整个 web-boot 条目失败并让应用起不来（2026-10-13 事故，见 `docs/verification.md` §13）。
  因此 `inject` 必须声明用到的键，且访问一律包在 try/catch 里——可选特性绝不能
  让激活失败。

### 3.2 字段来源

- 字段清单的**唯一来源是运行时 schema 信封**（`configForms.describe()` 里的 `schema`）。
- **禁止**在 `lib/client.panels*.js`、`lib/client.page.js` 中写死任何 provider/model 字段名。
  字段到分组的映射只允许来自 `lib/client.fields.groups.js` / `lib/client.fields.hints.js`，
  且按 **group id** 选择，不按字段名。
- `lib/client.fields.groups.js` / `lib/client.fields.hints.js`（数据）与 `lib/client.fields.js`（查询）
  只允许提供：分组、标签、提示（字段说明 + 逐选项说明
  `valueHintFor` / 模式文案 `modeHintFor`）、按 kind 选择的控件，以及**纯呈现元数据**
  （`unit` / `rows` / `pair` / `titleRank` / 分组级 `catalog`——`pair` 只决定哪几个相邻短字段
  并排成两列，`titleRank` 只决定实例卡标题用哪个叶子的值（小者优先，面板据此实现
  `name → id → #n` 而无需写字段名），`catalog` 只把「这一组是模型目录」这一事实告诉面板
  （据此显示发现按钮），三者都不决定字段是否存在）。
  它**不是**「哪些字段存在」的真源。
- 上游新增字段必须自动出现在页面上。任何可能导致字段静默消失的改动都是回归，
  必须由 `tests/coverage.test.js` 拦住。

### 3.3 清空语义

- 清空一个字段 = `{op:"unset"}`，表示「继承」（界面上写作「默认（未设置）」）。
- **禁止**用 `null` 表达清空：host 端 `{op:"set", value:null}` 会写入字面 `null`。
- `null` 只在 schema 明确声明可空、且用户显式选择时才写入。**实测依据**
  （adapter / pi-ai 的行为与 file:line）见 `docs/research-findings.md` §6：
  `null` 在可选标量上会变成 `TypeError`、具名校验错误，或被静默塞进请求，
  因此「留空 = `unset`」是唯一普遍安全的编码。
- 数组缩短必须由高到低发 `unset`：`unset` 落在 `index === length` 时 host 会抛 `TypeError`。
- **「留空」一律是 `unset`，不是 `null`**：闭集多选（`array`+`enum`，如 `input`）取消最后一个
  勾选 = 清空字段；闭集字典（`dict`+`keyEnum`+标量值，如 `reasoningEfforts`）里**清空某一行
  = 删掉那个键**，全空 = 清空字段。adapter 只允许 `reasoningEfforts.off` 为 `null`，其它档位
  写 `null` 或空串都会被判非法，因此界面绝不写值型 `null`（`off: null` 只能手写 YAML，
  记录在 `docs/field-coverage.md`）。

### 3.4 依赖与模块划分

- **不得**新增第三方依赖（含构建期）。本仓库没有打包器、没有 TypeScript，
  这是刻意的：`lib/*.js` 就是交付产物。
- **禁止单体文件**：逻辑按职责分文件（单文件 ≤700 代码行，`tests/module-contract.test.js` 强制），
  且每个非 owner 文件必须是可用于浏览器的包内 chunk（见 `docs/interface-contract.md` 的
  「Chunk envelope」）。平台只服务 owner 目录下的平级 `client.<…>.js`，**不能有子目录**，
  因此逻辑目录用点号文件名表达；模块清单、registry key、加载阶段见 `docs/architecture.md` §1.1/§4。
- 复用既有组件与 API：优先 `@deepseek-ai/dsh-client-ui-primitives` 与
  DSH 既有服务，不重造轮子。
- 不做与任务无关的重构。

### 3.5 兼容性提示是 advisory

`lib/client.fields.groups.js` 里的 `COMPAT_GATES` 只是保存前的提示。
**adapter 的校验永远权威**：它拒绝某字段时报的错必须原样展示，不得吞掉或改写。

### 3.6 未知字段与表达式

- 未识别的字段必须照常渲染（`other` 兜底分组），不得丢弃。
- `!!js` 表达式只读展示，保存时原样保留，不得改写。

---

## 4. 验证要求

任何「已完成」的声明都必须能指向一次真实执行。

- 跑全量测试：`node --test`（v10 实测 **367 项**：366 pass + 0 fail + 1 todo）。
- 语法检查：对每个 `lib/*.js` 执行 `node --check`（v10 实测 **20/20** 通过：host 半 + owner + 18 个 chunk）。
- 模块契约：`node --test tests/module-contract.test.js`（8 项：加载计划 ↔ 磁盘 ↔ 实际请求三方一致、
  阶段序、chunk envelope、注册唯一性、facade 未降级、样式片段缺失降级、模块缺失报错具名、
  单文件 ≤700 代码行）。
- 独立 harness：`node tests/verify.integration.mjs`（38 项）、`node tests/verify.render.mjs`（15 项）、`node tests/verify.polish.mjs`（42 项；P10a 是「服务端字节 vs 磁盘」的新鲜度检查组，chunk 改动后必须先 `touch lib/client.js`，否则它只报 observation）。
- 对抗式复核：`tests/v7.audit.test.js`（35 项，含 1 条 `todo` = FINDING-3 既定偏离）与
  `tests/v8.audit.test.js`（24 项）；两者可单独跑（v8 的浏览器层用例读 `/tmp/piai-audit` 的真实
  Chromium 产物，产物不存在时跳过）。
- **浏览器布局夹具**：`tests/layout/`（`build-fixture.mjs` + 原语 CSS 快照 + README）。
  `node --test` 与三个 harness 只断言 DOM / props / CSS 文本，**看不到计算布局**；
  R1 这类「文字被压成 0 宽」的缺陷只有真实浏览器夹具能看见，测量由 ego-browser 在页内
  完成、**不进入 `node --test`**、不新增依赖。见 `docs/verification.md` §17.6。
- 判定只允许 `verified` / `partial` / `untested` / `blocked`，并记录原始输出。
- **未实测的项目不得写 verified。** 已知被环境阻塞的项目见 `docs/verification.md`。
  GUI 首次发现需要一次性 DSH 重启（本机已于 2026-10-16 重启）；重启后本页已在
  真实 GUI 中实测通过（boot graph + 18/18 chunk 字节 + 页面 DOM/交互，见 §19.6/§19.8）。
  仍未做的是**保存/写入**的 GUI 实测——AGENTS §4 禁止为验证而写用户真实 profile。
- 不得对用户真实的 profile 做写操作来「验证」；验证必须是无损的。

---

## 5. 文档纪律

- 文档必须与代码一致。代码变了、文档没变 = 缺陷。
- 字段清单变化时，必须同时更新 `docs/field-coverage.md` 与
  `tests/coverage.test.js` 中的显式名单——后者刻意写死，以便上游变化时**故意失败**。
- 不写无法验证的断言。不确定就写 `untested`。

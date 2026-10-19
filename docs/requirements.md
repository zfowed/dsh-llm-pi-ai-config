# 需求（requirements）

## 1. 一句话需求

在 DSH「设置」下新增 **「模型扩展配置」** 页面，完整覆盖 `llm-pi-ai` 的模型配置。

## 2. 定位（不可违背）

**本项目是 `llm-pi-ai` 的配置管理扩展，不是为 `dsh-llm-pi-ai-config` 自身增加模型配置。**

页面是 `llm-pi-ai` 的一个「远程控制面」：它读取 `llm-pi-ai` 的 schema 与当前值，
把用户的编辑写回 `llm-pi-ai` 那一行配置。本插件自己没有任何可配置项。

## 3. 功能需求

### R1 入口

- 在「设置」的 section 列表注册一个**新的**导航格子，标题「模型扩展配置」。
- 必须使用**新的 id**，不得替换自带的「模型」页。
- 排序紧随自带的「模型」页之后。
- 当 host 没有提供 `llm-pi-ai` 命名空间时，**不得留下任何痕迹**（不注册、不请求 chunk）。

### R2 字段覆盖：完整，且不写死

- 必须覆盖 `llm-pi-ai` **全部**用户可写字段：提供商级 22 项、模型级 7 项、`compat` 26 键，
  含嵌套对象、数组、枚举、可选值、union。
- 字段清单的**唯一来源是运行时 schema**。上游新增字段必须自动出现。
- **不允许**出现「schema 里有、页面上没有」的字段。这是本项目的核心验收点。
- **每一个可配置项都必须有写死的 key、中文标签和中文说明**：原始 YAML key
  （`apiKeyEnv`、`compat.thinkingFormat`、`models[].maxTokens`……）与说明放在字段行的
  **提示气泡**里（`piai-info` + `Tooltip`，v7 起；v6 及以前是行内 key chip + 短说明内联），
  标签与说明来自 `lib/client.fields.js`；任何缺失都不得回退成英文标识符，必须由
  `tests/presentation.test.js` 拦住（含联合分支等渲染期才展开的叶子）。
- **说明必须能教用户怎么用**（v5）：一句话讲清「作用 + 生效条件/默认值 + 不支持的后果」，
  **禁止**复述 key 或标签（不得出现「是否支持 X 参数」「X 的字段名」「X 的格式」这类空话）。
  文案依据只能来自 adapter/pi-ai 的安装实现或官方 README，不得凭字段名推测。
  v7 起字段级说明**一律**进气泡（`LONG_HINT_LIMIT` 不再决定内联/气泡），分组级说明仍内联；
  `tests/presentation.test.js` 仍要求每个渲染期叶子都有非空中文说明。

### R3 模型管理

- `models[]` 支持增删改；每项可编辑 `id`、`name`、`contextWindow`、`maxTokens`、
  `input`、`reasoningEfforts`、`compat`。
- `modelOverrides` 支持按模型 ID 增删键，并可编辑除 `id` 外的同一套字段
  （字典键即 id，adapter 明确拒绝在 override 内再写 `id`）。
- 两者都是**实例容器**：`models[]` 的每个元素、`modelOverrides` 的每个键各渲染成
  一张可折叠卡片（v7 起卡头自写，见 §6 / `docs/interaction-design.md` §15.4），写入路径必须带实例段
  （`providers.<p>.models.<i>.<field>` /
  `providers.<p>.modelOverrides.<id>.<field>`）。缺实例段的路径会被 host
  `applyPathOp` 直接拒绝（`Config array index "<field>" is out of range`），
  该缺陷与修复证据见 [verification.md](verification.md) §10 与
  `tests/instances.test.js`、`tests/verify.integration.mjs` HOST-5..8。
- 卡片标题（v7 起）= `name` → `id` → `#n`；`modelOverrides` 保持字典键标题。
  字段名优先序必须由 `lib/client.fields.js` 的呈现元数据表达，面板不得写死字段名
  （AGENTS §3.2、验收 A9；见 `docs/interaction-design.md` §15.9 D1）。

### R4 提供商管理

- 支持新增（输入提供商名）、选择、删除提供商。
- 顶部是一条提供商 tab 条（显示全部提供商，`displayName` 优先、回落配置键名）；
  v7 起外观与语义抄官方「内置插件」页的 `.tabs`/`.tab`（下划线式 tab，见
  `docs/interaction-design.md` §15.2），**添加**是 tab 条末尾的一枚真 tab
  （选中它显示新增表单），**删除当前提供商**移到吸底操作条 `.piai-bar`。
- 下方是所选提供商的**全部**可配置项，**不再按「路由 / 高级 / 模型」分标签**。
- 分组只作为页内分节存在（基础信息 / 模型列表 / 逐模型覆盖 / 默认值 / 请求构造 /
  超时 / 图片预算 / 重试 / 协议兼容 / 其他），任何分组都不得被藏进另一个标签。

### R5 写入

- 所有写入走 DSH 既有设置管线：`configForms.mutate` → `remote.settings.mutate`
  → `settings.write` → `configEditor.edit` → 原子写 `cordis.patch.yml`。
- 必须携带 revision，冲突时把错误交给用户，**不得静默重试**。
- **清空字段表示「继承」**，发出 `unset`；**不得**用 `null` 表达清空。
- 写入仅限 `llm-pi-ai` 这一行；不得影响其他插件、其他行。
- 保留未知字段、保留 `!!js` 表达式、保留块外注释与其他插件配置。

### R6 协议兼容提示

- 按协议（`openai-completions` / `openai-responses` / `anthropic-messages` /
  `bedrock-converse-stream` / `mistral-conversations` 等）提示 `compat` 字段是否被接受。
- 提示是 **advisory**；adapter 的校验与报错始终权威，页面原样展示其错误。

### R8 凭据（密钥）

- `apiKeyEnv` 是**凭据引用**，页面上**只读展示**引用名 + 状态（未配置 / 已配置（本地凭据）/
  已配置（环境变量））+ 复制。
- 支持**设置/更新密钥**：内联密码输入 → `ctx.remote.credentials.set(ref, secret)`；
  **清除密钥** → `unset(ref)` + 二次确认。
- 引用名为空时允许先设置引用名（走既有 settings 管线写入 `apiKeyEnv`，校验
  `[A-Za-z_][A-Za-z0-9_]*`）。
- 密钥**永不进入** draft / ops / YAML；宿主没有凭据 remote 时降级为只读提示。
- 依据：adapter `apiKeyEnv: z.string().role("credential-ref")` 与 shipped 模型页的
  `remote.credentials.set/unset` 用法（见 `docs/verification.md` §12）。

### R7 其他参数

- adapter 已实现但自带界面未开放的模型参数，本页也必须开放
  （`defaultInput`、`headers`、`reasoning`、`thinkingBudgets`、`cacheRetention`、
  `transport`、`timeoutMs`、`websocketConnectTimeoutMs`、`streamIdleTimeoutMs` 等）。

## 4. 非功能需求

| 编号 | 要求 |
| --- | --- |
| N1 | 不新增第三方依赖（含构建期）；不使用 TypeScript、不引入打包器 |
| N2 | 模块按职责拆分，禁止单体文件；每个非 owner 文件是可复用的包内 chunk |
| N3 | 复用 DSH 既有组件与服务，不重造轮子 |
| N4 | 不做与需求无关的重构 |
| N5 | 文档与代码一致 |
| N6 | 未实测的项目必须标为 `untested`/`blocked`，不得声称通过 |

## 5. 验收标准

| 编号 | 标准 | 判定方式 |
| --- | --- | --- |
| A1 | 全部测试通过 | `node --test` → **tests 359 / pass 358 / fail 0 / todo 1**（v9-T32/T35 后实测；另见 `tests/verify.*.mjs` 38/15/42 与 v7/v8 两个 audit）|
| A2 | 字段零丢失：每个 schema 叶子恰好落在一个分组 | `tests/coverage.test.js` |
| A3 | 名单正确：22 / 7 / 26，且是显式写死的独立记录 | `tests/coverage.test.js` |
| A4 | 未知字段仍会渲染（前向兼容） | `tests/coverage.test.js` 合成未知叶子 |
| A5 | 清空产生 `unset`，绝不产生 `set null`；并符合 host 真实语义 | `tests/form.test.js` + `tests/verify.integration.mjs` |
| A6 | 协议门控与 adapter 完全一致 | `tests/compat.test.js` |
| A7 | bundle 装载契约正确（owner 无 chunk、**全部** chunk 名合法、加载计划↔磁盘↔请求一致、槽位 id/order 正确、未提供命名空间时零注册） | `tests/wiring.test.js`、`tests/module-contract.test.js` |
| A8 | 每个 `lib/*.js` 语法正确 | `node --check`（v10 实测 **20/20**）|
| A9 | 面板中不出现任何 provider/model 字段名字面量 | `grep`（已实测零命中） |
| A10 | 无第三方依赖、无直接文件/YAML 访问 | 清单 + `grep` |
| A11 | 每个配置项都有 key + 中文标签 + 中文说明 | `tests/presentation.test.js`（60 个 key / 125 个渲染期叶子） |
| A12 | 凭据只经 `remote.credentials.*`，密钥不落配置 | `tests/wiring.test.js` + `tests/a11y.test.js` |
| A13 | GUI 中菜单可见且可保存 | **当前 blocked**，见 `docs/verification.md` |
| A14 | v7：tab 外观/语义照官方「内置插件」页；「添加」是真 tab；删除在 `.piai-bar` | `tests/a11y.test.js` + `tests/render.test.js` + `tests/verify.polish.mjs` |
| A15 | v7：字段说明与 key chip 在提示气泡里（`Tooltip(openOnClick, portal, side=right)`）；字段级行内无 `.piai-hint` | `tests/a11y.test.js` |
| A16 | v7：实例卡卡头自写、删除常驻、标题 `name→id→#n`（覆盖仍为字典键） | `tests/instances.test.js` |
| A17 | v7：枚举是「方框单选」且任意项数都不走 `Menu`；`renderRow` 对 enum 的 `useHtmlFor` 为 false | `tests/a11y.test.js` |
| A18 | v7：复选组间距 8px/16px、框↔label 4px、label 不换行；同行五处按钮 32px | `tests/styles.test.js` + `tests/verify.polish.mjs` |
| A19 | v7 类集合 **66**（v9 起 **67**，见 A23）、token 白名单 **23**（实测用到 19）；`:focus-*` 恰好 4 条白名单选择器 | `tests/styles.test.js` + `tests/v7.audit.test.js` + `tests/v8.audit.test.js` |
| A20 | v7 写入语义未变（清空仍 `unset`，无 `set null`）；v9 起 `inject` 为 **8** 个服务（新增 `remote.llm`，见 A25）、无新依赖 | `tests/v7.audit.test.js`、`tests/wiring.test.js` |

A11 是本项目唯一无法在当前环境闭环的验收项，原因与证据见
[docs/verification.md](verification.md) §3、§4。它被明确标注，而不是被声称通过。

## 6. v7 用户需求（R1–R6）

> **编号提醒**：本节的 R1–R6 是 v7 轮次用户需求的编号，与 §3 的 R1–R8 是**两套编号**。
> 完整交互/视觉规则与官方出处见 [docs/interaction-design.md](interaction-design.md) §15；
> 本节只记录需求口径，不重复出处。写入语义与定位（§2、R5）不变。

| 编号 | 需求 | 已定假设 / 待决策 |
| --- | --- | --- |
| R1 | 提供商 tab 条：外观/语义照官方「内置插件」页的 `.tabs`/`.tab`（下划线指示条）；任意数量提供商可换行；**添加 = 一枚真 tab**（打开添加 panel）；**删除提供商挪到 `.piai-bar`** | 空列表行为待决策（§15.9 D2） |
| R2 | 字段提示：官方 `SettingsValueField` 式提示钮（24×24 + `IconInfoOutlineRegular` size 12），交互改为 `Tooltip(openOnClick, portal, side=right)`；气泡内容 = 原始 key chip + 中文说明；**行内不再显示 key chip**；分组级说明保留 | `IconInfoOutlineRegular`、行内去 key chip 为已定假设 |
| R3 | 实例卡：标题 `name` → `id` → `#n`；`modelOverrides` 保持字典键标题；卡头自写（含常驻删除），不使用 `DisclosureRow` 的动作槽 | 字段名优先序的实现方式待决策（§15.9 D1） |
| R4 | 枚举：单选语义 + 方框外观（非原生圆形），支持多选项换行；`>4` 项不再用 `Menu`；`renderRow` 对 enum 的 `useHtmlFor = false` | 自画方框（+1 token）为已定假设 |
| R5 | 复选组（`.piai-checks`）：行内/换行、label 不换行、框↔label 4px（覆盖原语内部 6px）、项间 8px/16px | — |
| R6 | 同行按钮 32px：`piai-provider-add`（既有）+ `piai-dict-add` / `piai-tag-add` / `piai-cred-editor` / `piai-cred` 四处；**不改 `Button` 的 `size` 属性** | hover 背景 token 待决策（§15.9 D3） |

## 7. v9 用户需求（R1–R6）与验收（A21–A28）

> **编号提醒**：本节是**第三套** R 编号（§3 是 v3 的 R1–R8，§6 是 v7 的 R1–R6）。
> 本轮**不改**定位（§2）、写入链路（§3 R5）与清空语义，只改控件呈现并新增两条交互。
> 交互与官方出处见 [interaction-design.md](interaction-design.md) §18；
> 控件级记录见 [field-coverage.md](field-coverage.md)。

| 编号 | 需求 | 判定方式 |
| --- | --- | --- |
| R1 | **档位行普通化**：`reasoningEfforts` 的每个档位渲染成普通字段行（中文档位名 + ⓘ 提示 + 输入框），不再有裸 key chip | `tests/a11y.test.js` / `tests/instances.test.js` 断言 `.piai-tier-key` 计数为 0；真实浏览器夹具的 `tierInputFillsRow` + `tierInfoVisible` 两项 **verified**——**判定以 [verification.md](verification.md) §18.2/§18.6 为准** |
| R2 | **逐选项说明**：单选/多选/闭集字典的每个选项都要有中文说明，讲清「填什么、什么含义」；说明可换行，追加在该字段的提示气泡里 | `tests/hints.test.js` 断言每个 enum 取值 / `array`+`enum` 取值 / `$var` 取值都有非空中文说明；`tests/a11y.test.js` 断言气泡结构是 `[span.piai-root > (code.piai-key?, span(hint)?, span(line)*)]`（**无 `<br>`**，v9-T20） |
| R3 | **布尔 = 三态单选**：`开启` / `关闭` / `默认（未设置）`；第三个是回到「未写」的唯一路径，`Switch` 在布尔字段退役 | `tests/a11y.test.js`、`tests/v8.audit.test.js`（断言布尔行是 `radiogroup` 且**不**解析 `Switch`） |
| R4 | **模板参数行简化**：`compat.chatTemplateKwargs` / `chatTemplateArgs` 每行一个「`字面值` / `$var 变量`」二选一 + 对应编辑器，键名只显示一次，模式与每个变量都有说明 | `tests/a11y.test.js`、`tests/hints.test.js`；真实浏览器夹具的 `templateRowReadable` + `templatePartOrder` 两项 **verified**；写入语义由 `tests/form.test.js` 兜（清空 = `unset`） |
| R5 | **原代码 = 只读预览**：显示**整个 `llm-pi-ai` 配置的当前草稿**（含未保存修改），草稿脏时**必须提示**未保存；只读，不产生任何写入 | `tests/raw.test.js`（内容 === `yaml.toYaml(草稿)`、dirty 有提示、全程 0 次 `mutate`）；`tests/yaml.test.js`（序列化契约与敌意输入） |
| R6 | **获取可用模型**：走官方 `llm/discoverModels` 同款流程——请求 → 可搜索选择器 →「添加所选」才写入 `models[]`；已有行不被覆盖；不自动保存。**候选行只显示原始 id**（等宽；显示名进 `title = 名称 \|\| id`，`name === id` 不重复；名称仍可被搜索命中），与官方「设置 → 模型」picker 同款 | `tests/catalog.test.js`（成功/拒绝/空/异常四条路径、已有行保留、ops 路径带实例段、宿主缺 `remote.llm` 时不抛错）；候选行口径见 `interaction-design.md` §18.1 E17b/§18.3、官方 `PICKER:874-878` |

### 语义登记（v9 复核，写进本文件即为项目规则）

1. **留空 = 删键（`unset`）**；清空字段永远只发 `{op:"unset"}`。
2. **`null` 只在 schema 明确声明可空、且用户显式选择时才写入**；本轮界面
   **没有任何**会写值型 `null` 的入口（唯一 adapter 合法的 `reasoningEfforts.off: null`
   只能手写 YAML）。依据与 file:line 见
   [research-findings.md](research-findings.md) §6 与 [field-coverage.md](field-coverage.md)
   的「清空语义的依据」。
3. 该规则**不是新规矩**（它一直是 AGENTS §3.3 与 R5 的要求），v9 只是把它复核到了
   adapter / pi-ai 的实测行为上。

| 编号 | 标准 | 判定方式 |
| --- | --- | --- |
| A21 | R1 档位行：无裸 key chip；每行 1 个 ⓘ，`aria-describedby` 解析到该 trigger；input id 仍以 `-<level>` 结尾 | `tests/a11y.test.js`、`tests/instances.test.js`、`tests/v7.audit.test.js` 的 info 计数不变量 |
| A22 | R2 逐选项说明：每个取值都有中文说明且进入气泡（radio `title` + 气泡追加行；气泡是单个 `span.piai-root` 纵向栈，无 `br`，portal 内自带嵌套根，见 `interaction-design.md` §18.6.1） | `tests/hints.test.js`、`tests/a11y.test.js` |
| A23 | 类集合 **67**：`+piai-tabs-bar` `+piai-catalog` `−piai-tier-key`；CSS / `CLASSES` / JS 字面量 / polish `FROZEN_CLASSES` 四方相等 | `tests/styles.test.js`、`tests/v8.audit.test.js` §16.5 W1 |
| A24 | token 白名单仍 23（实测用到 19）、`:focus-*` 仍恰好 4 条、未新增 `--dsw-*` | `tests/styles.test.js`、`tests/v8.audit.test.js` |
| A25 | `inject` = **8** 项（`slots`/`locale`/`remote`/`remote.settings`/`remote.credentials`/`remote.llm`/`configForms`/`settingsSchema`）；`remote.llm` 缺席时页面仍注册、发现降级 | `tests/wiring.test.js`、`tests/v7.audit.test.js`、`tests/v8.audit.test.js`、`tests/catalog.test.js` |
| A26 | R5 原代码：只读、草稿同源、dirty 提示、0 写入；YAML chunk 契约（永不抛错、无尾换行、`!!js` 原样）| `tests/raw.test.js`、`tests/yaml.test.js` |
| A27 | R6 发现：四条路径都不写配置、已有行不被覆盖、采纳只暂存；**候选行只渲染原始 id**（`title = 名称 \|\| id`，名称仍可被搜索命中），与官方 picker 一致 | `tests/catalog.test.js`；浏览器侧的选择器/候选行准则状态见 `docs/verification.md` §18 |
| A28 | 字段覆盖 22 / 7 / 26 与叶子总数不因 v9 改变 | `tests/coverage.test.js`、`tests/presentation.test.js`（125 个渲染期叶子） |

**逐项判定与未闭环项（判定一律以 [verification.md](verification.md) §18.6 为准，本文件不代替它下结论）**：

- R1 的**计算布局**由 `tests/layout/` 的真实浏览器夹具实测（§18.2，v9-T13 修夹具 +
  v9-T14 独立复测），逐项 **verified**：
  - 档位行 —— `tierInputFillsRow`（input 与控件槽等宽，delta 0）+ `tierInfoVisible`
    （ⓘ 24×24；「off 档位」文字未被压成 0 宽）。
  - 布尔三选一 —— `boolRadios16`（3×`16×16`）+ `boolLabelsVisible`（三个标签同一 top）。
  - 模板参数行 —— `templateRowReadable`（键名/模式/值/删除 4 个部件都可见、未裁切、都在卡片内）
    + `templatePartOrder`（DOM 序 键名 → 模式 → 值 → 删除）。
  - tab 两栏 —— `barIsOneRow`（overlap 27.5、bottomDelta 0）+ `actionsRightOfList`（0px）
    + `actionsFlushRight`（gap 0）+ `actionVisible` + `actionSlotDoesNotWrap`。
- **条目内竖排不是缺陷**：`.piai-dict-row` 是卡片容器（`interaction-design.md` §14.2 的既有设计），
  v9 早期的旧准则 `templateRowOnOneLine` 已**删除并重写**
  为上面的 `templateRowReadable` / `templatePartOrder`（F2 已裁决，见 §18.8）。
- **「原代码」视图 = `partial`**（§18.6/§18.7）：`tests/raw.test.js` 证明 DOM 层存在与 dirty 文案，
  `r5-raw.html` 夹具只覆盖**回退形状** `<pre class="piai-expr-body">`；`CodeBlock` 原语的真实
  几何（行号列宽、复制按钮位置、shiki 高亮）**未测**，不得升级。
- **模型目录 Modal = `partial`**（§18.6）：证据是「真实样式表 + 自建 DOM」，不是 Modal 原语
  真实渲染；夹具未新增该页。
- **A13（真实 GUI 里本页可见）= `blocked`**（§18.6）：首次发现需要一次 DSH 重启。

# 字段覆盖记录（field coverage）

本文件是「模型扩展配置」页面对 `llm-pi-ai` 配置项的覆盖记录。

**权威来源不是本文件，也不是页面代码，而是运行时的 schema 信封。** 页面通过
`ctx.configForms.describe()` 拿到 host 投影出的 `volatileForm(Config).toJSON()`，
再由 `lib/client.schema.js` 遍历出全部可写叶子。`lib/client.fields.js` 只负责分组、
标签与提示。因此上游新增字段会自动出现在页面上，不会因为本文件忘记更新而消失。

本文件与 `tests/coverage.test.js` 一起构成记录：测试从真实 fixture
(`tests/fixtures/llm-pi-ai.schema.json`) 出发，断言每个叶子恰好落在一个分组里，
并断言下面这几份名单。

- fixture：`{uid: 382, refs: 144}`，由 `node scripts/snapshot-schema.mjs` 从已安装的
  `@deepseek-ai/dsh-llm-pi-ai` 生成。
- 单个提供商（provider profile）共 **22** 个字段，其中遍历出的可写叶子共 **111** 个
  （容器本身不产生叶子，其子字段会展开）。

## 分组总览

| 分组 | id | 叶子数 |
| --- | --- | --- |
| 基础信息 | `identity` | 4 |
| 模型列表 | `models` | 32 |
| 逐模型覆盖 | `overrides` | 31 |
| 默认值 | `defaults` | 3 |
| 请求构造 | `request` | 8 |
| 超时 | `timeouts` | 3 |
| 图片预算 | `images` | 3 |
| 重试 | `retry` | 1 |
| 协议兼容（提供商级） | `compat` | 26 |
| 其他 | `other` | 0（兜底分组，仅在出现未知字段时非空） |

## 提供商级 22 个字段

| 字段 | kind | 分组 | 页面是否开放 |
| --- | --- | --- | --- |
| `apiKeyEnv` | string | 基础信息 | 是（凭据引用，`x-cordis.role=credential-ref`） |
| `displayName` | string | 基础信息 | 是（同时用作顶部提供商 tab 的显示名） |
| `api` | enum(`openai-completions`/`openai-responses`/`anthropic-messages`) | 基础信息 | 是 |
| `baseURL` | string | 基础信息 | 是 |
| `models` | array(object) | 模型列表 | 是（可增删） |
| `modelOverrides` | dict(object) | 逐模型覆盖 | 是（可增删键） |
| `compat` | object(26 键) | 协议兼容（提供商级） | 是 |
| `defaultContextWindow` | integer | 默认值 | 是 |
| `defaultMaxTokens` | integer | 默认值 | 是 |
| `defaultInput` | array(enum `text`/`image`) | 默认值 | 是 |
| `headers` | dict(string) | 请求构造 | 是（键值行） |
| `reasoning` | enum(`off`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`) | 请求构造 | 是 |
| `thinkingBudgets` | object(`minimal`/`low`/`medium`/`high`) | 请求构造 | 是 |
| `cacheRetention` | enum(`none`/`short`/`long`) | 请求构造 | 是 |
| `transport` | enum(`sse`/`websocket`/`websocket-cached`/`auto`) | 请求构造 | 是 |
| `timeoutMs` | integer | 超时 | 是 |
| `websocketConnectTimeoutMs` | integer | 超时 | 是 |
| `streamIdleTimeoutMs` | number (300000, 1..2147483647) | 超时 | 是 |
| `maxRequestImageBytes` | integer (20971520) | 图片预算 | 是 |
| `requestImagePixelBudget` | integer (4194304) | 图片预算 | 是 |
| `requestImageMaxBytes` | integer (1048576) | 图片预算 | 是 |
| `retryPolicy` | union(`normal`/`always`) | 重试 | 是（判别式联合） |

合计 22 项，全部在页面上可达。

## 模型级 7 个字段

`models[]` 的每一项与 `modelOverrides.<id>` 共用同一套字段，但 **override 不含 `id`**
（字典键即 id，adapter 明确拒绝在 override 内再写 `id`）。

两者都是**实例容器**：叶子清单里它们的成员路径不带实例段（`providers.<p>.models.id`），
`lib/client.schema.js` 给这些叶子打上 `container = {kind, path}`，面板按实例渲染成
每模型 / 每键一张可折叠卡片，并把路径重定基为 `providers.<p>.models.<i>.<field>` /
`providers.<p>.modelOverrides.<id>.<field>`。因此：

- 叶子总数与上表**不变**（`models` 32、`modelOverrides` 31）；
- 只有带实例段的路径才会被 host `applyPathOp` 接受；不带实例段的旧路径会抛
  `Config array index "<field>" is out of range`（见 `docs/verification.md` §10）。


| 字段 | kind | 页面是否开放 |
| --- | --- | --- |
| `id` | string（必填，仅 `models[]`） | 是 |
| `name` | string | 是 |
| `contextWindow` | integer | 是 |
| `maxTokens` | integer | 是 |
| `input` | array(enum `text`/`image`) | 是 |
| `reasoningEfforts` | union(`false` / `null` / 强度表) | 是（专用控件） |
| `compat` | object(26 键) | 是 |

## compat 的 26 个键

provider 级与 model 级 **键集完全一致**（已用测试比对，双向零差异）：

```
supportsStore, supportsDeveloperRole, supportsReasoningEffort,
supportsUsageInStreaming, supportsFinishReason, maxTokensField,
requiresToolResultName, requiresAssistantAfterToolResult,
requiresThinkingAsText, requiresReasoningContentOnAssistantMessages,
thinkingFormat, chatTemplateKwargs, chatTemplateArgs,
supportsThinkingTokenBudget, thinkingTokenBudgetField, vllmPriority,
supportsMaxOutputTokens, supportsStrictMode, cacheControlFormat,
supportsLongCacheRetention, supportsEagerToolInputStreaming,
supportsCacheControlOnTools, supportsTemperature, forceAdaptiveThinking,
allowEmptySignature, supportsStrictTools
```

其中 `chatTemplateKwargs` / `chatTemplateArgs` 是字典，值可以是字面量，也可以是
`{$var, omitWhenOff?}`，`$var ∈ {thinking.enabled, thinking.effort, thinking.budget}`。

### 协议可见性（advisory）

`lib/client.fields.js` 镜像了 adapter 的 `COMPAT_GATES`，用于保存前提示。**adapter 始终
是权威**：它拒绝某个被 withhold 的字段时会直接报错并点名该字段，页面原样展示该错误。
每个协议的 offer 数量：

| 协议 | offer |
| --- | --- |
| `openai-completions` | 19 |
| `openai-responses` / `azure-openai-responses` / `openai-codex-responses` | 4（共享同一 gate） |
| `anthropic-messages` | 7 |
| `bedrock-converse-stream` | 1（`supportsStrictMode`） |
| `mistral-conversations` | 0（仅 withhold 一个字段） |

**页面上的 compat 分区（v8）**：26 个键被 `compatSections()` 分成 6 个折叠分区，
分区头是**自写折叠头**（复用 `instanceCardHead` + 空动作槽，14px chevron 常显、
整条标题可点、Enter/Space 可切换）。**分区头不再显示任何数量计数**
（`piai-count` 徽标已删除），分区体常驻 DOM + `hidden`、左内边距 18px 与标题文字对齐；
字段仍在展开时才挂载。详见 `docs/interaction-design.md` §16.4。

## adapter README 未列出、但 schema 定义的 9 个字段

这 9 个字段在 adapter 的 README 表格里没有出现，但 schema 里真实存在，页面全部开放：

`defaultInput`、`headers`、`reasoning`、`thinkingBudgets`、`cacheRetention`、
`transport`、`timeoutMs`、`websocketConnectTimeoutMs`、`streamIdleTimeoutMs`

`tests/coverage.test.js` 中有一条专门的测试断言这 9 个字段既存在于 schema、又落在某个
分组里，防止"文档没写就被悄悄漏掉"。

## 明确不在本页面的内容

- `providers` 根节点本身（它没有可写的整体语义；它由顶部提供商 tab 行承担选择）。
- `models[]` / `modelOverrides` 的容器路径本身（由实例卡片承担增删）。
- 已移除的历史键 `provider` / `maxRetries` / `maxRetryDelayMs`（仅作为迁移提示）。
- 未求值的 `!!js` 表达式：只读展示，保存时原样保留，不会被本页面改写。

## 呈现覆盖（key + 中文标签 + 中文说明）

页面每个字段行显示：**中文标签 + 控件**，另有一个提示钮（`piai-info`）把
**原始 YAML key（chip）与该字段的中文说明**一起放进气泡（v7 起；见
`docs/interaction-design.md` §15.3）。分组级说明仍内联显示。

**气泡形状（v9-T20 起）**：Tooltip 的 `label` 恰好是一个 `span.piai-root`，其直接子元素
按序是 `code.piai-key?` → `span(字段说明)?` → `span(选项行)*`；行距来自该栈自身的
`flex-direction:column; gap:4px`，**不再使用 `<br>`**。因为气泡走 `createPortal(…, document.body)`、
在真实 GUI 里没有 `.piai-root` 祖先，样式表用成对选择器
（`.piai-root .piai-root` + `.piai-root:not(.piai-page)`）覆盖嵌套根与 portal 根两种情形；
`> .piai-key { align-self:flex-start }` 让 chip 保住内容宽度与底色/边框/圆角。
文字色分两种（v9-T31 + v9-T35）：**嵌套根**（正文与逐选项说明）带 `color: inherit`，
继承 portal 落点的 surface，否则浅色主题下会深字压深底；**chip 不继承**，继续用 base
`.piai-key` 的同族主题 token 色对（`--dsw-alias-label-secondary` 文字 +
`--dsw-alias-bg-layer-2` 底 + `--dsw-alias-border-l1` 边框）= 浅底深字。
两种做法都**不引用** primitives 的静态浅色 token，白名单仍 **23/19**。
内边距同样是**补偿值**（v9-T39）：primitives 的 `.bubble` 固定 `padding: 3px 7px`，
wrapper 用 `padding: 12px 8px`（`--piai-space-3/2`）补偿成四边 **15px** 等距；该规则用
`:has(> .piai-key)` / `:has(> span)` 门控，**只命中气泡**，Modal 内容层不加 padding。
细节与浏览器证据见 `docs/interaction-design.md` §18.6.1 与 `docs/verification.md` §18。

- 文案全部来自 `lib/client.fields.js` 的 `FIELDS` 表；显示用的原始 key 由
  `keyLabelFor(leaf)` 从叶子路径推导（`apiKeyEnv` / `compat.thinkingFormat` /
  `models[].maxTokens`），因此 key 不可能与 schema 漂移。
- `tests/presentation.test.js` 枚举**页面真实渲染**的 125 个叶子（含 `retryPolicy`、
  `reasoningEfforts` 等联合分支，以及重定基后的模型/覆盖叶子），断言每个叶子都能解析出
  中文标签与中文说明，并把 60 个呈现键写成显式名单：上游新增字段会**故意失败**。
- 实例重定基（`models[i]`、`modelOverrides.<id>`）通过 `leaf.presentationPath` 走同一张表；
  没有它，模型卡片里的标签会退化成英文标识符且丢失说明（见 `docs/verification.md` §12）。
- **取值级中文名**（v5）：`VALUE_LABELS` + `valueLabelFor(leaf, value)` 给个别取值起中文名并
  保留原始 YAML token，目前用于输入模态：`text` → 「文本（text）」、`image` → 「图片（image）」
  （`input` 与 `defaultInput` 共用；`models[].input` 通过 `presentationPath` 命中同一项）。
  没有条目的取值仍显示原始 token，枚举分段/菜单的标签不变。
- **成对呈现**（v6）：`pair` id 把**相邻**的短字段合并成两列网格（`.piai-row-pair`，抄自
  shipped「模型」页的 `_modelAdvanced`）。当前分组：

  | pair id | 字段 |
  | --- | --- |
  | `identity` | 模型 `id` + `name`（`modelOverrides` 没有 `id`，`name` 单独一行） |
  | `size` | `contextWindow` + `maxTokens`；`defaultContextWindow` + `defaultMaxTokens` |
  | `timeout` | `timeoutMs` + `websocketConnectTimeoutMs` |
  | `image` | `maxRequestImageBytes` + `requestImageMaxBytes` |
  | `backoff` | `retryPolicy.backoff.initialDelayMs` + `maxDelayMs` |
  | `budget` | `thinkingBudgets` 六档（3 行 × 2 列） |

  连续且同 id 才合并；单个成员仍渲染成普通行。`tests/presentation.test.js` 断言每个 id 至少覆盖
  两个渲染期叶子（防止"写了没用"），`tests/instances.test.js` 断言模型卡里的实际网格。

### 闭集多选与闭集字典的控件语义（v5）

| 情形 | 控件 | 写入语义 |
| --- | --- | --- |
| `array` + `enum`（`input`/`defaultInput`） | 复选组 `piai-checks`，每个允许值一个 `Checkbox`（**v8 起盒子固定 16×16，标签文字必须可见**，见 `docs/interaction-design.md` §16.2） | 勾选/取消即改写数组；最后一个取消 = `unset` 整个字段 |
| `array` 无 enum（`retryPolicy.retryableCodes`） | 自由标签 chip（`piai-tags`） | 增删即改写数组；清空 = `unset` |
| `dict` + `keyEnum` + 标量值（`reasoningEfforts`） | 档位表 `piai-tiers`：`keyEnum` 每个键一行**普通 `Row`**（**v9**：不再有裸 key chip，`.piai-tier-key` 退役；key 与说明改走该行的 `piai-info` 气泡） | **留空 = 删除该键（不声明该档位）**；全空 = `unset` 整个字段 |
| `dict` + `valueVar`（`compat.chatTemplateKwargs` / `compat.chatTemplateArgs`） | 模板参数表 `TemplateArgsControl`（**v9**）：每行一个「`字面值` / `$var 变量`」模式单选（`includeUnset: false`，模式是二选一而非三态）+ 对应编辑器 | 删除键 = 删该键；**删掉最后一项 = `unset` 整个字段**（adapter 视空 dict 与缺键等价，见下节依据） |
| 其它 `dict`（`headers`） | 通用字典编辑器（含 `null` 开关） | 删除键 = 删该键；清空 = `unset` |

**已知取舍**：`reasoningEfforts` 的 adapter 校验只允许 `off` 为 `null`（其余档位为 `null`
或空串都会报 `needs the wire value dispatch should send`），档位表因此**不写 null**。
代价是「`off` 支持但不发参数」（YAML 里的 `off:`，即字面 `null`）没有 UI 入口，只能手写
YAML；`off` 留空等于「不声明 off」= 该模型关不掉思考。详见
`docs/verification.md` §14 与 `lib/client.fields.js` 的 `reasoningEfforts.off` 说明。

### `apiKeyEnv`（凭据引用）

schema 的 `meta.role = "credential-ref"`：它是**凭据名**，不是密钥。页面只读展示引用名与
状态，密钥经 `remote.credentials.set` 写入宿主凭据存储；配置里永远只有引用名。
详见 `docs/requirements.md` R8 与 `docs/verification.md` §12。

### v7 呈现调整（不改变字段真源与写入语义）

字段行的解剖（v7，逐条见 `docs/interaction-design.md` §15）：

```
.piai-row
├─ .piai-row-head   中文 label + .piai-info 提示图标 + 必填/已修改标识
│                   （原始 key chip 不在这里）
├─ .piai-row-control  控件本体；aria-describedby 指向 .piai-info 的 id
└─ （字段级行内 .piai-hint 已取消；说明在气泡里）
```

| 调整 | 实际实现 | 性质 / 出处 |
| --- | --- | --- |
| 字段提示 | 常驻 `piai-info`（24×24、`IconInfoOutlineRegular` size 12）；`Tooltip(openOnClick, portal, side="right")` 气泡内容 = `piai-key` 的原始 key chip + `fields.hintFor(leaf)` 的中文说明；行内无 key chip、无字段级 `.piai-hint`（分组级说明仍内联）。**v9-T20 起**形状为单个 `span.piai-root` 纵向栈（无 `<br>`、portal 内自带嵌套根，见 §18.6.1） | 用户需求 R2；官方提示钮 E3/E4（`docs/interaction-design.md` §15.3、§18.6.1） |
| 实例卡标题 | `models[]` 卡：`name`（非空）→ `id` → `#n`；`modelOverrides` 卡仍用字典键。优先序经 `describeField(path).titleRank` 表达（`name` 标 1），面板不写死字段名；回落链 = rank 候选 → `required` string → `#n` | 用户需求 R3；§15.9 D1 已裁决接受 `titleRank` |
| 枚举控件（单选） | `.piai-select` 作 `role="radiogroup"`，每个取值一个原生 radio（同 `name`、`appearance:none` 16px 方框、选中 brand 填充 + CSS 边框勾）；最后一项是「默认（未设置）」（**v9 文案**；选中 = `unset`）；任意项数都不走 `Menu`；`renderRow` 对 enum `useHtmlFor = false` | 用户需求 R4；§15.5；§18.7 |
| 复选组间距 | `.piai-checks` 项间 8px/16px、框↔label 4px（`> label`）、文本不换行（`> label > span` **只保留 `white-space: nowrap`**，v8 起删掉 `min-width/overflow/text-overflow`，见 §16.2）；勾选/取消语义与「最后一个取消 = `unset`」不变 | 用户需求 R5；§15.6、§16.2 |
| 同行按钮 | 五处（provider-add / dict-add / tag-add / cred / cred-editor）行内按钮 32px，仅覆盖 CSS 高度，`Button size` 仍为 `sm` | 用户需求 R6；§15.7 |

**单选枚举 vs 闭集多选的区别（易混点）**：`enum`/`const` 是**单选**（radiogroup，选一个；
「默认（未设置）」= `unset`）；`array`+`enum`（`input`/`defaultInput`）是**多选**（`piai-checks` 复选组，
可勾多个，最后一个取消 = `unset`）。两者写入语义都是 `unset`，绝不写 `null`。
（v9 起布尔叶子也走同一个 radiogroup：`开启` / `关闭` / `默认（未设置）`。）

### 联合分支参数块（v8）

判别式联合（如 `retryPolicy` = `normal` / `always`）的分支成员叶子（`maxRetries`、
`retryableCodes`、`backoff.*`）路径比联合路径长一级，但它们是**当前选中那个分支的参数**，
不是另一个子对象键。页面因此：

- `.piai-nested` **不画左边框/缩进竖线**（v8 删除 `border-left` 与 `padding-left`），
  用间距分隔；
- 标题点名分支：`branchLabelFor(active) + '的参数'`（如「normal（按次数重试）的参数」），
  取不到时回落「分支参数」；
- 分支切换后标题随之变化；面板不写死任何 provider/model 字段名。

出处：`docs/interaction-design.md` §16.3（本项目决定 + `lib/client.fields.js` 的
`retryPolicy.branch.*` 中文名）。

### 复选框组：标签必须可见（v8）

`input` / `defaultInput` 的复选组（以及字典行的「关闭时省略」复选框）在 v8 修复了
「复选框被拉伸、文字标签被压成 0 宽」的缺陷：盒子固定 16×16，文本 span 只保留
`white-space: nowrap`。语义不变（勾选/取消即改写；最后一个取消 = `unset`）。
**可见性是布局属性，`node --test` 的 DOM 断言看不见**，由 `tests/layout/` 的真实浏览器
夹具测量（见 `docs/verification.md` §17.2–§17.3）。

字段清单（22 / 7 / 26）、分组、容器实例重定基与全部写入语义**不因 v7/v8 改变**；
**v9 也不改**——v9 只改控件的呈现与「清空」的文案，字段集仍等于 schema 的字段集。

样式侧的计数（与代码实测一致）：CSS 类集合 **67**（v7 新增 `piai-item-head` /
`piai-item-actions` / `piai-item-remove`；v8 等量替换 `piai-count` → `piai-disclosure-body`；
**v9 净 +1**：新增 `piai-tabs-bar`（两槽 tab 条）与 `piai-catalog`（发现结果列表），
退役 `piai-tier-key`），token 白名单仍 **23**（实测用到 19），
焦点选择器仍恰好 4 条白名单式规则——细节见 `docs/interaction-design.md` §15.8、§16.5、§18.8
与 `docs/verification.md` §16。

## v9 控件与语义变更

v9 的字段覆盖与写入语义**一项未变**；变的是控件形态与「清空」的措辞。逐条：

| 变更 | 实际实现 | 依据 |
| --- | --- | --- |
| **布尔叶子改三态单选** | `BooleanControl` 不再用 `Switch`，改用共享的 `EnumControl`：`开启`（`true`）/ `关闭`（`false`）/ `默认（未设置）`（`__unset__` → `form.remove`，绝不 `form.edit(path, null)`）。`false` 与「未写」是两个状态，第三个 radio 是回到「未写」的唯一路径 | `lib/client.panels.controls.js` 的 `EnumControl()`、`BooleanControl()`；`tests/a11y.test.js:675-683`、`:811-844` |
| **档位行 = 普通 `Row`** | `TierTableControl` 的每一行包在共享 `Row` 里（`label` = 该档位的中文名，`keyLabel` = `reasoningEfforts.<level>`，说明进 `piai-info` 气泡），不再是「裸 key chip + 输入框」 | `lib/client.panels.collections.js` 的 `TierTableControl()`；`tests/a11y.test.js:1911`、`tests/instances.test.js:676` 断言 `.piai-tier-key` 为 0 |
| **模板参数表** | `compat.chatTemplateKwargs` / `chatTemplateArgs` 走 `TemplateArgsControl`：每行一个「`字面值` / `$var 变量`」模式单选（`includeUnset: false`）；模式说明、`$var` 变量名说明都来自 `fields.modeHintFor(leaf)` / `fields.valueHintFor(leaf, name)`；键与中文名不同名时 chip + 名字都显示，同名只显示一次 | `lib/client.panels.collections.js` 的 `TemplateArgsControl()`；`lib/client.fields.hints.js` 的 `MODE_HINTS` |
| **逐选项提示** | `Row.hintLines`（可选字数组）把「每个选项是什么意思」追加到该行 `piai-info` 气泡的**纵向栈**里（每行一个 `span`，gap 4px，无 `br`；栈由 `hintBubble` 包成 `span.piai-root`，见 §18.6.1）；枚举/联合分支的值级文案由 `fields.valueHintFor(leaf, value)` 提供，缺条目就只显示标签（纯增量） | `lib/client.panels.kit.js` 的 `hintBubble()`、`renderRow()`；`lib/client.panels.controls.js` 的 `enumHintLines()`；`lib/client.fields.js` 的 `valueHintFor()` |
| **只读 YAML 视图（原代码）** | 页内 `原代码` / `配置表单` 切换：只读 `CodeBlock({lang:'yaml', lineNumbers:true})` 渲染**当前草稿**（含未保存修改），`dirty` 时在代码上方显示 `rawNotice`；YAML 由 `lib/client.yaml.js` 的 `toYaml` 生成；`CodeBlock` 缺席时降级为 `<pre class="piai-expr-body">` | `lib/client.page.js` 的 `makePage()`、`rawFace()`；`lib/client.core.js` 的 `CodeBlock`（`createUi()` 内绑定）；`lib/client.yaml.js` |
| **模型发现** | 只有 `fields.GROUPS` 里带纯呈现标记 `catalog: true` 的分组（当前 = `models`）才出现「获取可用模型」按钮与选择器；发现是**读**（`ctx.remote.llm.discoverModels`），采纳是 `form.edit(container.path, rows)` 的一次暂存写入 | `lib/client.fields.groups.js` 的 `GROUPS`、`lib/client.fields.js` 的 `groupLeaves()`；`lib/client.panels.catalog.js` 的 `ModelCatalogPicker()`、`GroupBlock()`；`lib/client.page.js` 的 `makePage()` |

### 模型发现的写入语义（v9）

- 请求 `{provider, baseURL?, api?}` 由 **页面面** 从所选提供商的草稿组装（v10 起这两个
  字段名只出现在 `lib/client.page.js` 的 `makePage()` 与 `lib/client.fields.groups.js`
  的 `FIELDS` 文案表里；`lib/client.panels*.js` 只按 `group.catalog` 结构分派），key
  一律是只读展示的 `provider` 名（`lib/client.page.js` 的 `makePage()`）。
- 结果只在 **添加所选** 时落地：按身份键去重，**已存在的行原样保留**（用户改过的行不被覆盖），
  只有真正的新条目追加；写入是 `form.edit(container.path, rows)`（`lib/client.panels.catalog.js` 的 `GroupBlock()`）。
- 发现失败/空结果/宿主不支持都只显示提示，**不写任何东西**；`!!js` 表达式容器直接禁用
  （`lib/client.panels.catalog.js` 的 `GroupBlock()`）。
- **候选行只显示原始 id（v9-T25，照官方 picker）**：一行 = 复选框 + 一个等宽
  `code.piai-dict-key`，文本是原始 id；显示名放进 `title`（`title = 名称 || id`，缺失回退 id），
  因此 `name === id` 不会读成重复两段；名称仍参与搜索（过滤同时匹配 id 与名称）。
  实现见 `lib/client.panels.catalog.js` 的 `ModelCatalogPicker()`（过滤与候选行）；官方出处
  `@deepseek-ai/dsh-client-ui-settings-models` 的 `span.candidateId`：只渲染 id、
  `title = name ?? id`（alias `PICKER:874-878`，见 `interaction-design.md` §18.1/§18.3）。

## 清空语义的依据（`unset` vs 字面 `null`）

本页的「留空 = 删键（`unset`），`null` 只在 schema 明确声明可空且用户显式选择时才写入」
不是风格偏好，而是按 adapter 与 pi-ai 的实测行为定的。证据（完整报告见
`/tmp/piai-research/UNSET_VS_NULL.md`，摘要并入 `docs/research-findings.md` §6）：

| 位置 | 事实 | 出处 |
| --- | --- | --- |
| adapter 把空 dict 当缺键 | `configuredCompatEntries` 丢掉 `Object.keys(value).length === 0` 的条目 | `llm-pi-ai/lib/index.js:477-481` |
| pi-ai 丢 `undefined`、留 `null` | `if (resolved !== undefined) { resolvedValues[key] = resolved }`，而 `typeof value !== "object" \|\| value === null` 时直接 `return value` | `pi-ai/dist/api/openai-completions.js:765-791` |
| 顶层 compat 标量不得为空 | `if (value == null) invalid(...)`，`compat.vllmPriority: null` 会被具名拒绝 | `llm-pi-ai/lib/index.js:528` |
| `null` 不会被 schema 拦下，但随后必然出事 | `baseURL`/`displayName`/`retryPolicy` 解析期 `TypeError`；`models[].id` 被 `.required()` 拒；可选标量被默认值吞掉或被静默塞进请求 | `llm-pi-ai/lib/index.js:1092-1093`、`:1144`；schemastery `SCHEMA:533-543` |
| 叶子级 `null` ≠ 缺键 | `deepEqualJson` 按键数比较；pi-ai 用 `!== undefined`；adapter 用 `value == null` | `dsh-util-values/lib/index.js:176-188` |

因此界面上「不做声明」永远只发 `{op:"unset"}`；唯一 adapter 合法且需要显式选择的
`null` 是 `reasoningEfforts.off: null`（「支持但不发参数」），它**没有 UI 入口**
（档位行留空 = 删键 = 不支持），只能手写 YAML——这条取舍仍记录在上文「已知取舍」。

## 分组不变式

`groupLeaves()` 的契约是：**交给它的每个叶子必须恰好落在一个分组里**。最后一个
`other` 分组是无条件兜底。因此：

- 未知路径（上游新增字段）→ 落入 `other`，照常渲染通用控件；
- 未知 kind → 走通用文本控件；
- 不会出现"字段在 schema 里存在但页面上看不到"的情况。

`tests/coverage.test.js` 用合成叶子（未知路径、未知 kind、深层未知路径）验证了这一点。

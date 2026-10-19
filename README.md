# dsh-llm-pi-ai-config

给 DSH 的「设置」加一个 **「模型扩展配置」** 页面，用来编辑
`@deepseek-ai/dsh-llm-pi-ai`（模型路由 adapter）的**完整**配置。

> 定位：本项目是 `llm-pi-ai` 的配置管理扩展，**不是**为 `dsh-llm-pi-ai-config` 自身增加模型配置。
> 页面上的每一次修改，都通过 DSH 既有设置管线落到真实的 `llm-pi-ai` 配置上。

---

## 它解决什么

DSH 自带的「设置 > 模型」只开放了 22 个提供商级字段中的 7 个、7 个模型级字段中的 5 个。
剩下那些（重试策略、协议兼容、推理强度、thinking 预算、传输方式、超时、图片预算……）
本来只能手改 YAML。

本页把这些字段全部放进界面，并且**不写死字段名单**：页面遍历运行时 schema，
所以 `llm-pi-ai` 以后新增字段，页面会自动出现，不需要改这个插件。

## 它长什么样

在「设置」左侧新增一格 **模型扩展配置**（排在「模型」之后）。页面不再分成
「路由 / 高级 / 模型」三个标签，而是：

```
标题 + 副标题（未填写的字段保留为「默认（未设置）」，不会被写成 null）
├─ 提供商 tab 条      下划线式 tab（照抄官方「内置插件」页），列出全部提供商
│                     （默认显示 displayName，没有则显示配置键名）
│                     末尾多一枚「添加」tab；提供商多了就换行
│                     右侧是操作槽：一枚「原代码 / 配置表单」只读切换
├─ 提示区             校验、写错、非本机不可写
├─ 所选提供商的全部可配置项（一页到底，按分组卡片排列）
│   基础信息 · 模型列表 · 逐模型覆盖 · 默认值 · 请求构造 · 超时 ·
│   图片预算 · 重试 · 协议兼容 · 其他
│   每个字段行 = 中文标签 + 提示图标 + 控件（说明与原始 key 在提示气泡里）
│   「模型列表」组标题右侧另有「获取可用模型」
└─ 吸底操作条         状态 + 删除当前提供商 + 放弃修改 + 保存
```

- **「添加」是真 tab**：选中它，下方就是新增提供商表单；**一个提供商都没有时**不渲染
  tab 条，直接显示这个表单。删除提供商在吸底操作条里（两步确认）。
- **每个字段行只有「中文标签 + 提示图标 + 控件」**：把鼠标移到提示图标（或点击钉住）会弹出
  气泡，里面有**原始 YAML key**（如 `compat.thinkingFormat`）和**中文说明**；说明讲清
  「作用 + 生效条件/默认 + 不支持的后果」，不只是复述字段名（`docs/requirements.md` R2）。
  分组标题下的分组级说明仍直接显示。
- **`models[]` 每个模型一张可折叠卡片**（默认折叠，标题是显示名称 → 模型 id → `#序号`），
  卡片里是该模型的 `id` / `name` / `contextWindow` / `maxTokens` / `input` /
  `reasoningEfforts` / `compat`；鼠标悬停卡片头（或键盘聚焦）时右侧的删除图标显形，
  收起状态也能删。
- **`modelOverrides` 每个覆盖键一张可折叠卡片**，键即模型 id。
- 分组标题只是分节，字段清单仍然完全来自运行时 schema：上游加字段、加分组都会
  自动出现，不需要改这个插件。

控件按类型分派：输入框 / 单选（含布尔三态）/ 复选组 / 可编辑标签 / 键值字典 / 档位表 /
模板参数表 / 联合分支嵌套表单 / 实例卡片。

- **单选（`enum`）**：一组方框单选项（原生 radio 语义），选项多了自动换行，
  最后一项是「默认（未设置）」；不再分「≤4 用分段、>4 用下拉」。
- **布尔（`boolean`）**：同一个三态单选——`开启` / `关闭` / `默认（未设置）`。
  「关闭」是显式写 `false`（adapter 真的会看到一个关掉的开关），
  「默认（未设置）」是把该键删掉、跟随模型目录与协议默认；两者不是一回事。
- **逐选项说明**：每个选项都带一句中文解释（单选/多选/闭集字典都一样），
  追加在该字段的提示气泡里，一行一个。气泡是一个纵向栈（每行一个节点、间距 4px，
  **不再用 `<br>` 拼行**），长说明会自动换行、不被截断；气泡走 portal 渲染，
  因此它自带一个 `.piai-root` 嵌套根来继承插件自己的样式（chip 的背景/边框/圆角）。
  文字色分两种：**正文只继承、不重上主题色**（`color: inherit`）——气泡永远深底，
  重上主题文字色会在浅色主题下把它压成深字；而**原始 key 的 chip 保持自己的
  浅底深字色对**（不继承气泡的浅前景，否则几乎看不见）。
  气泡内边距**四边相等**（原语气泡自带 3px/7px 的不等内边距，内容层补偿成四边 15px；
  该规则只命中气泡，模型选择对话框不受影响）。
- **模板参数（`compat.chatTemplateKwargs` / `chatTemplateArgs`）**：每行一个
  「`字面值` / `$var 变量`」二选一——字面值原样发出（也可显式发 `null`），
  `$var` 交给 pi-ai 按本次请求的思考状态取值（`thinking.enabled` / `thinking.effort` /
  `thinking.budget`，可勾「关闭时省略」）；键名只显示一次，删掉最后一行即清空该字段。
- **输入模态（`input` / `defaultInput`）**：每个允许值一个复选框（`文本（text）` /
  `图片（image）`），一眼看到支持什么，不勾选＝不作声明。复选框固定 16×16，
  **文字标签一定看得见**（不会被行宽规则拉变形）。
- **联合分支（`retryPolicy` 等）**：分支参数块不再画左边框/缩进竖线，标题会点名当前分支，
  例如「normal（按次数重试）的参数」——说明这些字段属于**当前选中的那个分支**，
  不是另一个子对象。
- **协议兼容（compat）分区**：6 个可折叠分区，标题右侧**不再有数量计数器**；
  每项都有一个常显的 ▸/▾ 箭头（收起 ▸、展开 ▾，14px），整条标题都能点，
  键盘 Enter/Space 也能展开；展开后内容左缘与标题文字对齐。
- **推理强度（`reasoningEfforts`）**：7 个档位各占一个普通字段行（中文档位名 + ⓘ 提示 + 输入框，
  版式与其它字段行一致），填的是分派时发送的取值，**留空＝不声明该档位**；
  没有增删行、没有 null 开关。
- **同行等高**：凡是按钮和输入框在同一行的（添加提供商、字典加键、标签加项、凭据行），
  按钮高度都是 32px，和输入框齐平。
- **焦点态**交给官方控件自己（输入框换边框色、单选/复选框自带焦点环、tab 有官方下划线环），
  本插件不再叠加第二、第三层描边。
- **观感对齐 shipped「模型」页**：字段标签 12px 次级色、说明 12px 三级色、输入框 32px、
  分组卡用 `--dsw-alias-bg-module-platform` + `--dsw-radius-lg`、实例卡是 0.5px 细描边；
  字段之间靠 12px 间距（不再逐行画线），**成对的短字段并排两列**（模型 id + 显示名、
  上下文窗口 + 最大输出 token、超时、图片预算、退避、thinking 预算六档）。
  这些规则逐条抄自该页自己的 CSS，不是目测近似（`docs/interaction-design.md` §14、§15、§16）。

`apiKeyEnv` 是**凭据引用**：只读展示引用名与状态（未配置 / 已配置（本地凭据）/ 已配置（环境变量）），
并提供「设置密钥 / 更新密钥 / 清除密钥」——密钥直接写入 DSH 凭据存储
（`remote.credentials.set`），**不会**写进配置文件。

### 「原代码」：只读看整个配置

tab 条右侧的「原代码」把**当前草稿的完整 `llm-pi-ai` 配置**（`providers` 全量）
渲染成带行号的 YAML，方便一眼看清 adapter 到底会收到什么。

- **只读**：没有编辑、没有保存、不产生任何写入；切回「配置表单」即回到原页面。
- **含未保存修改**：内容就是表单里的草稿，不是磁盘内容；草稿有未保存改动时，
  代码上方会明确提示这一点。
- YAML 由插件自己的只读序列化器生成（`lib/client.yaml.js`，永不抛错）；
  `!!js` 表达式原样输出，不会被求值。

### 「获取可用模型」：照官方同款流程

「模型列表」分组右侧的按钮向**宿主**询问该提供商列出的模型（官方
`llm/discoverModels`，与自带「设置 → 模型」页同一个 RPC）：

1. 用当前表单里的 `provider` / `API 地址` / `API 协议`（以及你刚输入但还没保存的密钥）发起询问；
2. 结果进一个**可搜索的选择器**（勾选 + 全选/取消全选），**什么都不会被写**。
   每个候选**只显示原始模型 id**（等宽）；显示名不另起一段，而是放在悬停提示里
   （`title = 名称 || id`），所以 `name` 与 `id` 相同的模型不会看起来重复。
   搜索同时匹配 id 与显示名——照抄自带「设置 → 模型」页的 picker
   （`@deepseek-ai/dsh-client-ui-settings-models` 的 `span.candidateId`：只渲染 id、`title = name ?? id`）；
3. 只有点「添加所选」才把选中的条目并入 `models[]`——**已有的行原样保留**，不会覆盖你改过的值；
4. 采纳只是暂存，**不会自动保存**；点吸底条的「保存」才真正写入。

发现失败（宿主不支持、端点不可达、协议不能列模型）只显示错误，不影响手动填写。

字段清单与分组见 [docs/field-coverage.md](docs/field-coverage.md)。

## 安装

本包是一个 profile bundle，`package.json` 里已声明 `dsh.bundle.patch`，
把它加进 profile 即可自动挂载，不需要手工改 `cordis.patch.yml`：

```bash
dsh plugin --profile desktop add /Users/zfowed/Downloads/dsh-llm-pi-ai-config
```

> **首次启用需要重启一次 DSH。** 这不是 bug：DSH 的 client-modules 会把
> 「这个包不是客户端包」的判定按 `baseUrl + 包名` 缓存到进程结束。本包被首次扫描时
> `package.json` 还不存在，否定判定因此被缓存，热补丁无法清除。重启一次之后，
> 后续所有改动都走热重载（已实测）。
> 证据见 [docs/verification.md](docs/verification.md) §4。

## 行为约定

- **留空 = 删除该键（`unset`），不是写 `null`。** 界面上就是「默认（未设置）」那一项；
  `null` 只在该字段的 schema 明确允许、且你显式选择时才写入（本页目前没有任何
  会写值型 `null` 的入口）。依据：adapter 视空 dict 与缺键等价，且 `null` 在多数字段上
  会变成 `TypeError` / 具名校验错误 / 被静默塞进请求（见 [docs/research-findings.md](docs/research-findings.md) §6）。
- **写入是原子的、经过版本校验的。** 冲突会明确报错，不会被静默覆盖。
- **adapter 是权威。** 页面里的协议兼容提示只是提示；adapter 拒绝某字段时报的错原样展示。
- **`!!js` 表达式只读**，保存时原样保留。
- **块内 YAML 注释会丢失**：官方 `configEditor` 会整体替换 `llm-pi-ai` 行的 `config` 节点，
  这与自带「模型」页行为一致；块外的行与注释保留。

## 开发

```bash
node --test                           # 全部测试（367 项：366 pass + 1 todo）
node tests/module-contract.test.js    # 模块契约：计划↔磁盘↔请求、阶段序、单文件上限（5 项）
node tests/v7.audit.test.js           # v7 对抗式复核（35 项）
node tests/v8.audit.test.js           # v8 对抗式复核（24 项）
node tests/layout/build-fixture.mjs   # 生成浏览器布局夹具页（-> /tmp/piai-layout）
node tests/verify.integration.mjs     # 独立验证 harness（38 项）
node tests/verify.render.mjs          # 独立 render/hook harness（15 项）
node tests/verify.polish.mjs          # 独立样式/a11y harness（42 项）
for f in lib/*.js; do node --check "$f"; done   # 语法检查（20 项）
node scripts/snapshot-schema.mjs      # 重新生成 schema fixture
```

本仓库**没有打包器、没有 TypeScript、没有第三方依赖**：`lib/*.js` 就是交付产物
（host 半 + owner + 18 个 chunk，共 20 个文件）。平台只服务 owner 目录下的平级
`client.<…>.js`，所以模块用**点号逻辑目录**表达：`client.core.js`、`client.fields.{groups,hints}.js`、
`client.page.js`、`client.panels.{kit,controls,collections,render,instances,catalog}.js`、
`client.styles.{chrome,controls}.js`。单文件 ≤700 代码行，由
`tests/module-contract.test.js` 强制。细节见
[docs/development.md](docs/development.md) 与 [docs/architecture.md](docs/architecture.md)。

## 文档

- [AGENTS.md](AGENTS.md) — 协作规则与硬性约束（唯一控制面）
- [docs/requirements.md](docs/requirements.md) — 需求与验收标准
- [docs/architecture.md](docs/architecture.md) — 架构、数据流、模块边界
- [docs/development.md](docs/development.md) — 开发、测试、调试
- [docs/field-coverage.md](docs/field-coverage.md) — 字段覆盖记录
- [docs/interaction-design.md](docs/interaction-design.md) — 交互与视觉契约（含官方出处）
- [docs/verification.md](docs/verification.md) — 验证记录与未验证项
- [docs/research-findings.md](docs/research-findings.md) — 调研证据
- [docs/interface-contract.md](docs/interface-contract.md) — 模块接口契约

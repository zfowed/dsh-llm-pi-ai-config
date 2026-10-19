# 架构（architecture）

## 1. 总体形状

本插件是一个「双层」DSH 插件：

```
profile cordis.patch.yml
  └─ 行 llm-pi-ai-config  name: dsh-llm-pi-ai-config
       ├─ host 半（lib/index.js）      空实现：只为让包出现在 Loader 里
       └─ client 半（lib/client.js）   浏览器 bundle owner，注册「模型扩展配置」页面
```

host 半之所以必须存在，是因为 DSH 的 client-modules 只会扫描 **Loader 条目**：
一个包必须先在 host 侧挂载成条目，浏览器侧才会被 `package.json` 的 `dsh.client`
声明发现，进而通过 `exports["./client"]` 取到 bundle。host 半本身不做任何事。

**写入目标的真相**：页面编辑的是 `llm-pi-ai` 命名空间，不是本插件的命名空间。
本插件没有 `Config`，也不 `provide` 任何设置。

### 1.1 为什么没有物理子目录（v10）

平台的资源路由只服务 owner 目录下的**平级文件名**：client-modules 用
`CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/` 校验，并以
`join(dirname(record.meta.clientPath), fileName)` 取文件（服务端 `chunkRequest()` /
`chunkResponse()`，客户端 `require.async` 同规则）。名字里不能出现 `/`，所以
`lib/` 下**不可能有真实子目录**，`lib/client.<…>.js` 就是交付形态。

因此「按功能分模块」用**点号逻辑路径**表达，映射如下（约定，不是实现细节）：

| 逻辑目录 | 文件 |
| --- | --- |
| `core` | `client.core.js`（共享基础：纯工具 + 原语解析/降级） |
| `schema` / `form` / `yaml` | `client.schema.js`、`client.form.js`、`client.yaml.js`（三个独立纯 chunk） |
| `fields` | `client.fields.groups.js`（数据）、`client.fields.hints.js`（数据）、`client.fields.js`（逻辑） |
| `page` | `client.page.js`（页面面） |
| `panels` | `client.panels.js`（出口）+ `client.panels.{kit,controls,collections,render,instances,catalog}.js` |
| `styles` | `client.styles.js`（出口）+ `client.styles.{chrome,controls}.js`（片段） |

共 20 个 `lib/*.js`：1 个 host 半、1 个 owner、18 个 chunk。单文件上限
**700 代码行**（去空行与注释；最长的 `client.page.js` 约 650），由
`tests/module-contract.test.js` 断言，防止再长出单体文件。

**新增 chunk 不需要重启 DSH**：只要 URL 的 `?rev=` 等于 owner 当前 rev 且文件存在，
服务端就会从磁盘读它（`?rev=` 只由 `lib/client.js` 的 stat 决定，见 development.md §5）。

## 2. 数据流

### 2.1 读

```
host: llm-pi-ai Config (Schemastery)
  → SettingsForms.describe()
      volatileForm(Config).toJSON()          // {uid, refs} 引用图，只含可写字段
      projectForm(form, value)               // 当前值
      revision
  → dsh-api-settings-controller (remote.settings.describe)
  → 客户端 SettingsDescribeMirror            // 唯一的 describe 读取点
  → ctx.configForms.describe().getSnapshot().view.namespaces
  → 本页：pageStore（createSnapshotStore）
  → lib/client.schema.js: leaves(envelope, providerRef, basePath)
        · 实例容器（models[]、modelOverrides）给成员叶子打 container={kind, path}
  → lib/client.fields.js:  groupLeaves(leaves)          // 表来自 client.fields.groups.js / .hints.js
  → lib/client.page.js:    makePage(chunks, deps) 组装 props，交给面板
  → lib/client.panels.js:  ProviderPanel → GroupBlock → FieldsBlock 按 container 分区
        · client.panels.instances.js 的 ArraySection / InstanceDictSection 把成员叶子
          重定基成 providers.<p>.models.<i>.<field> / providers.<p>.modelOverrides.<id>.<field>
  → lib/client.panels.{kit,controls,collections,render,catalog}.js: 渲染
```

关键点：页面**不维护字段表**。它把 schema 信封交给遍历器，遍历器给出叶子，
分组模块只负责「放在哪一组、叫什么名字」。因此字段集永远等于 schema 的字段集。

叶子清单本身**不因实例渲染而变化**：`models[]`/`modelOverrides` 的成员仍然只出现
一次（路径不带实例段），`container` 只是补齐了「它们属于哪个可重复组」这一信息，
重定基发生在面板渲染期。因此 22 / 32 / 31 / 26 的审计名单不受影响。

### 2.1.1 只读预览（v9「原代码」）

```
lib/client.page.js  formSnapshot.values    // 暂存草稿（含未保存修改）
  → lib/client.yaml.js  toYaml(values)     // 单向 YAML 序列化，永不抛错
  → core.ui.CodeBlock({lang:'yaml', lineNumbers})   // 只读；缺失时 <pre class="piai-expr-body">
```
这条链路**只读**：不产生 op、不碰 revision、不写文件；`toYaml` 也没有 parser 与
round-trip 承诺。它的输入是**草稿**（`formSnapshot.values`），因此预览与表单永远同源。

### 2.1.2 模型发现（v9「获取可用模型」）

```
lib/client.page.js  从所选提供商的**草稿**组装 {provider, baseURL?, api?}
  → ctx.remote.llm.discoverModels("llm-pi-ai", request)     // 只读 RPC
       → @deepseek-ai/dsh-llm#llm/discoverModels             // LlmRuntime
       → llm-pi-ai 注册的 registerModelDiscovery(settingsNs, …)
       → 已安装目录（离线）或 GET {baseURL}/models（联网）
  → {kind:'found', models} | {kind:'refused', message}       // owner 归一，永不抛错
  → lib/client.panels.catalog.js  ModelCatalogPicker（勾选 + 搜索）
  → 采纳 = form.edit(container.path, rows)                   // 一次暂存写入，不自动保存
```
发现是**读**：失败只显示提示；采纳与其它编辑走同一条 diff → `mutate` 管线。

### 2.2 写

```
lib/client.form.js  createStagedForm
    draft 与 baseline 比对 → diffOps → 最小 op 序列
  → ctx.configForms.get("llm-pi-ai").mutate(ops, revision)
  → remote.settings.mutate(ns, ops, expectedRevision)
  → ctx.settings.write → SettingsForms.mutate
  → ctx.configEditor.edit(document)
       解析整个 cordis.patch.yml（yaml parseDocument）
       只 document.setIn([<llm-pi-ai 行下标>, "config"], …)
       重新走 internal/config 校验 + resolveConfig
       失败回滚
  → writeFileAtomic(patchPath, text, {mode: 0o600})
```

因此：**块外的一切都保留**（其他插件的行、注释、`dsh-skill-mcp-panel` 之类的标记），
**`llm-pi-ai` 行块内的注释会丢失**——这与官方「模型」页行为一致。

## 3. 模块边界

| 文件 | 角色 | 允许依赖 | 禁止依赖 |
| --- | --- | --- | --- |
| `lib/index.js` | host 半 | 无 | 一切（它是空实现） |
| `lib/client.js` | bundle owner：注册设置页、locale、两条受控 remote 通道、**分阶段 chunk 装载**、渲染安全层 | `react`、`client-store`、cordis 服务 `slots`/`locale`/`remote.settings`/`remote.credentials`/`remote.llm`/`configForms`/`settingsSchema`、`require.async` | 直接读写文件；自行持久化；在自身 factory 里触碰 chunk |
| `lib/client.core.js` | 共享基础（纯函数 + `createUi`） | 无（factory 里 `require('react')` 与 primitives） | React 之外的全局；其它 chunk |
| `lib/client.schema.js` | schema 信封遍历（纯函数） | 无 | React、ctx、I/O；**与其它 chunk 互相独立** |
| `lib/client.form.js` | 暂存编辑与最小 diff（纯逻辑，写入语义唯一实现） | 无 | React、ctx、I/O、传输实现；**同上，保持独立** |
| `lib/client.fields.groups.js` | 分组 / 字段标签 / 协议门控数据 | 无 | 一切逻辑 |
| `lib/client.fields.hints.js` | 逐选项文案 / 模式文案数据 | 无 | 一切逻辑 |
| `lib/client.fields.js` | 分组与标签查询 + 协议门控镜像 | `fieldsGroups`/`fieldsHints`（eval 期从 registry 读） | React、ctx、I/O；**不得成为字段真源** |
| `lib/client.yaml.js` | 只读 YAML 序列化（纯函数，单向） | 无 | React、ctx、I/O、解析、写入 |
| `lib/client.page.js` | 页面面：`makePage`、tab id、吸底条删除、缺失占位、raw 只读面 | `chunks.core`（经参数）、`chunks.panels`、`fields`/`schema`/`form`/`yaml` | ctx、global 读取、remote.*、I/O |
| `lib/client.panels.kit.js` | 行级基础件：`Row`/`hintBubble`/`ConfirmButton`/`leafUi`/`pairRunsOf`/`renderRow` | `shared`（core/ui/components） | ctx、remote、I/O；**不得写死字段名** |
| `lib/client.panels.controls.js` | 标量控件 + `renderControl` 分派 | 同上 | 同上 |
| `lib/client.panels.collections.js` | 集合控件（复选组/标签/字典/模板参数/档位表） | 同上 | 同上 |
| `lib/client.panels.render.js` | 联合/对象/数组控件 + `FieldsBlock` | 同上 | 同上 |
| `lib/client.panels.instances.js` | 实例卡分区 + 兼容折叠 | 同上 | 同上 |
| `lib/client.panels.catalog.js` | 模型发现：分组 UI + 选择器 | 同上 | 同上 |
| `lib/client.panels.js` | 面板出口：组装 `shared`、`ProviderTabs`、`ProviderPanel` | `shared`（core + 六个模块） | ctx、remote、I/O；**不得写死字段名** |
| `lib/client.styles.chrome.js` | 样式片段：root 变量、页面外壳、字段行 | 无 | 一切 |
| `lib/client.styles.controls.js` | 样式片段：控件、实例卡、catalog、@media | 无 | 一切 |
| `lib/client.styles.js` | 样式出口：拼接 + 注入（纯字符串 + `install()`） | 两个片段（eval 期从 registry 读） | 其它一切 |

依赖方向单向：`page`/`panels*` → `core`；`panels*` → `kit`；`fields` → 两张数据表。
**chunk 之间没有 import**（那会破坏「同一份字节既是浏览器脚本又是 Node 可测模块」），
跨模块调用只走下面第 4 节的两条通道。

**三条保持不变的红线**（v10 没动）：
- `lib/client.panels.*` 与 `lib/client.page.js` 里**不得出现 provider/model 字段名**；
  分组与控件分派只按 **group id / `leaf.kind` / 结构**；
- `lib/client.form.js` 是写入语义的唯一实现，面板只允许 `form.edit/remove/reset`；
- `lib/client.schema.js`、`lib/client.form.js`、`lib/client.yaml.js` 保持零 chunk 依赖
  （`node --test` 直接 import 它们；写入路径必须单文件可审计）。三者在
  `hasOwn`/`isPlainObject`/`isExpression` 上有意保留各自的 micro-helper，这是本文件
  第 5 节记录的**已知取舍**，不再合并。

## 4. Chunk 机制（为什么没有打包器也能拆模块）

DSH 的客户端模块系统支持**包内 chunk**（自带包 `dsh-client-ui-sidebar-documentpreview`
与 `…-terminal` 就是这么做的）：

- 文件名必须匹配 `^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$`；
- chunk 通过 `window.__ModuleLoader__.load({id, chunk, factory})` 自注册；
- owner 用 `await require.async("./client.<name>.js")` 取回其 `factory` 的返回值；
- 服务端按 `/plugins/<id>/<fileName>?rev=…` 提供，rev 不匹配则 404。

因此 `lib/*.js` 是**手写的、可直接交付的浏览器脚本**：无 `import`/`export`，
没有构建步骤。为了让这些「同一个文件」在 `node --test` 下也能被直接测试，
每个 chunk 采取双通道：

| 环境 | 取用方式 |
| --- | --- |
| 浏览器 | `require.async("./client.<name>.js")` 返回 factory 的返回值 |
| Node 测试 | `await import('./lib/client.<name>.js')` 后读 `globalThis.__dshLlmPiAiConfig.<key>` |

这正是「测试跑的就是交付的字节」的实现方式。

### 4.1 分阶段加载（v10）

`lib/client.js` 用一张显式计划装载全部 chunk（`__internals.chunkPlan`，被
`tests/module-contract.test.js` 与 `tests/wiring.test.js` 同时断言）：

| 阶段 | 内容 | 原因 |
| --- | --- | --- |
| **P0** | `core`、`schema`、`form`、`fields.groups`、`fields.hints`、`yaml`、`styles.chrome`、`styles.controls`、`panels.{kit,controls,collections,render,instances,catalog}` | 这一批没有 chunk 间依赖（只注册工厂或纯数据） |
| **P1** | `fields`、`panels`、`page`、`styles` | 这四个出口在 eval/factory 期读 P0 的 registry 条目（`fieldsTables`/`fieldsHints`、`core`、两个样式片段） |

阶段是**硬要求**：`require.async` 在脚本到达后立刻 materialize 工厂，同一
`Promise.all` 里的依赖可能晚于被依赖者到达。因此「依赖必须在更早的阶段」，这一点
由 `tests/module-contract.test.js` 的边表断言（依赖 → 被依赖）逐个固定。

**代价与权衡**：拆分后设置页首次打开要取 **18 个 chunk 请求**（拆分前 6 个），
阶段内并发、响应固定 `cache-control: public, max-age=31536000, immutable`，
之后再打开命中缓存。这是「可维护性 vs 冷启动请求数」的有意取舍：18 个平级小文件
比一个 4146 行的文件更容易审查与并行修改，而冷启动只在首次或 rev 变化后发生。

### 4.2 跨模块的两条通道（v10）

1. **registry 组合**：`fields` 与 `styles` 两个出口在 eval 期读
   `globalThis.__dshLlmPiAiConfig.<key>`（`fieldsGroups`/`fieldsHints`/`stylesChrome`/
   `stylesControls`）。缺一个：`fields` 直接抛错（块加载失败由 owner 兜住，绝不静默丢掉全部中文文案）；
   `styles` 报 `COMPLETE === false`，`install()` 变成空操作（半张样式表比没有更糟）。
2. **`shared` bag（DI）**：面板层不读全局。`lib/client.panels.js` 的 factory 建一个
   `shared = {core, ui, react, h, require, components}`，按顺序调用六个模块的
   `create<X>(shared)` 工厂，把它们返回的对象并进 `shared.components`。
   **跨模块引用必须在调用期读 `shared.components.<name>`，不得在创建期捕获**——
   `renderRow`（kit）↔ `FieldsBlock`（render）↔ `ArraySection`（instances）↔
   `renderControl`（controls）是环，只有晚绑定能表达。模块内部函数照旧直接调用。

### 4.3 降级语义（逐条与拆分前一致）

`ensureChunks()` 返回 `{core, schema, form, fields, yaml, panels, page, styles}`。
只有 `yaml`、`styles`（含两个片段）是**隔离失败**的：它们的缺失或抛错被归一成
`undefined` / `NO_STYLES`，不 reject 整个装载。「原代码」面显示
`原代码视图不可用`，页面无样式但照常可用。其余 chunk 缺失会让整个 `ensureChunks()`
拒绝，由 owner 的 `ChunkBoundary` 显示「加载失败 + 重试」，**绝不 abdicate 设置格**。
`page`/`panels` 缺少 `core` 或某个 `panels.*` 模块时抛的是**具名错误**
（`client.core.js must be loaded before …`），而不是渲染期 `h(undefined)`。

## 5. 关键设计决策

| 决策 | 理由 |
| --- | --- |
| 字段集来自运行时 schema，而非代码常量 | 否则上游加字段就会静默从界面消失——本项目要防的就是这个 |
| 分组用 `other` 无条件兜底 | 未知路径/未知 kind 也必须渲染 |
| 清空一律 `unset` | host 端 `set null` 会写进字面 `null`，那不是「继承」 |
| diff 而非整体重写 | 不覆盖并发修改，不触碰无关行，副作用最小 |
| 用 `whileServed(["llm-pi-ai"], …)` 挂载 | adapter 缺席时零痕迹；不产生空页面 |
| 新 section id `model-extended` | 复用自带 id 会**替换**那一页，属破坏性行为 |
| 不做 revision 自动重试 | 盲目重试会覆盖另一个窗口的并发修改 |
| 不引依赖、不引打包器 | 交付物就是源码；避免构建链与版本漂移 |
| host 半保持空 | 本插件没有 host 侧状态；它只需存在于 Loader |
| 实例容器用 schema 的 `container` 元数据，而不是新增数组叶子 | 成员叶子照旧全部出现在审计清单里（22/32/31/26 不变），重定基只发生在渲染期；`ArrayControl` 的 `itemLeaves` 分支从未被 `walk` 填充，正是这条缺失让 `models[]` 写入一直报 `Config array index` |
| 顶部 tab = 提供商自建下划线 tab 条（v7；此前是 `Pill` chip 行），而不是 `SegmentedTabs` | `SegmentedTabs` 把 tab 排成等宽栅格（`repeat(N, minmax(0,1fr))`），提供商一多就挤压裁切；v7 起外观/语义照官方「内置插件」页的 `.tabs`/`.tab`（下划线 + `flex-wrap` 换行），见 `interaction-design.md` §15.2 |
| `role=tabpanel` 只在有活动 tab 时出现（活动 tab 可以是「添加」） | 0 个提供商时**不渲染** tablist/tab/tabpanel，直接渲染添加表单（D2 裁决，§15.2.10）；悬空 tabpanel 会破坏 `aria-labelledby` 契约 |
| 「原代码」是**只读预览**，且序列化放在独立 chunk | 预览必须能看见「含未保存修改」的当前草稿，但它绝不能成为第二条写路径；`client.yaml.js` 只有 `toYaml`、没有 parser、永不抛错，因此它既进不了 ops，也不会在渲染期把页面拖垮 |
| 模型发现走官方 `llm/discoverModels`，不自己列模型 | 该 RPC 是 shipped「设置 → 模型」页同款流程：请求由草稿组装、结果只进选择器、「添加所选」才落一次暂存写入；adapter 才是「有哪些模型」的权威 |
| `baseURL` / `api` 两个字段名只允许出现在 owner/page | 它们是 adapter 自己 discovery 调用的参数（`LlmModelDiscoveryRequest`），不是「字段 → 分组」映射；panels 仍只按 `group.catalog` 结构分派，AGENTS §3.2 的禁令不变 |
| **v10：逻辑目录用点号文件名表达，不引子目录** | 平台只服务平级 `client.<name>.js`（1.1 节），物理目录不可得；点号命名 + 本文件的映射表给出等价的导航结构，且保持「交付物即源码」 |
| **v10：owner 拆出 `page`，面板拆出六个模块** | 4146 行的 `client.panels.js` 与 1762 行的 owner 已经超出可维护范围；拆完后最大单文件 917 行 / 650 代码行，且每个模块有单一职责 |
| **v10：面板层用 `shared` bag 做 DI，而不是全局或 import** | chunk 之间无法 import（会破坏双通道），全局读取又会让面板不再是「props 的纯函数」；bag 由出口显式装配，跨模块引用晚绑定，环依赖也能表达 |
| **v10：样式表按区域拆成两段，出口拼接并报 `COMPLETE`** | CSS 占 1190 行且分区清晰；拼接保持「一个 `<style>`、一个 `CLASSES` 权威表」，`COMPLETE` 让片段缺失时**不安装**而不是装半张 |
| **v10：`client.schema.js`/`client.form.js`/`client.yaml.js` 不复用 core 的 micro-helper** | 它们必须保持零依赖、可被 `node --test` 单独 import，写入路径也必须单文件可审计；`hasOwn`/`isPlainObject`/`isExpression` 的少量重复是**有意代价**（约 20 行），换的是独立性与可审计性 |

## 6. 已知限制

- 首次发现需要一次 DSH 重启（client-modules 的否定判定按 `baseUrl + 包名` 缓存到进程结束）。
  证据见 [verification.md](verification.md) §4。
- 非 loopback 页面 `persistence === "memory"`，保存是**静默 no-op**；页面只做了文案提示。
- `llm-pi-ai` 行块内的 YAML 注释在保存后丢失（官方编辑器行为）。
- **v10：chunk 文件必须平级**（1.1 节）。想再细分模块只能继续加
  `client.<模块>.<子模块>.js`，或者先扩平台支持子目录。
- **v10：每次新增/改动 chunk 后要让 owner 的 artifact stat 变化**（`touch lib/client.js`），
  否则浏览器与 host 都还在用旧 URL 的旧字节（development.md §5）。

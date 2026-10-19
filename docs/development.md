# 开发与验证（development）

## 1. 环境事实

- Node v24.11.1，macOS。
- **没有 TypeScript、没有打包器、没有第三方依赖**。这是刻意的：
  `lib/*.js` 就是交付产物，不经过任何构建步骤。
- 测试用 Node 内建能力：`node:test` + `node:assert/strict`。
- 已安装 DSH 的源码在 `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`，
  纯 Node 无法直接读取 asar；需要查证时用 `npx @electron/asar extract` 解出一份。
  本次开发解出的副本在 `/tmp/asarx/out/dsh/node_modules/@deepseek-ai/`。

## 2. 常用命令

```bash
cd /Users/zfowed/Downloads/dsh-llm-pi-ai-config

node --test                                   # 全部测试（367 项：366 pass + 1 todo，0 fail）
node --test tests/coverage.test.js            # 只跑字段覆盖
node --test tests/yaml.test.js                # 只读 YAML 序列化 chunk（26 项）
node --test tests/hints.test.js               # 逐选项/模式提示的完整性与文案（13 项）
node --test tests/catalog.test.js             # 模型发现接线：成功/拒绝/空/异常四条路径（25 项）
node --test tests/raw.test.js                 # 「原代码」只读切换（9 项）
node --test tests/v7.audit.test.js            # v7 对抗式复核（35 项，含 1 条 todo）
node --test tests/v8.audit.test.js            # v8 对抗式复核（24 项；浏览器层用例读 /tmp/piai-audit）
node --test tests/module-contract.test.js     # v10 模块契约：计划↔磁盘↔请求、阶段序、envelope、降级路径、单文件上限（8 项）
node tests/verify.integration.mjs             # 独立验证 harness（38 项断言）
node tests/verify.render.mjs                  # 独立 render/hook harness（15 项断言）
node tests/verify.polish.mjs                  # 独立 样式/a11y harness（42 项断言；P10a 检查服务端字节新鲜度）
node tests/layout/build-fixture.mjs           # 生成浏览器布局夹具页（-> /tmp/piai-layout；不进 node --test）
node scripts/snapshot-schema.mjs              # 重新生成 schema fixture（需可读副本，见 §4）

for f in lib/*.js; do node --check "$f"; done # 语法检查（20 项：owner + 18 chunk + host）
```

`node --test tests/` 在本机 Node 上会把 `tests` 当模块解析而报错，请用
`node --test`（自动发现）或显式列出文件。

## 3. 目录结构

```
.
├─ AGENTS.md                  协作规则与硬性约束（唯一控制面）
├─ README.md                  面向使用者
├─ package.json               声明 dsh.client / dsh.bundle；无任何依赖
├─ cordis.patch.yml           作为 profile bundle 自动挂载的行
├─ lib/                       交付产物（20 个文件：host = index.js，owner = client.js，18 个 chunk）
│  ├─ index.js                host 半（空实现，仅为让包进入 Loader）
│  ├─ client.js               bundle owner：注册设置页、locale、两条受控 remote 通道、
│  │                          分阶段 chunk 计划（CHUNK_PLAN）、渲染安全层
│  ├─ client.core.js          chunk `core`：纯工具 + 原语解析/降级（ui）
│  ├─ client.schema.js        chunk `schema`：信封遍历（零依赖）
│  ├─ client.form.js          chunk `form`：暂存编辑 + 最小 diff（零依赖，写入语义唯一实现）
│  ├─ client.fields.groups.js chunk：分组/字段标签/协议门控（数据）
│  ├─ client.fields.hints.js  chunk：逐选项与模式文案（数据）
│  ├─ client.fields.js        chunk `fields`：查询逻辑 + re-export 数据表
│  ├─ client.yaml.js          chunk `yaml`：只读 YAML 序列化（单向、永不抛错）
│  ├─ client.page.js          chunk `page`：页面面（makePage / tab id / 吸底条 / 原代码视图）
│  ├─ client.panels.kit.js    chunk：行级基础件（Row / hintBubble / ConfirmButton / renderRow）
│  ├─ client.panels.controls.js     chunk：标量控件 + renderControl 分派
│  ├─ client.panels.collections.js  chunk：复选组/标签/字典/模板参数/档位表
│  ├─ client.panels.render.js       chunk：联合/对象/数组控件 + FieldsBlock
│  ├─ client.panels.instances.js    chunk：实例卡分区 + 兼容折叠
│  ├─ client.panels.catalog.js      chunk：模型发现分组 UI + 选择器
│  ├─ client.panels.js        chunk `panels`（出口）：组装 shared bag + 两个公开组件
│  ├─ client.styles.chrome.js       chunk：样式片段（root/页面外壳/字段行）
│  ├─ client.styles.controls.js     chunk：样式片段（控件/实例卡/catalog/@media）
│  └─ client.styles.js        chunk `styles`（出口）：拼接 STYLESHEET + 注入
├─ scripts/snapshot-schema.mjs 生成 fixture（复刻 host 的 volatileForm 投影）
├─ tests/
│  ├─ fixtures/llm-pi-ai.schema.json  权威 schema 信封快照
│  ├─ helpers/                       测试共享工具：load-core.mjs、class-sources.mjs
│  ├─ schema.test.js / form.test.js   实现单测
│  ├─ coverage.test.js                可执行的字段覆盖记录
│  ├─ compat.test.js                  协议门控一致性
│  ├─ wiring.test.js                  bundle owner 的装载契约（迷你模块加载器）
│  ├─ module-contract.test.js         v10 模块契约：计划↔磁盘↔请求、阶段序、envelope、尺寸上限
│  ├─ render.test.js / a11y.test.js   owner 渲染回归 / 面板无障碍
│  ├─ instances.test.js              实例容器：模型/覆盖卡片的 op 路径
│  ├─ presentation.test.js           呈现覆盖：每个配置项的 key / 中文标签 / 中文说明
│  ├─ hints.test.js                  逐选项与模式提示的完整性（值级文案）
│  ├─ yaml.test.js                   只读 YAML chunk：envelope + 序列化 + 敌意输入
│  ├─ catalog.test.js                模型发现：成功/拒绝/空/异常、已有行不被覆盖
│  ├─ raw.test.js                    「原代码」只读切换与「不产生 mutate」
│  ├─ styles.test.js                 样式 chunk：作用域 / token / 类覆盖
│  ├─ v7.audit.test.js                v7 对抗式复核（独立复算 6 项需求 + 不变量）
│  ├─ v8.audit.test.js                v8 对抗式复核（R1–R3 + 不变量 + 浏览器层）
│  ├─ layout/                         浏览器布局夹具：build-fixture.mjs + primitives/*.css 快照 + README
│  ├─ verify.integration.mjs          独立验证 harness（非 node:test）
│  ├─ verify.render.mjs               独立 render/hook harness（非 node:test）
│  └─ verify.polish.mjs               独立 样式/a11y harness（非 node:test；42 项断言）
└─ docs/                      需求 / 架构 / 覆盖 / 验证 / 调研 / 接口契约
```

**逻辑目录 ↔ 文件名**（平台不允许 chunk 放子目录，见 architecture.md §1.1）：

| 逻辑目录 | 文件 |
| --- | --- |
| `core` | `client.core.js` |
| `fields` | `client.fields.groups.js` / `client.fields.hints.js` / `client.fields.js` |
| `page` | `client.page.js` |
| `panels` | `client.panels.js` + `client.panels.{kit,controls,collections,render,instances,catalog}.js` |
| `styles` | `client.styles.js` + `client.styles.{chrome,controls}.js` |

## 4. 改动指南

### 「我该改哪个文件」（v10 速查）

| 想改的东西 | 改哪里 |
| --- | --- |
| 字段中文标签 / 说明 / 分组 / 协议门控表 | `lib/client.fields.groups.js` |
| 逐选项说明、`$var` 模式文案 | `lib/client.fields.hints.js` |
| 标签/提示的查询逻辑、路径归一 | `lib/client.fields.js` |
| 页面结构（头部、tab 条、吸底条、原代码视图） | `lib/client.page.js` |
| owner 的激活逻辑、locale、凭据/发现通道、chunk 计划 | `lib/client.js` |
| 某个控件（枚举/布尔/凭据/数字/文本） | `lib/client.panels.controls.js` |
| 复选组/标签/字典/模板参数/档位表 | `lib/client.panels.collections.js` |
| 联合分支、对象/数组控件、叶子清单分区 | `lib/client.panels.render.js` |
| 模型卡 / 覆盖卡 / 兼容折叠 | `lib/client.panels.instances.js` |
| 「获取可用模型」按钮与选择器 | `lib/client.panels.catalog.js` |
| 行/标签/提示气泡/两步入确认 | `lib/client.panels.kit.js` |
| 两个公开组件与跨模块组装 | `lib/client.panels.js` |
| 样式 | 外壳类 → `lib/client.styles.chrome.js`；控件/实例卡 → `lib/client.styles.controls.js`；类名清单 → `lib/client.styles.js` |
| 原语解析与降级件、共享纯工具 | `lib/client.core.js` |
| 写入语义（清空/unset/diff） | `lib/client.form.js`（**只改这里**） |

新增一个 chunk 的标准动作：写文件 → 加进 `lib/client.js` 的 `CHUNK_PLAN`
（放在依赖的更后一个阶段）→ 跑 `node --test tests/module-contract.test.js`
（它会检查计划↔磁盘↔请求三方一致、阶段序、envelope 与单文件上限）。

### 加一个字段标签或提示

只改 `lib/client.fields.groups.js` 的 `FIELDS` 表（逐选项文案在
`lib/client.fields.hints.js`）。**不要**把字段名加到任何 `lib/client.panels*.js` 或
`lib/client.page.js`——那里禁止出现 provider/model 字段名。
新字段就算完全不写进表里也会渲染（走通用控件 + 路径转标签）。

### 改分组

改 `lib/client.fields.groups.js` 的 `GROUPS`。`other` 必须是最后的无条件兜底，
否则可能出现字段被丢弃。改完必须跑 `tests/coverage.test.js`。

注意：分组只是**页内分节**，不再对应任何标签页；`lib/client.js` 把
`groupLeaves()` 的全部结果交给 `ProviderPanel`，所以新分组不需要改页面装配。

### 给字段写中文标签与说明

`lib/client.fields.groups.js` 的 `FIELDS` 表是**唯一**写字段文案的地方（逐选项文案在
`lib/client.fields.hints.js`）：
- 每个叶子的键必须是**相对 provider profile 的路径**（`compat.thinkingFormat`、
  `retryPolicy.maxRetries`），模型级字段去掉 `models.`/`modelOverrides.` 前缀即可复用；
- `label` 与 `hint` 都必须含中文；**显示用的原始 key 不写在这里**，它由
  `keyLabelFor(leaf)` 从叶子路径推导；
- 联合分支的显示名写成 `<字段键>.branch.<分支取值或结构>`；
- 改完必须跑 `node --test tests/presentation.test.js`：它枚举页面真实渲染的叶子
  （含联合分支）并比对 60 个 key 的显式名单，漏写即失败。

### 凭据（密钥）改动

密钥只允许走 `ctx.remote.credentials.{describe,set,unset}`，配置里只写引用名
（`apiKeyEnv`，schema `role: credential-ref`）。改这块必须跑
`tests/wiring.test.js`（通道守卫 + 降级）与 `tests/a11y.test.js`（只读引用 + 密码框）。

### 测试 harness 的 primitives stub 必须是 wrapper 形状

平台把 `Button`/`Input` 导出为 `forwardRef(...)`，另有组件导出为 `memo(...)` 包装对象。
测试里的 primitives stub 如果只提供普通函数，就**永远看不到**「解析器拒绝 wrapper 对象」
这一类缺陷（本轮缺陷正是这样逃过了全部 harness）。因此：

- `tests/a11y.test.js` 的 `createHarness({wrapPrimitives})`、
  `tests/instances.test.js`（默认 wrapper 化）、`tests/verify.polish.mjs` 的
  `renderCell({wrapPrimitives:true})` 都会把原语包成 wrapper；
- 三个 mini-renderer 都按 React 语义解包（memo 取 `.type`、forwardRef 取 `.render`）；
- `tests/wiring.test.js` 有一条静态守卫：解析原语处不得出现裸
  `typeof x === 'function'`，必须走 `isComponent`。
- **v8 起改为**：面板**已不再解析任何 `memo(...)` 组件**（`DisclosureRow` 退役，见
  `docs/interaction-design.md` §16.4/§16.5 W2）。memo 形态的覆盖仍然保留，但改成
  **合成的解析器形态测试**：`tests/a11y.test.js:1460` 与 `tests/verify.polish.mjs:1364`
  把 `Tooltip` 包成 `memo` 对象（`{Button:'forwardRef', Input:'forwardRef', Tooltip:'memo'}`），
  断言的是「`isComponent` 接受 memo 包装对象」这条规则本身，
  不再声称某个 shipped memo primitive 被采用。
  **v9 附注**：布尔叶子不再解析 `Switch`（改走三态单选），但该 primitive 仍在模块初始化时
  绑定；`tests/a11y.test.js` 与 `tests/v8.audit.test.js` 反过来断言「布尔行**不得**解析
  `Switch`」。

### 改实例容器渲染

`models[]` / `modelOverrides` 的成员叶子带 `container = {kind, path}`
（`lib/client.schema.js`），渲染在 `lib/client.panels.instances.js` 的 `ArraySection` /
`InstanceDictSection`。改这里必须跑 `tests/instances.test.js`（断言每张卡片发出的
op 路径）与 `node tests/verify.integration.mjs`（用真实 host `applyPathOp` 字节
验证这些路径可被接受）。`lib/client.form.js` 的写入语义**不要动**。

### 上游 adapter 升级

```bash
node scripts/snapshot-schema.mjs     # 重新生成 fixture（需可读副本，见下）
node --test                          # A2/A3 会故意失败，提醒你确认名单
```
`tests/coverage.test.js` 里 22 / 7 / 26 三份名单是**故意写死**的：
上游一变，测试就红，必须人工确认后再更新名单与 `docs/field-coverage.md`。
这正是「不静默漂移」的机制。

### 重新生成 schema fixture（维护者步骤，不是跑测试的前提）

`tests/fixtures/llm-pi-ai.schema.json` 是**测试套件的权威输入**，已提交到仓库；
`node --test` 直接读它，**不需要**先重新生成。只有上游 adapter 升级、需要确认信封真的
变了时，才由维护者重跑一次 `scripts/snapshot-schema.mjs`。

脚本**不引入任何依赖**（本仓库刻意零依赖、无打包器）：它用 `createRequire` 从「能看到
包的那份 `node_modules`」里 `require.resolve` 出 `@deepseek-ai/schemastery` 与
`@deepseek-ai/dsh-llm-pi-ai`，再复刻 host 的 `volatileForm` 投影。

这两个包**打包在 `app.asar` 里**，纯 Node 读不进 asar；`.unpacked` 旁路只有少量未打包
文件（本机 23 项，两个包都不在其中）。所以标准安装上的默认搜索**会**失败——失败信息会
点名缺的是哪个包、解释原因，并直接给出下面两条可执行命令。

先解出一份可读副本（一次性）：

```bash
npx @electron/asar extract \
  "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar" /tmp/dsh-asar
```

再指定它（`--search` 可重复，一个目录可同时满足两个包）：

```bash
node scripts/snapshot-schema.mjs --search /tmp/dsh-asar/dsh/node_modules
# 或：DSH_APP_NODE_MODULES=/tmp/dsh-asar/dsh/node_modules node scripts/snapshot-schema.mjs
```

默认搜索顺序：`DSH_APP_NODE_MODULES`（可用 `:` 分隔多个）→ `$DSH_PROFILE_DIR/node_modules`
→ `$DSH_HOME/profiles/<profile>/node_modules` → `app.asar.unpacked/dsh/node_modules`
→ `app.asar/dsh/node_modules`。成功时脚本会打印每个包实际来自哪个目录，便于核对用的是
哪一份副本；实测 `--search /tmp/asarx/out/dsh/node_modules` 的输出与已提交 fixture
**逐字节一致**（`cmp` 无差异）。

### 改写入语义

只改 `lib/client.form.js`，并同步 `tests/form.test.js`。
不允许在面板里手搓 op：清空必须走 `form.remove`。

## 5. 调试

- 页面是浏览器 bundle，日志直接进 DevTools console。
- host 半刻意保持空：它没有日志也不要加逻辑。
- 若页面不出现，按顺序排查：
  1. `llm-pi-ai` 是否在 describe 里（`whileServed` 只在被服务时注册）；
  2. 本包是否在客户端 boot graph 里（`/plugins/events` 的 `graph` 帧）；
  3. 若不在，多半是首次发现被否定判定缓存挡住——需要一次 DSH 重启，
     见 [verification.md](verification.md) §4。
- 改 chunk 内容后不需要重启，但**必须让 owner 的 rev 变化**，否则 F5 也会拿到旧字节：
  见下面「改动 chunk 后必须让 owner 的 rev 变化」。

### 改动 chunk 后必须让 owner 的 rev 变化（否则 F5 也会看到旧页面）

**现象**：只改了某个 chunk（例如 `lib/client.fields.js`），磁盘字节已正确、`node --test` 全绿，
用户 F5 后却仍是旧页面（旧分组、英文兜底标签、没有 compat 折叠、没有样式）。

**机制**（`@deepseek-ai/dsh-client-modules`，行号为解出的 shipped 源码
`/tmp/asarx/out/dsh/node_modules/@deepseek-ai/dsh-client-modules/lib/index.js`）：

1. 每个插件资源的 URL 形如 `/plugins/<id>/client.<chunk>.js?rev=<entry.rev>`（`chunkUrl()`，`:220-222`）。
2. `entry.rev` 只由 **owner bundle `client.js`** 一个文件的 artifact 元数据算出：
   `captureArtifactBaseline(clientPath)` 对 `client.js` 取 `statSync` 的 `mtimeMs/ctimeMs/size`，
   `artifactRevision()`（`:193-199`）再 `framedHash("plugin-artifact", …)`。
   **包内 chunk 文件完全不参与 rev 计算。**
3. host 按**完整资源 URL**（含 `?rev=`）缓存响应：`chunkResponse()`（`:934-956`）末尾
   `this.responses.set(resourceUrl, response)`；`bundleResource()`（`:958-970`）优先返回
   `this.responses.get(resourceUrl)`，响应头固定 `cache-control: public, max-age=31536000, immutable`
   （`IMMUTABLE_CACHE`，`:159`）。
4. 响应体由 `lazyBody()`（`:318-324`）惰性且**只求值一次**（`result ??= Promise.resolve().then(produce)`）：
   某 URL 第一次被请求后，字节就固定在那一次读到的内容上。
5. 因此「只改 chunk」= `client.js` 的 stat 不变 = rev 不变 = URL 不变 =
   host 缓存命中 **且** 浏览器 `immutable` 缓存命中 = 继续拿到旧字节。

**这是平台缓存行为，不是本插件能修的缺陷**，也不要在插件里加版本号绕过它。

**处理办法**（按代价从低到高）：

1. 让 **owner 的 artifact 元数据变化**：重新保存一次 `lib/client.js`，或只改 mtime
   （`touch lib/client.js`）。watcher 依 stat 重算 rev，新 rev 产生全新 URL，从而同时绕过
   host 与浏览器缓存。实测：touch 后 rev 由 `bb89155d2249` 变为 `36ba45ac23da`。
2. 用户侧 **F5 重载页面**——必须在 rev 变化之后，否则请求的还是同一个 URL。
3. 仍不行才重启 DSH（最后手段）。

**自查命令**（任何 chunk-only 改动之后都应跑一遍）：

```bash
cd /Users/zfowed/Downloads/dsh-llm-pi-ai-config

# 1) 先取当前 rev：开发者工具 Network 里 owner 请求的 &rev=<rev>，
#    或客户端 boot graph（/plugins/events 的 graph 帧，见本节第 2 条）。
REV=<rev>

# 2) 看「服务器实际供了什么」，而不是「磁盘上有什么」
curl -s "http://127.0.0.1:19387/plugins/dsh-llm-pi-ai-config/client.fields.js?rev=$REV" \
  | grep -c relativePath

# 3) 与磁盘对照（应一致）
grep -c relativePath lib/client.fields.js
```

**判据**：`?rev=<rev>` 的响应里出现你刚加进去的标记（如 `relativePath`），才算浏览器这一轮
拿到的是新字节；否则 `node --test` 再绿也不代表用户看得到。原始前后对照见
[verification.md](verification.md) §8。

### 调试「原代码」预览（v9）

- 预览的输入是 `formSnapshot.values`——**当前草稿**，不是磁盘内容。因此在表单里改一个字段后
  立刻切到「原代码」，新值就应该出现在 YAML 里；看不到就是 `formSnapshot` 没更新（缺陷），
  不是缓存问题。预览里出现未保存的修改是**预期行为**（切换时还有 `rawNotice` 提示）。
- 预览只显示一行 `原代码视图不可用` = YAML chunk 没到：先看 boot graph 里有没有
  `client.yaml.js`（`/plugins/events` 的 `graph` 帧），再按上一节的 rev 规则处理。
- 预览的代码块样式全丢但文字还在 = `CodeBlock` primitive 缺失，走了
  `<pre class="piai-expr-body">` 降级；这是**有意的**降级路径，不是空白页事故。
- 切换「原代码 / 配置表单」**不得**产生任何写入：`tests/raw.test.js` 断言切换过程中
  `mutate` 调用数为 0；手工复核时看吸底条的「有未保存的改动」是否被切换本身点亮。

### 调试模型发现（v9）

- 按钮禁用时把鼠标停在上面：`title` 就是原因——宿主不支持（`remote.llm` 未注入或没有
  `discoverModels`）、发现出错（宿主 message 原样透传）、或当前 `models` 是 `!!js` 表达式。
- 失败信息来自宿主 RPC `llm/discoverModels`（错误码 `llm/model-discovery-rejected`），
  页面把它**原样**显示在 `.piai-error[role="alert"]` 里；adapter 的校验始终权威，
  不要在插件里改写它（AGENTS §3.5 同理）。
- 四条路径（成功 / 拒绝 / 空结果 / 抛异常）用假 `remote.llm` 在 `tests/catalog.test.js`
  里覆盖，不需要真实网关；要手工复现某条路径，照着该文件的 stub 写法在 `/tmp` 起一个
  小脚本即可。
- 选择器里点「添加所选」**不自动保存**：`form.edit` 只暂存，吸底条应显示「有未保存的改动」，
  点「保存」才走 `mutate`。

## 6. 验证纪律

- 结论只有四种：`verified` / `partial` / `untested` / `blocked`，写进
  `docs/verification.md`，并附原始输出。
- **没实测过的不许写 verified。**
- 不要用「对真实 profile 写一次」来验证：那是有损的。验证必须无损。
  写入语义的正确性用「抽取 host 真实 `applyPathOp` 字节并执行」来证明，
  `tests/verify.integration.mjs` 就是这么做的。

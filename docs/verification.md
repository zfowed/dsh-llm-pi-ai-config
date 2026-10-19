# 验证记录（verification）

> **v10 说明（历史段落）**：本文件 §1–§18 是各版本当时的实测记录，其中的
> `lib/…js:<行号>` 引用在 v10 拆分后已改为**文件级**引用（旧行号对应的是已不存在的
> 旧版字节，保留行号只会误导）。当前模块布局见
> [architecture.md](architecture.md) §1.1；§19 起使用「文件 + 符号名」引用。

本文件记录**实际执行过**的验证、**原始结果**，以及**未经证实**的部分。
判定只有四种：`verified`（已证实）、`partial`（部分证实）、`untested`（未测）、
`blocked`（被环境阻塞）。**没有实测过的项一律不写 verified。**

环境：macOS，DSH Desktop 0.2.0-rc.2，Node v24.11.1，profile
`/Users/zfowed/.dsh/profiles/desktop`，无 TypeScript、无打包器、无第三方依赖。

## 1. 自动化测试（全部实测）

> **本节是 task-14 冻结版本的历史快照**（168 项）。当前（布局重构后）的实测命令与结果
> 见 §10；下面的文件数量表与 md5 均对应当时那一版，不再代表 HEAD。

命令与原始结果：

```
$ cd dsh-llm-pi-ai-config && node --test
ℹ tests 168
ℹ suites 10
ℹ pass 168
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 128.283167
[exit: 0]

$ node --check lib/*.js                # client / panels / styles / schema / form / fields / index
7 个文件全部通过，无输出

$ node tests/verify.integration.mjs
checks passed : 34
checks failed : 0
unverified    : 0
[exit: 0]

$ node tests/verify.render.mjs        # 独立 render/hook harness（本文件 §6）
--- summary: 15 passed, 0 skipped, 0 failed ---
[exit: 0]

$ node tests/verify.polish.mjs        # 独立 beautify/样式/a11y harness（本文件 §7、§9）
--- summary: 41 passed, 0 failed ---   # 5 条 OBS 均为诊断信息（含供出字节，§9.4）
[exit: 0]
```

以上五条命令均在 task-14 冻结版本上运行：`lib/client.js` md5
`45b645a481221fe9230356a5ae8c7a94`（40541 字节）、`lib/client.panels.js` md5
`28a52bb0ec06022b022a0929f0ae6183`、`lib/client.styles.js` md5
`54b89ee1b02b09af72acca329f96980f`、`lib/client.fields.js` md5
`66afaea701b80cd34f6ff1e35b2a5273`。
历史：task-7 `39dd4ce9…` → task-9 `06c938e2…` → task-13 的 HIGH 缺陷（polish 28/4）
→ task-14 修 `client.fields.js` → task-15 复核 polish **34/0** → task-17 v2 样式
（`client.styles.js` md5 `348fd7040dcfec98dc08688fbc1c048b`）→ task-18 polish **41/0**（rev bump 后供出字节亦为 v2，§9.4）。
**注意**：`node --test` 全绿**不**自动代表页面在真实分组/标签下正确（task-13 正是全绿但有
4 项独立红）；独立 harness 的价值就在此。

| 测试文件 | 数量 | 覆盖内容 | 判定 |
| --- | --- | --- | --- |
| `tests/schema.test.js` | 53 | schema 信封遍历：uid/inline 解析、dict/array/union/const、全 const 联合折叠为单个 enum、`{__jsExpr}` 跳过、`shape()` | verified |
| `tests/form.test.js` | 50 | `diffOps` 最小化、清空即 `unset`、类型切换为单次 `set`、数组缩短从高到低、save 恰好一次、冲突不推进基线 | verified |
| `tests/coverage.test.js` | 10 | 每个叶子恰好落在一个分组；22/7/26 名单；未知字段仍渲染；README 遗漏的 9 个字段可达；**task-14 新增：`providers.<name>.` 前缀路径与 basePath `[]` 分组一致** | verified |
| `tests/compat.test.js` | 9 | 7 个协议的 offer/withheld 集合、互斥性、未知协议返回 undefined、offer 词表恰为 26 | verified |
| `tests/wiring.test.js` | 6 | owner bundle 注册（无 `chunk`）、`require.async` 加载的 chunk 文件名合法、`settings.section` 的 id/order、未提供命名空间时零注册零请求、校验委托。**枚举只列 4 个 chunk，已过期**（owner 现在请求 5 个，含 `client.styles.js`）——见 §7.5 | partial（断言通过，但清单过期） |
| `tests/render.test.js` | 22 | owner 自有渲染回归：真实 page 组件在「信封存在/缺席、hook 返回 undefined、缺 hook、缺 controller、面板抛错、面板导出缺失、t 本地化、SegmentedTabs/tabpanel、piai-root、样式 effect 安装与清理、样式 chunk 拒绝」下都不抛错 | verified |
| `tests/styles.test.js` | 8 | 样式 chunk：单 `<style>`、显式 `data-plugin`、幂等、disposer 只删自己的节点、无 `document` 安全、选择器作用域、禁用构造、token 白名单、52 类集合 | verified |
| `tests/a11y.test.js` | 9 | 面板 a11y：label/id、aria-describedby、aria-invalid、role=alert、SegmentedTabs 语义、compat 6 组 26 键默认折叠、withheld 可编辑、二次确认 + Esc | verified（**在其自身的 props 分组下**；页面真实分组失效见 §7.3） |
| `tests/verify.integration.mjs` | 33 项断言 | 独立harness：静默丢失猎杀、never-null 字节级验证（对 host 真实 `applyPathOp` 字节）、compat 表 | verified |
| `tests/verify.render.mjs` | 15 项断言 | 独立 render/hook harness：真实 slots 模块 + 真实 `useSyncExternalStoreWithSelector` 字节 + 真实 `SlotCore` + 真实 `lib/client.js`（自写 mini-loader / mini-renderer） | verified |
| `tests/verify.polish.mjs` | 41 项断言 + 5 项观察 | 独立 polish harness：真实 styles chunk + 真 CSS 解析 + 真实 `lib/client.js`/`client.panels.js`/`client.fields.js` + 真实 adapter gate 表。task-13 时 28/4（4 红 = §7.3 的 HIGH）；task-14 修复后 34/0；task-15 裁决两项口径错误并加强断言（§7.7）；task-17 v2 后 39/0（§9） | verified |

## 2. 逐项判定

| 声明 | 方法 | 原始观察 | 判定 |
| --- | --- | --- | --- |
| 字段集来自运行时 schema，而非硬编码 | 用真实 fixture 调 `leaves()`/`groupLeaves()` | 111 个叶子；分组后 111；重复 0；丢失 0 | verified |
| `providers` 恰有 22 个字段 | `shape(envelope, providerRef).fields` 与显式名单双向比对 | 22 == 22，零差异 | verified |
| 模型级恰有 7 个字段 | `shape()` on `models` 的 `inner` | 7 == 7 | verified |
| compat 恰有 26 个键，provider 级与 model 级键集相同 | 两侧 `shape()` 比对 | 26 == 26，零差异 | verified |
| 未知字段不会被静默丢弃 | 合成未知路径/未知 kind/深层未知路径交给 `groupLeaves()` | 全部落入分组（`other` 兜底） | verified |
| 面板不写死任何 provider/model 字段名 | `grep` 字段名字面量 | `lib/client.panels.js` 零命中（分组改由 group id 选择） | verified |
| 清空字段产生 `unset`，绝不产生 `set null` | 驱动真实 form 模块 + 对 host 抽取的 `applyPathOp` 执行 | 仅 `unset`；`set null` 会写入字面 null（故从不使用） | verified |
| 写入走官方管线 | 逐段阅读 `configForms.get` → `mutate` → `remote.settings.mutate` → `settings.write` → `configEditor.edit` → `writeFileAtomic(0o600)` | 链路成立；本插件不注册自己的命名空间 | verified |
| 页面在 adapter 缺席时不留痕迹 | `wiring.test.js` 以 `served:false` 调 `apply()` | 注册 0 个槽位，请求 0 个 chunk | verified |
| chunk 机制对第三方包可用 | 阅读 `dsh-client-modules` 且以 `window===globalThis` 的沙箱实测 | 4 个 chunk 文件名匹配 `client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js`，各自以 `chunk` 字段注册 | verified |
| 未新增第三方依赖 | 检查清单 | `dependencies`/`devDependencies`/`peerDependencies` 均为 `{}` | verified |
| lib 不直接读写文件或 YAML | `grep` | 唯一命中是解释管线的注释 | verified |
| 其它插件配置行与注释会被保留 | 阅读 `configEditor.edit` | 仅 `setIn([index,"config"], …)`；块外注释/行保留，**块内注释会丢失**（与官方 Models 页一致） | verified |
| `!!js` 表达式保存后仍保留 | 阅读 `config-editor` 的 `__jsExpr` → `Scalar(tag:yaml.org,2002:js)` 往返 | 保留；本页只读展示 | verified |
| 提交前无需重启即可继续开发 | 触碰已存在 bundle 观察客户端图 rev | rev 变化（`dc59e17bf15b` → `950d2f404e8b`），热重载通道有效 | verified |
| 注入的 `hooks:{page}` 变成 `use<Name>` 选择器 hook，必须带选择器调用 | 在真实 `@deepseek-ai/dsh-client-ui-slots` 上执行 `standardHookPropName`；从 shipped renderer 抽出真实 `useSyncExternalStoreWithSelector` 字节执行 | `page`→`usePage`；带选择器返回选择结果；**不带参数抛 `TypeError: l is not a function`**（见 §6） | verified |
| 渲染期抛错 → 槽位条目失效（导航保留、正文空白） | 在真实 `SlotCore` 上注册 `settings.section` 两条目，再调 `reportEntryError(...,{abdicate:true})` | `entriesOfSlot` 只剩 shipped 条目；`entries` 仍是两行；`snapshot()` 得到 `[{id:"models",active:true},{id:"model-extended",active:false}]` | verified |
| 修复后页面组件在四种输入下都不抛错、面板抛错被边界contained、chunk 失败可见 | `tests/verify.render.mjs` 以真实 `lib/client.js` + 真实 shim 选择器 hook 驱动（自写 mini-renderer，含 Suspense/错误边界语义） | 15/15；`PageErrorBoundary` 捕获面板抛错；chunk 拒绝显示 `Failed to load the page components: …`；缺 hook 落到 `hookMissing` 态 | verified |

## 3. 未验证 / 被阻塞 / 新近证实（证实项只覆盖其自身范围，不得外推）

| 项 | 原因 | 判定 |
| --- | --- | --- |
| GUI 中「模型扩展配置」菜单真实出现并可操作 | **出现**已在 §6.1 观察到（DSH 重启后导航项出现），修复后槽位检查器又确认本条目 `active:true`（§6.6）——本包已进入客户端图。**「可操作」**（可见正文、点击与交互）仍无人目视确认。 | partial（出现已证实；交互未证实） |
| 修复后 `settings.section` 的 `model-extended` 在真实浏览器里恢复 `active:true` | 修复后由 Lead 执行 `cordis_inspect_query`（platform=client, provider=Slots, method=`listSubTree`, input `{"root":"settings.section"}`）**成功返回**；本条目原始观察为 `{"registrant":"mf","id":"model-extended","order":12,"priority":0,"active":true}`（修复前同口径为 `active:false`，见 §6.1） | verified（**仅槽位级**：槽位级 abdication 已消失、cell 已 active；可见正文/样式/交互与真实保存仍未证实，见 §6.6） |
| 用鼠标完成一次真实保存（改值 → 保存 → 回读 → 再改回） | 需要上面那条 GUI 通路；本轮不做任何对真实 profile 的写操作。 | blocked |
| 非 loopback 页面的持久化 | 源码为 `persistence = ctx.remote.$host.isLoopback ? "host" : "memory"`，且 `persistence==="memory"` 时 `enqueue()` 直接返回 false、不发任何请求。即非本机页面保存是**静默 no-op**。本页对此只做了提示文案，未在真实非 loopback 环境实测。 | untested |
| React 组件真实渲染（真实 react-dom、DOM 结构、样式、交互） | 环境无 React、无 DOM。`tests/verify.render.mjs` 已用自写 mini-renderer（含 Suspense / error-boundary 语义）**真实调用** owner 的页面组件，但真实 react-dom 与浏览器 DOM 仍未渲染。槽位检查器的 `active:true` 只证明条目已投影，**不证明可见正文内容/样式/交互**。 | partial |
| `require.async` 在真实浏览器中的网络取回（`/plugins/<id>/client.<name>.js?rev=…`） | 已在沙箱内验证注册协议与文件名规则，但真实 HTTP 取回未跑通（依赖上面的首次发现）。 | partial |
| adapter 的 `assertServiceable` 在保存时的报错文案 | 由 host 在写入时执行；未在真实保存中观察。 | untested |
| 页面级分组 / 中文标签 / compat 折叠 / `aria-describedby`（§7.3 的 HIGH 缺陷） | task-13 发现（独立 harness 4 项红）；**task-14 已修复** `lib/client.fields.js` 的实例前缀剥离；task-15 复核 `groupLeaves(['providers','alpha'])` 与 basePath `[]` 分组**完全相等**（9 组形状）、`labelFor` 前缀路径得到策展标签、6 组 compat 折叠 19/19 标注、`aria-describedby` 69 条零悬空 | **fixed / verified**（§7.3、§7.7） |
| 美化后的**视觉观感**、亮/暗色、hover/focus 动效、真实鼠标/键盘交互，以及 v2 的**窄容器真实折叠/溢出是否消失、输入框宽度是否真的对齐** | 无 DOM、无布局引擎、无截图、无浏览器自动化；结构性保证已 verified（§9.2），真实渲染只能由用户目视。详见 §7.8、§9.5 | untested |

## 4. 首次发现被阻塞的根因（实测隔离）

`dsh-client-modules` 的 `resolveMeta()` 会把结果——**包括「这不是客户端包」的否定判定**——
按 `baseUrl + "\0" + loaderName` 缓存：

```js
sourceKey(loaderName, baseUrl) { return `${baseUrl}\0${loaderName}` }
// "Package metadata (including the negative 'not a client package' verdict) is
//  cached per Loader specifier and owning-tree base URL until restart."
```

profile 里的 `node_modules/dsh-llm-pi-ai-config` 软链在本包 `package.json` 出现**之前**
就已存在，因此该键上的否定判定被缓存，之后任何补丁都无法清除。

隔离实验（每项均已回滚，profile 已恢复到实验前状态并校验字节一致）：

| 实验 | 结果 |
| --- | --- |
| 插入一个同形状的全新包 | 进入客户端图（76 条） |
| 插入本包 | 始终不进入（75 条） |
| 换新 specifier 别名指向同一 manifest | 被拒：manifest name 必须等于 specifier |
| 路径式 specifier（`./node_modules/...`） | 被拒：上游 manifest 名不匹配 |
| 把软链换成真实目录副本 | 仍不进入 → 不是软链问题 |
| 触碰一个已存在的 bundle | rev 变化 → HMR 本身正常 |

结论：这是**一次性重启成本**，不影响后续热重载开发。该重启后来已经发生：
§6.1 的导航项与 §6.6 的 `active:true` 都要求本包已进入客户端图，§3 的菜单行据此由
`blocked` 改为 `partial`。

## 5. 已知平台行为（记录，不规避）

- 通过 `configEditor` 保存会替换 `llm-pi-ai` 行内的 `config` 节点，因此**该行块内的 YAML
  注释会丢失**，与官方 Models 页行为一致；块外的行与注释保留。
- host 的 `SettingsForms.mutate` 中，若 `unset` 的父节点是**对象**且更低层已有值，会被改写为
  `{op:"set", value:<继承值>}`——语义仍是「继承」，但用户层 YAML 会显式出现该键；数组父节点的
  `unset` 始终是 splice。
- `unset` 落在数组索引且 `index === length` 时，host 会抛 `TypeError`；因此数组缩短必须
  由高到低发出（`tests/form.test.js` 与独立 harness 均已断言）。

## 6. 空白页事故：渲染期抛错 → 占位失效（abdication）（2026-10-12）

### 6.1 现象

DSH 重启后，设置页出现「模型扩展配置」导航项，点进去**正文空白**；四个 chunk 均
HTTP 200。live 客户端槽位检查器读到本条目 `"active": false`，而所有 shipped 条目均为
`"active": true`。

### 6.2 机制（全部来自 shipped 字节，file:line 可查）

1. `inject: () => ({hooks: {page: pageStore}})` 这个注入面由 renderer 的
   `bindInjectSources()` 处理：每个 `hooks` 源经 `standardHookPropName` 变成 `use<Name>`
   属性，值为 `observableHook(source)`：
   - `@deepseek-ai/dsh-client-ui-slots/lib/index.js:7-9` — `standardHookPropName('page') === 'usePage'`
   - `@deepseek-ai/dsh-client-ui-renderer/`lib/client.js`（owner） — `hooks`→`usePage`；
     `:431` 取名 绑定 `observableHook(source)`
   - `…/client.js:155-161` — `bindSnapshotSelector`：`useSelector(sel, eq)` 把 `sel`
     **原样**传给 `useSyncExternalStoreWithSelector(subscribe, getSnapshot, void 0, sel, eq)`，
     不提供默认值（`:159`）
2. 因此 `usePage` 是**选择器 hook**，必须带选择器调用。无参数调用时，shipped shim
   （`…/client.js:93-140`，真实 `useSyncExternalStoreWithSelector@1.2.0` 字节）执行
   `l(a)` 而 `l === undefined` → **`TypeError: l is not a function`**。
   shipped 的可用对照：`dsh-client-ui-settings-shell/`lib/client.js`（owner）
   `props.useShellCard((snapshot) => snapshot)`。
3. 渲染期抛错被槽位条目边界接住并上报：
   - `…/dsh-client-ui-renderer/`lib/client.js`（owner） — `SlotErrorBoundary.componentDidCatch`
   - `:1117` — `host.reportEntryError(slotKey, entry, error, {abdicate: spec.kind !== "chain"})`
   - `dsh-client-ui-slots/lib/index.js:62`（`abdicated` WeakSet）
     （`reportEntryError` 把条目加入 WeakSet）（`entriesOfSlot` 跳过它）（`snapshot()` 里 `active: active.has(entry)`）
4. 失效是**终身**的：原始 `entries` 仍保留该行（导航还在），但 `entriesOfSlot` 不再投影它，
   renderer 对 list 槽位的空位渲染 `<div data-slot-error>`（`…/client.js:1147`）
   —— 于是「导航在、正文空白」。

原始根因（修复前 `lib/client.js`）：`var view = props.usePage()`（无选择器）后立刻
读 `view.envelope`。

### 6.3 复现（可执行，非推断）

`tests/verify.render.mjs` 的 A3/A4 直接执行从 shipped renderer 抽取的**真实**
`useSyncExternalStoreWithSelector` 字节：带选择器返回选择结果；不带参数抛
`TypeError: l is not a function`。A6 在真实 `SlotCore` 上复现整条机制，得到与 live 检查器
一致的形状：

```
occupants=[{id:"models",active:true},{id:"model-extended",active:false}]
entriesOfSlot -> ["models"]      # 正文消失
entries       -> ["models","model-extended"]   # 导航保留
```

### 6.4 修复内容（task-7，`lib/client.js` md5 `39dd4ce965f8ff9b92e26c50d1fe38d0`）

> 下面括号里的行号指向 **task-9 加固后**的 `lib/client.js`
> （md5 `06c938e24beeb97bb15e074d3439a6a7`，32376 字节）；task-7 冻结字节的行号略有不同。

- `readView(usePage)`（`:390-393`）以 `usePage(identity)` 调用，缺 hook 时返回 `undefined`
  并落到显式 `hookMissing` 态（`:608-613`）；页面不再解引用 undefined。
- 新增渲染安全原语：`attempt()`（`:40-46`）、`snapshotOf()`（`:396-408`）、
  `panelOf()`（`:428-442`，面板导出缺失→可见占位；task-9 起该占位文案经 `t` 本地化）、
  `identity/noopSubscribe/emptySnapshot`。
- 新增内层错误边界 `PageBoundary`（`:83-127`，包裹面板 body）与
  `ChunkBoundary`（`:130`，包裹 lazy/Suspense）：面板或 chunk 抛错时显示行内
  错误 + 重试，而不是让整个槽位被 abdicate。
- chunk 加载失败显示 `loadFailed` 文案 + `retry` 按钮（eager 路径 `:301-322`）。

### 6.5 验证与原始输出

命令与结果见 §1（四条命令全绿，140/140、33/0、15/15）。

`tests/verify.render.mjs`（本文件作者独立编写，不复用 `tests/render.test.js`；
不使用 `lib/client.js` 的 `exports.__internals` 测试缝，而是走
`apply()` → 捕获 `slots.register` → 真实 `SectionHost`）：

- B1 信封完好：不抛错，文本含页面标题；观察到 `usePage(function)`
- B2 信封缺席：不抛错，显示 `Loading…`
- B3 hook 返回 undefined：不抛错
- B4 选择器 hook：实测调用参数为 `function`
- B5 面板抛错：`PageErrorBoundary` 捕获，页面其余部分仍在
- B6 chunk 拒绝：显示 `Failed to load the page components: …`（非空正文）
- B7 owner 仍是合法 bundle owner（无 `import`/`export`/`module.exports`，无 `chunk`）
- B8 可执行代码中不再有 `props.usePage()` 无参调用

**负对照（证明 harness 不是空过）**：把冻结字节复制到 `/tmp/verify-negctl/client.js`，
将 `return usePage(identity)` 改回 `return usePage()`，以
`VERIFY_OWNER_LIB=/tmp/verify-negctl/client.js node tests/verify.render.mjs` 运行：
B1/B2/B4/B5 共 4 项 FAIL，B1 原文
`page header missing; text=Failed to load the page components: l is not a function`。
（B8 是静态守卫，只针对原始的 `props.usePage()` 写法；该类缺陷由动态的 B4 兜住。）

### 6.6 诚实结论

| 声明 | 判定 |
| --- | --- |
| 机制成立：无选择器调用 → `TypeError` → `reportEntryError` → abdication → 导航保留、正文空白 | verified（shipped 字节 + 真实 `SlotCore` 执行） |
| 修复后的页面组件在「信封完好/缺席、hook 返回 undefined、选择器 hook」下不抛错，面板抛错被边界contained，chunk 失败可见 | verified（`tests/verify.render.mjs` B1–B6） |
| 修复后真实浏览器里该 cell 重新 `active: true` | **verified（仅槽位级）**：修复后 Lead 执行 `cordis_inspect_query`（platform=client, provider=Slots, method=`listSubTree`, input `{"root":"settings.section"}`）成功返回，观察到本条目 `{"registrant":"mf","id":"model-extended","order":12,"priority":0,"active":true}`；修复前同口径为 `active:false`（§6.1）。按 §6.2，abdication 在同一注册生命周期内不可逆，故 `active:true` 只能来自修复后的新注册（页面已重载）——这是由 §6.2 推出的**推论**，不是本轮的直接观察。原始返回由 **Lead 转述**，harden-page 未自行复跑该查询。<br>**仍未证实**：可见 DOM 正文/样式/交互（§3 的 `partial` 行）、一次真实 GUI 保存（`blocked`）、非 loopback 持久化（`untested`）、adapter `assertServiceable` 文案（`untested`） |

### 6.7 复查清单（供 Lead / 用户）

1. 用户重载页面（F5，不需要重启 DSH）——abdication 终身，只有新注册才能恢复 `active`。
   **已完成**：`active:true` 的观察要求一次修复后的新注册（§6.6）。
2. 重载后重新执行 `cordis_inspect_query`（platform=client, provider=Slots,
   method=listSubTree, input `{"root":"settings.section"}`），确认
   `{"id":"model-extended",…,"active":true}`。
   **已完成**：Lead 观察到 §6.6 记录的原始返回（由 Lead 转述）。
3. 目视确认「模型扩展配置」正文出现标题/页签/面板。
   **未完成**：没有任何人报告过目视结果，仍为 untested。

### 6.8 本轮缺陷与风险（task-9 之后的状态）

| # | 严重度 | 事实 | 位置 |
| --- | --- | --- | --- |
| 1 | low | 槽位级已证实（§6.6：`active:true`）；但**可见 DOM 正文/样式/交互**仍未被任何 harness 或目视检查证实 | 环境 |
| 2 | fixed | 已修（task-9）：`panelMissing` 进 zh/en 字典，经注入的 `t` 读取；reader 缺失或回显 key 时回落 bundled 英文 `'panel missing'`（保持 `tests/render.test.js` 的既有断言） | `lib/client.js`（owner） |
| 3 | fixed | 已修（task-9）：`project()` 把非数组/缺失的 `namespaces` 视为空，并跳过非对象条目；畸形 `describe()` 快照不再让 mirror 订阅回调抛错 | `lib/client.js`（owner） |
| 4 | info | 新增 `exports.__internals`（测试缝）暴露 `makePage/lazyComponent/readView`；不违反 chunk envelope，但扩大了模块面。本 harness 刻意不使用它，以保持独立性 | `lib/client.js`（owner） |
| 5 | info | `EagerHost`（React 无 `lazy`/`Suspense` 时）与 `createPageBoundary()` 的 Passthrough 分支未被任何 harness 执行 | `lib/client.js`（owner） |

## 7. 美化改造的独立验证（task-13 / task-15，verifier3）

独立 harness：`tests/verify.polish.mjs`（纯 `node`，34 项断言 + 4 项观察）。它不使用任何作者
自有的测试工具，也不使用 `lib/client.js` 的 `exports.__internals`：它自己实现 mini-loader /
fake `document` / CSS 解析器 / mini-renderer（含 `useState`/`useEffect`、Suspense 与错误
边界语义），并从 `lib/client.styles.js` 与 `docs/interaction-design.md` 的冻结清单出发。
命令与原始输出见 §1。判定：`verified` / `partial` / `untested` / `blocked`。

task-13（首轮）发现 1 个 HIGH 缺陷并通过 `tests/verify.polish.mjs` 的 4 项红断言暴露；
task-14 修复；task-15 复核并对剩余 2 项红断言做了**裁决**（结论：两处都是 harness 度量口径
错误，已修正口径且**加强**断言）。当前状态：`34 passed / 0 failed`（§7.2、§7.3、§7.8）。

### 7.1 逐项判定

| # | 项 | 方法（原始观察） | 判定 |
| --- | --- | --- | --- |
| 1 | 样式契约 §7：恰好一个 `<style>`；显式 `data-plugin`/`data-plugin-css`；幂等；disposer 只删自己的节点且可重复调用；无 `document` 安全 no-op；`STYLESHEET` 无 `</style>`/模板占位 | P1a–P1f：fake document 上真实 `install()`；注入外部插件 `<style>` 验证不被误删；`withDocument:false` 的沙箱验证 no-op | verified |
| 2 | 泄漏检查 §5 | P2a–P2d：自写 CSS 解析器取出 57 条选择器，全部以 `.piai-root` 开头；无元素/`*`/裸属性复合；无 `@import`/`!important`/`url(`；`@keyframes` 名 `piai-` 前缀 | verified |
| 3 | 颜色 token 政策 §2 | P3a–P3c：246 条声明零 hex/rgb/hsl/颜色关键字；`--dsw-*` 只出现于 14 白名单中的 10 个；`.piai-root` 上 13 个本地变量齐备 | verified |
| 4 | 类覆盖 §4 三方相等 | P4a–P4c：CSS 52、`CLASSES` 52、JS（client.js+panels.js）52、冻结清单 52，逐名集合相等；`piai-tab` 已无处出现 | verified（字面量 52/52/52；task-14 后行为可达性亦成立，见 §7.3） |
| 5 | a11y §8.1–§8.2/§8.5/§8.6 | P5a：真实 `SegmentedTabs`（items 唯一、带 DOM id、`value∈items`、`label` 非空）+ `role="tabpanel"`+`aria-labelledby`。P5b：错误面 `role="alert"`、脏状态 `aria-live="polite"`。P5c（**按页签配对**，task-15 修正口径）：27 个带 id 控件、id 唯一、16 经 `<label htmlFor>`、4 经 `aria-label`、7 由 primitive 自持 `label`；悬空 `htmlFor` = 0；19 个 `Switch` 全部有 `label` | verified |
| 6 | a11y §8.3 `aria-describedby` | P5f（task-14 后）：69 条 `aria-describedby` 全部指向渲染树中真实存在的 id（67 个 id），零悬空 | verified |
| 7 | a11y §8.4 `aria-invalid`（校验失败态） | P5g（观察）：代码确由 `Row({invalid})` 发出、primitive 自身也会设；但无法在不构造真实校验失败态的情况下动态触发 | untested |
| 8 | compat §6：6 组 / 26 键 / 默认折叠 / 每组键集 / withheld 标注但可编辑 | P5d（task-14/15 后）：真实页面 6 个 `DisclosureRow`、26 键、徽标计数逐组相符、**每组解析出的键集与该组冻结键集完全相等**；协议 `anthropic-messages`：未 offer 的 19 个键 **19/19 全部**被标 `该协议不支持`，且 offered 的键零误标；6 个控件无一被禁用 | verified（§7.8）**（v8 起改为：无 `DisclosureRow`，6 个自写折叠头；无计数徽标；断言见 `docs/verification.md` §17.5 与 `tests/v8.audit.test.js`）** |
| 9 | 韧性 §1.3/§7（关键项） | P6a：注入**拒绝**的 `client.styles.js` → 页面仍渲染正文、不抛错（同时断言 owner 确实请求了该 chunk）。P6b：注入 hook 始终以**选择器**调用（3 次均 `usePage(function)`），空白页机制未回归。P6c：面板抛错被 `PageErrorBoundary` 捕获；`client.panels.js` 拒绝时显示 loadFailed 文案 | verified |
| 10 | 负对照（harness 非空转） | 见 §7.4：三个样式 mutant + 一个「前缀盲查表」mutant 各自让对应断言失败 | verified |
| 11 | 样式 chunk 请求 + wiring 清单 | P8a：owner 请求 5 个 chunk，含 `./client.styles.js`。P8b（task-14 后）：`tests/wiring.test.js` 已枚举 5 个 → **in sync**（task-13 报告后已修） | verified |
| 12 | compat gate 真值（Lead 追加检查） | P7a–P7c：mirror 与真实 adapter 的 7 个协议 offer/withhold 集合逐字节一致；无任何 gate 对 26 键显式 `withhold`；标注规则与 adapter 运行期规则一致 | verified（§7.6） |

### 7.2 关键结论（task-13 发现 → task-14 修复 → task-15 复核）

- task-13 时：`node --test` 166/166 全绿，而 `tests/verify.polish.mjs` **28 passed / 4 failed**。
  这 4 项红是**同一个真实 HIGH 缺陷**的证据（P5d/P5e/P5h/P5f 同源），不是环境问题，也不是
  harness 误报：它们驱动的是「页面自己的 `leaves()` 调用」，而作者的测试喂给面板的是
  **不带实例前缀**的叶子 / hand-built 分组。
- task-14 修复 `lib/client.fields.js`（新增 `relativePath`/`matchPath`，剥离
  `providers.<name>.` 实例前缀）后：`tests/verify.polish.mjs` **34 passed / 0 failed**。
- task-15 复核：修复真实（§7.3 的前后数字），并对 task-13 遗留的 P5c/P5d 两项红做了裁决
  —— **两处都是 harness 度量口径错误**（§7.8），已修正口径且加强了断言（不再有任何放宽）。

### 7.3 task-14 修复的 HIGH 缺陷：页面分组/标签/提示失效（前后对照）

**修复前 → 修复后**（同一 fixture、同一页面调用）：

| 观察 | 修复前（fields.js `24124` 字节版） | 修复后（md5 `66afaea701b80cd34f6ff1e35b2a5273`） |
| --- | --- | --- |
| `groupLeaves(leaves(env, providerRef, ['providers','alpha']))` | `["other:111"]` | `["identity:4","models:32","overrides:31","defaults:3","request:8","timeouts:3","images:3","retry:1","compat:26"]` |
| 与 basePath `[]` 分组是否相等 | 否 | **完全相等**（P5e 断言 deepEqual） |
| `labelFor({path:['providers','alpha','api']})` | `"Api"`（humanize 兜底） | `"协议类型"`（策展标签） |
| `describeField('providers.alpha.api').hint` | `''` | 长度 31 的策展提示（P5h 断言与 `api` 相等） |
| 「模型」页签 | `当前 schema 没有模型字段。` | 渲染 63 个字段控件（P5e） |
| §6 compat 折叠组 | `DisclosureRow` = 0 | 6 组、26 键、徽标计数相符（P5d） |
| `aria-describedby` | 键存在但值 `undefined`（0 条有效） | 69 条全部指向真实存在的 id（P5f） |

**根因**（task-13 定位，task-14 修复）：

证据链（全部可复现，均在冻结版本上）：

1. `lib/client.js` 用**带实例前缀**的 basePath 生成叶子：
   `schemaApi.leaves(envelope, providerRef, ['providers', selected])`
   → `leaf.path` 形如 `providers.alpha.api`、`providers.alpha.compat.supportsStore`。
2. 而 `lib/client.fields.js` 的 `GROUPS[].match` 期望**没有实例前缀**的路径：
   `path === 'api'`、`path === 'apiKeyEnv'`、`path.indexOf('models.') === 0`、
   `path.indexOf('compat.') === 0`（`lib/client.fields.js` / `client.fields.groups.js` / `client.fields.hints.js`）。
3. 后果 A（分组）：`groupLeaves(页面叶子)` = `[{"id":"other","n":111}]`；
   同一 envelope 用 `[]` 作为 basePath（`tests/coverage.test.js:58` 的调用）=
   `identity:4, models:32, overrides:31, defaults:3, request:8, timeouts:3, images:3, retry:1, compat:26`。
   → `modelGroups`（id 为 `models`/`overrides`）为空：**「模型」页签显示
   “当前 schema 没有模型字段。”**（P5e 原始观察）；`compat` 组不成立：**§6 的 6 个
   `DisclosureRow` 一个都不渲染**（P5d：`DisclosureRow`=0，文本停在「其他」组）。
   → 于是「该协议不支持」标注**在真实页面上从不出现**；`piai-disclosure`/`piai-count`
   只存在于不可达代码里，因此 §4 的类覆盖在**字面量**层面仍然通过（§7.1 #4 的限定语）。
4. 后果 B（标签/提示/单位）：FIELDS 查表同样只剥离 `models.`/`modelOverrides.` 前缀，
   不剥 `providers.<name>.`：
   - `describeField('api')` → `label:"协议类型"`、有 hint；`describeField('providers.alpha.api')` → `label` 缺失、hint `''`。
   - `labelFor({path:['api']})` → `"协议类型"`；`labelFor({path:['providers','alpha','api']})` → `"Api"`（humanize 兜底）。
   - 页面实际文本即 `Api Key Env / Display Name / Api / Base U…`（英文兜底），而非冻结的中文标签/提示。
5. 后果 C（a11y §8.3）：`hint` 解析不到 → `describedBy` 为 `undefined` →
   渲染树里 `aria-describedby` 键存在但值为 `undefined`，`aria-describedby` 关联实际缺失。

**严重度：HIGH（已修复）。** 修复前冻结契约中 §3 的卡片/分组、§6 的 compat 折叠与标注、
§9 的类→结构映射在真实页面上均未实现；「模型」页签为空。类覆盖与面板级 a11y 测试当时全绿
却覆盖不到这一层，因为它们的输入绕过了页面自己的 basePath——这正是本次事故的测试盲区。

**修复（task-14，`lib/client.fields.js`）**：新增 `relativePath(path)` / `matchPath(path)`，
在查表与分组前剥离 `providers.<name>` 实例前缀（只剥实例对，`models.*`/`modelOverrides.*`/
`compat.*` 保持原样），页面继续使用绝对路径（`form.edit`/`form.remove` 需要它）。
`tests/coverage.test.js` 同时补了相应断言。

**独立复核（task-15）**：§1 的 `node tests/verify.polish.mjs` 由 4 红转为
**34 passed / 0 failed**；P5e 现在直接断言「页面分组 == basePath `[]` 分组 == 冻结的 9 组形状」，
P5h 断言前缀路径的标签/提示与相对路径相同。负对照见 §7.4 的 `fields-prefix-blind` mutant：
把 `relativePath` 改回前缀盲后，P5d/P5e/P5h/P5f **立即再次全红**，证明修复可测且未被放宽的
口径掩盖。

### 7.4 负对照（证明 harness 不会空转）

把**真实** `lib/client.styles.js` 复制到 `/tmp/polish-negctl/` 后分别变异，
`VERIFY_POLISH_STYLES_LIB=<mutant> node tests/verify.polish.mjs`：

| mutant | 变异 | 失败断言（原始） |
| --- | --- | --- |
| `m1-no-tag.js` | 删掉 `node.setAttribute('data-plugin', PLUGIN_TAG)` | `[FAIL] P1b the element carries the explicit data-plugin / data-plugin-css tags` |
| `m2-unscoped.js` | 在真实 `STYLESHEET` 里加一条 `.piai-leak { … }` | `[FAIL] P2a every selector starts with .piai-root` + `[FAIL] P4a`（多出一个类） |
| `m3-missing-class.js` | 删除 `.piai-root .piai-unit` 规则 | `[FAIL] P4a CSS classes == CLASSES export == frozen 52-list` |

**task-15 追加（针对新代码，防回归）**：把**真实** `lib/client.fields.js`
（md5 `66afaea7…`，已含 task-14 修复）复制到 `/tmp/polish-negctl/fields-prefix-blind.js`，
只把 `relativePath` 改回前缀盲（数组分支永不剥离、文本分支 `return text`），
`VERIFY_POLISH_FIELDS_LIB=<mutant> node tests/verify.polish.mjs`：

```
[FAIL] P5d / P5e / P5h / P5f        （4 failed）
[OBS!] P5c-diag / P5d-diag          （2 observation problem(s)）
--- summary: 28 passed, 4 failed, 2 observation problem(s) ---
P5e: the page's own leaves/groupLeaves call yields ["other:111"] … missing groups ["identity","models","compat"]
```

即：**放宽 id 收集口径之后，原始 HIGH 缺陷类仍被完整检出**，没有因为口径调整而变得不可测。
（`OBS` 是诊断项，不计入失败数——见 §7.8 的说明。）项目文件未被修改。

### 7.5 Lead 追加检查 1：样式 chunk 是否真的被请求？wiring 清单是否过期？

- **(a) 已证实**：P8a —— owner 的请求列表原文
  `["./client.schema.js","./client.form.js","./client.fields.js","./client.panels.js","./client.styles.js"]`。
- **(b) 已证实**：P6a —— 把 `client.styles.js` 变成 rejected promise 后，页面仍渲染
  `Extended model config …` 正文且不抛错（`apply()` 与渲染路径都不受影响）。
- **wiring 清单确实过期**：P8b 原始观察
  `wiring.test.js lists ["client.fields.js","client.form.js","client.panels.js","client.schema.js"];`
  `owner requests [..., "client.styles.js"] -> STALE: ["client.styles.js"]`。
  即 `tests/wiring.test.js` 仍只枚举 4 个 chunk；它不会因为第 5 个 chunk 而失败，
  也就**不会**拦住「样式 chunk 被漏请求」这类回归。这是测试覆盖缺口（medium，测试侧），
  本文件按分工不修改他人测试，交由 Lead 处置。

### 7.6 Lead 追加检查 2：compat 的「withheld」到底来自哪里？“该协议不支持”是否夸大？

- **mirror 忠实**：P7a —— `lib/client.fields.js` 与真实
  `@deepseek-ai/dsh-llm-pi-ai/lib/index.js` 的 7 个协议，offer/withhold **集合逐一相同**。
- **无显式 withhold**：P7b —— 对 26 个冻结键，任何协议都**没有**一条显式 `withhold`
  （显式 `withhold` 只出现在非冻结键，如 `supportsMidConvoSystemMessages`、`sessionAffinityFormat`）。
  结论：所谓 “withheld” 完全来自 `compatDisposition(api,key) !== 'offer'`，即
  **“该协议的 gate 没有把这一项列为 offer”**。
- **可被标注为「不支持」的键（26 键中，按协议）**：P7c 原文
  `{"mistral-conversations":26,"openai-completions":7,"openai-responses":22,`
  `"azure-openai-responses":22,"openai-codex-responses":22,"anthropic-messages":19,`
  `"bedrock-converse-stream":25}`。26 键**每一个**都被至少一个协议 offer（P7b），
  不存在“永远无效”的键。
- **标签是否夸大**：不夸大，但语义需要说明。adapter 自己的运行期规则是
  `gate?.[field] !== "offer"`（`resolveModelCompat`）：模型级 compat 命中即**硬报错**并说明
  `its api is "<api>", which does not take it`，路由级则**跳过**。因此“gate 未 offer”与
  “该协议不支持”在 adapter 行为上等价。唯一的措辞风险是：UI 无法区分“显式 withhold”与
  “gate 未表态”，而两者对用户是同一个结果——**无需改文案**；但若将来 adapter 改为
  “未表态 = 允许”，该文案会立刻变成夸大，届时应改为“该协议未声明支持”。

### 7.7 task-15 裁决：P5c / P5d 两项红断言（结论：harness 口径错误，产品无缺陷）

两项红断言在 task-14 后仍然存在，作者方（harden-page）主张二者都是 harness 度量口径错误。
裁决方式：在**真实** `lib/client.panels.js` + `lib/client.fields.js` + 真实 fixture 下复现，
并打印具体节点的原始属性。结论如下。

**P5c —— harness 错误（harden-page 正确）。** 原断言把两个页签的控件并成一个列表，却只用
**advanced 页签**的渲染树构造 `htmlFor` 集合；而 `apiKeyEnv`/`displayName`/`baseURL` 属于
identity 组，渲染在 **provider 页签**。task-14 之前 provider 页签是空态（identity 组不成立），
所以这个混用看不见。修正为**按页签配对**后，诊断原文（P5c-diag，真实渲染树）：

```
[{"id":"piai-field-providers-alpha-apiKeyEnv","primitive":"Input","htmlForOnProviderTab":true,"htmlForOnAdvancedTab":false},
 {"id":"piai-field-providers-alpha-displayName","primitive":"Input","htmlForOnProviderTab":true,"htmlForOnAdvancedTab":false},
 {"id":"piai-field-providers-alpha-baseURL","primitive":"Input","htmlForOnProviderTab":true,"htmlForOnAdvancedTab":false}]
```

即：三个控件在**它们真正渲染的那个页签上**都有 `<label htmlFor>`。修正后 P5c 通过：
`27 id-bearing controls across both tabs (unique ids; 16 htmlFor-labelled, 4 aria-labelled,
7 primitive-labelled); 19 Switch instances all labelled; dangling htmlFor=0;
provider: 5 controls, 3 htmlFor; advanced: 22 controls, 15 htmlFor`。

**P5d —— harness 错误（harden-page 正确），但保留并加强了断言。** 原 `subtreeFieldIds()`
只从 5 个 primitive 名（`SettingsValueField`/`SettingsSecretField`/`Input`/`Switch`/
`SegmentedControl`）收集 id；而布尔行的控件是 shipped `Switch`，其签名为
`Switch({checked,onChange,label,disabled,title,className})`——**根本没有 `id` 属性**，
行 id 落在 hint 节点（`<controlId>-hint`）。诊断原文（真实渲染树，26 个键逐个定位）：

```
keys with an id = 26/26; id-carrying node kinds = {"div.piai-hint":26,"stub:SegmentedControl":3,
"stub:Button":1,"stub:Input":3}; disclosure rows carrying the Tag = 6/6;
for anthropic-messages: not-offered=19, Tagged=19, Tagged-but-offered=[]
```

即：`div.piai-hint` ×26（每行都有）、`SegmentedControl` ×3、`Button` ×1（>4 选项枚举的 Menu
锚点）、`Input` ×3。**没有一行缺少稳定 id。** 因此原口径测错了对象。修正后的断言（比原来更强）：

1. 每个冻结键必须在**它自己那一组**的折叠分区子树里解析出一个稳定 id
   （不是「树里任意位置有」）——新增逐组键集相等断言；
   **（v8 起改为：分区子树由 `.piai-item-head` + `.piai-disclosure-body` 构成，
   不再是 `DisclosureRow`；`DisclosureRow` 已从解析表删除，见 §17.5 与
   `docs/interaction-design.md` §16.4。）**
2. 每个渲染出的字段行控件仍需有可解析的可访问名（P5c：`htmlFor`/`aria-label`/primitive `label`）；
3. 任何 `<label htmlFor>` 都不得悬空（按页签分别校验，P5c/P5f）；
4. 被标注行的控件不得 `disabled`/`readOnly`（P5d 保留）。
   同时把 Tag 归属规则改为「含**恰好一个** compat 键的最小 tagged 子树」（`taggedCompatKeys()`），
   修正前该规则同样只看 primitive id，导致 13 个布尔行无法归属。

**关于“稳定 id 落在 hint 节点”是否满足 §8.2**：§8.2 要求每个控件有稳定 id 并由
`<label htmlFor>` 关联。对 shipped `Switch` 而言，id 属性在 primitive 层不可用
（它渲染 `<button role="switch" aria-label={label}>`），其可访问名由 `label` 提供；行级
稳定 id 由 hint/触发器节点承载，页面无一处 `<label htmlFor>` 悬空。因此按可测的语义判定为
**满足**；这是一条口径说明，不是缺陷。若未来希望「id 必须在控件本体上」，需要先扩展
`@deepseek-ai/dsh-client-ui-primitives` 的 `Switch` 签名（属上游变更，不在本仓库范围）。

**口径变更是否削弱了检测能力？** 没有。§7.4 的 `fields-prefix-blind` mutant 在**放宽 id
收集之后**仍让 P5d/P5e/P5h/P5f 全红；样式 3 个 mutant 也各自命中对应断言。

**harness 自身的一处口径修正（附带）**：`groupLeaves()` 返回的是 vm 沙箱 realm 的数组，
`assert.deepStrictEqual` 会因原型跨 realm 而失败（即使 JSON 相同），已用 `Array.from()`
归一化——这是 harness 侧的修正，与产品无关。

### 7.8 本轮未验证（诚实边界，不得外推）

| 项 | 原因 | 判定 |
| --- | --- | --- |
| **视觉观感**：真实布局（880px 内容列、卡片、`240px/1fr` 栅格、吸底条）、间距、排版 | 无 DOM、无截图、无浏览器自动化；mini-renderer 只到 element/props 层 | untested（**最终视觉验收属于用户**） |
| **亮/暗色真实渲染** | 只验证“颜色 100% 来自 14 个 `requiresLightAndDark` token、零 hex/rgb/关键字”，未在两种主题下目视 | untested（token 政策已 verified） |
| **hover / focus 动效与 `:focus-visible` 视觉环** | 同上；CSS 中存在该规则（P2/P3 层面通过），但视觉未验 | untested |
| **真实鼠标/键盘交互**（点页签、折叠展开、Switch 切换、二次确认 + Esc、Tooltip 展开、键盘 Tab 序） | 无真实浏览器；`ConfirmButton` 的 Esc 逻辑依赖 `document.addEventListener`，未在真实文档上跑 | untested（`tests/a11y.test.js` 在其自有 harness 下断言了二次确认/Esc） |
| `aria-invalid` 动态触发（§8.4） | 无法在不构造真实校验失败态下触发（P5g 观察） | untested |
| 「模型」页签 / §6 compat 折叠 / 中文标签提示 / `aria-describedby` 的**页面级**行为 | task-14 后**不再阻塞**：P5e/P5h/P5f/P5d 均已通过（§7.3）；仍未验证的只是它们的**视觉呈现**（见上一行的视觉项） | verified（行为层）；视觉 untested |
| 我本人重查 live `active` 标志 | task-15 再次执行 `cordis_inspect_query`（client / Slots / `listSubTree`，`{"root":"settings.section"}`）**1 次，仍 10s 超时**，原文见 §7.9；§3 记录的是 Lead 早前的成功读数，**不是**我本轮的观察 | blocked（本轮仍未观察到） |
| 真实 profile 写入 / 真实保存往返 | 按 AGENTS.md，本轮不对用户 profile 做写操作 | blocked |

### 7.9 task-15 live 复查（原文）

```
$ cordis_inspect_query(platform=client, provider=Slots, method=listSubTree, input={"root":"settings.section"})
Error: Slots.listSubTree: Client inspect query Slots.listSubTree timed out after 10000ms. Open or reconnect the Harness page, then retry.
```

客户端桥本轮仍然不应答，故 `active` 标志**本轮未观察到**；§3 的 `active:true` 是 Lead 早前的读数。

## 8. chunk 版本化缓存事故：磁盘正确 ≠ 浏览器拿到（task-16）

### 8.1 事故

美化改造（task-10~14）落地后，用户 F5 仍看到**旧页面**：只剩一个「其他」兜底分组、标签是
英文兜底（`Api Key Env` / `Display Name` / `Api`）、没有 compat 折叠、没有样式。
而磁盘上的字节与全部测试都是正确的。

### 8.2 机制（shipped 源码，行号可查）

`/tmp/asarx/out/dsh/node_modules/@deepseek-ai/dsh-client-modules/lib/index.js`：

- `:220-222` `chunkUrl()` — chunk 的 URL 是 `/plugins/<id>/client.<chunk>.js?rev=<entry.rev>`。
- `:193-199` `artifactRevision(baseline)` = `framedHash("plugin-artifact", [mtimeMs, ctimeMs, size])`；
  `:882-887` 只对 **owner bundle 一个路径**取基线：`captureArtifactBaseline(record.meta.clientPath)`，
  而 `captureArtifactBaseline` 就是对 `client.js` 做一次 `statSync`。
  **包内 chunk 文件不参与 rev 计算。**
- `:934-956` `chunkResponse()` — 构造响应后 `this.responses.set(resourceUrl, response)`。
- `:958-970` `bundleResource()` — 先查 `this.responses.get(resourceUrl)`，命中即以
  `cache-control: public, max-age=31536000, immutable`（`:159` `IMMUTABLE_CACHE`）返回。
- `:318-324` `lazyBody()` — `result ??= Promise.resolve().then(produce)`：响应体只求值一次。

因果链：只改 chunk → `client.js` 的 stat 不变 → rev 不变 → URL 不变 → host 响应缓存命中
（且浏览器 `immutable` 缓存亦命中）→ 继续供旧字节。**这是平台缓存行为，不是插件缺陷。**

### 8.3 原始观测

| 时点 | rev | 请求 | 观察 |
| --- | --- | --- | --- |
| 修复前（未 touch `client.js`） | `bb89155d2249` | `client.fields.js?rev=bb89155d2249` | **24185 B，`relativePath` ×0**（旧字节）——Lead 现场测量 |
| 磁盘（同时刻） | — | `lib/client.fields.js` | md5 `66afaea701b80cd34f6ff1e35b2a5273`，含 `relativePath` ×3 |
| touch `client.js` 后 | `36ba45ac23da` | `client.fields.js?rev=36ba45ac23da` | **25970 B，`relativePath` ×3 / `matchPath` ×3**（本轮 curl 复核） |
| 同上 | `36ba45ac23da` | `client.styles.js?rev=36ba45ac23da` | 14306 B；`data-plugin` ×4；`piai-root` 出现 60 次（**59 个 `.piai-root` 选择器** + 1 处 `CLASSES` 字面量）；`@keyframes` ×1 |
| 同上 | `36ba45ac23da` | `client.panels.js?rev=36ba45ac23da` | 55964 B；`DisclosureRow` ×6、`piai-disclosure` ×1、`piai-count` ×1 |
| 同上 | `36ba45ac23da` | `??dsh-llm-pi-ai-config/client.js&rev=36ba45ac23da` | 40618 B；`SegmentedTabs` ×6、`piai-root` ×1、`readView` ×4 |
| 同一时刻，旧 URL | `bb89155d2249` | `client.fields.js?rev=bb89155d2249` | **HTTP 404**——rev 变化触发重建后，不匹配旧 rev 的缓存条目被丢弃 |

补充实测（本轮 curl）：

- 响应头原文：`content-type: text/javascript; charset=utf-8` /
  `cache-control: public, max-age=31536000, immutable`。
- 供出的 chunk 体**逐字节包含**磁盘文件（外层是 61 B 的 combo 包装：
  fields 25909→25970、styles 14245→14306、panels 55903→55964；owner 40541→40618），
  说明 rev 一致时服务器供的就是磁盘当前内容。
- `lib/client.js` 的 `mtime=ctime=10:56:37`、size 40541 即本轮 rev 的输入（touch 只改 mtime/ctime）。

**未能复现的项**：上表第一行（`24185 B / 0 markers`）是 Lead 在 rev 仍为 `bb89155d2249` 时的
现场测量；我复核时 rev 已经变化，旧 URL 现为 404，因此**该行我没有独立复现**，只作为现场记录
引用。我独立复现的是机制（源码行号）、rev 变化后的供出字节、以及旧 URL 的 404。

### 8.4 结论与教训

| 声明 | 判定 |
| --- | --- |
| chunk-only 改动不改变 `entry.rev`（rev 只由 owner `client.js` 的 stat 决定） | verified（源码 + rev 从 `bb89155d2249` 变为 `36ba45ac23da` 实测） |
| host 按完整 URL（含 rev）缓存响应且响应体只求值一次、头为 `immutable` | verified（源码 + 响应头原文） |
| rev 变化后同一 chunk 请求供出新字节 | verified（25970 B / `relativePath` ×3，逐字节包含磁盘文件） |
| 旧 rev 的 URL 在重建后不再供出（404） | verified（本轮 curl） |
| 「磁盘正确 + `node --test` 全绿」能否推出「浏览器看到新字节」 | **不能**（本次事故即反例） |
| 用户页面现在显示的是新版（视觉/交互） | **untested**——用户需在 rev 变化后 F5 亲自确认；本轮未做任何视觉核验 |

**教训（写进流程）**：

1. **磁盘级判定只覆盖磁盘。** task-13/14/15 的结论（分组/标签/样式在**字节**层面正确）成立，
   但它们证明的是 `lib/*.js` 与 harness 的输入；**交付给浏览器的 artifact 一度仍是旧 chunk**。
2. **任何 chunk-only 改动之后，都要核对「服务器为当前 rev 供了什么」**（§8.3 的 curl + 标记
   grep），而不是只看磁盘与测试。
3. **F5 只有在 rev 变化之后才有意义**：URL 不变时 F5 命中的仍是缓存里的旧字节。
4. 这是平台缓存行为，**不在插件里修**；处理办法见 [development.md](development.md) §5 的
   「改动 chunk 后必须让 owner 的 rev 变化」。

## 9. v2 容器自适应布局 + 流式控件（task-18，verifier3）

用户实测截图暴露两个缺陷：(a) 同卡片输入框宽度不齐；(b) 设置弹窗窄于视口时 `协议类型`
分段控件与 `添加路由` 输入框溢出。已定位为「primitives 的 `Input` 是 `inline-flex` 按内容收缩」
+「我们用视口 `@media (max-width:719px)`，在更窄的弹窗里永不触发」。`docs/interaction-design.md`
§10 是冻结契约，task-17 据此实现。本节是**独立**验证（`tests/verify.polish.mjs`，41 项断言 +
5 项观察），运行于 task-17 冻结版本 + Lead 的 rev bump 之后：

- `lib/client.styles.js` md5 `348fd7040dcfec98dc08688fbc1c048b`（16296 B）
- `lib/client.panels.js` md5 `28a52bb0ec06022b022a0929f0ae6183`（**未改**，类清单无漂移）
- `tests/verify.polish.mjs` md5 `6fbc31803723f1bc36f4e89668b76002`
- owner rev（bump 后）`bce5e5b056e9`，供出的 styles chunk = v2（§9.4）

### 9.1 逐项判定

| # | 项 | 方法（原始观察） | 判定 |
| --- | --- | --- | --- |
| 1 | **无宽度断点**（§10.2，HIGH 若违反） | P2c：整表唯二 `@media` 是 `(prefers-reduced-motion: reduce)`；扫描所有 `@media` prelude，宽度/方向条件 = 0 | verified |
| 2 | **内在换行布局**（§10.2） | P9a：`.piai-row` `display:flex` + `flex-wrap:wrap`；`.piai-row-head` `flex:0 1 …` + `min-width`；`.piai-row-control` `flex:1 1 320px` + `min-width:0` + `max-width:100%`；`.piai-hint` `flex:1 1 100%` | verified（结构层面） |
| 3 | **流式控件**（§10.3） | P9b：`.piai-row-control > *` 有 `width:100%`/`min-width:0`/`max-width:100%`/`box-sizing:border-box`；`.piai-row-control input` 有 `width:100%`+`min-width:0`；`.piai-provider-add` 相关规则 2 条 | verified |
| 4 | **多选项换行而非裁切**（§10.3） | P9c：`.piai-select` / `.piai-multi` / `.piai-bool` 均有 `flex-wrap:wrap` + `max-width:100%` | verified |
| 5 | **内容列可压缩**（§10.2） | P9d：`.piai-page` `max-width:880px` + `min-width:0` | verified |
| 6 | **token 白名单 v2 = 19**（§10.5） | P3a：用到 15/19，白名单外 0；P3b：278 条声明零 hex/rgb/hsl/颜色关键字；P3c：12 个被引用的本地变量全部有定义（且新增「引用即必须定义」断言） | verified |
| 7 | **放宽后的作用域零外泄**（§10.6） | P2a：64/64 选择器以 `.piai-root` 开头；P2b：无 `.piai-root *` 广域通配、无 `@import`/`url(`/`!important`；P2e 证明：渲染树中**恰好一个**节点带 `piai-root`（`class="piai-root piai-page"`、`data-piai="1"`），且 host 代码从不施加该类 → 选择器只能命中本页子树 | verified |
| 8 | **类覆盖 52/52/52**（§10 不变） | P4a/P4b/P4c：CSS 52、`CLASSES` 52、JS 52、冻结清单 52 三方集合相等；`piai-tab` 不存在 | verified |
| 9 | **韧性**（仍然 load-bearing） | P6a：拒绝 `client.styles.js` 时页面照常渲染不抛错；P6b：注入 hook 仍以选择器调用；P6c：面板抛错被 `PageErrorBoundary` 捕获 | verified |
| 10 | **负对照**（新代码） | 见 §9.3 | verified |
| 11 | **`> *` 不拉伸提示触发器**（harden-page 追加） | P9e：`.piai-root .piai-row-control > .piai-info` 有 `flex:none; width:auto`（3 类选择器压过 `> *` 的 2 类 + 通配），`.piai-dict-add` 与 `.piai-provider-add` 同待遇 | verified |
| 12 | **供出字节**（development.md §5 的 rev 陷阱） | P10a（rev bump 后）：`containsDiskFile=true`，v1 标记 0、v2 标记齐 —— 见 §9.4 | verified |

**为什么换行布局能自己塌成单列（一行解释）**：标签列是 `flex:0 1 200px`（可压到 `min-width:132px`）、
控件列是 `flex:1 1 320px` 且 `min-width:0`，所以当容器宽度 < 200+320+gap 时 flex 行**自然换行**，
控件落到自己的整行并吃满宽度——没有任何媒体查询、没有固定栅格轨道，因此也不存在
「轨道内 min-content 撑破卡片」的路径（这正是 v1 `grid-template-columns: 240px minmax(0,1fr)` 的漏洞）。

### 9.2 口径裁决：两处 harness 更新（契约真的变了）

1. **token 白名单 14 → 19**（§10.5 扩充）：这是契约变更，不是产品缺陷。P3c 同时按 §10.4
   放宽了「本地 `--piai-radius-*` 必须定义」（圆角可改用官方 `--dsw-radius-md`），但**加强**为
   「凡被 `var()` 引用的 `--piai-*` 都必须有定义」，并保留间距/字号/行高必需项。
2. **选择器规则放宽**（§10.5/§10.6）：旧 P2b「任何元素/`*`/裸属性复合选择器都禁止」编码的是 §5 v1
   规则；§10.6 明确**允许** `.piai-root` 之后的后代元素/属性选择器（§10.3 的
   `.piai-row-control input` 正是必需项）。现改为：(a) 禁止 `.piai-root *` 这种**广域**通配；
   (b) 仍禁止未以 `.piai-root` 开头的选择器（P2a）；(c) 允许 scoped `> *`。
   实测：64 个选择器、广域通配 0；允许的 scoped 通配为
   `[".piai-provider-add > *", ".piai-row-control > *", ".piai-select > *"]`。
   **契约文本张力（已按「广度」裁决）**：§10.6 的条目写「禁止 `*` 通配」，而 §10.3 **要求**
   `.piai-root .piai-row-control > *`。裁决依据是 §10.6 自己给出的反例 `.piai-root *`（会大范围
   覆盖 primitives 内部），因此按「是否从 `.piai-root` 直接广域展开」判定；实现里的注释
   （`lib/client.styles.js` 关于 §10.6 的说明）与之一致。

### 9.3 负对照（对**新**代码，证明断言不空转）

| mutant（均为 `lib/client.styles.js` 的 /tmp 副本） | 变异 | 失败断言（原文） |
| --- | --- | --- |
| `v2-m1-width-media.js` | 在 `STYLESHEET` 开头重新插入 `@media (max-width:719px) { .piai-root .piai-row { display:block } }` | `[FAIL] P2c`：`width-based @media re-introduces viewport-aware layout …: ["@media (max-width: 719px)"]` |
| `v2-m2-no-minwidth.js` | 删除 `.piai-root .piai-row-control` 的 `min-width: 0` | `[FAIL] P9a intrinsic wrapping layout exists (no query involved)` |

两次变异后其余断言仍全绿（M1: 20 passed/1 failed；M2: 20 passed/1 failed），说明失败精确对应变异。
项目文件未被修改。

### 9.4 供出字节检查（development.md §5 的 rev 陷阱）

rev 读取自 `/plugins/events`（graph 条目），并用 shipped 的 sha1 `framedHash`
（`artifactRevision`：`plugin-artifact` + NUL + 逐字段 `字节长度:` 帧的 `[mtimeMs, ctimeMs, size]`）
从 `lib/client.js` 的 stat **独立复算**；两者一致。

**rev bump 之前（现场记录，未通过）**：

```
[OBS!] P10a ... STALE: the served chunk at rev 36ba45ac23da does not contain the on-disk
  client.styles.js - chunk edits do not bump the rev (development.md 5). ...
  served 14306B vs disk file 16296B; containsDiskFile=false; width-@media=true; .piai-row flex-wrap=true
```

即：磁盘已是 v2（16296 B），rev 未变 → 服务器仍供 14306 B 的 **v1**；此时浏览器只会看到 v1。

**Lead 执行 mtime-only `touch lib/client.js` 后（内容 md5 仍 `45b645a481221fe9230356a5ae8c7a94`）**：
rev `36ba45ac23da` → `bce5e5b056e9`，本轮复核原文：

```
[OBS ] P10a served client.styles.js matches the on-disk sheet for the current rev -
  rev=bce5e5b056e9 (recomputed from stat: bce5e5b056e9); served 16357B vs disk file 16296B;
  containsDiskFile=true; width-@media=false; .piai-row flex-wrap=true;
  probes={"max-width: 719px":false,"grid-template-columns: 240px":false,
          "flex: 1 1 320px":true,"prefers-reduced-motion":true,"--dsw-alias-border-l4":true}
```

**结论（verified）**：`16357 B = 磁盘 16296 B + 61 B combo 包装`，`containsDiskFile=true` 即服务器
供出的正是 v2 字节；v1 的两个标记（`max-width: 719px`、`grid-template-columns: 240px`）为 0，
v2 标记（`flex: 1 1 320px`、`prefers-reduced-motion`、`--dsw-alias-border-l4`）齐备。
**但「服务器供 v2」仍不等于「用户浏览器显示 v2」**：页面必须先 F5 重新拉取新 rev 的 URL；
真实渲染见 §9.6。

### 9.5 task-18 裁决：`.piai-row-control > *` 与「禁止 `*`」的张力（结论：允许 child universal 是正确解法）

**争议**：§10.3 **要求** `.piai-root .piai-row-control > *`（让 primitives 的 `inline-flex` 输入框
吃满所在列），而 §10.7.6／任务文字的「no `*` universal selector」若按字面执行会禁止它。
harden-page 的解法是：允许**锚定在一个 scoped 类下的 child universal**，并显式断言
`.piai-root *` 这种**后代广域**形式不存在。

**裁决：该解法成立。** 依据与原始证据：

1. §10.6 自己给出的禁止反例就是 `.piai-root * { box-sizing: border-box; }`——危害在于**广域**
   （大范围改写 primitives 内部盒模型），而不是 `*` 这个字符本身。§10.3 的
   `.piai-root .piai-row-control > *` 只命中我们自己的行控件的直接子节点，两者不是同一件事。
2. 零 `*` 会**直接违背** §10.3（该条是 v2 修「输入框宽度不齐」的手段之一），所以「零通配」不是
   正确目标；正确目标是**把允许的形状收窄到可证明不外泄的那一种**。
3. 原始证据（最终表，66 个选择器）：含 `*` 的选择器**恰好 4 个**，全部是
   `.piai-root .<scoped-class> > *`：
   `[".piai-root .piai-provider-add > *", ".piai-root .piai-row-control > *", ".piai-root .piai-select > *", ".piai-root .piai-dict-add > *"]`；
   广域形式（`grep -nE '\.piai-root\s*[>+~]?\s*\*' lib/client.styles.js`）→ **无命中**。
4. 外泄不可能：P2a 断言 66/66 选择器以 `.piai-root` 开头；P2e 断言渲染树中**恰好一个**节点带
   `piai-root`（本页根，`data-piai="1"`）且 host 代码从不施加该类——child universal 只能命中该
   子树内部的节点。
5. harness 因此把 P2b 从「禁止非广域的 `*`」**加强**为**形状白名单**：含 `*` 的选择器必须匹配
   `^\.piai-root\s+[^\s>+~,]+\s*>\*$`；任何其它含 `*` 的选择器一律失败。
6. 顺带验证 harden-page 的防拉伸措施：`.piai-root .piai-row-control > .piai-info { flex:none;
   width:auto }`（P9e）——3 个类选择器（0,3,0）压过 `> *` 的 2 类 + 通配（0,2,0），与声明顺序无关；
   `.piai-dict-add` 也拿到与 `.piai-provider-add` 相同的 `min-width:0` / 流式输入处理。

**因此不建议改成「零通配」**；若将来契约要求零通配，应先修改 §10.3 并给出替代的流式机制（例如
显式列出各控件包裹类），否则 P9b 的 `.piai-row-control > *` 断言会与契约自相矛盾。

### 9.6 本轮未验证（诚实边界，不得外推）

| 项 | 原因 | 判定 |
| --- | --- | --- |
| **窄容器下的真实折叠**（标签/控件换行、无溢出） | 无布局引擎、无 DOM、无截图；本轮只证明 CSS 规则存在且无宽度断点 | untested（**用户需在 rev 变化后 F5 目视**） |
| **输入框宽度是否真的对齐**（修 (a) 的最终效果） | 同上；`display:inline-flex` 的最终布局由浏览器决定 | untested |
| 间距 / 圆角 / 描边 / 占位符观感与官方控件是否一致 | 只验证 token 合规与规则存在，未做像素级对比 | untested |
| 亮/暗色真实渲染 | 只验证颜色 100% 来自白名单 token | untested |
| hover / focus 动效、`:focus-visible` 视觉环 | 无真实浏览器 | untested |
| 真实鼠标/键盘交互（页签、折叠、Switch、二次确认 + Esc、Tooltip） | 无真实浏览器 | untested |
| **浏览器实际拿到并渲染 v2** | 服务器已供 v2（§9.4 verified），但页面需 F5 才会请求新 rev 的 URL；真实渲染未经目视 | partial（供出 verified；渲染 untested） |
| 真实 profile 写入 / 真实保存往返 | 按 AGENTS.md 不做对真实 profile 的写操作 | blocked |

**不声明**：页面「好看」、溢出「已视觉修复」。结构层面已 verified；**最终视觉验收属于用户**。

---

## 10. 布局重构：提供商 tab + 单页全量字段 + 实例路径修复（2026-10-13）

本轮改动（`lib/client.schema.js` 容器元数据、`lib/client.fields.js` 的 `profileLabel`
与两个分组的标题、`lib/client.panels.js` 的 `ProviderTabs`/`ProviderPanel`/实例分区、
`lib/client.js` 的页面装配、`lib/client.styles.js` 的类清单与 tab 条）由本文件记录
其验证证据。判定：除「真实浏览器观感」外均为 `verified`；观感为**用户确认**（untested）。

### 10.1 先证伪的缺陷：实例容器路径被 host 拒绝（改动前）

从 shipped `@deepseek-ai/dsh-settings` 字节抽取 `applyPathOp`
（`/tmp/asarx/out/dsh/node_modules/@deepseek-ai/dsh-settings/lib/index.js:189-216`）后实测：

```
$ node -e '... host.applyPathOp(value, {op:"set", path:["providers","alpha","models","id"], …})'
THROWS: Config array index "id" is out of range
$ node -e '... {op:"set", path:[...,"modelOverrides","name"], …}'
THROWS: Cannot read properties of undefined (reading 'default')
$ node -e '... {op:"set", path:[...,"models",1,"id"], value:"x"}'
index op ok: {"providers":{"alpha":{"models":[{"id":"deepseek-v4-flash"},{"id":"x"}]}}}
```

原因：`walk()` 对「`array`/`dict` 且 inner 是对象」采取容器透明策略，成员叶子的路径不带
实例段（`providers.alpha.models.id`），页面据此发出的 op 必然被拒。修复后由
`tests/verify.integration.mjs` 的 HOST-5..8 固化（含该旧路径的负对照）：

```
PASS | HOST-5 | the pre-fix flat model path is rejected by the host (negative control) | Config array index "id" is out of range
PASS | HOST-6 | the index-bearing model path the panels emit is accepted | [{"id":"z"},{"id":"b"}]
PASS | HOST-7 | the instance-keyed override path the panels emit is accepted | {"gpt-x":{"name":"GPT X"}}
PASS | HOST-8 | removing a model card splices by the same index | [{"id":"a"}]
```

### 10.2 语法与全量测试（该轮计数；追加回归用例后的当前计数见 §11.7）

```
$ for f in lib/*.js; do node --check "$f"; done          # 无输出 = 全部通过

$ node --test
ℹ tests 187
ℹ suites 11
ℹ pass 187
ℹ fail 0
```

逐文件：`schema 59`、`form 50`、`render 24`、`a11y 11`、`coverage 11`、`compat 9`、
`styles 8`、`instances 8`（新增）、`wiring 7`。

### 10.3 三个独立 harness

```
$ node tests/verify.integration.mjs
checks passed : 38      checks failed : 0      unverified : 0

$ node tests/verify.render.mjs
--- summary: 15 passed, 0 skipped, 0 failed ---

$ node tests/verify.polish.mjs
--- summary: 41 passed, 0 failed ---
```

`verify.polish` 的 P4（类覆盖）现为 49 / 49 / 49；P5a 改为在**渲染出的标记**上断言
自建 tablist（`role=tablist`/`tab`、唯一 `aria-selected`、roving `tabIndex`、
`aria-controls` ↔ `tabpanel.id` ↔ `aria-labelledby` 交叉一致、切换提供商后 tabpanel
重新指向），不再依赖 `SegmentedTabs`。

### 10.4 结构层面已验证的点

1. **叶子零丢失且清单不变**：`leaves(envelope, profileRef, ['providers', name])` 仍为
   111 个叶子；`models` 32、`modelOverrides` 31、`compat` 26，由 `tests/coverage.test.js`
   的显式名单与 `tests/schema.test.js` 的容器用例共同固定（容器元数据是**附加**字段）。
2. **实例卡片与写入路径**：`tests/instances.test.js` 用真实 `client.panels.js` 渲染，
   断言 2 张模型卡片默认折叠、标题为 `#1 deepseek-v4-flash` / `#2 deepseek-v4-pro`、
   展开后编辑发出 `edit(['providers','alpha','models',1,'id'], …)`、删除发出
   `remove([...,'models',1])`、覆盖键发出 `remove([...,'modelOverrides','gpt-x'])` 与
   `edit([...,'modelOverrides','pro'], {})`；`!!js` 容器值只读且零写入。
3. **单页不丢分组**：`lib/client.js` 把 `groupLeaves()` 的全部结果交给 `ProviderPanel`；
   `tests/a11y.test.js` 与 `verify.polish` 的 P5e 断言 `identity..compat` 九个分组
   与 111 个叶子一一落位。
4. **tab 无障碍**：`ProviderTabs` 的 tablist/roving/箭头键契约由
   `tests/a11y.test.js`（两个新用例）与 `verify.polish` P5a 覆盖；空提供商列表不渲染
   tablist / tabpanel（`tests/render.test.js`）。
5. **渲染安全**：`verify.render` B5 证明「面板 chunk 的组件抛错」被边界捕获、外壳存活；
   本轮把 **tab 条与面板体各自**放进 `PageBoundary`，因此任一 chunk 面崩溃都不会
   abdicate 槽位。
6. **样式契约**：类覆盖 49 / 49 / 49；token 白名单仍 19；无宽度 `@media`、无
   `!important`、无颜色字面量；`.piai-tabs` 纵向 flex、`.piai-provider-list` 换行。

### 10.5 本轮未验证（诚实边界）

| 项 | 原因 | 判定 |
| --- | --- | --- |
| 顶部 chip tab 条在真实设置弹窗内的换行观感 | 无布局引擎/截图 | untested（**用户需在 rev 变化后 F5 目视**） |
| 模型/覆盖折叠卡片的实际视觉与展开手感 | 同上 | untested |
| 真实浏览器中点击 tab 切换提供商、键盘方向键移动焦点 | 无真实浏览器（DOM 焦点 API 只在真实内核可用） | untested |
| 真实保存往返落到用户 profile | 按 AGENTS.md 不对真实 profile 做写操作 | blocked |
| 本次改动后的 GUI 可见性 | 需用户 F5（rev 已变，服务端已供出新字节，见 §10.6） | partial（**服务端 verified**；浏览器渲染 untested） |

### 10.6 服务端已供出本次字节（实测）

`touch lib/client.js` 之后从客户端 boot graph 取到本插件当前 rev：

```
$ curl -s http://127.0.0.1:19387/plugins/events | …entries…
{"id": "dsh-llm-pi-ai-config", "url": "plugins/??dsh-llm-pi-ai-config/client.js&rev=f6f72ef7b6cf", "rev": "f6f72ef7b6cf", …}

$ R=f6f72ef7b6cf
$ curl -s -o /dev/null -w '%{http_code} %{size_download}' \
    "http://127.0.0.1:19387/plugins/??dsh-llm-pi-ai-config/client.js&rev=$R"
200 40972
$ curl -s "…&rev=$R" | grep -c providerTabItems      # 2  → 新装配在服务端
$ curl -s -o /dev/null -w '%{http_code} %{size_download}' \
    "http://127.0.0.1:19387/plugins/dsh-llm-pi-ai-config/client.panels.js?rev=$R"
200 68101
$ curl -s "…/client.panels.js?rev=$R" | grep -c InstanceDictSection   # 3  → 新面板
$ curl -s "…/client.styles.js?rev=$R" | grep -c provider-list          # 3  → 新样式
```

判定：**服务端供出 = verified；浏览器渲染 = untested（需用户 F5）**。注意 owner 的调度 URL
是 boot graph 给的 `…/??<id>/client.js&rev=…` 形式，直接猜 `/plugins/<id>/client.js?rev=` 会 404。

### 10.7 用户确认步骤

```bash
cd /Users/zfowed/Downloads/dsh-llm-pi-ai-config
touch lib/client.js     # 让 owner 的 rev 变化（chunk-only 改动不会）
```

然后在 GUI 里 F5。若仍看到旧布局，按 `docs/development.md` §5 的 `?rev=` 自查命令确认
服务端实际供出的字节。

---

## 11. 控件样式缺失：forwardRef/memo 原语被判成「缺失」（2026-10-13）

**症状**（用户截图）：同一个面板里，提供商 chip 与「协议类型」分段控件是 DSH 正常观感，
而输入框、按钮、「未设置」旁的操作全是浏览器原生控件。

### 11.1 根因

`lib/client.panels.js` 的 `primitive()` 与 `lib/client.js` 的 `primitiveComponent()`
都用 `typeof found === 'function'` 判断原语是否可用。shipped
`@deepseek-ai/dsh-client-ui-primitives` 的导出并非全是函数：

| 原语 | 服务端 bundle 里的绑定（实测） | 形态 | 旧判断 | 结果 |
| --- | --- | --- | --- | --- |
| `Button` | `cc=j.forwardRef(function({variant:n="ghost",size:o="md",…` | 对象 | false | 退化成 `FallbackPill` → 原生 `<button>` |
| `Input` | `T_=j.forwardRef(function({icon:n,className:o,…` | 对象 | false | 退化成字符串 `'input'` → 原生 `<input>` |
| `DisclosureRow` | `j_=j.memo(function({icon:n,title:o,open:s,…` | 对象 | false | 退化成 `FallbackDisclosureRow` → 无箭头/hover |
| `Pill` `SegmentedControl` `Switch` `Menu` `MenuItemButton` `Tooltip` `Tag` `Checkbox` `StateDot` | 普通 `function` 声明 | 函数 | true | 本就是真原语（所以「一半有一半没有」） |

这些原语确实是 shell 的 seed：`const sE=Object.freeze(Object.defineProperty({__proto__:null,…,
Button:cc,…,DisclosureRow:j_,…,Input:T_,…}, …))`，而前端 bundle 的静态模块表含
`"@deepseek-ai/dsh-client-ui-primitives":sE`（供出字节 `index-5SrrfWpU.js` 与 asar 内一致）。

### 11.2 排除「CSS 没加载」

供出的 `index-BPHePDI_.css` 里原语规则齐全：`._wrap_14sgc_1{display:inline-flex;
…height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);
border-radius:var(--dsw-radius-md);…}`、`._button_1rv3m_2{…}`、`._pill_1bqmh_1{…}`。
问题只在「有没有把原语取到手」。

### 11.3 截图像素测量（交叉验证，2× 缩放）

以真 `Pill` 高度 24px 定标（截图里选中 chip 的盒子 47 设备px ≈ 24 CSS px）：

- 输入框：44 设备px 高、2 设备px `#767676` 边框、**没有任何 `._wrap_` 包装盒的浅色边框** →
  ≈22 CSS px 的裸 `<input>`（真 `Input` 包装应为 32px / 0.5px）。
- 「添加提供商 / 删除当前提供商」：约 24 CSS px 高、`#767676` 边框、`#efefef` 填充 →
  原生 `<button>`（真 `Button` md=36px / sm=28px，`ghost` 无边框）。
- 对照：chip 填充 `#eeeeef` + 圆角 999px（真 `Pill`）；协议行是 35px 灰轨道 + 白色指示器
  （真 `SegmentedControl`）。

### 11.4 修复

两个解析器都改为按「React 组件类型」判断：

```
function isComponent(value) {
  if (typeof value === 'function') return true
  if (value === null || typeof value !== 'object') return false
  var tag = value.$$typeof
  if (tag === undefined) return false
  if (没有 Symbol.for) return false            // 保守：回到旧下限
  return tag === Symbol.for('react.forward_ref') ||
         tag === Symbol.for('react.memo') ||
         tag === Symbol.for('react.lazy')
}
```

明确不接受 `Symbol.for('react.element')`（已渲染元素不是组件类型；接受会让 `h(type,…)`
在渲染期抛错，正是本项目出过的 abdication 事故）。owner 的 `panelOf()` 同样改用该判断。

### 11.5 配套视觉适配（「美化」）

真控件回来之后，原先针对原生 fallback 调的 CSS 需要对齐：

1. add 行的弹性从 `input` 移到**原语的包装元素**（`.piai-provider-add > *` /
   `.piai-dict-add > *` 用 `flex: 1 1 160px; min-width: 0`），内层 `input` 只负责 `width: 100%`；
2. 模型/覆盖折叠卡片改成卡片外观（bg-layer-1 + border-l1 + radius-md + 内边距），
   标题行/箭头/hover 交还 `DisclosureRow`，字段块吃满宽度、动作按钮保持紧凑；
3. 行内动作按钮统一 `variant: 'outline'` + `size: 'sm'`（原语可用变体只有
   `ghost`/`primary`/`outline`/`toolbar`），破坏性动作仍走 `ConfirmButton` 二次确认；
4. 提供商 chip 行加 `align-items: center`；类清单仍 **49**，token 白名单仍 19，未新增 `piai-*` 类。

### 11.6 回归证据（旧解析器下必失败 → 修复后通过）

```
$ node --test tests/a11y.test.js          # 新增「wrapper 形状原语被采用」用例
  ✖ a forwardRef/memo primitive is adopted instead of the local stand-in   （旧解析器）
  ✔ 12/12                                                                  （修复后）

$ node --test tests/instances.test.js     # stub 改为 forwardRef/memo 形状
  旧解析器下 5 项失败（卡片/路径不可见），修复后 8/8

$ node --test tests/wiring.test.js        # 新增静态守卫：解析处不得再用裸 typeof
  旧解析器 → ✖；修复后 8/8

$ node tests/verify.polish.mjs            # 独立 harness 增加 P5i
  [FAIL] P5i forwardRef/memo primitives are adopted, not the local stand-ins （旧解析器）
  [PASS] P5i … wrapped stubs in tree: [["Pill",8],["Input",21],["Button",10],
         ["SegmentedControl",7],["Checkbox",2],["Menu",2],["MenuItemButton",20],
         ["Tooltip",1],["DisclosureRow",6],["Tag",19],["Switch",19],["StateDot",1]]  （修复后）
```

### 11.7 本轮实测（当前 HEAD，rev `a4b170ff9024`）

```
$ for f in lib/*.js; do node --check "$f"; done          # 无输出
$ node --test                                            ℹ tests 189  pass 189  fail 0
$ node tests/verify.integration.mjs                      checks passed 38 / failed 0
$ node tests/verify.render.mjs                           15 passed / 0 failed
$ node tests/verify.polish.mjs                           42 passed / 0 failed
```

服务端已供出本次字节：owner 含 `isComponent`，panels 含 `react.forward_ref`（1）与
`variant: 'outline'`（12），styles 含 `.piai-provider-add > *`（1）。

### 11.8 本轮未验证（诚实边界）

| 项 | 原因 | 判定 |
| --- | --- | --- |
| 真原语下的最终观感（输入框 32px、按钮 28px、折叠卡片） | 无真实浏览器截图；结构断言只证明用了原语 | untested（**需用户 F5 目视**） |
| 各控件的像素级对齐/hover/焦点态 | 同上 | untested |
| 服务端供出 | 已用 `?rev=` 实测（§11.7） | verified |

**说明**：`isComponent` 保持内部实现（不加入 `createPanels` 的返回值），以免改动
`tests/wiring.test.js` 冻结的「面板导出恰为两个组件」契约；改由 a11y + instances 的
wrapper 形状端到端用例、polish P5i 独立复核、以及 wiring 的静态守卫三条共同覆盖。


---

## 12. 表单 v4：截图缺陷 + 全量中文说明 + 组件/凭据（2026-10-13）

本轮按用户四张截图 + 三条要求执行：修缺陷、**每个配置项写死 key 与中文说明**、深度梳理
表单/控件/展开折叠交互。

### 12.1 截图缺陷与修法

| 图 | 问题 | 处理 |
| --- | --- | --- |
| 1 | 提供商条与第一个卡片贴太近 | `.piai-page` 列间距提到 `--piai-space-5` |
| 1 | `apiKeyEnv` 想要只读 | 只读引用行 + 凭据状态 + 设置密钥（§12.4） |
| 2 | 模型卡内标签变英文、说明丢失 | 见 §12.2（回归修复） |
| 2 | `Input` 复选框排错位 | 改为可编辑多选标签（chip + × + 添加） |
| 2 | `Reasoning Efforts` 重复、分支名 `dict` | 联合控件：中文分支名 + 同路径 const 分支不再重复渲染 + 「分支参数」嵌套块 |
| 3 | 同一行输入框与按钮不等高 | `.piai-provider-add button { height: 32px }`（与 32px 的 `Input` 一致） |
| 4 | 枚举旁漂浮的「未设置」压住说明、含义不明 | 清除/继承成为控件的一等公民：`piai-clear` 同高控件 + `aria-pressed`，文案「继承（未设置）」；`>4` 项时菜单末项同样措辞 |

行版式由横向两列改为**竖向**（标签+key → 控件 → 说明，行间 0.5px `border-l2`），
从根上消除「控件掉到标签下面重排」的错位。

### 12.2 修上一个版本引入的呈现回归（英文标题 + 无说明）

实例重定基把叶子路径变成 `providers.alpha.models.0.input`，而 `FIELDS` 表按 provider 相对路径
索引，于是模型卡内所有字段退化成 `humanize()` 的英文标题、且 hint 为空。实测：

```
providers.alpha.models.input            => "输入模态"  + "该模型接受的输入类型…"
providers.alpha.models.0.input          => "Input"     + undefined      ← 回归
providers.alpha.modelOverrides.gpt-x.name => "Name"    + undefined      ← 回归
```

修法：重定基时保留 `leaf.presentationPath`；`labelFor/hintFor/describeField` 的调用方
统一走 `presentationPathOf(leaf)`；嵌套走查（联合分支/嵌套对象/数组项）通过
`leaves(envelope, ref, path, presentationBase)` 带上呈现前缀。
回归测试：`tests/instances.test.js`「模型卡片在重定基后仍显示中文标签与说明」。

### 12.3 每个配置项 = key + 中文标签 + 中文说明

- 补 26 个 `compat.*` 中文标签、`baseURL`、`thinkingBudgets.{minimal,low,medium,high}` 标签与说明，
  以及 6 个 `retryPolicy.*` 嵌套字段、7 个 `reasoningEfforts.<档位>`、4 个联合分支显示名。
- 每个行首显示**原始 YAML key chip**（`piai-key`），由 `keyLabelFor(leaf)` 从路径推导：
  `apiKeyEnv` / `compat.thinkingFormat` / `models[].maxTokens` / `modelOverrides.<id>.name`。
- `tests/presentation.test.js`（新增，5 项）：枚举**页面真实渲染**的 125 个叶子（含联合分支），
  断言每个叶子有中文标签与中文说明、可算出 key，并把 **60 个呈现键写成显式名单**——
  上游新增字段即故意失败。联合分支也必须有中文显示名。

### 12.4 凭据（新的受控写入通道）

依据（实测源码）：

```
// @deepseek-ai/dsh-llm-pi-ai/lib/index.js
apiKeyEnv: z.string().role("credential-ref")
// @deepseek-ai/dsh-client-ui-settings-models/lib/client.js（shipped 模型页）
ctx.remote.credentials.describe(refs) / .set(ref, value) / .unset(ref)
ctx.remote.$on("credentials/record-updated" | "credentials/reference-updated", …)
// describe 结果：{ configured, source: "env"|"file", writable }
```

实现：`apiKeyEnv` 行只读展示引用名 + 状态徽标 + 复制；「设置密钥/更新密钥」内联
`type=password` → `credentials.set`；「清除密钥」二次确认 → `unset`；`source="env"` 时禁用写；
引用名为空时允许先填引用名（校验 `[A-Za-z_][A-Za-z0-9_]*`，走既有 settings 管线）；
宿主没有凭据 remote 时整行降级为只读提示。
**密钥永不进入 draft/ops/YAML**，配置里只有引用名；`AGENTS.md` §3.1 已把这条通道写成规则。

### 12.5 本轮实测（rev `a9379e404569`）

```
$ for f in lib/*.js; do node --check "$f"; done     # 无输出
$ node --test                                        ℹ tests 200  pass 200  fail 0
$ node tests/verify.integration.mjs                  checks passed 38 / failed 0
$ node tests/verify.render.mjs                       15 passed / 0 failed
$ node tests/verify.polish.mjs                       42 passed / 0 failed
```

逐文件：schema 59、form 50、render 24、a11y 15、coverage 11、wiring 10、compat 9、
instances 9、styles 8、presentation 5。

服务端已供出本次字节：owner 含 `credentialApiAvailable`，panels 含 `CredentialControl`，
fields 含「透传 store 参数」，styles 含 `piai-tag`。类清单 **58**，token 白名单仍 **19**。

### 12.6 本轮未验证（诚实边界）

| 项 | 原因 | 判定 |
| --- | --- | --- |
| 竖向行 + 标签 chip + 标签编辑器 + 凭据行的真实观感 | 无真实浏览器截图 | untested（**需用户 F5 目视**） |
| 真实凭据写入往返（`credentials.set` 落到宿主凭据文件） | 按 AGENTS 不对真实 profile/凭据做写操作 | blocked |
| 标签编辑器 / 下拉 / 密码框的键盘与焦点实测 | 无真实浏览器 | untested（结构断言覆盖 aria/键盘处理） |
| 服务端供出新字节 | `?rev=` 实测 | verified |

---

## 13. 事故：激活期读取未注入的 remote 命名空间导致 web boot 失败（2026-10-13）

**症状**（用户截图）：应用弹「应用无法启动或已意外停止」，
`web boot: 1 entry did not activate — dsh-llm-pi-ai-config: failed`，
诊断报告 `~/Library/Logs/DeepSeek Harness/crash-2026-10-13T09-05-27-500Z-web-boot.log`。

日志全文只给出审计结论，没有内层异常：

```
--- error ---
Error: web boot: 1 entry did not activate
dsh-llm-pi-ai-config: failed
--- renderer console (error level, oldest first) ---
dsh-app://app/assets/index-5SrrfWpU.js:126 Error: web boot: 1 entry did not activate
```

### 13.1 根因

上一轮为「设置密钥」加了 `ctx.remote.credentials.describe/set/unset` 与
`ctx.remote.$on(...)`，但**没有把这两个命名空间加进 cordis `inject`**。

shipped「设置 > 模型」页的注入表（实测 `dsh-client-ui-settings-models/lib/client.js`）：

```js
const inject = ["slots","locale","remote","remote.credentials","remote.llm",
                "remote.settings","remote.session","configForms","settingsSchema"];
```

`dsh-typert-protocol` 的契约也写明：每个 remote 命名空间是**独立的 cordis 服务键**
（`remote.settings`、`remote.credentials`……）。cordis 对**未注入**的服务键访问会抛错，
而 `apply()`/section `inject()` 在激活期执行，于是整个条目 failed，应用起不来。

我们旧的注入表只有：

```js
['slots','locale','remote.settings','configForms','settingsSchema']
```

### 13.2 修复

1. 注入表补齐：`['slots','locale','remote','remote.settings','remote.credentials',
   'configForms','settingsSchema']`（与 shipped 页面一致）。
2. 访问全部改为**防御式**：`credentialsRemote`、`credentialApiAvailable()`、
   事件订阅都包在 try/catch / `attempt()` 里并返回 `function () {}`；
   任何命名空间异常一律降级为「当前宿主不支持凭据管理」，**绝不让激活失败**。
3. 规则写入 `AGENTS.md` §3.1 与 `docs/interface-contract.md`。

### 13.3 回归证据（可复现该事故）

`tests/wiring.test.js` 新增：

```
✖ a hostile/uninjected remote namespace must never fail activation   （修复前）
✔ a hostile/uninjected remote namespace must never fail activation   （修复后）
```

用例用一个 `get credentials() { throw new Error('Service "remote.credentials" is not available') }`
的 remote 服务模拟未注入命名空间，断言 `apply()` 不抛错、settings cell 仍注册、
凭据能力降级为 `available: false`。修复前该用例失败（`apply()` 抛出），修复后通过。

### 13.4 本轮实测

```
$ for f in lib/*.js; do node --check "$f"; done     # 无输出
$ node --test                                        ℹ tests 201  pass 201  fail 0
$ node tests/verify.integration.mjs                  checks passed 38 / failed 0
$ node tests/verify.render.mjs                       15 passed / 0 failed
$ node tests/verify.polish.mjs                       41 passed / 0 failed（P10a 观察项：见下）
```

`verify.polish` 的 P10a（服务端供出字节 vs 磁盘）在事故现场运行时**无法读取当前 rev**：
崩溃的 renderer 已让本插件条目从 `/plugins/events` 的 graph 中消失，harness 报
`[OBS!] … cannot read the current rev: graph timeout`。这属于「应用处于崩溃态」的观测限制，
不是内容不符；重启应用后 P10a 应恢复通过（§13.5）。

### 13.5 待用户动作（无法在本环境闭环）

- **重启应用**（崩溃对话框的「重启」，或退出后重新打开）。重启会重算 owner rev 并重新拉取
  修复后的 bundle；本插件的条目只有在重启后的新 boot 中才会重新进入 graph。
- 重启后若页面出现：本轮全部 UI（竖向行、key chip、标签编辑器、凭据行）才算真正可见。
  在此之前，本轮 UI 的判定仍是 **untested**，凭据真实写入往返仍是 **blocked**。

---

## 14. v5：五张截图缺陷（焦点三层边框 / 继承出 tab / 输入模态 / 档位表 / 提示文案）（2026-10-13）

用户带回 5 张截图。每一条都先定位到具体实现证据，再改；改动集中在
`lib/client.panels.js`、`lib/client.styles.js`、`lib/client.fields.js`、`lib/client.schema.js`。
**没有**改动 `inject`、写入链路或 `lib/client.form.js`，激活路径与 §13 修复后的形态一致。

### 14.1 根因与证据

| # | 现象 | 根因（证据） |
| --- | --- | --- |
| 1 | 聚焦的输入框「多了好多边框」 | 我们的样式表有两条焦点规则：`.piai-root .piai-row-control:focus-within { outline; outline-offset: 3px }` 与 `.piai-root :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px }`。primitives 的 `Input.module.css` 本身只做 `.wrap:focus-within { border-color: business-primary }`，官方 `settings-form/fields.module.css` 更是 `outline: none` + `border-color`。三条叠在一个输入框上 |
| 2 | 「协议类型」选「继承」时白色指示块漂到卡片外 | 原实现把「继承」做成轨道旁的 `piai-clear` 药丸，未选中任何选项时 `SegmentedControl` 的 `selected = options.findIndex(o => o.value === value)` 为 `-1`，指示块按 `--dsh-segment-index: -1` 平移出轨道（primitives `SegmentedControl` 源码）|
| 3 | 输入模态只有 `text ×` + 「添加」 | `renderControl` 对 `array`+`enum` 走的是 `TagListControl` 的 chip + 添加菜单分支：未选中的允许值被藏在菜单里，还提供一个自由文本入口 |
| 4 | 推理强度每档一张卡片、有 null 开关与删除按钮 | `reasoningEfforts` 是 `dict`+`keyEnum`+标量值，`DictControl` 只渲染「已存在的键」，每个键一张 `piai-dict-row` 卡（含删除、`valueNullable` 的 `null` 开关、`valueEnum` 单选） |
| 5 | 提示是「接口是否支持 store 参数。」这类复述 | `FIELDS` 的 compat 文案按「是否支持 X」模板写，没有说明开启/关闭的后果 |

同一次排查还发现两个写入缺陷（同一控件、同一代码路径）：

- `lib/client.schema.js` 从未给 union 叶子赋值 `discriminator`，`UnionControl` 因而
  永远发 `{}`：选 `reasoningEfforts` 的 `false` 会写空对象、选 `retryPolicy` 的
  `always` 也会写空对象。adapter 会以 `has an empty reasoningEfforts` 等错误拒绝。
- `reasoningEfforts` 的档位表语义取自 adapter 校验：只有 `off` 允许 `null`
  （`only "off" may leave it empty`），其它档位 `null`/空串都非法。

### 14.2 修复

- **焦点**：删除上述两条规则，样式表不再声明任何 `:focus-within` / `:focus-visible`；
  白名单随之从 19 收到 18（`--dsw-alias-state-business-primary` 移出）。
- **继承入 tab**：`EnumControl` 在 ≤4 个真实选项时把「继承」作为轨道最后一段（字符串哨兵
  `__unset__`，`title` 保留完整措辞），越界值追加「未识别」段；`UnionControl` 改为按值形态
  选分支，并写回分支本身（const 字面量 / `{discriminator: value}` / 结构化分支不落盘）。
- **复选组**：`array`+`enum` 改 `CheckboxGroupControl`（`piai-checks`），每个允许值一个
  `Checkbox`，标签走新增的 `fields.valueLabelFor`（`文本（text）` / `图片（image）`）；
  `TagListControl` 只留自由标量数组。
- **档位表**：`dict`+`keyEnum`+标量值改 `TierTableControl`（`piai-tiers`/`piai-tier`/
  `piai-tier-key`）：每个键一行输入框，留空删键、全空清字段，无增删行、无 null 开关。
  取舍（`off: null` 无 UI 入口）写入 `docs/field-coverage.md` 与 AGENTS §3.3。
- **提示**：26 个 compat 键与其余复述型文案按「作用 + 生效条件/默认 + 不支持的后果」重写，
  语义取自 pi-ai 安装实现（`dist/api/openai-completions.js`、`anthropic-messages.js`）与
  `README.md` 的 compat 接口注释；标准写入 `docs/requirements.md` R2。

### 14.3 先证伪（负向控制）

在 `/tmp` 的仓库副本上把老行为放回去，新断言必须失败（全部实测）：

| 放回的老行为 | 失败的用例 |
| --- | --- |
| 恢复 `.piai-root :focus-visible` 焦点环 | `styles.test.js`「the v2 layout …（§10.2–§10.4）」（焦点断言） |
| 档位表不再删键（只 `onReplace`） | `a11y.test.js`「an unset union and the tiers branch …」 |
| 去掉轨道里的「继承」段（`value: undefined`） | `a11y.test.js`「the inherit choice is a segment …」+「enums use SegmentedControl (≤4 + inherit) …」 |
| union 恢复写 `{}` | `a11y.test.js`「an unset union and the tiers branch …」 |
| 去掉 `leaf.discriminator` 赋值 | `schema.test.js`「leaves() over the real schema」 |

### 14.4 本轮实测

```
$ for f in lib/*.js; do node --check "$f"; done      # 无输出
$ node --test                                         ℹ tests 207  pass 207  fail 0
$ node tests/verify.integration.mjs                   checks passed 38 / failed 0
$ node tests/verify.render.mjs                        15 passed / 0 failed
$ node tests/verify.polish.mjs                        （见下）
```

`verify.polish` 的 P10a 是「服务端字节 vs 磁盘」的新鲜度检查组，会随缓存状态在
observation / pass 间切换，两次实测：

```
# touch 之前（服务端仍是旧字节）
[OBS!] P10a served client.styles.js matches the on-disk sheet — STALE: served 21737B vs disk 23165B; containsDiskFile=false
--- summary: 41 passed, 0 failed, 1 observation problem(s)

$ touch lib/client.js        # 让 owner rev 变化，dev server 重新供出 chunk
# touch 之后
[OBS ] P10a ... rev=c1d32d0eab90 (recomputed from stat: c1d32d0eab90); served 23226B vs disk file 23165B; containsDiskFile=true
--- summary: 42 passed, 0 failed
```

服务端字节直查（非破坏性 GET，rev `c1d32d0eab90`）：

```
$ curl -s -o /tmp/served.client.styles.js \
    'http://127.0.0.1:19387/plugins/dsh-llm-pi-ai-config/client.styles.js?rev=c1d32d0eab90'
HTTP 200 · 23226B（= 磁盘 23165B + 61B 的服务端前缀）
$ python3 -c "print(open('lib/client.styles.js','rb').read() in open('/tmp/served.client.styles.js','rb').read())"
True
```

四份 chunk 都做了同样的包含性检查（`client.styles.js` / `client.panels.js` /
`client.fields.js` / `client.schema.js` → `containsDiskFile=True`），并 grep 到新标记：
`piai-tiers`、`TierTableControl`、`勾选该模型能接受的输入类型`、`valueLabelFor`、
`discriminatorKey`。即：**磁盘上的修复已经能从服务端拿到**；剩下的只是浏览器端重新加载。

新增/更新的用例：`tests/schema.test.js`（union `discriminator`）、`tests/a11y.test.js`
（继承段、union 写回、档位表、复选组、自由 chip）、`tests/instances.test.js`（模型卡里的
复选组与档位表按实例路径写入）、`tests/styles.test.js`（不得有焦点规则、类集合 62、
白名单 18）、`tests/verify.polish.mjs`（冻结类集合 62、白名单文案）。（v6 起类集合 63、白名单 20，见 §15。）

### 14.5 判定

| 项目 | 判定 |
| --- | --- |
| 五个截图问题（结构/CSS/文案层面） | **verified**（单测 + 三个 harness 全绿，且先证伪） |
| 焦点真实观感、指示块位置、复选/档位表的真实交互 | **untested**：需要真实浏览器 |
| 启动不再崩溃 | **partial**：不新增 inject/remote 访问，激活路径零改动；仍需用户重启后确认页面出现 |
| 凭据真实写入往返 | **blocked**（不对用户 profile 做写操作） |

用户动作：点崩溃对话框的「重启」（不要点「禁用第三方插件…」），页面出现后按 5 张截图逐条核对；
此后 §13.5 与 §14.5 的 untested 项即可回填。

---

## 15. v6：对齐 shipped「模型」页观感（2026-10-13）

用户贴出 shipped「模型」设置页（`@deepseek-ai/dsh-client-ui-settings-models`）的截图，要求
「参考这样子的样式」。做法是**把它自己的 CSS 抄过来**：该页不引用任何 `.css` 文件，样式都在
`lib/client.js` 内联的 CSS-module 串里（hash 前缀 `_6fYtdq_`），因此可以从 app.asar 里把这份
CSS 原样取出，作为逐条对照的真源，而不是照截图目测。

### 15.1 抄到的证据（原文）

```
_6fYtdq_field         flex-direction:column;gap:6px;display:flex
_6fYtdq_fieldLabel    color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px
_6fYtdq_input         box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);
                      border-radius:var(--dsw-radius-md);width:100%;height:32px;
                      background:var(--dsw-alias-bg-layer-1);padding:0 10px;font-size:14px
_6fYtdq_input:focus   border-color:var(--dsw-alias-state-business-primary);outline:none
_6fYtdq_advancedHint  color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px
_6fYtdq_editor        border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-module-platform);
                      gap:14px;padding:14px 16px
_6fYtdq_modelCatalogTitle  color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500
_6fYtdq_modelAdvanced grid-template-columns:repeat(2,minmax(0,1fr));gap:8px
_6fYtdq_modelEntry    border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);padding:6px
_6fYtdq_modelInputChoices flex-wrap:wrap;align-items:center;gap:16px;min-height:32px
```

### 15.2 改动

- `.piai-row` 去掉 `border-top` 与上下 padding，间距改由 `.piai-fields` 的 12px gap 提供
  （官方页的字段行之间没有分隔线）。
- 字段标签 12px/500/`label-secondary`；说明 12px/`label-tertiary`；分节标题
  12px/500/`label-secondary`。
- 新增 `.piai-row-pair` 两列网格（`repeat(2,minmax(0,1fr))`），由 `fields.pair` 决定分组：
  `identity` / `size` / `timeout` / `image` / `backoff` / `budget`（见 `docs/field-coverage.md`）。
- 分组卡 `bg-module-platform` + `radius-lg` + `14px 16px`；实例卡（模型/覆盖）
  `.5px border-l4` + `radius-lg` + `6px`。
- token 白名单 18 → **20**（新增 `--dsw-alias-bg-module-platform`、`--dsw-radius-lg`）；
  类清单 62 → **63**（新增 `piai-row-pair`）。两者都按项目规则同步了测试与文档。

### 15.3 先证伪（负向控制）

在 `/tmp` 的仓库副本上做两个最小回退，新断言必须失败（实测）：

| 放回的老行为 | 失败的用例 |
| --- | --- |
| `FieldsBlock` 忽略 `pair`，恢复"每个叶子一行" | `instances.test.js`「paired short fields share one two-column grid…」 |
| `.piai-row` 恢复 `border-top: 0.5px` 行分隔线 | `styles.test.js`「the v2 layout …（§10.2–§10.4）」 |

### 15.4 本轮实测

```
$ for f in lib/*.js; do node --check "$f"; done      # 无输出
$ node --test                                         ℹ tests 209  pass 209  fail 0
$ node tests/verify.integration.mjs                   checks passed 38 / failed 0
$ node tests/verify.render.mjs                        15 passed / 0 failed
$ node tests/verify.polish.mjs                        42 passed / 0 failed（touch owner 后）
```

服务端字节直查（rev `6630a2d4dcd4`，非破坏性 GET）：三份 chunk 都 `containsDiskFile=True`，
并 grep 到 `piai-row-pair`、`--dsw-alias-bg-module-platform`、`pairRunsOf` 与 18 处 `pair: '…'`。

新增/更新的用例：`tests/styles.test.js`（行内不再有分隔线、字段间距来自容器、标签/说明的
颜色与字号、两列网格、类集合 63、白名单 20）、`tests/instances.test.js`（模型卡里
`id`+`显示名称`、`上下文窗口`+`最大输出 Token` 各在一个两列网格里；网格至少两行；复选组与
档位表整行不与其它字段并排）、`tests/presentation.test.js`（每个 `pair` id 至少两个渲染期叶子）、
`tests/verify.polish.mjs`（P9a 的探针改为 `.piai-fields` gap + `.piai-row-pair` 网格，
并断言 `.piai-row` 无分隔线）。

### 15.5 判定

| 项目 | 判定 |
| --- | --- |
| 与 shipped 页的字段/卡片/网格样式一致（CSS 层面） | **verified**（逐条抄自官方 CSS + 断言 + 先证伪） |
| 真实观感（间距、两列网格在窄容器下的换行、暗色） | **untested**：需要真实浏览器 |
| 结构/功能不受影响 | **verified**：控件分派、写入语义与 209 项测试全绿；本轮只改样式与呈现元数据 |

仍待用户动作：重启应用后目视核对；`docs/interaction-design.md` §14 是本轮的设计契约。

---

## 16. v7：官方 tab / 提示气泡 / 实例卡头 / 方框单选 / 复选组间距 / 同行按钮（2026-10-14，T7 收口）

本轮实现需求 R1–R6，设计契约是 `docs/interaction-design.md` §15。本节记录 T7 亲自执行的
命令、T5 的负向控制、T6 的对抗式复核结论与最终判定。原始输出按执行顺序贴出，不做转述。

### 16.1 四条命令的原始输出（T7 实测）

```
$ for f in lib/*.js; do node --check "$f"; done
OK lib/client.fields.js
OK lib/client.form.js
OK lib/client.js
OK lib/client.panels.js
OK lib/client.schema.js
OK lib/client.styles.js
OK lib/index.js                      # 7/7 通过，无 stderr

$ node --test
ℹ tests 249
ℹ suites 11
ℹ pass 248
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 1

$ node tests/verify.integration.mjs
================ VERIFICATION SUMMARY ================
checks passed : 38
checks failed : 0
unverified    : 0
======================================================

$ node tests/verify.render.mjs
--- summary: 15 passed, 0 skipped, 0 failed ---

$ touch lib/client.js && node tests/verify.polish.mjs
[OBS ] P10a served client.styles.js matches the on-disk sheet for the current rev —
      rev=75e52e449e7c (recomputed from stat: 52c8650fc309); served 35643B vs disk file 35582B;
      containsDiskFile=true; width-@media=false; .piai-row column=true;
      probes={"max-width: 719px":false,"grid-template-columns: 240px":false,
              "flex: 1 1 320px":false,"prefers-reduced-motion":true,
              "--dsw-alias-border-l4":true,".piai-key":true,".piai-item-head":true,
              ".piai-item-remove":true,".piai-provider-list":true,
              "--dsw-focus-ring-width":true,".piai-tag":true,".piai-cred":true}
--- summary: 42 passed, 0 failed ---
```

说明：`todo 1` 是 `tests/v7.audit.test.js` 里 FINDING-3（既定偏离）的显式守卫，
不是失败。`tests/v7.audit.test.js` 单项实测 **tests 35 / pass 34 / fail 0 / todo 1**。
P10a 仍是 OBS：`containsDiskFile=true`（服务端字节包含磁盘版本）但服务端 rev
（`75e52e449e7c`）不是 touch 后重算的 rev（`52c8650fc309`）——平台按完整 URL 缓存，
`touch` 只改变下一轮 rev（`docs/development.md` §5）。这是观察项，不是断言失败。

### 16.2 先证伪：T5 的 6 条负向控制（task-6 实测，原始输出存档 `/tmp/v7-neg/negctl-output.txt`）

在 `/tmp` 的仓库副本上逐条放回老行为，断言必须由绿转红（基线 40/40 全绿）：

| # | 放回的老行为 | 失败的用例 | 失败断言原文 |
| --- | --- | --- | --- |
| a | 提供商 tab 换回 `Pill` | `the provider strip is a tablist: one roving tab per provider plus the add tab` | `the underline hook is data-active on the selected tab only` |
| b | 行内重新渲染 `piai-key` chip | `every field hint is one piai-info trigger, described by its control and shown in a Tooltip`；另带红一条 `an enum is one self-drawn radio group at any option count, never a native select`（共 2 条） | `the raw key moved into the bubble`、`The expression evaluated to a falsy value:` |
| c | 实例卡改回 `DisclosureRow`（收起不可删） | `models[] renders one collapsible card per model…`、`modelOverrides renders one collapsible card per key…`、两处 add/remove、两处 op 路径等 **9 条** | `the head must carry a disclosure button` |
| d | 枚举换回 `SegmentedControl` | `an enum is one self-drawn radio group at any option count, never a native select`、`the inherit choice is the last radio…`、union 两条 | `SegmentedControl left the page in v7 (§15.5)` / `the enum track left the page in v7` / `exactly one branch option is selected` |
| e | 去掉 checks 的 nowrap/gap:4px | `the v7 controls carry the E1/E5/E9/E10 shapes (§15.2, §15.4–§15.7)` | `box ↔ label gap tightens to 4px` |
| f | 同行按钮回 28px | `the v7 controls carry the E1/E5/E9/E10 shapes (§15.2, §15.4–§15.7)` | `piai-provider-add button matches the 32px input` |

结论：6 条全部「改前红、改后绿」，且失败信息指向具体规则，不是泛红。

### 16.3 T6 复核的 5 条负向控制（T7 在 `/tmp/v7-t7neg` 副本上复跑）

T6 的复核断言在 `tests/v7.audit.test.js`（35 项）。T6 自己的控制台输出未落盘为工作区工件，
因此下表是 **T7 亲自复跑**这 5 个最小变异得到的原始结果（基线
`tests 35 / pass 34 / fail 0`，即 34 pass + 1 个 FINDING-3 todo）：

| # | 变异 | 失败的用例 | 失败断言原文 |
| --- | --- | --- | --- |
| M1 | 删掉 `fields.js` 的 `titleRank: 1` | `R3 §15.4 — card titles come from presentation metadata (name → required string → #n)` + `…hardcodes no provider/model field name` | `Expected values to be strictly deep-equal:`（标题回落成 `id`） |
| M2 | 加一条 `:focus-within`（命中 primitives 内部）到样式表 | `§15.8.3 — focus rules are exactly the four whitelisted forms, none reaching a primitive` | `Expected values to be strictly deep-equal:` |
| M3 | 让 `ProviderTabs` 在 0 提供商时也渲染 tablist（`hasTabs = true`） | `R1 §15.2.10 (D2) — zero providers render no tablist/tab/tabpanel; the add form is direct` | `no tablist without providers` |
| M4 | 在 `panels.js` 里写字面字段名 `'name'` | `R3 §15.4 — the panel hardcodes no provider/model field name` | `'name' at index … is not a React key:` |
| M5 | 去掉控件的 `aria-describedby` | `R2 §15.3.6 — aria-describedby targets the permanent piai-info anchor, never the portal bubble` | `hinted fields must be described` |

结论：5 条全部「改前红、改后绿」；变异均只改 `lib/`，在工作区之外进行，工作区未被污染。

### 16.4 对抗式复核的结论（verifier-2 / task-7、task-12）

| 编号 | 内容 | 状态 |
| --- | --- | --- |
| FINDING-1 | `DictControl` 给 primitive `Checkbox` 传了一个不会被渲染的 `id`（primitive 不 spread rest） | **已修**；`tests/v7.audit.test.js` 有硬回归断言 |
| FINDING-2 | `UnionControl` 的 `activeId` 让 `realId` 压住 `pendingId`，`false` 状态下无法切到档位表分支 | **已修**（pending 优先）；转为硬回归断言，且不产生写入直到填第一个档位 |
| FINDING-3 | 非活动 tab 的 `aria-controls` 指向**未渲染**的 panel（官方把访问过的 panel 常驻并 `hidden`） | **已知偏离，不修**：单面渲染是 v6 起的既定设计；`v7.audit.test.js` 保留 `todo` 守卫，不视为发布阻断 |
| OBS-4 | 规格写「错误节点走 `aria-describedby`」，实现是控件 `aria-invalid` + 页级 `role="alert"` 原样回显 | 口径已按实现改正（`interaction-design.md` §15.3.6 / §15.12） |
| OBS-5 | `[role="tab"]` 多两条防御声明（`min-width/max-width`）与 `background: none` 等价写法、焦点环不带 business-primary fallback | 记为有意偏离（§15.2.3 / §15.12） |
| OBS-8 | R5 nowrap 实际落在 `.piai-checks > label > span` | 行为等价，已按实现改正（§15.6.4） |

### 16.5 判定

| 项目 | 判定 | 依据 |
| --- | --- | --- |
| 结构 / 接口 / 写入语义（`unset`、无 `null`、无新依赖、`inject` 未变） | **verified** | `node --test` 249/0 fail；`tests/v7.audit.test.js` §15.8.5 |
| CSS / token / 类清单（66 类、23 token 白名单、4 条焦点选择器） | **verified** | `tests/styles.test.js` + `verify.polish.mjs` 42/0 + audit §15.8.1–3 |
| 文案（每个叶子的 key / 中文标签 / 中文说明） | **verified** | `tests/presentation.test.js` |
| R1 tab / R2 气泡 / R3 卡头 / R4 方框单选 / R5 复选组 / R6 等高（harness 层面） | **verified** | `a11y` / `render` / `instances` / `styles` + audit 1–21 + 6+5 条负向控制 |
| 上游原语签名（Tooltip/Switch/Checkbox/图标） | **verified** | `tests/v7.audit.test.js` §6（E4/E5/E9/E10） |
| 真实浏览器观感（下划线 tab、气泡、卡片、方框、间距） | **untested** | 需要用户重启 DSH 后目视；本环境无法自动化视觉验证 |
| R4 对勾 `input:checked::after` 的像素 | **untested** | harness 只断言规则存在，不代表像素可见（§15.12.1） |
| 凭据真实写入（`credentials.set/unset`） | **blocked** | 需要真实凭据 remote；按纪律不对真实 profile 做写操作 |
| 服务端字节新鲜度 | **partial** | P10a 是 OBS：`containsDiskFile=true`，但服务端 rev 尚未是 touch 后的新 rev |

仍待用户动作：重启应用 → F5 → 目视核对 6 项需求；`docs/interaction-design.md` §15 是本轮
的设计契约，计数与类/token 清单已与代码对齐（AGENTS §4、`docs/development.md` §2）。

---

## 17. v8：复选框标签可见性 / 分支参数块 / 协议兼容折叠项（2026-10-14，T7 收口）

本轮设计契约 = `docs/interaction-design.md` §16。本节记录 T7 亲自执行的命令、T5 的浏览器
夹具测量与 3 条负向控制、T6 的独立复核结论、以及最终判定。数字均为实测值，不引用转述。

### 17.1 命令原始输出（T7 实测）

```
$ for f in lib/*.js; do node --check "$f"; done
# 7/7 通过，无 stderr

$ node --test
ℹ tests 272
ℹ suites 11
ℹ pass 271
ℹ fail 0
ℹ todo 1

$ node tests/verify.integration.mjs
checks passed : 38 / checks failed : 0 / unverified : 0

$ node tests/verify.render.mjs
--- summary: 15 passed, 0 skipped, 0 failed ---

$ touch lib/client.js && node tests/verify.polish.mjs
--- summary: 42 passed, 0 failed ---

$ node --test tests/v7.audit.test.js tests/v8.audit.test.js
ℹ tests 58 / pass 57 / fail 0 / todo 1
#   分开跑：v7.audit = 35（34 pass + 1 todo = FINDING-3）；v8.audit = 23（23 pass）
```

T7 直接从 `lib/client.styles.js` 复算的不变量：

| 项 | 实测 | 说明 |
| --- | --- | --- |
| `CLASSES` | **66** | 含 `piai-disclosure-body`，**不含** `piai-count`（v8 等量替换） |
| `--dsw-*` 出现数 / 白名单 | **19 / 23** | 19 个是本轮真实引用，23 个是白名单（§15.8；§2 口径） |
| 焦点选择器 | **恰好 4 条** | `tab:focus-visible`(+`::after`)、`info:focus-visible`、`item-head:has(:focus-visible) item-remove`；无 `:focus-within` |

`todo 1` 是 `tests/v7.audit.test.js` 的 FINDING-3（v6 起的单面渲染取舍），不是失败。

### 17.2 R1 根因与复现（修复前的原始测量）

根因：`.piai-root .piai-row-control input { width:100% }`（§10.3）**同时命中
`.piai-checks` 内的复选框**，把复选框拉伸到所在 `<label>` 的整宽；label 的宽度由内容反推，
`.piai-checks > label > span` 又带 `min-width:0; overflow:hidden; text-overflow:ellipsis`
→ span 宽 0，文字消失。

T6 的浏览器夹具 `/tmp/piai-audit/f-v7state.html` 原始数据：

```json
"inputRow": {"input":{"w":97.84,"h":16}, "label":{"w":97.84}, "span":{"w":0,"h":20}, "text":"文本（text）", "gap":16}
"omitRow":  {"input":{"w":87,"h":16},              "span":{"w":0,"h":20}, "text":"关闭时省略"}
```

T5 夹具的负向控制 (a) 复现同一量级：checkbox inputs `97.84px` / `112.43px`（各自 == label 宽），
option spans `0px` / `0px`。两条独立测量互相印证。

### 17.3 修复后实测（T5 夹具 + T6 真实渲染，双份）

**T5 夹具**（`tests/layout/`，600×1200 CSS px，stylesheet sha256
`fe347b3780f71eec220706de13bc678e68eaa0730f7e773822e3dda39c16db63`；
下表与 T5 的原始测量存档 `/tmp/v8-neg/negctl-output.txt` 的
`BASELINE r1/r2/r3` 行逐值一致）：

| 判据 | 原始测量 | 结论 |
| --- | --- | --- |
| 两个 `input[type=checkbox]` | `16×16`、`16×16` | 通过 |
| 两个 `.piai-checks > label > span` 宽 > 40px 且非空 | `80.84px`「文本（text）」、`95.43px`「图片（image）」 | 通过 |
| 相邻 `.piai-checks` label 间距 | `16` | 通过 |
| 普通文本框吃满 `.piai-row-control` 内容盒（±1px） | wrap `600px` vs control content `600px` → delta `0` | 通过 |
| `.piai-select input` 仍 16×16 | `16×16`、`16×16` | 通过 |
| `.piai-nested` 计算 `borderLeftWidth` / `paddingLeft` / `gap` | `0px` / `0px` / `8px` | 通过 |
| `.piai-nested-title` 含分支名 +「的参数」 | `按档位表设置的参数` | 通过 |
| `.piai-count` 节点数 | `0` | 通过 |
| 常驻 `.piai-disclosure-body` | 6 个；5 个 `hidden` + `display:none` + rect `0×0` | 通过 |
| 展开分区内容左缘 == 标题 span 左缘（±1px） | `27px` vs `27px` → delta `0` | 通过 |
| 收起分区 chevron 可见且 14×14 | 5 × `14×14` | 通过 |
| 6 个 `aria-controls` 互异且都能 `getElementById` 解析 | 6 distinct，6/6 解析 | 通过 |

**T6 真实 chunk 渲染**（`/tmp/piai-audit/measurements-real.json`，真 `STYLESHEET` + 真原语 CSS）：

| 判据 | 原始测量 |
| --- | --- |
| `input` / `defaultInput` 两行的 checkbox | `16×16`；span `80.84px` / `95.43px`，文本正常 |
| 全页 radio（54 个） | 全部 `16×16` |
| `.piai-nested` | `borderLeftWidth "0px"`、`paddingLeft "0px"`、`gap "8px"`、标题 `normal（按次数重试）的参数` |
| compat 6 个分区 | 5 个 `aria-expanded=false`、`targetExists=true`、`targetHidden=true`、`hasCount=false`；展开的那个（模板与路由）`bodyContentLeft=43` == `titleLeft=43`、`fieldRows=4`、`paddingLeft="18px"` |
| chevron | `chevronWidth=14`（每分区） |
| 计数 | `itemHeads=7`（6 compat + 1 模型卡）、`itemRemoves=1`、`itemActions=1`、**`piaiCount=0`** |

**与源码顺序无关**：T6 额外做了 radio 顺序对调的证伪夹具——
`f-radiofirst-v7.html` 的 radio 被拉成 `126.3 / 114.55 / 129.86 / 31`，而
`f-radiofirst-real.html` 全部 `16×16`，证明修复后不再依赖「谁先命中」的顺序。

### 17.4 负向控制（T5 3 条 + FINDING-V8-2 的还原口径）

在 `/tmp` 副本上改回旧行为、重建夹具再测（工作区未污染）。原始输出存档
`/tmp/v8-neg/negctl-output.txt`（T5 产出），逐行如下（节选 `key` 字段）：

```
BASELINE r1  {"pass":true,  "key":{"checkboxWidths":[16,16],"optionSpanWidths":[80.84,95.43],"adjacentLabelGap":16,"textInputDelta":0,"selectWidths":[16,16]}}
BASELINE r2  {"pass":true,  "key":{"borderLeftWidth":"0px","paddingLeft":"0px","title":"按档位表设置的参数"}}
BASELINE r3  {"pass":true,  "key":{"countBadges":0,"hiddenBodies":5,"alignmentDelta":0,"collapsedChevrons":["14x14",…],"ariaControlsDistinct":6}}
MUTANT (a) r1 {"pass":false,"key":{"checkboxWidths":[97.84,112.43],"optionSpanWidths":[0,0]}}
MUTANT (b) r3 {"pass":false,"key":{"countBadges":6}}
MUTANT (c) r2 {"pass":false,"key":{"borderLeftWidth":"1px","paddingLeft":"12px"}}
```

| # | 变异 | 原始测量 | 判定 |
| --- | --- | --- | --- |
| (a) | 还原 v7 三件套：① 去掉 `:not([type="checkbox"]):not([type="radio"])`；② 删 `.piai-checks > label > input` 钉死规则；③ 恢复 span 的 `min-width/overflow/text-overflow` | checkbox inputs `97.84px` / `112.43px`（== 各自 label 宽），spans `0px` / `0px` | `checkbox16:false`、`optionSpansVisible:false`、`pass:false` |
| (b) | 每个分区头恢复 `<span class="piai-count">5</span>` | `countBadges:6`，标题变成 `通用能力5`… | `noCountBadge:false`、`pass:false` |
| (c) | 恢复 `.piai-nested { border-left:1px solid …; padding-left:12px }` | `borderLeftWidth "1px"`、`paddingLeft "12px"` | `nestedNoRail:false`、`pass:false` |

**FINDING-V8-2（为什么 (a) 必须同时还原三件套）**：三条规则是纵深防御——
① 宽度规则上的两个 `:not(...)`（只让文本框吃满）；② 钉死盒子的
`.piai-checks > label > input { flex:none; 16px }`；③ span 只留 `white-space: nowrap`。
**只删 ① 不会复现**：钉死规则的特异性 **(0,2,2)** 仍高于裸宽度规则的 **(0,2,1)**，盒子保持
16×16（T6 的 `f-nonot.html` / `f-both.html` 实测均为 `16×16`）；只有连 ② 一起删，拉伸才会
重新压塌 span（`f-v7state.html`）。特异性由 T7 复算：
`.piai-root .piai-checks > label > input` = 2 类 + 2 元素 = **(0,2,2)**；
`.piai-root .piai-row-control input` = 2 类 + 1 元素 = **(0,2,1)**；
加上两个 `:not([type=…])` 后 = 2 类 + 2 属性 + 1 元素 = **(0,4,1)**。
（`tests/layout/README.md` 把钉死规则写作 `(0,3,2)`，按 CSS 复算应为 `(0,2,2)`——以复算为准。）

**FINDING-V8-1（残余风险，本轮明确不改）**：加了两个 `:not(...)` 后宽度规则变成 **(0,4,1)**，
对**没有 `type` 属性**的 `<input>` 会盖过钉死规则 **(0,2,2)**——T6 实测
`fallbackRow.input.w = 216`（`inputType: null`，`/tmp/piai-audit/f-real2.html`）。
该形态只在 `primitive('Checkbox', 'input')` 的**降级路径**可达；shipped `Checkbox` 恒输出
`type="checkbox"`（`f-real2.html` 的 checkbox 行是 16×16）。评估过用 `:where()` 把宽度规则的
特异性归零，但**修不好**这条降级路径：钉死规则要求 `label` 包裹，而降级路径没有 `label`。
故不采纳，记录为已知残余风险 + 未来可选方案（若要修，得给降级路径单独加一条钉死规则）。

### 17.5 T6 复核结论（`tests/v8.audit.test.js`，23 项全绿）

| 复核面 | 结论 | 证据 |
| --- | --- | --- |
| R1 CSS：宽度规则已收窄且不再命中 checkbox/radio；盒子钉死 16px；span 不含收缩三件套 | **通过** | v8.audit §1（tests 1–5）；styles/夹具双测 |
| R1 影响面：`defaultInput`、字典 `omitWhenOff` 同修；radio 仍 16px 且与源码顺序无关 | **通过** | 17.3 的两份测量 + `f-radiofirst-*` |
| R1 浏览器层：checkbox 16×16、span > 40px、文字非空 | **通过** | v8.audit §6（tests 23–24）读真实 Chromium 产物 |
| R2：`.piai-nested` 无 rail；标题 = 分支名 + 「的参数」；缺省回落「分支参数」 | **通过** | v8.audit §2（tests 6–8）+ 两份夹具 |
| R3：compat 用自写头、无 `DisclosureRow`、原生 button、常驻 hidden body、无计数、18px 对齐 | **通过** | v8.audit §3（tests 9–13）+ 真实渲染 |
| 不变量：CLASSES 66 四方相等、token 19/23、焦点 4 条、写入语义未变、`inject` 7 服务、无新依赖 | **通过** | v8.audit §4（tests 14–19） |
| 上游耦合：Checkbox/Input/Tag/Tooltip/图标按签名使用；`instanceCardHead.actions` 对模型卡零影响 | **通过** | v8.audit §5（tests 20–22） |
| 需求遗漏：逐条对照用户原话，无未落地项 | **通过** | v8.audit §6 与本节 17.3 |

### 17.6 夹具方法与 harness 盲区

- **盲区**：`node --test`（含 `verify.*.mjs`）只断言 DOM / props / CSS **文本**，没有布局引擎；
  R1 的「文字宽 0」在所有这些断言下都是绿的——三层防御全部回退之前它不会显形。
- **夹具**（`tests/layout/`，T5 建）：`build-fixture.mjs` 用 `node:vm` 从
  `lib/client.styles.js` 取出**真实 `STYLESHEET`**（不手抄子集），拼上
  `tests/layout/primitives/{Checkbox,Input,Tooltip}.module.css`（字节快照，文件头带来源与 md5；
  Tooltip 快照为 v9-T40 新增，用于 r7 的真实 `.bubble`），
  生成静态页到 `/tmp/piai-layout/`；测量由 **ego-browser** 在页内 `evaluate` 完成，
  **不进入 `node --test`**，**不新增任何依赖**（AGENTS §3.4）。
- **T6 的第二套夹具**：`/tmp/piai-audit/` 独立构建（`build.mjs` 可开关
  `--strip-not --no-pin --old-span` 造 v7 状态），另有 `render-fixture.mjs` 渲染**真实 chunk**，
  与 T5 的夹具互为独立实现（两套都指向同一结论）。
- **夹具必须画真图标（D6）**：面板的图标解析降级到 `FallbackIcon` 时渲染**无尺寸**的
  `<span>`，18px 的标题对齐前提就不成立；因此夹具自带 `<svg width=14 height=14>`，
  不能拿降级 span 去量对齐。真实运行时必须解析到真原语图标，这条对齐才成立。
- **已知遗留（交给 Lead/T5 决定）**：`tests/v8.audit.test.js` 的
  `R3 §16.4.5/7` 用例把 6 个 body id 的**字面量**（`piai-field-compat-section-N-body`）钉进断言；
  而 §16.4.7 的口径是「测试不得钉死 id 字面量，只断言 6 个互异且都能解析」。
  两处需二选一（改测试或改规格），超出 T7 写作用域。

### 17.7 判定

| 项目 | 判定 | 依据 |
| --- | --- | --- |
| 结构 / 接口 / 写入语义 / 不变量（66 类、19–23 token、4 焦点选择器） | **verified** | `node --test` 272/0 fail；v8.audit 23/23 |
| R1 复选框标签可见（计算布局） | **verified** | 两套独立浏览器夹具：16×16 + span 80.84/95.43 + 间距 16 |
| R1 的降级路径（无 `type` 的 `<input>`，FINDING-V8-1） | **partial（已知残余）** | 实测 216px；仅 `primitive('Checkbox','input')` 降级可达；本轮不改 |
| 字典 `omitWhenOff` 复选框 | **verified（无本地钉死兜底）** | 修复后 16×16 / span 70；依赖「排除规则 + 原语 CSS」 |
| R2 分支参数块 | **verified** | 夹具 `0px/0px/8px` + 动态标题 |
| R3 compat 折叠项（无计数、常显箭头、常驻 body、18px 对齐） | **verified** | 夹具 + 真实渲染（43==43） |
| 文案（key / 中文标签 / 中文说明） | **verified** | `tests/presentation.test.js` |
| **真实 GUI 观感** | **untested** | 127.0.0.1:19387 有鉴权门；需用户重启 DSH 后目视 3 项（标签是否显示、分支块是否无边框且标题点名分支、折叠项是否无计数器且箭头常显） |
| 凭据真实写入（`credentials.set/unset`） | **blocked** | 需要真实凭据 remote；按纪律不对真实 profile 做写操作 |

仍待用户动作：重启 → 目视核对 3 项；设计契约是 `docs/interaction-design.md` §16，
计数与类/token 清单已与代码对齐（AGENTS §4、`docs/development.md` §2、README）。

## 18. v9：T8 新增面独立验证（…，verifier：impl-schema；T14 夹具复测、T19 portal、T23 气泡、T29 候选行、T38 对比度、T42 气泡内边距）

> **修订说明（v9-T42）**：**用户要求气泡「间距调大，上下左右一样」**。primitives 的 `.bubble`
> 自带 `padding: 3px 7px`（上下/左右天生不等）；v9-T39 在**气泡 wrapper** 上用补偿式
> `padding: var(--piai-space-3) var(--piai-space-2)`（12/8）把视觉内边距做成 **15/15/15/15**，
> 并用 `:has(> .piai-key | > span)` 门控把 Modal 的 portal wrapper 排除在外。v9-T40 把 r7 的
> `.bubble` 从「内联模拟」升级为**真实 `Tooltip.module.css` 快照**（`tests/layout/primitives/`），
> 新增 `bubbleInsetUniform`/`bubbleInsetGrew`/`modalWrapperUnaffected`/`modalGateDoesNotMatch`
> 与两条负对照；r7 现 **13/13**。详见 §18.12。

> **修订说明（v9-T38）**：**用户第三次 GUI 反馈**「Tooltip 气泡正文深字压深底」。根因是
> primitives 气泡用**静态浅色前景**（气泡永远深底），T20 的嵌套 `span.piai-root` 让本插件
> `.piai-root{color:var(--dsw-alias-label-primary)}` 以更高 specificity 覆盖它。v9-T31 给嵌套根
> 加 `color: inherit`（正文 **12.14:1**）；同一轮**误把 inherit 也加到 chip** 上 → chip
> **1.09:1**（v9-T32 的对比度断言发现），v9-T35 撤回（chip 回到自身主题 token 对 **6.51:1**）；
> v9-T36 把 r7 准则改为**对比度**口径 + 两条独立负对照。完整链路见 §18.11，判定与边界见
> §18.6/§18.11.5。

> **修订说明（v9-T29）**：**用户反馈**「获取可用模型」弹窗每个候选显示两段文字
> （等宽 id + 显示名），而多数模型 `name === id` → 读起来是同一串重复。v9-T25 按官方
> 「设置 → 模型」picker（alias `PICKER:874-878`）改为**只渲染原始 id**、名称进 `title`、
> 且**名称仍参与搜索**；v9-T26 补回归断言并同步 r6 夹具准则名；v9-T28 删除因此成为死规则的
> `.piai-root .piai-catalog > label > span`。详见 §18.10。

> **修订说明（v9-T23）**：用户批准后，v9-T20 把 **Tooltip 气泡**也改成「portal 内嵌套
> `.piai-root` + 纵向 flex 栈」，`.piai-key` chip 恢复独立样式，`<br>` 分隔全部删除
> （`lib/client.panels.js` 的 `h('br'` 计数 = **0**）。§18.9.5 的 F7 由「已知未修」改为
> **已修**；新增 r7-bubble 夹具的正/负对照复核（§18.2），判定表与冻结哈希同步更新。

> **修订说明（v9-T19）**：**用户在自己真实 GUI 里发现**「获取可用模型」弹窗候选列表无样式
> （`deepseek-flashdeepseek-flash…` 粘连）。根因是 primitives `Modal` 走
> `createPortal(…, document.body)`，而本插件 CSS 全部以 `.piai-root` 作用域开头 → portal 内
> 不匹配。**缺陷从 §18 的 partial 判定里逃逸了**：v9-T10 的替代证据是自建 DOM + 真实样式表，
> 但**没有覆盖 portal 作用域**（自建页把内容放在 `.piai-root` 里，恰好绕过了真实条件）。
> §18.9 记录根因/修复/逃逸复盘；本节的 §18.0/18.1/18.2/18.6 已按 T16–T18 后的字节重测。

> **修订说明（v9-T14）**：v9-T13 修复了 `tests/layout/` 的 F1–F4（选择器 bug、F2/F3 准则重写、
> README sha）。本节在修复后**重新实测 5 个夹具页**（ego-browser，自己的运行），据此把
> R1/R4 从「被 F1 阻塞/口径 partial」升级为实测，R5「原代码」从 untested 改为 partial，
> 并改写 F1–F4 状态。

> **披露（利益相关，AGENTS §4 要求可追溯）**：本节验证者 `impl-schema` 在本轮**之前**实现过
> `lib/client.schema.js` 的 `valueVar` / `valueVarNames` 元数据与 `tests/schema.test.js` 的对应
> 用例（task-2）。为使该部分**不靠自己的测试文件背书**，§18.4 用
> `/tmp/v9-evidence/valuevar-recompute.mjs`（不 import 任何 `tests/` 文件）从 fixture 结构
> 独立重算，并把结论标注为「verified（披露关系，独立重算）」。本轮写范围仅本文件与 `/tmp`。

### 18.0 被验证字节（冻结点）

| 文件 | bytes | md5 |
| --- | --- | --- |
| `lib/client.js` | 68660 | `17eb78d61b9a465f884740b8992edc0c` |
| `lib/client.schema.js` | 28904 | `119fe924f2808aa325cb68983951699a` |
| `lib/client.form.js` | 23509 | `4a5aec17b04b487a8064ca8ac8bc7ade` |
| `lib/client.fields.js` | 52361 | `30abf4cd346e7afffb2cf56153d3af9c` |
| `lib/client.yaml.js` | 10536 | `947aee46e1222dfcf2cf12a355e3ff1e` |
| `lib/client.panels.js` | 160097 | `14e0887f335115f7a1d21a1e748bd76c` |
| `lib/client.styles.js` | 43086 | `1d7fd0971102703e79111dd546116749` |
| `lib/index.js` | 948 | `b4b4a9a3c1c206e9169851f8c39f4a92` |

fixture `tests/fixtures/llm-pi-ai.schema.json` sha256
`3d94d08aeb40936e4e1e76a1e88432d638404249a154291641031be0c377f0cd`。

**本轮新增/变更的夹具与测试文件（v9-T39/T40，v9-T42 记录 md5）**：

| 文件 | bytes | md5 |
| --- | --- | --- |
| `tests/layout/measure-in-page.js` | 38783 | `4cb4fd187000d6b23dca5ccaa56392e2` |
| `tests/layout/build-fixture.mjs` | 36992 | `a8c2e2e424396e88083b61e69ff952f4` |
| `tests/layout/README.md` | 29779 | `5471ecac049dd539b52201455a0f4a69` |
| `tests/layout/primitives/Tooltip.module.css`（**新增**，原语真实快照） | 3068 | `f1f8bd16200f3116bacf0c735b1c53bd` |
| `tests/layout/primitives/Checkbox.module.css` | 1438 | `210d5f8b5f942da4ee90daa4d5883bbf` |
| `tests/layout/primitives/Input.module.css` | 1575 | `8d9839ca9e38872c46c0a6d2782e33f4` |
| `tests/styles.test.js`（v9-T36；本轮未再改） | 39422 | `ea18820f73eb9eb2c0e78e38e8358bf3` |
| `tests/catalog.test.js`（v9-T26；未再改） | 46193 | `92eae71b10d08df98ca4227eac86c792` |
| `tests/verify.polish.mjs`（v9-T18；其后未再改） | 134523 | `62e79f54026148ad6d0181861f5beaf3` |

夹具 build 身份（v9-T42 亲自重建）：stylesheet `8b1fdfb79418a8acf795ba8107674b5d07ad05283726af7ae5404e17ceda6994`
（37316B）、三个原语快照 md5 见上表、**7 页**
（r1 50210B、r2 46580B、r3 49219B、r4 45802B、r5 45674B、r6 46497B、r7 47371B）、
`index.html` + `manifest.json`；两次异目录构建 `diff -r` 为空。**聚合 md5**：我用
`cat $(ls -1 | sort) | md5 -q` 得 `a90eeed465e430cd5c1c61ece1ddcd42`；各轮报告的聚合值我均
无法用常见聚合方式复现（方法未给出），确定性一律以 `diff -r` 为准。

> **F0 更正（Lead 说明）**：v9-T10 时记的 `lib/client.js` 字节变化
> （68619B/`8602819b…` → 68660B/`17eb78d6…`）是 **Lead 指派的副标题文案修正**
> （zh/en 两行字符串），**不是越界写入**。§18.1 的原始输出已绑定修订后的
> `17eb78d6…`（68660B）。

### 18.1 命令与原始输出（全部在 §18.0 冻结点上重跑）

> **v9-T42 补记**：以下 ①–⑥ 已在 **T39/T40 之后的字节**（`lib/client.styles.js`
> `1d7fd097…`；panels 仍 `14e0887f…`）上**全部重跑**；计数不变（`node --test`
> **359 / 358 pass / 0 fail / 1 todo**，四文件 **73**）。原始输出
> `/tmp/v9-evidence/80-t42-check.txt`、`81-t42-nodetest.txt`、`82-t42-integration.txt`、
> `83-t42-render.txt`、`84-t42-newtests.txt`、`85-t42-polish.txt`。
> **历史计数**：v9-T38 为 359/358 + 73；v9-T29 为 358/357 + 73；v9-T23 为 357/356 + 72。

**① `node --check lib/*.js`（8 项逐条）** — 8/8 OK，退出 0：

```
lib/client.fields.js: OK (exit 0)
lib/client.form.js: OK (exit 0)
lib/client.js: OK (exit 0)
lib/client.panels.js: OK (exit 0)
lib/client.schema.js: OK (exit 0)
lib/client.styles.js: OK (exit 0)
lib/client.yaml.js: OK (exit 0)
lib/index.js: OK (exit 0)
```

**② `node --test`** — 358 / 357 pass / **0 fail** / 1 todo（原始尾部；v9-T29）：

```
ℹ tests 359
ℹ suites 29
ℹ pass 358
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 1
ℹ duration_ms 457.982959
```

**③ `node tests/verify.integration.mjs`** — 38/0：

```
================ VERIFICATION SUMMARY ================
checks passed : 38
checks failed : 0
unverified    : 0
======================================================
```

**④ `node tests/verify.render.mjs`** — 15/0：`--- summary: 15 passed, 0 skipped, 0 failed ---`

**⑤ `touch lib/client.js && node tests/verify.polish.mjs`** — 42/0，P5c/P8b/P10a 原文：

```
[PASS] P5c every field primitive receives a stable id; every radiogroup a name — 20 id-bearing field controls on the page (unique ids; 16 htmlFor-labelled, 4 aria-labelled, 0 primitive-labelled); 0 Switch instances (retired); 28 radiogroups named (23 compat booleans); 1 id-less search box; dangling htmlFor=0; 118 htmlFor targets; id-carrying primitives=["Button","Input"]
[OBS ] P8b tests/wiring.test.js chunk enumeration vs what the owner actually requests — wiring.test.js lists ["client.fields.js","client.form.js","client.panels.js","client.schema.js","client.styles.js","client.yaml.js"]; owner requests ["client.fields.js","client.form.js","client.panels.js","client.schema.js","client.styles.js","client.yaml.js"] -> in sync
[OBS ] P10a served client.styles.js matches the on-disk sheet for the current rev — rev=f27140dbbf39 (recomputed from stat: f27140dbbf39); served 43147B vs disk file 43086B; containsDiskFile=true; width-@media=false; .piai-row column=true; probes={"max-width: 719px":false,"grid-template-columns: 240px":false,"flex: 1 1 320px":false,"prefers-reduced-motion":true,"--dsw-alias-border-l4":true,".piai-key":true,".piai-item-head":true,".piai-item-remove":true,".piai-provider-list":true,"--dsw-focus-ring-width":true,".piai-tag":true,".piai-cred":true,".piai-tabs-bar":true,".piai-catalog":true}
--- summary: 42 passed, 0 failed ---
```

P3a（本轮）仍为 `19/23` allowlist token；P5c 仍真实开窗。P10a 判读：`served 43147B` 比磁盘
多 61B 是模块包装而非陈旧（`containsDiskFile=true` = 服务端返回体**包含**当前磁盘文件字节）；
`rev` 与 stat 重算一致（因为本步先 `touch`）。该项**只观察、不阻断**：`fresh=false` 才会
assert 失败，本轮 `fresh=true`。

**⑥ 四个新测试文件单独跑（73/73）**：

```
tests/yaml.test.js    : tests 26 / pass 26 / fail 0 / todo 0
tests/hints.test.js   : tests 13 / pass 13 / fail 0 / todo 0
tests/catalog.test.js : tests 25 / pass 25 / fail 0 / todo 0   (T26 新增 1 条候选行口径回归)
tests/raw.test.js     : tests  9 / pass  9 / fail 0 / todo 0
```

（另有 `tests/styles.test.js` 10/10，含 T36 的三条规则断言：嵌套根 `color: inherit`、
chip 规则不得声明 `color`、base chip 仍 `--dsw-alias-label-secondary`。）

### 18.2 浏览器布局证据（ego-browser，600×1200 CSS px，`/tmp/piai-layout`）

`node tests/layout/build-fixture.mjs`（重建 `/tmp/piai-layout`；**v9-T40 后的 7 页**）：

```
r1-checks.html  50210 bytes
r2-nested.html  46580 bytes
r3-disclosure.html 49219 bytes
r4-tabs.html    45802 bytes
r5-raw.html     45674 bytes
r6-catalog.html 46497 bytes
r7-bubble.html  47371 bytes
stylesheet 37316 bytes, sha256 8b1fdfb79418a8acf795ba8107674b5d07ad05283726af7ae5404e17ceda6994
primitives 210d5f8b5f942da4ee90daa4d5883bbf 8d9839ca9e38872c46c0a6d2782e33f4 f1f8bd16200f3116bacf0c735b1c53bd
```

**T39/T40 又改过样式表与夹具后 §18.2 的既有数值已复核**：我在 v9-T42 用自己的 ego-browser
重新测了**全部 7 页**（累计第 6 轮），R1–R6 的判定与像素值同 v9-T14/T19/T23/T29/T38
**逐项一致**（r1 12/12、r2 3/3、r3 7/7、r4 6/6、r5 4/4、r6 10/10，`missing:[]`；例如 tier
探针仍 `600×60`、模板 `partTops [434,460,524,600.5]`、r6 行 `spanCount 0 / gap 11`）——
T39 的 `:has()` 门控补偿 padding 没有扰动其他页，r6 的 `scopePadding` 仍 `0/0/0/0`、
`scopeGateMatches` 全 false。**r7 现在 13/13**（12 条 + `probeStructure`），新增
`bubbleInsetUniform` / `bubbleInsetGrew` / `modalWrapperUnaffected` / `modalGateDoesNotMatch`。
原始输出与 7 页完整 `RAW`：`/tmp/v9-evidence/87-t42-browser.txt`。

**重建确定性（v9-T42 复核）**：分别构建到 `/tmp/piai-layout` 与 `/tmp/piai-layout-alt`，
`diff -r` 输出为空（逐字节相同）。聚合 md5 与各轮报告值的差异见 §18.0 备注；
确定性证据以 `diff -r` 为准。

> **F4 已修（v9-T13 → … → v9-T40）**：`tests/layout/README.md` 现记录**当前** build 的真实
> sha `8b1fdfb7…`（37316B，v9-T40 的 7 页，含 Tooltip 快照）；更早的若干 sha 只作为历史说明
> 保留；R1/R4/R6/R7 准则状态均为实测（见下）。README 属 `tests/`（非本轮写范围），我只复核未改。

#### R1（`r1-checks.html`）——**F1 已修，12/12 实测**

> **F1 已修（v9-T13）**：`tests/layout/measure-in-page.js` 不再用
> `.piai-row[data-probe="tier"]`，改为 `probeEl('tier')`（真实
> `.piai-tier[data-probe="tier"]`），并加 `need()`/`q()` 把缺节点记进
> `measurements.missing`、由 `checks.probeStructure` 判死，**不再整页抛错**。
> **本轮独立复核（v9-T14）**：新表达式在该页返回 `probeStructure:true`、
> `missing:[]`、`pass:true`；探针身份实测 `{tagName:"DIV", className:"piai-tier", innerRow:true}`；
> 反向对照（把 :83 还原成修复前写法）在同一页仍抛
> `TypeError: Cannot read properties of null (reading 'querySelector')`。

R1 实测（ego-browser 页内 `evaluate`，600×1200，**12/12 pass**）：

| 准则（新） | 原始值 | 判定 |
| --- | --- | --- |
| `checkbox16` | `16×16`, `16×16` | ✓ |
| `optionSpansVisible` | `80.84px`「文本（text）」/`95.43px`「图片（image）」 | ✓ |
| `adjacentLabelGap16` | `16` | ✓ |
| `textInputFillsRow` | wrap `600` vs control `600` → delta `0` | ✓ |
| `selectInput16` | 7 个 `.piai-select input` 全 `16×16` | ✓ |
| `boolRadios16` / `boolLabelsVisible` | 3×`16×16`；spans `26`「开启」/`26`「关闭」/`91`「默认（未设置）」，同一 top | ✓ |
| `tierInputFillsRow` | `.piai-tier` 探针 `600×60`，其 `.piai-row` 同矩形；control `600` == wrap `600` → delta `0` | ✓ |
| `tierInfoVisible` | ⓘ `24×24` @ `x 47.45`（svg `12×12`） | ✓ |
| `templateRowReadable` | 4 部件全 `visible`：key `583×18`、mode `583×19.5`、value `566×24`、delete `583×27.5`、null `583×32`；均落在卡片 `left 8.5 → right 591.5` 内；模式标签「字面值」「$var 变量」宽度 > 20 | ✓ |
| `templatePartOrder` | DOM 序 `[0, 1, 12, 14]`（严格递增）＝键名→模式→值→删除 | ✓ |
| `probeStructure` | `missing: []` | ✓ |

新准则的完整原始返回值（`RAW` 整行，原样）：

```
RAW {"probe":"r1","viewport":{"width":600,"height":1200},"measurements":{"checkboxInputs":[{"x":0,"y":188.5,"width":16,"height":16,"left":0,"right":16,"top":188.5,"bottom":204.5},{"x":116.84,"y":188.5,"width":16,"height":16,"left":116.84,"right":132.84,"top":188.5,"bottom":204.5}],"optionSpans":[{"text":"文本（text）","x":20,"y":186.5,"width":80.84,"height":20,"left":20,"right":100.84,"top":186.5,"bottom":206.5},{"text":"图片（image）","x":136.84,"y":186.5,"width":95.43,"height":20,"left":136.84,"right":232.27,"top":186.5,"bottom":206.5}],"adjacentLabelGap":16,"textInput":{"controlContentWidth":600,"wrap":{"x":0,"y":120.5,"width":600,"height":32,"left":0,"right":600,"top":120.5,"bottom":152.5},"delta":0},"selectInputs":[{"x":0,"y":242.25,"width":16,"height":16,"left":0,"right":16,"top":242.25,"bottom":258.25},{"x":49,"y":242.25,"width":16,"height":16,"left":49,"right":65,"top":242.25,"bottom":258.25},{"x":0,"y":301.75,"width":16,"height":16,"left":0,"right":16,"top":301.75,"bottom":317.75},{"x":62,"y":301.75,"width":16,"height":16,"left":62,"right":78,"top":301.75,"bottom":317.75},{"x":124,"y":301.75,"width":16,"height":16,"left":124,"right":140,"top":301.75,"bottom":317.75},{"x":8.5,"y":461.75,"width":16,"height":16,"left":8.5,"right":24.5,"top":461.75,"bottom":477.75},{"x":83.5,"y":461.75,"width":16,"height":16,"left":83.5,"right":99.5,"top":461.75,"bottom":477.75}],"bool":{"group":{"x":0,"y":300,"width":235,"height":19.5,"left":0,"right":235,"top":300,"bottom":319.5},"inputs":[{"x":0,"y":301.75,"width":16,"height":16,"left":0,"right":16,"top":301.75,"bottom":317.75},{"x":62,"y":301.75,"width":16,"height":16,"left":62,"right":78,"top":301.75,"bottom":317.75},{"x":124,"y":301.75,"width":16,"height":16,"left":124,"right":140,"top":301.75,"bottom":317.75}],"spans":[{"text":"开启","x":20,"y":300,"width":26,"height":19.5,"left":20,"right":46,"top":300,"bottom":319.5},{"text":"关闭","x":82,"y":300,"width":26,"height":19.5,"left":82,"right":108,"top":300,"bottom":319.5},{"text":"默认（未设置）","x":144,"y":300,"width":91,"height":19.5,"left":144,"right":235,"top":300,"bottom":319.5}]},"tier":{"probe":{"x":0,"y":331.5,"width":600,"height":60,"left":0,"right":600,"top":331.5,"bottom":391.5},"row":{"x":0,"y":331.5,"width":600,"height":60,"left":0,"right":600,"top":331.5,"bottom":391.5},"controlContentWidth":600,"wrap":{"x":0,"y":359.5,"width":600,"height":32,"left":0,"right":600,"top":359.5,"bottom":391.5},"delta":0,"info":{"x":47.45,"y":331.5,"width":24,"height":24,"left":47.45,"right":71.45,"top":331.5,"bottom":355.5}},"template":{"row":{"x":0,"y":425.5,"width":600,"height":211,"left":0,"right":600,"top":425.5,"bottom":636.5},"parts":[{"name":"key","rect":{"x":8.5,"y":434,"width":583,"height":18,"left":8.5,"right":591.5,"top":434,"bottom":452}},{"name":"mode","rect":{"x":8.5,"y":460,"width":583,"height":19.5,"left":8.5,"right":591.5,"top":460,"bottom":479.5}},{"name":"value","rect":{"x":17,"y":524,"width":566,"height":24,"left":17,"right":583,"top":524,"bottom":548}},{"name":"delete","rect":{"x":8.5,"y":600.5,"width":583,"height":27.5,"left":8.5,"right":591.5,"top":600.5,"bottom":628}}],"partTops":[434,460,524,600.5],"distinctRows":4,"order":[0,1,12,14],"modeLabels":["字面值","$var 变量"],"modeInputs":[{"x":8.5,"y":461.75,"width":16,"height":16,"left":8.5,"right":24.5,"top":461.75,"bottom":477.75},{"x":83.5,"y":461.75,"width":16,"height":16,"left":83.5,"right":99.5,"top":461.75,"bottom":477.75}],"info":{"x":8.5,"y":487.5,"width":24,"height":24,"left":8.5,"right":32.5,"top":487.5,"bottom":511.5},"nullButton":{"x":8.5,"y":560.5,"width":583,"height":32,"left":8.5,"right":591.5,"top":560.5,"bottom":592.5},"valueInput":{"x":17,"y":524,"width":566,"height":24,"left":17,"right":583,"top":524,"bottom":548}},"missing":[]},"checks":{"checkbox16":true,"optionSpansVisible":true,"adjacentLabelGap16":true,"textInputFillsRow":true,"selectInput16":true,"boolRadios16":true,"boolLabelsVisible":true,"tierInputFillsRow":true,"tierInfoVisible":true,"templateRowReadable":true,"templatePartOrder":true,"probeStructure":true},"pass":true}
```

探针身份与反向对照原文：

```
TIER_PROBE {"tagName":"DIV","className":"piai-tier","innerRow":true,"hasDeletePart":true}
NEGCTL preT13 throws: Error: JavaScript evaluation failed at line 82, column 31: TypeError: Cannot read properties of null (reading 'querySelector')
```

**F2 已裁决**：`templateRowOnOneLine` 已删除；`.piai-dict-row` 是竖排卡片
（`flex-direction: column`，`docs/interaction-design.md:706/:893`），模板行实测
`partTops [434,460,524,600.5]`、`distinctRows 4`，这是**设计**而非缺陷。

**F3 已修**：R4 的 `barIsOneLine`（top 差 ≤1）已被 `barIsOneRow`（垂直 overlap > 0 且底边一致）
+ `actionsFlushRight` + `actionSlotDoesNotWrap` 取代，见下。

<details>
<summary>v9-T10（夹具修复前）对照证据</summary>

修复前的 R1 原始 JSON（当时 stock 表达式直接抛错，用 `/tmp` 修正副本测得）：

```
MEASURE {"probe":"r1","viewport":{"width":600,"height":1200},"checks":{"checkbox16":true,"optionSpansVisible":true,"adjacentLabelGap16":true,"textInputFillsRow":true,"selectInput16":true,"boolRadios16":true,"boolLabelsVisible":true,"tierInputFillsRow":true,"tierInfoVisible":true,"templateRowOnOneLine":false},"pass":false}
```

验证者追加探针原文（`EXTRA` 整行，原样）：

```
EXTRA   {"probe":"r1","tier":{"label":{"text":"off 档位","x":0,"y":334.5,"w":43.45,"h":18,"left":0,"right":43.45,"top":334.5,"bottom":352.5,"cy":343.5,"clip":{"scrollWidth":43,"clientWidth":43,"clipped":false}},"info":{"x":47.45,"y":331.5,"w":24,"h":24,"left":47.45,"right":71.45,"top":331.5,"bottom":355.5,"cy":343.5},"infoSvg":{"x":53.45,"y":337.5,"w":12,"h":12,"left":53.45,"right":65.45,"top":337.5,"bottom":349.5,"cy":343.5},"input":{"x":8.5,"y":363.5,"w":583,"h":24,"left":8.5,"right":591.5,"top":363.5,"bottom":387.5,"cy":375.5},"labelRightVsInfoLeft":4,"labelAndInfoSameLine":false,"labelBottomVsInputTop":11,"labelAndInputSameLine":false,"inputSameLineAsInfo":false},"bool":{"group":{"x":0,"y":300,"w":235,"h":19.5,"left":0,"right":235,"top":300,"bottom":319.5,"cy":309.75},"groupClip":{"scrollWidth":235,"clientWidth":235,"clipped":false},"inputs":[{"x":0,"y":301.75,"w":16,"h":16,"left":0,"right":16,"top":301.75,"bottom":317.75,"cy":309.75},{"x":62,"y":301.75,"w":16,"h":16,"left":62,"right":78,"top":301.75,"bottom":317.75,"cy":309.75},{"x":124,"y":301.75,"w":16,"h":16,"left":124,"right":140,"top":301.75,"bottom":317.75,"cy":309.75}],"inputs16":["16x16","16x16","16x16"],"spans":[{"text":"开启","x":20,"y":300,"w":26,"h":19.5,"left":20,"right":46,"top":300,"bottom":319.5,"cy":309.75,"clip":{"scrollWidth":26,"clientWidth":26,"clipped":false}},{"text":"关闭","x":82,"y":300,"w":26,"h":19.5,"left":82,"right":108,"top":300,"bottom":319.5,"cy":309.75,"clip":{"scrollWidth":26,"clientWidth":26,"clipped":false}},{"text":"默认（未设置）","x":144,"y":300,"w":91,"h":19.5,"left":144,"right":235,"top":300,"bottom":319.5,"cy":309.75,"clip":{"scrollWidth":91,"clientWidth":91,"clipped":false}}],"spansOnOneLine":true,"lastSpanRightVsGroupRight":0,"labelsInsideGroup":true},"template":{"row":{"x":0,"y":425.5,"w":600,"h":175.5,"left":0,"right":600,"top":425.5,"bottom":601,"cy":513.25},"rowClip":{"scrollWidth":599,"clientWidth":599,"clipped":false},"childrenCount":5,"key":{"text":"sys","x":8.5,"y":434,"w":583,"h":18,"left":8.5,"right":591.5,"top":434,"bottom":452,"cy":443,"clip":{"scrollWidth":583,"clientWidth":583,"clipped":false}},"radios":[{"x":8.5,"y":461.75,"w":16,"h":16,"left":8.5,"right":24.5,"top":461.75,"bottom":477.75,"cy":469.75},{"x":83.5,"y":461.75,"w":16,"h":16,"left":83.5,"right":99.5,"top":461.75,"bottom":477.75,"cy":469.75}],"radioLabels":[{"text":"字面值","x":28.5,"y":460,"w":39,"h":19.5,"left":28.5,"right":67.5,"top":460,"bottom":479.5,"cy":469.75,"clip":{"scrollWidth":39,"clientWidth":39,"clipped":false}},{"text":"$var 变量","x":103.5,"y":460,"w":56.41,"h":19.5,"left":103.5,"right":159.91,"top":460,"bottom":479.5,"cy":469.75,"clip":{"scrollWidth":56,"clientWidth":56,"clipped":false}}],"radiosOnOneLine":true,"info":{"x":8.5,"y":487.5,"w":24,"h":24,"left":8.5,"right":32.5,"top":487.5,"bottom":511.5,"cy":499.5},"wrap":{"x":8.5,"y":519.5,"w":583,"h":33,"left":8.5,"right":591.5,"top":519.5,"bottom":552.5,"cy":536},"input":{"x":17,"y":524,"w":566,"h":24,"left":17,"right":583,"top":524,"bottom":548,"cy":536},"nullButton":{"text":"null","x":8.5,"y":560.5,"w":583,"h":32,"left":8.5,"right":591.5,"top":560.5,"bottom":592.5,"cy":576.5,"clip":{"scrollWidth":582,"clientWidth":582,"clipped":false}},"distinctRows":[434,460,488,520,561],"contentBottomVsRowBottom":8.5,"allChildrenOnOneLine":false}}
```

说明：`labelAndInfoSameLine:false` 是**按 top 判定**的探针结果（label top `334.5` vs ⓘ top
`331.5`，差 3px）；两者**中线相同**（`cy` 均为 `343.5`），ⓘ 是 24px 命中区包 12px 图标，
所以视觉上同行。该追加探针脚本（`/tmp/v9-evidence/extra-probes.js`）随 v9-T10 结束而废弃，
保留仅作前后对照。

截图（v9-T10）：`/tmp/v9-evidence/shots/r1-checks.png`。

</details>

**v9-T14 复测截图**：`/tmp/v9-t14-r1-checks.png`（同一文件另存为
`/tmp/v9-evidence/shots/t14-r1-checks.png`）——「off 档位」label 未被压 0 宽、ⓘ 可见、input
整行；布尔三项同行；模板块为竖排卡片（键名→模式→值→null→删除）。

#### R2 / R3（回归，未改动面；v9-T14 复测）

```
R2 RAW {"probe":"r2","viewport":{"width":600,"height":1200},"measurements":{"nested":{"borderLeftWidth":"0px","paddingLeft":"0px","rect":{"x":0,"y":148,"width":600,"height":80,"left":0,"right":600,"top":148,"bottom":228}},"nestedTitle":{"text":"按档位表设置的参数","x":0,"y":148,"width":600,"height":18,"left":0,"right":600,"top":148,"bottom":166}},"missing":[]},"checks":{"nestedNoRail":true,"nestedTitle":true,"probeStructure":true},"pass":true}
   → 3/3（含 probeStructure；不含它则 2/2，与 v9-T13 的计数一致）
R3 RAW checks {"noCountBadge":true,"sixPermanentBodies":true,"collapsedBodiesHaveNoBox":true,"bodyContentAligned":true,"collapsedChevrons14":true,"ariaControlsResolve":true,"probeStructure":true},"pass":true,"missing":[]
   → 7/7（含 probeStructure；不含则 6/6）
   原始值：countBadges 0；6 个 body（1 个 `582×54` 展开 + 5 个 `0×0` hidden）；对齐 `27==27`（delta 0）；5 个箭头 `14×14`；6 个 id 互异且全解析
```

#### R4（`r4-tabs.html`）——两栏，**F3 已修后 6/6 实测**

```
RAW {"probe":"r4","viewport":{"width":600,"height":1200},"measurements":{"bar":{"bar":{"x":0,"y":98.5,"width":600,"height":38.5,"left":0,"right":600,"top":98.5,"bottom":137},"list":{"x":0,"y":100.5,"width":149.83,"height":36.5,"left":0,"right":149.83,"top":100.5,"bottom":137},"actions":{"x":536,"y":109.5,"width":64,"height":27.5,"left":536,"right":600,"top":109.5,"bottom":137},"action":{"x":536,"y":109.5,"width":64,"height":27.5,"left":536,"right":600,"top":109.5,"bottom":137},"overlap":27.5,"bottomDelta":0,"actionRightGap":0},"missing":[]},"checks":{"barIsOneRow":true,"actionsRightOfList":true,"actionsFlushRight":true,"actionVisible":true,"actionSlotDoesNotWrap":true,"probeStructure":true},"pass":true}
   → 6/6（含 probeStructure；不含则 5/5）
```

| 准则（新） | 原始值 | 判定 |
| --- | --- | --- |
| `barIsOneRow`（垂直 overlap > 0 且底边差 ≤1） | overlap `27.5`、`bottomDelta 0`（top：list `100.5` vs actions `109.5`，**允许不同**，`align-items:flex-end` 基线对齐） | ✓ |
| `actionsRightOfList` | `actions.left 536` ≥ `list.right 149.83 − 1` | ✓ |
| `actionsFlushRight` | `bar.right 600 − actions.right 600` = `0` | ✓ |
| `actionVisible` | 按钮 `64×27.5` | ✓ |
| `actionSlotDoesNotWrap` | 槽高 `27.5` ≤ 按钮高 `27.5 + 2` | ✓ |

F3 的处置：旧的 `barIsOneLine`（top 差 ≤1）会对正确布局误报红，已删除；新准则与
`lib/client.styles.js` 的 `.piai-tabs-bar { align-items: flex-end }` 一致。
截图：`/tmp/v9-t14-r4-tabs.png`（＝`/tmp/v9-evidence/shots/t14-r4-tabs.png`）。

#### 原代码视图 —— **partial（v9-T13 新增 `r5-raw.html`，只覆盖回退形状）**

可追溯的间接证据：`lib/client.js`（owner） `h(CodeBlock, {code, lang:'yaml', lineNumbers:true})`；
`lib/client.js`（owner） dirty 时插入 `.piai-hint`（`t('rawNotice')`）；
`tests/raw.test.js:523-524`（CodeBlock 必须在）（「含未保存的修改」）；
R4 里「原代码」按钮已实测可见（`64×27.5`，贴右）。

v9-T13 新增 `r5-raw.html`，**但只画了文档化的回退形状** `<pre class="piai-expr-body">`
（`CodeBlock` 原语的 DOM/CSS 未快照），因此只验证只读外壳（notice + 可滚动代码体）：

```
RAW {"probe":"r5","viewport":{"width":600,"height":1200},"measurements":{"raw":{"body":{"x":0,"y":96.5,"width":600,"height":240,"left":0,"right":600,"top":96.5,"bottom":336.5},"notice":{"text":"只读预览：以下是当前草稿的完整 llm-pi-ai 配置，含未保存的修改。","x":0,"y":98.5,"width":600,"height":18,"left":0,"right":600,"top":98.5,"bottom":116.5},"code":{"x":0,"y":144.5,"width":600,"height":180,"left":0,"right":600,"top":144.5,"bottom":324.5},"codeScroll":{"scrollWidth":598,"clientWidth":598}},"missing":[]},"checks":{"rawNoticeVisible":true,"rawCodeVisible":true,"rawCodeContained":true,"probeStructure":true},"pass":true}
   → 4/4（含 probeStructure；不含则 3/3，与 v9-T13 的计数一致）
```

| 准则 | 原始值 | 判定 |
| --- | --- | --- |
| `rawNoticeVisible` | 「只读预览：…含未保存的修改。」`600×18` | ✓ |
| `rawCodeVisible` | `pre.piai-expr-body` `600×180` | ✓ |
| `rawCodeContained` | `code.right 600` ≤ `body.right 600`；`scrollWidth 598 == clientWidth 598` | ✓ |

**不得升级为 verified**：`CodeBlock` 原语的真实几何（行号列、复制按钮、shiki 高亮）
仍无证据；判定 **partial**，替代证据只有上面的回退形状 + DOM 层
`tests/raw.test.js`。补齐方式：真实 GUI（A13）或给 `tests/layout/primitives/` 增补
`CodeBlock.module.css` 快照 + 真实 DOM 夹具。

#### 模型目录选择器 Modal —— **verified（v9-T17 夹具 `r6-catalog.html` + 负对照；v9-T29 口径修正后复测）**

**v9-T29 独立复测（ego-browser，600×1200）**：r6 正向 **10/10**
（9 条 `portalCatalog*` + `probeStructure`），`pass:true`、`missing:[]`。r6 画的是真实 portal
**结构**（`.fixture-shell`（非 `.piai-root`）→ `.dialog` → **内层 `.piai-root`** → 工具栏 +
`.piai-catalog`）。**候选行现在只显示原始 id**（T25 口径，官方 `PICKER:874-878`），
准则名随之改为 `portalCatalogCheckboxIdGap8`（checkbox→id 间距 ≥7.5）与
`portalCatalogIdSingleLine`（无额外 span、可见文本 === id、chip 自身不溢出）。
原始 `RAW`（节选逐行字段）：

```
RAW …"rows":[
 {"visibleText":"…0123456789abcdef0123456789abcdef","id":"…0123456789abcdef0123456789abcdef","title":"Deepseek V4 Flash Preview","spanCount":0,"code":{"width":534.63},"codeScrollWidth":535,"codeClientWidth":535,"gap":11},
 {"visibleText":"deepseek-v4-pro","id":"deepseek-v4-pro","title":"deepseek-v4-pro","spanCount":0,"code":{"width":108.38},"codeScrollWidth":108,"codeClientWidth":108,"gap":11},
 {"visibleText":"…0123456789abcdef01","id":"…0123456789abcdef01","title":"…0123456789abcdef01","spanCount":0,"code":{"width":433.48},"gap":11},
 {"visibleText":"gpt-x","id":"gpt-x","title":"GPT X","spanCount":0,"code":{"width":36.13},"gap":11}],
 "portalCatalogDiagnostics":{"listComputed":{"display":"flex","flexDirection":"column","gap":"4px","overflow":"auto"},
  "rowComputed":{"display":"flex","flexDirection":"row","gap":"8px","alignItems":"center"},
  "firstRowId":"…","firstRowTitle":"Deepseek V4 Flash Preview","firstRowSpanCount":0,"firstRowGap":11,"firstRowOverflow":0},
 "checks":{"portalCatalogScoped":true,"portalCatalogSearch":true,"portalCatalogRows":true,
  "portalCatalogRowsSingleLine":true,"portalCatalogNoOverflow":true,"portalCatalogInput16":true,
  "portalCatalogCheckboxIdGap8":true,"portalCatalogIdSingleLine":true,"portalCatalogStacked":true,
  "probeStructure":true},"pass":true}
R6_POSITIVE {"shellTag":"DIV.fixture-shell","scopeTag":"DIV.piai-root","rootCount":1,
  "catalogDisplay":"flex","catalogFlexDirection":"column","catalogGap":"4px",
  "rowDisplay":"flex","rowGap":"8px","rowAlign":"center","inputBox":"16x16","gap":8}
```

判读：4 行 `spanCount` 全 **0**、`visibleText === id`、`title` 分别
`Deepseek V4 Flash Preview` / `deepseek-v4-pro` / 长 id 本身 / `GPT X`（**name → id 回退**）；
checkbox→id 实测间距 **11px** = label flex `gap 8` + UA checkbox `margin-right 3`；
`codeScrollWidth == codeClientWidth`（535/108/433/36）→ chip 自身不溢出。
（T25 之前 `gap` 量的还是 id→名称，且每行多一个 `span`。）

**负对照（我自己动手解包内层 wrapper）**：`parent.insertBefore` 全部子节点后删除
`.piai-root`——这正是修复前的真实条件（portal 内容没有 `.piai-root` 祖先）：

```
R6_UNWRAP unwrapped
R6_NEG_CHECKS 0/10 pass=false missing=["nested .piai-root wrapper (T16 scope re-entry)","portal toolbar","portal search input","portal .piai-catalog list"]
R6_NEG_DIAGNOSTICS {"listDisplay":"block","listGap":"normal","rowDisplay":"inline","rowGap":"normal",
  "firstRowInput":{"width":13,"height":13},"firstRowGap":3,"firstRowOverflow":0,
  "firstRowText":"deepseek-v4-flash-preview-0123456789abcdef0123456789abcd"}
```

负对照直接复现用户截图里的粘连形态：`display:inline` + `gap 0` →
`deepseek-v4-flash-preview-0123456789abcdef…Deepseek V4 Flash Preview` 糊在一起、
复选框退回原语 `13×13`、9 条准则全 false。**该夹具因此被证明能检出本缺陷**，
catalog Modal 判定升级为 **verified**。截图：`/tmp/v9-t19-r6-catalog.png`（正向）、
`/tmp/v9-t19-r6-negative.png`（负向，与用户复现一致）。

**40vh 上限的独立证据（v9-T10 自建探针，与 r6 相互独立）**：同一份真实 STYLESHEET、
40 行候选：

```
viewport 600×1200，40vh = 480；40 行候选
.piai-catalog computed max-height: 480px；元素 rect 高 480（上限生效）
40 个候选 id 全部 getClientRects().length === 1（单行）
运行 A（含 1 个 74 字符 id，520.17px）：仍单行、右缘 563.67 < 列表右缘 572.5；
  scrollWidth 551 > clientWidth 545（+6px）→ 出横向滚动条，clientHeight 被压到 465；
  scrollHeight 1036 > clientHeight 465 → 纵向可滚动
运行 B（把该 id 改回常规长度后重测）：scrollWidth 545 == clientWidth 545（无横向溢出），
  clientHeight 480；40 个 id 宽度 79.48px
描述 span：text-overflow ellipsis，全部在列表内
搜索框：aria-label「搜索模型」，id 为 null（见 §18.5(b)）
```

原始输出：`/tmp/v9-evidence/09-catalog.txt`（运行 A）、`/tmp/v9-evidence/11-catalog-longid.txt`（A→B 对照）。
截图：`/tmp/v9-evidence/shots/catalog-probe.png`（运行 A：可见纵向滚动条 = 40vh 上限生效，
长 id 在右缘被截）。
判定：40vh 上限与「id 单行」**verified**（r6 夹具 + 上述独立探针）；
「极端长 id 会出现 +6px 横向滚动」是 `code{flex:none}` 的既定行为（F5，信息级）。

**残留（不得外推）**：夹具仍**不含**原语 `Modal` 的真实 DOM/CSS（`Modal.module.css` 未快照），
r6 复刻的是 portal **作用域结构**；Modal 的遮罩/居中/滚动容器本身未测。

> **逃逸复盘（必须留档）**：v9-T10 曾把本项判为 **partial**，替代证据是自建 DOM + 真实
> 样式表——但那个自建页把内容放在 `.piai-root` 里，**恰好绕过了 portal 这一真实条件**，
> 于是缺陷逃逸到用户 GUI。教训：替代证据必须覆盖「与真实运行环境不同的那一维」
> （这里是**作用域祖先**），否则 partial 不能当作"结构已验证"的挡箭牌。

#### Tooltip 气泡（`r7-bubble.html`）—— **verified（几何 + 文字对比度 + 四边内边距；含四条独立负对照）**

气泡的**几何、可读性与内边距**（v9-T42 自己复测，ego-browser 600×1200）：r7 正向 **13/13**
（`bubbleWrapperScoped`/`bubbleKeyChipStyled`/`bubbleTextInheritsSurface`/`bubbleBodyContrast`/
`bubbleChipContrast`/`bubbleInsetUniform`/`bubbleInsetGrew`/`modalWrapperUnaffected`/
`modalGateDoesNotMatch`/`bubbleLinesStacked`/`bubbleLineGapAtLeast1`/`bubbleNegativeIsUnstyled`
+ `probeStructure`），`pass:true`、`missing:[]`。**T40 起该页的 `.bubble` 是原语真实快照
`Tooltip.module.css`（不再是内联模拟）**，DOM 也是真实链 `span.bubble > span.label >
span.piai-root`（见 §18.12 的边界说明）。

```
RAW …"bubble":{"positive":{"scope":{"x":31,"y":93,"width":360,"height":172},"wrapper":{"display":"flex","flexDirection":"column","gap":"4px","color":"rgb(230, 236, 245)","paddingLeft":"8px"},"scopedStack":true,
  "chip":{"color":"rgb(78, 89, 105)","backgroundColor":"rgb(244, 245, 247)","borderRadius":"6px","paddingLeft":"4px","alignSelf":"flex-start"},
  "chipBox":{"width":218.52,"height":19},"lineColors":["rgb(230, 236, 245)","rgb(230, 236, 245)","rgb(230, 236, 245)"],
  "tops":[105,128,171,214],"adjacentGaps":[4,4,4],"stacked":true,"disjoint":true},
 "negative":{"wrapper":{"display":"block","gap":"normal","color":"rgb(230, 236, 245)","paddingLeft":"0px"},"scopedStack":false,
  "chip":{"color":"rgb(230, 236, 245)","backgroundColor":"rgba(0, 0, 0, 0)","borderRadius":"0px","paddingLeft":"0px","alignSelf":"auto"},
  "tops":[335.5,333.5,353.5,373.5],"adjacentGaps":[-17,-18.5,-18.5],"stacked":false,"disjoint":false},
 "aliasColor":"rgb(21, 26, 35)","surfaceColor":"rgb(230, 236, 245)","bubbleBackground":"rgb(35, 42, 54)",
 "contrast":{"body":{"foreground":"rgb(230, 236, 245)","background":"rgb(35, 42, 54)","luminance":{"foreground":0.8340647179711792,"background":0.022795953894607847},"ratio":12.14},
             "chip":{"foreground":"rgb(78, 89, 105)","background":"rgb(244, 245, 247)","luminance":{"foreground":0.09784379216558951,"background":0.9125331254129174},"ratio":6.51}}},
 "bubbleInset":{"positive":{"top":15,"right":15,"bottom":15,"left":15},"primitives":{"top":3,"right":7,"bottom":3,"left":7},"spread":0,
   "bubbleComputed":{"position":"fixed","padding":{"top":"3px","right":"7px","bottom":"3px","left":"7px"},"maxWidth":"360px","width":"360px","color":"rgb(230, 236, 245)","backgroundColor":"rgb(35, 42, 54)","borderRadius":"6px","animationName":"none","visibility":"visible"},
   "modal":{"inset":{"top":0,"right":0,"bottom":0,"left":0},"padding":{"top":"0px","right":"0px","bottom":"0px","left":"0px"},"dialogPadding":{"top":"16px","right":"16px","bottom":"16px","left":"16px"},
            "gateSelectors":[".piai-root .piai-root:has(> .piai-key)",".piai-root:not(.piai-page):has(> .piai-key)",".piai-root .piai-root:has(> span)",".piai-root:not(.piai-page):has(> span)"],
            "gateMatches":[false,false,false,false],"wrapperGateMatches":[false,true,false,true]}}},
 "checks":{"bubbleWrapperScoped":true,"bubbleKeyChipStyled":true,"bubbleTextInheritsSurface":true,
  "bubbleBodyContrast":true,"bubbleChipContrast":true,"bubbleInsetUniform":true,"bubbleInsetGrew":true,
  "modalWrapperUnaffected":true,"modalGateDoesNotMatch":true,"bubbleLinesStacked":true,
  "bubbleLineGapAtLeast1":true,"bubbleNegativeIsUnstyled":true,"probeStructure":true},"pass":true}
```

| 准则 | 正向原始值 | 负向（未包裹分支，v9-T20 前的形状） |
| --- | --- | --- |
| `bubbleWrapperScoped` | `display:flex / column / gap 4px` | `display:inline / gap normal` → false |
| `bubbleKeyChipStyled` | 背景 `rgb(244,245,247)`、radius `6px`、`padding-left 4px`、`align-self:flex-start`、chip 宽 `218.52 < 600` | 背景 `rgba(0,0,0,0)`、radius `0px`、`padding-left 0px`、`align-self:auto` → false |
| `bubbleTextInheritsSurface` | wrapper 与 3 条 span 的 `color` 全 = surface `rgb(230,236,245)`，且 **≠** 主题 alias `rgb(21,26,35)` | inline 分支同样等于 surface（T31 的效果），但几何/`scopedStack` 已 false |
| `bubbleBodyContrast` | 正文 `rgb(230,236,245)`（lum `0.8341`）vs 气泡底 `rgb(35,42,54)`（lum `0.0228`）= **12.14:1** | 见下方负对照 A（1.21:1） |
| `bubbleChipContrast` | chip 文字 `rgb(78,89,105)`（lum `0.0978`）vs chip 自身底 `rgb(244,245,247)`（lum `0.9125`）= **6.51:1** | 见下方负对照 B（1.09:1） |
| `bubbleLinesStacked` | tops `[105,128,171,214]` 严格递增、无重叠 | tops `[335.5,333.5,353.5,373.5]` 非递增、`disjoint:false` → false |
| `bubbleLineGapAtLeast1` | 相邻间隔 `[4,4,4]` | `[-17,-18.5,-18.5]` → false |
| `bubbleInsetUniform` | `.bubble` 边框盒 → wrapper 内容盒：**`15/15/15/15`**，`spread 0`，每边 ≥12 | 同左但 `scopedStack:false`（该准则只看正向，见负对照 A） |
| `bubbleInsetGrew` | 四边 `15 > 原语最宽边 7` | 负对照 A 下 `3/7/3/7` → false |
| `modalWrapperUnaffected` | Modal 形 `.piai-root` padding `0/0/0/0`，其内容盒与 dialog 内容盒偏移 `top 0 / left 0`（dialog 自带 16px 不受影响） | 负对照 B（去掉 `:has()`）→ `12/8/12/8`、偏移 `top 12 / left 8` → false |
| `modalGateDoesNotMatch` | 4 条门控 selector 对 Modal 全 `false`，对气泡 wrapper `[false,true,false,true]`（非空转） | — |

**两条独立负对照（我自己在页内做的，非引用）**：用自己的 WCAG 亮度/对比度实现重算
（`/tmp/v9-evidence/t38-contrast.js`），每次只改一处、随后恢复：

| 负对照 | 注入 | 正文对比度 | chip 对比度 | 结论 |
| --- | --- | --- | --- | --- |
| **A：嵌套根不再 inherit** | `wrapper.style.color = 主题 alias`（`rgb(21,26,35)`，lum `0.0102`） | **1.21:1**（1.2093）→ **false** | 6.51:1 不变 | 只打掉正文那一半 |
| **B：chip 注入 inherit** | `chip.style.color = 'inherit'` → 解析为 surface `rgb(230,236,245)` | 12.14:1 不变 | **1.09:1**（1.0887）→ **false** | 只打掉 chip 那一半 |
| 恢复后 | 移除内联覆盖 | 12.14:1 | 6.51:1 | 页面未被永久改动 |

**两条内边距负对照（v9-T42，我自己用 CSSOM 做的、可逆）**：

| 负对照 | 注入 | 气泡四边 inset | Modal wrapper padding | 结论 |
| --- | --- | --- | --- | --- |
| **A′：中和 T39 规则** | 把该规则 `selectorText` 改成 `[data-t42-off]`（匹配不到任何元素） | **`3/7/3/7`**、`spread 4` → `bubbleInsetUniform=false`、`bubbleInsetGrew=false` | `0/0/0/0` 不变 | 只打掉气泡那一半 |
| **B′：去掉 `:has()` 门控** | 同一规则 `selectorText` 去掉 `:has(...)` | 仍 **`15/15/15/15`** | **`12/8/12/8`**，内容盒相对 dialog 偏移 `top 12 / left 8` → `modalWrapperUnaffected=false` | 只打掉 Modal 那一半 |
| 恢复后 | 还原 `selectorText` | `15/15/15/15` | `0/0/0/0` | 页面未被永久改动 |

> **过程注（我自己的负对照翻车与修正）**：第一版 A′ 我把 `' [data-t42-off]'` **追加到整条
> selector 列表**上，CSS 只把这个后半段绑到列表的**最后一项**，前三个选择器仍然命中 →
> 中和失败（padding 仍是 12/8，看起来"负对照没有效果"）。改成 `selectorText =
> '[data-t42-off]'` 后才真正不匹配（`PROOF` 行：中和前 wrapper padding `12px 8px` → 中和后
> `0px` → 还原后 `12px 8px`）。教训：负对照必须自证「注入后目标确实不再匹配」，
> 否则它证明的是"我的注入没生效"，不是"夹具能判别"。

原始输出 `/tmp/v9-evidence/77-t38-browser.txt`（`CONTRAST …` 行含 aliases、lum 与四次色值
快照）、`/tmp/v9-evidence/88-t42-inset-fixed.txt`（`INSET_FIXED …` + `PROOF …`）。

**两条微观证据（我自己在页内做的）**：

1. **配对选择器哪一半在起作用**：r7 的 bare 页里，嵌套根的祖先链是
   `SPAN.piai-root > DIV.portal-host > DIV.fixture-shell > BODY > HTML` —— **没有 `.piai-root`
   祖先**，实测 `matches('.piai-root .piai-root') = false`、`matches('.piai-root:not(.piai-page)') = true`。
   也就是说：真实 portal 形状下**只有 `:not(.piai-page)` 那一半会命中**，
   `lib/client.styles.js` 里每条规则都成对书写是**必需**的，只写后代组合器等于没写。
   原始输出 `/tmp/v9-evidence/58-t23-microchecks.txt`。
2. **companion 规则（`.piai-item-actions{margin-left:0;align-self:stretch}`）的必要性**：
   在 r6 工具栏上把 `margin-left` 还原为 `auto`（即 T20 前的基础规则行为）→
   工具栏从 `left 0 / width 600` 变为 `left 378.5 / width 221.5`（被右推并缩窄），
   移除内联覆盖后恢复 `0 / 600`。机制与 Lead 报告的真实 GUI 值（推 `226.34px`、宽 `193.66px`，
   真实 Modal 更窄）一致——**若不带 companion 规则，Modal 工具栏会被右推**。

> **与 task-20 真实浏览器值的对应**：task-20 在真实 GUI 量到 chip 背景 `rgb(235,238,245)`、
> radius `6px`、`padding-left 4px`、chip 内容宽 `110.15px`、行 top `31→54→77.5→101`。
> 我的 r7 数字（背景 `rgb(244,245,247)`、宽 `218.52px`、tops `105/128/171/214`）来自**夹具的
> 近似浅色主题**与 360px 宽气泡容器，量级不同但结构一致：非透明背景 + 圆角 + 左内边距 +
> `align-self:flex-start` + 逐行堆叠 + 4px 间隔。**两套数字不混用**。
>
> **对比度/内边距数字的边界（T42 更新）**：**自 v9-T40 起，r7 的 `.bubble` 使用原语真实快照**
> `tests/layout/primitives/Tooltip.module.css`（md5 `f1f8bd16…`，来源与 md5 写在快照文件头），
> DOM 也是真实链 `span.bubble > span.label > span.piai-root`。因此
> **`padding: 3px 7px`、surface `rgb(230,236,245)`、bg `rgb(35,42,54)`、`position: fixed`、
> `border-radius: 6px`、`animation: tooltip-in …`（快照引用的 host token 未定义 → 计算为
> `none`，保证截图确定）都是原语自己的值，不再是「模拟」**。仍属模拟/未快照的部分只剩：
> 气泡的**定位数据**（真实组件用 ResizeObserver 算 `left/top`，夹具按同样方式给内联值）、
> `data-side` 的 transform（夹具不设，避免把 fixed 气泡平移出小视口）、以及原语的
> 箭头/`50vw` 上限（被插件 `maxWidth:360` 覆盖）。

**逃逸复盘（必须留档，适用于 Modal 与 Tooltip 两处）**：v9-T10 曾把 catalog 判为 **partial**，
替代证据是自建 DOM + 真实样式表——但那个自建页把内容放在 `.piai-root` 里，**恰好绕过了
portal 这一真实条件**，于是缺陷逃逸到用户 GUI，随后同样的作用域问题又在 Tooltip 上被用户发现。
教训：替代证据必须覆盖「与真实运行环境不同的那一维」（这里是**作用域祖先**），
否则 partial 不能当作"结构已验证"的挡箭牌；能同时给出负对照的夹具才算真正挡住。

### 18.3 对抗式复核（独立重算，`/tmp/v9-evidence/invariants.mjs`）

> **v9-T42 备注（lib 变更后已重算）**：v9-T39 又改了 `lib/client.styles.js`
> （`1d7fd097…`：`:has()` 门控的补偿 padding），本表在 T42 用
> `/tmp/v9-evidence/invariants.mjs` 再次重算（原始输出 `/tmp/v9-evidence/89-t42-invariants.json`）：
> 结论与 T19/T23/T29/T38 相同——零丢失 **111/111**、类 **67/67/54**、chunk **6/6/6**、
> panels 无字段名字面量、无依赖、清空全 `unset`。polish P3a 仍 `19/23` token。
> **v9-T38 备注（历史）**：v9-T31/T35 改了 `lib/client.styles.js`（`1a43001c…`），重算结论同上
> （`/tmp/v9-evidence/78-t38-invariants.json`）。
> **v9-T19 备注（历史）**：v9-T16 改了 `lib/client.panels.js`
> （`fbbb3738…`）与 `lib/client.styles.js`（`841cba55…`），因此本表在 T19 用
> `/tmp/v9-evidence/invariants.mjs` **重新独立重算**（原始输出
> `/tmp/v9-evidence/39-t19-invariants.json`）：全部结论不变，唯一差异是 JS 侧
> `piai-*` 字符串 53 → **54**（新增的是 `lib/client.panels.js` 及其 `client.panels.*` 模块 的 `'piai-root'`
> wrapper，`piai-root` 本就在 67 个 CLASSES 里）→ 仍无越界。§18.4 的 `schema.js`
> 未变（`119fe924…`），其重算结果也复核为一致（`/tmp/v9-evidence/40-t19-valuevar.json`）。

| 检查 | 方法 | 原始结果 | 判定 |
| --- | --- | --- | --- |
| 字段零丢失 | 直接 `leaves(env, uid, [])` 再 `groupLeaves`，比较集合 | 叶子 **111**、分组 **2**、grouped 111、dropped 0、duplicates 0、extra 0 | **verified** |
| 清空 = unset，无 `set null` | 对 `diffOps` 直接喂 4 种清空（标量/字典键/整字典/数组缩短） | 全部 `{op:"unset",…}`；`anySetNull:false`；`anySet:[]` | **verified** |
| 代码里有没有 `set null` 写入点 | 正则扫 `lib/*.js` 的 `edit/remove(...,null)` 与 `op:'set'…value:null` | 仅 2 处**注释**（`client.form.js:482`、`client.panels.js:783`），无执行代码 | **verified** |
| inject 一致性 | 解析 `lib/client.js` 的 `inject` 数组 × 代码里实际读的 `remote.<ns>` | inject 8：`slots, locale, remote, remote.settings, remote.credentials, remote.llm, configForms, settingsSchema`；实读 `credentials/llm/settings` 全部已注入；`remote` 根在列 | **verified** |
| 类集合三处一致 | `styles.CLASSES` × STYLESHEET 选择器 × 各 chunk 的 `piai-*` 字符串 | **67 / 67 / 54**；`missingInClassList=[]`、`missingInCss=[]`、`inJsNotInClassList=[]`（我的正则抽到 54 个 JS 侧名字，是**子集**方向；T19 新增的是 `panels:3501` 的 `'piai-root'`）；`CLASSES==CSS` 双向、JS 无越界均已独立成立；JS 侧「67 个全部被 emit」由 `tests/styles.test.js:842-881` 断言且本轮全绿 | **verified**（当前计数是 **67**，不是旧文档的 66） |
| chunk 计数三处一致 | 磁盘 `lib/client.*.js` × owner `require.async` × `tests/wiring.test.js` `CHUNKS` | 三处均 `[fields, form, panels, schema, styles, yaml]`，**6/6/6** | **verified** |
| panels 无 provider/model 字段名 | 先剥注释，再逐字段名找带引号字面量 | 仅剩：`'compat'`×2（**group id**，AGENTS §3.2 允许）、`'input'`×5（HTML 标签/React key）、`'name'`×2（React key） | **verified** |
| 无新增依赖 | 读 `package.json` | `dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies` 均不存在 | **verified** |
| 密钥不落配置 | 读 owner/panels 的可执行代码 + `tests/wiring.test.js:515` | 凭据按 `meta.role==='credential-ref'` 识别；密钥只进 `credentials.set(ref,secret)`（`panels:902`、`client.js:1523`），不进 draft/ops/YAML；可执行代码无 `apiKeyEnv` 字面量 | **verified** |
| `!!js` 表达式只读保留 | `isExpression` 在 walk 首行短路 + panels 渲染 `.piai-expr` | `schemaIsExpressionUsedInWalk:true`、导出 `isExpression`、panels 引用 `piai-expr` | **verified** |

**补充（AGENTS §3.2 在本轮进行中被更新）**：`lib/client.fields.js` 还导出
`valueHintFor` / `modeHintFor`（逐选项说明 / 模式文案），并允许分组级 `catalog`。
三者都是**呈现元数据**：`catalog` 只在 `groupLeaves` 里透传（`fields.js:530`），
不参与「字段是否存在」——这由本表第 1 行（零丢失 111/111）与 `tests/coverage.test.js` 共同证明；
`tests/hints.test.js` 13/13 与 `tests/catalog.test.js` 24/24 证明其 DOM/行为层。其**几何**
（提示气泡、按钮位置）未单独测量：提示在 `piai-info` 的 portal 气泡里（§17.6 记录的既有盲区），
catalog 的浮层只有 §18.2 的自建 DOM 证据。

### 18.4 披露范围内部分（`valueVar` / `valueVarNames`）的独立重算

`/tmp/v9-evidence/valuevar-recompute.mjs`（**不 import `tests/schema.test.js`**）从 fixture
结构自行推导期望，再打 shipped chunk：

```
fixture 结构期望：refs 291/293 → inner 266 → 唯一 object 分支的 $var=263 → ['thinking.enabled','thinking.effort','thinking.budget']
providers.compat.chatTemplateKwargs  : valueVar=true, valueVarNames=[thinking.enabled, thinking.effort, thinking.budget], valueNullable=true
providers.compat.chatTemplateArgs    : 同上
providers.headers                    : valueVar=null（键不存在）, valueNullable=false
命中的 6 个叶子                          : models.compat.chatTemplate{Kwargs,Args}、modelOverrides.compat.chatTemplate{Kwargs,Args}、compat.chatTemplate{Kwargs,Args}
全部命中 == fixture 期望                  : true
合成（分支含 zz+$var、$var 值序 [b,a,b]） : valueVar=true, valueVarNames=['b','a']（按 schema 顺序去重）
合成（inner 为 const-union）             : 无 valueVar 键（hasOwn=false）
```

判定：**verified（披露关系，独立重算）**。残留：本验证者无法排除「自己两次犯同一个
结构性误解」，若要完全外部化，可交由第三人或用户按上表复算。

### 18.5 两处已知边界的复核

**(a) `lib/client.fields.js` 的两处「继承」文案 —— 可接受。**
`fields.js:171`（`reasoningEfforts.hint`）与 `:1026`（`reasoningEfforts.false` 值标签）
都是**说明性文案**：前者描述「留空＝继承模型目录的既有能力」，后者描述「能力不从模型目录
继承」；UI 里「继承」这个动作的选项文案是「默认（未设置）」（bool 三选一实测），
与之不冲突，也不是把「继承」当作可点选项。AGENTS §3.3 约束的是**写值语义**（留空＝unset），
这两句正是它的中文解释。判定 **verified（可接受）**。

**(b) catalog 搜索框无 id 的 P5c 窄口子 —— 不能掩盖真实缺陷（有残余风险，已列）。**
口子在 `tests/verify.polish.mjs:2255-2282`：按 `call.props.type === 'search'` 豁免，
并强制 ① 至少存在一个 search box（`assert.ok(searchBoxes.length > 0)`）、
② 每个 search box 有**非空 `aria-label`**；真实代码 `lib/client.panels.js` 及其 `client.panels.*` 模块
确为 `type:'search'` + `aria-label:'搜索模型'` + 无 `id`。
为什么掩盖不了：`tests/a11y.test.js:653-670` 对**它渲染的树**里每个 `<input>` 强制
`id` 且 `label[htmlFor]` 必须解析到真实 id —— 字段行若被改成 `type:'search'`，
a11y 仍会红。a11y 的树**不含** Modal（grep 无 catalog/Modal 用例），所以 Modal 里的
search box 只受这个口子管，而这正是它存在的理由。残余风险（LOW）：
新增一个**既非字段行、又不在 a11y 树里**的 `type:'search'` 控件会同样被豁免；
口子按类型全局生效，不是按调用点。判定 **partial（口子成立，残余风险已记录）**。

### 18.6 判定表

| 项目 | 判定 | 依据 |
| --- | --- | --- |
| 语法 8/8、`node --test` 359/358/0/1 | **verified** | §18.1①②；v9-T38 在 T31/T35/T36 字节上复跑仍全绿 |
| integration 38/0、render 15/0、polish 42/0 | **verified** | §18.1③④⑤ |
| 四个新测试文件 73/73 | **verified** | §18.1⑥（catalog 25） |
| 结构不变量（零丢失/unset/inject/类 67/chunk 6/无字段名/无依赖/密钥/表达式） | **verified** | §18.3 独立重算 |
| `valueVar` / `valueVarNames` | **verified（披露关系，独立重算）** | §18.4 |
| R1 基线 5 项（`checkbox16`/`optionSpansVisible`/`adjacentLabelGap16`/`textInputFillsRow`/`selectInput16`） | **verified** | §18.2；v9-T14 12/12 + T19/T23 复测同值 |
| R1 布尔三选一（`boolRadios16`/`boolLabelsVisible`） | **verified** | 3×`16×16`；spans `26`/`26`/`91` 同一 top |
| R1 档位行（`tierInputFillsRow`/`tierInfoVisible`） | **verified** | 探针 `DIV.piai-tier`；control `600` == wrap `600`（delta 0）、ⓘ `24×24` |
| R1 模板参数行（`templateRowReadable`/`templatePartOrder`） | **verified** | 4 部件可见、未裁切、在卡片内；DOM 序 `[0,1,12,14]`；竖排是既有设计（F2 已裁决） |
| R2 / R3 回归 | **verified** | 3/3、7/7（均含 `probeStructure`） |
| R4 两栏（`barIsOneRow`/`actionsRightOfList`/`actionsFlushRight`/`actionVisible`/`actionSlotDoesNotWrap`） | **verified** | overlap `27.5`、`bottomDelta 0`、`actionRightGap 0`、按钮 `64×27.5`（F3 已修） |
| 模型目录 Modal 的 **portal 作用域**（`r6-catalog`：9 条 `portalCatalog*`） | **verified**（v9-T17 夹具 + T19/T29 正/负对照） | 正向 10/10；负对照（解包内层 `.piai-root`）0/10、gap（checkbox→id）`3`、input `13×13`（§18.2） |
| 候选行**只显示 id**（`portalCatalogIdSingleLine`） | **verified**（v9-T26 夹具准则 + 测试断言） | 4 行 `spanCount:0`、`visibleText === id`、`title` = name/id 回退、`codeScrollWidth == codeClientWidth`；`tests/catalog.test.js:1223` 三种候选断言（§18.10） |
| checkbox→id 间距 ≥7.5（`portalCatalogCheckboxIdGap8`） | **verified** | 4 行实测 **11px** = label flex `gap 8` + UA checkbox `margin-right 3`（负对照仅 `3`）；`tests/layout/measure-in-page.js:454-468` |
| 模型目录 Modal 的 **40vh 上限** | **verified**（v9-T10 自建探针，与 r6 独立） | `max-height 480px` @1200vh、`scrollHeight 1036 > clientHeight 480`（§18.2） |
| 原代码视图只读外壳（`r5-raw` 回退形状） | **partial** | notice/代码体可见且不溢出；`CodeBlock` 真实几何无证据 |
| **Tooltip 气泡几何 / `.piai-key` chip（portal）** | **verified**（v9-T22 夹具 + T36 对比度 + T40 内边距；正/四负对照同页） | 正向 **13/13**：wrapper `flex/column/gap 4px`、chip 背景 `rgb(244,245,247)`+radius `6px`+`padding-left 4px`+`align-self:flex-start`、tops `[105,128,171,214]`、相邻间隔 `[4,4,4]`；未包裹分支全 false（§18.2/§18.11/§18.12） |
| **气泡四边内边距**（`bubbleInsetUniform` / `bubbleInsetGrew`） | **verified**（r7 正向 + 负对照 A′） | `.bubble` 边框盒 → wrapper 内容盒 **`15/15/15/15`**、`spread 0`、每边 ≥12；原语自身 `padding: 3px 7px`；负对照 A′（中和 T39 规则）→ **`3/7/3/7`**、spread 4 失败（§18.12） |
| **Modal 内容层不受内边距规则影响**（`modalWrapperUnaffected` / `modalGateDoesNotMatch`） | **verified**（r7 正向 + 负对照 B′） | Modal 形 `.piai-root` padding `0/0/0/0`、与 dialog 内容盒偏移 `0/0`；4 条 `:has()` 门控对 Modal 全 false、对气泡 wrapper `[false,true,false,true]`；负对照 B′（去掉 `:has()`）→ Modal 变 `12/8/12/8` 而气泡仍 15/15（§18.12） |
| **气泡正文可读性**（`bubbleBodyContrast` / `bubbleTextInheritsSurface`） | **verified**（r7 正向 + 负对照 A） | 正文 `rgb(230,236,245)` lum `0.8341` vs 气泡底 `rgb(35,42,54)` lum `0.0228` = **12.14:1** 且 wrapper/3 span 全等于 surface、≠ alias；负对照 A（wrapper 解析 alias）→ **1.21:1** 失败（§18.11.5） |
| **chip 可读性**（`bubbleChipContrast`） | **verified**（r7 正向 + 负对照 B） | chip `rgb(78,89,105)` lum `0.0978` vs 自身底 `rgb(244,245,247)` lum `0.9125` = **6.51:1**；负对照 B（chip inherit）→ **1.09:1** 失败（§18.11.5） |
| **A13 真实 GUI 里本页可见性** | **blocked** | `curl http://127.0.0.1:19387/ -> 401`、`/settings -> 404`、`/plugins/events -> 200`（原始输出 `/tmp/v9-evidence/12-gui.txt`）；首次发现需一次 DSH 重启 |
| P10a 服务端字节新鲜度 | **verified（本轮，观察项）** | `containsDiskFile=true`；但该项**只观察不阻断**，且 `rev` 会因 `touch` 变化，不能替代 GUI 目视 |
| 凭据真实写入（`credentials.set/unset` 落盘） | **blocked** | 需要真实凭据 remote；不对真实 profile 做写操作（AGENTS §4） |

### 18.7 本轮未验证 / 诚实边界

- 原代码视图：`r5-raw.html` 只覆盖**回退形状**（`<pre class="piai-expr-body">`），
  `CodeBlock` 原语的真实几何（行号列宽、复制按钮位置、shiki 高亮）仍**未测**；
  `tests/raw.test.js` 只证明 DOM 层存在与 dirty 文案 → 整体 **partial**，不得升级 verified。
- 浏览器证据全部来自**静态夹具**：它钉住计算几何，不覆盖 React 装配；DOM 语义仍由
  `node --test` 的 359 项负责。夹具页数 **7**（v9-T13 前为 4；T17 加 `r6-catalog`，
  T22 加 `r7-bubble`）。
- catalog Modal：`r6-catalog.html` 覆盖了 **portal 作用域结构**（负对照可检出缺陷），
  但**不含**原语 `Modal` 自身的 DOM/CSS（`Modal.module.css` 未快照）——遮罩/居中/滚动容器
  未测；40vh 上限来自独立的 v9-T10 探针。
- Tooltip 气泡：`r7-bubble.html` 覆盖**嵌套根栈 + chip 样式 + 逐行堆叠 + 正文/chip 对比度 +
  四边内边距 + Modal 门控**，四条负对照（未包裹分支、wrapper 解析 alias、chip inherit、
  中和/去门控 T39 规则）。**自 v9-T40 起 `.bubble` 用原语真实快照**
  `tests/layout/primitives/Tooltip.module.css`（`f1f8bd16…`），DOM 也是真实链
  `span.bubble > span.label > span.piai-root` → 之前「surface 为模拟」的边界已收窄。
  **仍未覆盖**：气泡的定位数据（真实组件由 ResizeObserver 算 `left/top`）、`data-side`
  的 transform、原语箭头与 `50vw` 上限（被插件 `maxWidth:360` 覆盖）；`Modal.module.css`
  自身也未快照（r7 的 dialog 用 16px 内联 padding 代替）。因此只对 r7 的 12 条气泡准则
  （+`probeStructure`）判 verified，不外推到原语定位/箭头。
- 真实 GUI 观感、真实凭据写入、真实 `llm-pi-ai` 配置落盘均未在本环境闭环
  （A13 仍 401；三处用户反馈的缺陷都是用户在真实 GUI 中先发现的）。
- 本节所有 `verified` 都对应 §18.0 的 md5；v9-T16–T36 改了
  `lib/client.panels.js`/`client.styles.js`/`tests/layout/*`/`tests/styles.test.js`
  （`tests/verify.polish.mjs` 自 T18 后未变），§18.1 已在 v9-T38 全部重跑、
  §18.3 已重算。若 `lib/` 再被改动，需再重跑。

### 18.8 缺陷/红旗清单（v9-T42 状态：F1–F10 全部已消解；无未决红旗）

| # | 级别 | 位置 | 复现 / 原始证据 | 状态 |
| --- | --- | --- | --- | --- |
| F0 | 流程（**已澄清**） | `lib/client.js` | 16:10 68619B/`8602819b…` → 16:13:25 68660B/`17eb78d6…` | **非越界写入**：Lead 指派的副标题文案修正（zh/en 两行字符串）。§18.1 已在该字节上重跑，§18.0 记录 `17eb78d6…` |
| F1 | **HIGH → 已修（v9-T13）** | `tests/layout/measure-in-page.js:83` × `build-fixture.mjs:222` | 修复前：evaluate 旧表达式 → `TypeError: Cannot read properties of null (reading 'querySelector')`；修复后：`TIER_PROBE {"tagName":"DIV","className":"piai-tier"…}`、R1 12/12、`missing:[]` | **verified 已消解**；v9-T14 独立复测并把修复前表达式作为反向对照（仍抛错） |
| F2 | MEDIUM → **已裁决 + 准则已修正** | `.piai-dict-row{flex-direction:column}` × 旧准则 `templateRowOnOneLine` | 旧准则对设计误报红；新准则 `templateRowReadable`（4 部件可见/未裁切/在卡内）+ `templatePartOrder`（`[0,1,12,14]`）实测 true | **已按 Lead 裁决**：卡片竖排是既有设计（`docs/interaction-design.md:706/:893`），准则已删除重写，README 已写明 |
| F3 | LOW 口径 → **已修** | `tests/layout/measure-in-page.js` | `barIsOneLine`（top 差 ≤1）→ `barIsOneRow`（overlap `27.5` + bottomDelta `0`）+ `actionsFlushRight`（gap `0`）+ `actionSlotDoesNotWrap`，实测 true | **已消解**，与 `.piai-tabs-bar{align-items:flex-end}` 一致 |
| F4 | LOW 文档 → **已修** | `tests/layout/README.md` | README 现记录 sha `9e372913…`（34925B，T26 build）；R1/R4/R6/R7 准则状态已更新；新增 `r5-raw.html`、`r6-catalog.html`、`r7-bubble.html` | **已消解**。备注：T13/T17/T22/T26 报告的聚合 md5 我都无法用常见聚合方式复现（我的 `e666b92c…`）；确定性以 `diff -r` 空输出为准 |
| F5 | INFO | `lib/client.styles.js` 及其两个样式片段 | 74 字符 id 探测：`code{flex:none}` 保持单行，但会 +6px 横向滚动 | 记录备查（预期行为，非缺陷） |
| **F6** | **HIGH（用户可见）→ 已修（v9-T16）** | primitives `Modal`：`createPortal(…, document.body)`（asar `…/dsh-client-ui-primitives/lib/index.js:5214` 等）× 本插件 CSS 全部 `.piai-root` 作用域 | 用户真实 GUI：候选列表无样式、`deepseek-flashdeepseek-flash…` 粘连。可在 r6 页复现：解包内层 `.piai-root` → `R6_NEG_DIAGNOSTICS {"listDisplay":"block","listGap":"normal","rowDisplay":"inline","inputBox":"13x13","gap":0}`（§18.2） | 修复：`lib/client.panels.js` 及其 `client.panels.*` 模块（关闭不挂载）+ `:3519`（Modal 内容包 `div.piai-root`）+ `lib/client.styles.js` 及其两个样式片段（嵌套根作用域重入 + T20 纵向栈/companion；`:not(.piai-page)` 覆盖真实 portal 无祖先的情况）。已由 r6 正/负对照 + P5c 真实开窗审计复核；**逃逸复盘见 §18.9** |
| **F7** | **MEDIUM → 已修（v9-T20，用户批准后）** | `lib/client.panels.js` 及其 `client.panels.*` 模块（`hintBubble`）+ `:505`/`:1621`（`Tooltip portal:true`）；`lib/client.styles.js` 及其两个样式片段 | 修复前：气泡挂在 `document.body`，`.piai-root .piai-key{…}` 不可达 → chip 背景/边框/内边距全丢（裸 `<code>`），键与说明挤在一行。r7 负对照分支现在仍复现该形态：`display:inline`、chip `rgba(0,0,0,0)`/radius `0`/padding `0`、tops `[211.5,206.5,229,251.5]` | **已修**：`hintBubble` 返回**单个** `span.piai-root` wrapper（`panels:447-463`，`h('br'` 计数 = 0），嵌套根改为纵向 flex 栈 + `> .piai-key{align-self:flex-start}` + `> span{min-width:0}`，每条都**成对**写 `:not(.piai-page)` 变体（微观证据：`matches('.piai-root .piai-root')=false` / `matches('.piai-root:not(.piai-page)')=true`），并加 companion `> .piai-item-actions{margin-left:0;align-self:stretch}`（反证：还原 `margin-left:auto` → 工具栏被右推 `378.5px`、宽 `600→221.5`）。r7 正向 6/6、负向全 false；`tests/a11y.test.js:930-968`、`tests/v7.audit.test.js:1170-1193`、`tests/v8.audit.test.js:789-806` 三处旧断言已同步为 wrapper + 深度查找 + 无 `br` 反向断言；详见 §18.9.5 |
| **F9a** | **HIGH（用户第三次 GUI 反馈）→ 已修（v9-T31）** | `lib/client.styles.js` 及其两个样式片段（嵌套根 `color: inherit`）；旧行为来自 `.piai-root{color:var(--dsw-alias-label-primary)}` 对原语 `.bubble` 静态浅色的 specificity 覆盖 | 用户看到**深字压深底**；页内负对照 A（wrapper 解析 alias `rgb(21,26,35)`）→ 正文 **1.21:1** | **已修**：嵌套根继承它实际被 portal 进去的 surface 颜色 → 正文 **12.14:1**（`rgb(230,236,245)` lum 0.8341 on `rgb(35,42,54)` lum 0.0228）；r7 `bubbleTextInheritsSurface` + `bubbleBodyContrast` 实测 true |
| **F9b** | **MEDIUM（T31 的自我纠正，v9-T32 发现 → v9-T35 撤回）** | `lib/client.styles.js` 及其两个样式片段（chip 规则**只剩** `align-self: flex-start`，见 `:212` 的 T35 注释）；`:713` 保留 base `.piai-key` 的主题 token 色对 | T31 一度也给 chip 加 `color: inherit` → chip 变**浅字压浅底 1.09:1**；页内负对照 B（`chip.color=inherit`）复现 | **已修（撤回）**：chip 不继承，回到 `--dsw-alias-label-secondary` on `--dsw-alias-bg-layer-2` = **6.51:1**（text lum 0.0978 / bg lum 0.9125）；`tests/styles.test.js:918-934` 三条规则断言（嵌套根 inherit / chip 不声明 color / base chip token）10/10；详见 §18.11 |
| **F10** | **口径/体验（用户要求「间距调大、上下左右一样」）→ 已修（v9-T39，T40 夹具升级收口）** | `lib/client.styles.js` 及其两个样式片段（`:has(> .piai-key)`/`:has(> span)` × `:not(.piai-page)` 门控的补偿 padding）；原语 `padding: 3px 7px` 来自新增快照 `tests/layout/primitives/Tooltip.module.css` | 原语气泡上下 3px、左右 7px（天生不等）→ 用户看到上下紧、左右松。负对照 A′（中和该规则）复现 **`3/7/3/7`、spread 4**；负对照 B′（去掉 `:has()`）复现 Modal 变 `12/8` | **已修**：wrapper 补 `padding: var(--piai-space-3) var(--piai-space-2)`（12/8）→ 视觉四边 **15/15/15/15**、`spread 0`；`3 + 12 = 15`、`7 + 8 = 15`。门控让 Modal 形 wrapper（直接子节点是 `div.piai-item-actions`/`div.piai-catalog`/`p.piai-hint`）**不命中**：padding 仍 `0/0/0/0`、不动 dialog 自己的 16px。r7 13/13、四条负对照各自只打掉对应一半；详见 §18.12（含「夹具 `.bubble` 已改为原语真实快照」的边界更新） |
| **F8** | **口径/体验（用户 GUI 反馈）→ 已修（v9-T25，T26/T28 收口）** | `lib/client.panels.js` 及其 `client.panels.*` 模块（候选行渲染）（过滤）；`lib/client.styles.js` 旧规则 `.piai-root .piai-catalog > label > span` | 用户看到每行两段文字（等宽 id + 显示名），而多数模型 `name === id` → 同一串读起来重复；DOM 形状为 `label > input + code + span` | **已修**：候选行只渲染 `label > input + code.piai-dict-key`（文本 = 原始 id，`title = name \|\| id`），与官方「设置 → 模型」picker 同款（alias `PICKER:874-878`）；名称**仍参与搜索**（`:3446-3450` 同时匹配 id 与 label，测试用 `friendly` 子串证明）；v9-T26 加三种候选（无 name / name===id / name 不同）回归断言并同步 r6 准则名；v9-T28 删除因此成为死规则的 `> span` 样式（类集合仍 67）。详见 §18.10 |

仍待用户动作：A13（重启 DSH → 目视「模型扩展配置」页）；P10a 只能证明服务端返回的样式
字节新鲜，不能替代 GUI 目视。

### 18.9 v9-T16/T17/T18 + v9-T20/T21/T22：portal 作用域缺陷（用户 GUI 发现）与修复复核

#### 18.9.1 缺陷与影响面

- **现象（用户真实 GUI，先后两处）**：
  (1) 「获取可用模型」弹窗的候选列表**无样式**——id 与显示名粘连成一坨
  （`deepseek-flashdeepseek-flash…`），行距/复选框尺寸丢失；
  (2) 随后发现 **Tooltip 气泡**里的 raw-key chip 也没有样式（键与说明挤成一行、chip 无底色）。
- **影响面**：只有 **portal 内容**受影响。本面板解析到的原语里会 transclude 到
  `document.body` 的只有 `Modal` 与 `Tooltip`（**现已全部修复**）；其余
  （`Button`/`Input`/`Checkbox`/`Tag`/`Pill`/`StateDot`/icons）不 portal。
- **为什么既有证据没拦住**：`node --test`（当时 357 项）与三个 harness 只断言 DOM / props / CSS
  **文本**，看不见「选择器是否匹配」；§18 的 R1–R5 静态页里没有 Modal/Tooltip；v9-T10 的替代
  证据是自建 DOM，而那个自建页**把内容放进了 `.piai-root`**，恰好绕过了 portal（作用域祖先）
  这一真实条件 → partial 判定失效，缺陷逃逸到用户界面（复盘见 §18.2 末尾与 §18.9.6）。
  **同一盲区在 Modal 与 Tooltip 上先后各逃逸一次**。

#### 18.9.2 根因（file:line）

- primitives 的 `Modal` 走 `createPortal(…, document.body)`：
  `/tmp/asarx/out/dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js:5214`
  （同文件 `:6857` 亦走 portal；`Tooltip` 的 portal 分支在 `:4887`）。
- 本插件全部 CSS 以 `.piai-root` 作用域开头（`lib/client.styles.js` 的 `.piai-root …` 规则 +
  `CLASSES` 作用域策略）→ portal 内没有 `.piai-root` 祖先，`.piai-catalog`/`.piai-dict-key`
  等规则**永不匹配**。
- 结果：原语自带的搜索框（`Input` 的 module CSS 不依赖 `.piai-root`）仍有样式，而插件自己
  画的候选行完全裸奔——正是用户看到的不对称。

#### 18.9.3 修复点（Modal，v9-T16；行号按 T20 后的字节）

- `lib/client.panels.js` 及其 `client.panels.*` 模块：`ModelCatalogPicker` 在 `props.open !== true` 时 `return null`
  —— 关闭不挂载，保持页面恰好一个 `.piai-root` 节点（`verify.polish` P2e 的作用域泄漏不变量）。
- `lib/client.panels.js` 及其 `client.panels.*` 模块：Modal 的**内容**包一层
  `h('div', { className: 'piai-root', key: 'portal-root' }, …)` → portal 子树重新进入作用域；
  wrapper 自身不加样式，Modal 的 title/description/footer/aria 与所有子节点不变。
- `lib/client.styles.js` 及其两个样式片段（T16 段）：`.piai-root .piai-root, .piai-root:not(.piai-page)
  { background: none }` —— 中和嵌套根底色。`:not(.piai-page)` 是**必需**的：真实 portal 根
  没有 `.piai-root` 祖先，而页面根始终带 `piai-page`，因此只有页面根保留底色；颜色/字号/
  行高/`--piai-*` 变量仍来自上一条基础规则。
- `lib/client.styles.js` 及其两个样式片段（T20 段，见 §18.9.5）：嵌套根纵向 flex 栈 + chip 自身宽度 +
  span 换行 + Modal 工具栏 companion 规则。
- `tests/verify.polish.mjs`（v9-T18）：P5c 改为**先真实打开选择器再审计**，PASS 行出现
  `1 id-less search box`（该搜索框只存在于开窗后的 Modal 子树）→ 该断言不再空转。

#### 18.9.4 修复证据（v9-T23 复核）

- 夹具 `r6-catalog.html` 正向 **10/10**；**负对照**（解包内层 `.piai-root`）**0/10**、
  `gap 0`、input `13×13`、`display:inline`（完整原始值见 §18.2）。
- 夹具 `r7-bubble.html` 正向 **6/6**、负向分支全 false（§18.2 / §18.9.5）。
- `node tests/verify.polish.mjs` **42/0**，P5c 真实开窗（§18.1⑤）。
- §18.1①–⑥ 全部在 **panels `fdc21c81…` / styles `73325775…`** 上重跑，无连带红灯。

#### 18.9.5 F7：Tooltip 气泡 —— **已修（v9-T20，用户批准后）**

**根因**：`Tooltip` 与 `Modal` 一样 `portal: true`（`lib/client.panels.js` 及其 `client.panels.*` 模块），
而 `hintBubble`（当时 `:437-459`）返回**扁平数组** `[code.piai-key, br, span(hint), …]`；
气泡落在 `document.body` 下、没有 `.piai-root` 祖先，于是 `.piai-root .piai-key{…}`
（背景/边框/圆角/内边距）全部不匹配，chip 退化成裸 `<code>`，且键与说明只能靠 `<br>` 换行。

**修复点**：
- `lib/client.panels.js` 及其 `client.panels.*` 模块：`hintBubble` 现在返回**恰好一个**顶层节点
  `[ span.piai-root > (code.piai-key?, span(hint)?, span(line)*) ]`；节点顺序不变
  （chip → hint → 每条 extra line 一个 span），`h('br'` 全文件计数 = **0**，空内容返回 `[]`。
- `lib/client.styles.js` 及其两个样式片段：嵌套根改为**纵向 flex 栈**（`display:flex;
  flex-direction:column; gap:var(--piai-space-1); min-width:0; max-width:100%`）；
  `> .piai-key{align-self:flex-start}`（chip 保持自身宽度，背景/圆角/内边距可见）；
  `> span{min-width:0}`（长说明换行不溢出）；companion
  `> .piai-item-actions{margin-left:0; align-self:stretch}`。
- **配对理由（必需）**：每条规则都写成 `.piai-root .piai-root …` **与**
  `.piai-root:not(.piai-page) …` 两份。真实 portal 的被包裹节点没有 `.piai-root` 祖先，
  实测（r7 bare 页）`matches('.piai-root .piai-root') = false`、
  `matches('.piai-root:not(.piai-page)') = true` —— **只写后代组合器在真实 GUI 里一条都不命中**。
- **companion 反证**：在 r6 工具栏上把 `margin-left` 还原为 `auto`（T20 前的基础规则行为），
  工具栏由 `left 0 / width 600` 变成 `left 378.5 / width 221.5`（被右推 378.5px），
  移除内联覆盖即恢复；与 Lead 报告的真实 GUI 值（推 `226.34px`、宽 `193.66px`）机制一致。

**证据（v9-T23 自己复测）**：
- r7 正向 **6/6**：wrapper `flex/column/gap 4px`；chip 背景 `rgb(244,245,247)`、radius `6px`、
  `padding-left 4px`、`align-self:flex-start`、宽 `218.52 < 600`；tops `[117,140,163.5,187]`、
  相邻间隔 `[4,4,4]`。
- r7 **负对照**（同页未包裹分支）全 false：`display:inline`、chip `rgba(0,0,0,0)`/radius `0`/
  padding `0`、tops `[211.5,206.5,229,251.5]`、`disjoint:false`。
- task-20 的真实 GUI 前/后对照（引用，非我实测）：pre chip 背景 `transparent`、radius `0`、
  padding `0`、与 hint 同行；post 背景 `rgb(235,238,245)`、radius `6px`、`padding-left 4px`、
  `align-self:flex-start`、内容宽 `110.15px`，行 top `31→54→77.5→101`。
- 测试侧同步（v9-T21）：`tests/a11y.test.js:930-968`、`tests/v7.audit.test.js:1170-1193`、
  `tests/v8.audit.test.js:789-806` 三处旧断言改为「单 wrapper + 深度查找 chip/行 + 无 `br` 反向断言」；
  `node --test` 359/358/0/1 全绿（§18.1②）。

**残留（不外推）**：r7 复刻的是 portal 作用域结构 + 嵌套根样式，不是真实 `Tooltip` 原语 DOM
（`Tooltip.module.css` 未快照）；定位/箭头/`maxWidth:360` 未测。

#### 18.9.6 方法学结论（写给后续验证者）

1. **partial 的替代证据必须覆盖「与真实运行不同的那一维」**：本次是**作用域祖先**
   （portal），下次可能是 SSR、iframe、Shadow DOM 或真实 React 装配。覆盖不到就别把
   partial 当成"结构已验证"。**同一个盲区在 Modal 与 Tooltip 上先后各逃逸一次**，
   第二次（F7）正是第一次（F6）复盘里写下的风险。
2. **只有正向夹具不构成回归防线**：必须同时给出**负对照**（把修复拆掉必定变红）。
   `r6`（粘连形态）与 `r7`（裸 chip / 同行挤压）的负对照都能在页内复现修复前的缺陷形态，
   才证明夹具真的能检出该类作用域/布局缺陷。
3. **成对选择器要验证"哪一半在起作用"**：`matches()` 是最便宜的判据；
   写了两份而实际只有一份命中，等价于没写。

### 18.10 v9-T25/T26/T28：候选行口径修正（只显示 id，官方同款）

#### 18.10.1 用户反馈与口径依据

- **现象（用户真实 GUI）**：「获取可用模型」弹窗每个候选显示**两段文字**（等宽 id +
  显示名），而多数模型 `name === id` → 同一串读起来重复、行也更长。
- **口径依据（官方「设置 → 模型」picker）**：`docs/interaction-design.md:1379`（E17b）记录
  alias `PICKER:874-878` —— 每行一个 `span.candidateId`，`title: candidate.name ?? candidate.id`、
  `children: candidate.id`，即**页面上只有 id 一段文本，名称靠悬停看**。
  产品口径同见 `docs/requirements.md:169`（R6）与 `docs/field-coverage.md:293`。

#### 18.10.2 修复点

- `lib/client.panels.js` 及其 `client.panels.*` 模块：候选行只渲染 `label > input[type=checkbox] +
  code.piai-dict-key`；chip 文本 = `entry.identity`（原始 id）；`title = entry.label !== '' ?
  entry.label : entry.identity`（name → id 回退）。
- `lib/client.panels.js` 及其 `client.panels.*` 模块：过滤条件同时匹配 `identity.toLowerCase()` 与
  `labelText.toLowerCase()` → **名称隐藏但仍可被搜索命中**。
- `lib/client.styles.js`（v9-T28）：删除因行内不再有 span 而成为死规则的
  `.piai-root .piai-catalog > label > span`。

#### 18.10.3 测试证据（v9-T26；v9-T29 自己复跑 `node --test`）

`tests/catalog.test.js:1223-1289` 新增一条回归用例，三种候选（无 `name` / `name === id` /
`name` 不同）分别断言：

1. **形状**：每行子节点 `toPlain(children.map(c => c.type))` 深等于 `['input', 'code']`
   —— 没有 name span；`textContent(row) === id`（整行只有一段可见文本）。
2. **title 回退**：`children[1].props.title` 为 `'Friendly Name'`（不同名）或等于 id（无 name、
   name===id）。
3. **隐藏名称仍可搜**：搜 `model-x`（可见 id）命中 1 行；搜 `friendly`（**不是任何 id 的子串**）
   仍命中 `model-x` 那一行，且该行依旧只显示 id；搜不到时仍出冻结状态行
   （`role="status"`）。

计数变化：`tests/catalog.test.js` 24 → **25**；四个测试文件 72 → **73**；
`node --test` 357 → **358**（357 pass / 0 fail / 1 todo）。

#### 18.10.4 r6 夹具复测（v9-T29，ego-browser 600×1200）

准则随口径改名（`tests/layout/measure-in-page.js:454-468`、`build-fixture.mjs:658-659`）：

| 旧准则 | 新准则 | 判据 |
| --- | --- | --- |
| `portalCatalogGap8`（id→name 间距） | `portalCatalogCheckboxIdGap8` | checkbox → id 间距 ≥ **7.5** |
| `portalCatalogCodeSpanDisjoint`（id 与 name 不重叠） | `portalCatalogIdSingleLine` | 无额外 span、`visibleText === id`、`codeScrollWidth <= codeClientWidth + 1` |

实测（`/tmp/v9-evidence/67-t29-browser.txt`）：4 行 `spanCount:0`、`visibleText === id`、
`title` 分别 `Deepseek V4 Flash Preview` / `deepseek-v4-pro` / 长 id / `GPT X`、
**checkbox→id 间距 11px**（= label flex `gap 8` + UA checkbox `margin-right 3`）、
`codeScrollWidth == codeClientWidth`（535/108/433/36）；r6 正向 **10/10**。
负对照（解包内层 `.piai-root`）**0/10**，间距退回 **3**（只剩 UA margin）、input `13×13`。

#### 18.10.5 判定与边界

- catalog Modal 的 **portal 作用域**判定不变（verified）；新增两条**分项**判定
  「候选行只显示 id」与「checkbox→id 间距 ≥7.5」均为 **verified**（§18.6）。
- 40vh 上限仍来自 v9-T10 的自建探针（与 r6 相互独立），不受本次口径修正影响。
- 搜索框仍无 `id`（只靠 `aria-label`）——§18.5(b) 的 P5c 窄口子本轮未改，判定保持 partial。

### 18.11 v9-T31/T32/T35/T36：气泡文字色（F9a 正文 / F9b chip 与一次自我纠正）

#### 18.11.1 根因（file:line）

- primitives 的 Tooltip 气泡**永远深底、静态浅字**：`Tooltip.module.css` 的 `.bubble` 用静态
  浅色前景（binding 时是 `--dsw-static-neutral-bluish-00` 一类，**不在本项目 23-token
  allowlist 内**，所以插件侧不能直接复用它）。
- 本插件的基础规则 `.piai-root { color: var(--dsw-alias-label-primary) }` specificity 高于
  原语 `.bubble` 的类选择器；T20 在气泡内嵌了一层 `span.piai-root` 后，这层嵌套根就**重新
  施加了主题 alias**（浅色主题下 = 深字）→ 用户第三次反馈的「深字压深底」。
- 关键在于：嵌套根实际被 portal 进的 surface **不是页面背景**，所以任何指向主题 alias 的
  颜色在这里都是错的。

#### 18.11.2 F9a 修复（正文，v9-T31）

`lib/client.styles.js` 及其两个样式片段：嵌套根规则加 `color: inherit` —— 正文/hint 继承它真正被 portal
进去的 surface 前景色，不改原语的 surface。实测：正文 `rgb(230,236,245)`
（lum `0.8341`）on 气泡底 `rgb(35,42,54)`（lum `0.0228`）= **12.14:1**；
`bubbleTextInheritsSurface` 要求「等于 surface 且**不等于** alias」，夹具把 alias 钉成
`rgb(21,26,35)`（深）以证明二者可区分（`aliasColor !== surfaceColor` 为 true）。

#### 18.11.3 F9b 自我纠正（chip，v9-T31 引入 → v9-T32 发现 → v9-T35 撤回）

- T31 把同一条 `color: inherit` **也加到了 `> .piai-key`** 上。chip 的底色来自
  `.piai-key` 的 `--dsw-alias-bg-layer-2`（浅色主题下是浅底），而继承来的 surface 是浅字 →
  **1.09:1**（我复测 1.0887），chip 几乎消失。**这是本轮唯一的回归，由 T32 的对比度断言发现**。
- T35 撤回：`lib/client.styles.js` 及其两个样式片段 只剩 `align-self: flex-start`（`h('br'` 无关；
  该规则只管宽度），chip 的色对回到 base `.piai-key`（`:713`）=
  `--dsw-alias-label-secondary` on `--dsw-alias-bg-layer-2` → **6.51:1**。
- 裁决口径（写入代码注释 `:174`）：**只有正文继承；chip 保持自身主题 token 色对**。
  `tests/styles.test.js:918-934` 用三条规则断言钉住它：嵌套根必须 `color: inherit`；
  chip 规则**不得**声明 `color`；base `.piai-key` 必须仍是
  `var(--dsw-alias-label-secondary)`（10/10 通过）。

#### 18.11.4 T36：准则从「颜色同一性」改为「对比度 + 两条独立负对照」

`tests/layout/measure-in-page.js` 的 r7 探针现在计算 WCAG 2.x sRGB 相对亮度与对比度，
并断言：`bubbleTextInheritsSurface`（继承语义）、`bubbleBodyContrast` ≥ 4.5、
`bubbleChipContrast` ≥ 4.5（chip 的文字 vs **chip 自身底色**，不是气泡底）。
r7 仍保留未包裹分支的 `bubbleNegativeIsUnstyled`。

#### 18.11.5 我自己的复核（v9-T38）

自己实现了亮度/对比度（`/tmp/v9-evidence/t38-contrast.js`，不 import 夹具探针），
在同一页做两次**只改一处**的注入并恢复：

| 状态 | 正文前景 / 底 | 正文对比度 | chip 前景 / 底 | chip 对比度 |
| --- | --- | --- | --- | --- |
| 正向 | `rgb(230,236,245)` lum `0.8341` / `rgb(35,42,54)` lum `0.0228` | **12.14:1** ✓ | `rgb(78,89,105)` lum `0.0978` / `rgb(244,245,247)` lum `0.9125` | **6.51:1** ✓ |
| 负对照 A（wrapper 解析 alias `rgb(21,26,35)`，lum `0.0102`） | `rgb(21,26,35)` / 同上 | **1.21:1** ✗ | 6.51:1（不受影响） | ✓ |
| 负对照 B（`chip.color = inherit`，解析为 surface） | 12.14:1（不受影响） | ✓ | `rgb(230,236,245)` / 同上 | **1.09:1** ✗ |
| 恢复后 | — | 12.14:1 | — | 6.51:1 |

两条负对照**各自只打掉对应的一半**，且页面在实验后回到原值 → 夹具确实能判别这两类回归。
r7 正向 **9/9**、`missing:[]`；其余 6 页判定与像素值不变（§18.2）。

#### 18.11.6 判定与边界

- **判定：verified**——正向 9/9（T42 后为 13/13）+ 两条独立负对照各自失败 + 规则断言
  （`styles.test.js`）与全量测试（359）共同钉住；对比度数值与 task-20/31/32/35 的真实 GUI
  计算值一致（12.14 / 1.09 / 6.51）。
- **边界（必须随判定一起读）**：**本节撰写时（v9-T38）**夹具的 `.bubble` 还是内联模拟；
  **自 v9-T40 起已升级为原语真实快照** `tests/layout/primitives/Tooltip.module.css`
  （`f1f8bd16…`），surface / bg / `padding: 3px 7px` / `position: fixed` 等值现在是原语自己的。
  仍未覆盖：定位数据（ResizeObserver 的 `left/top`）、`data-side` transform、箭头与 `50vw`
  上限（被插件 `maxWidth:360` 覆盖）。详见 §18.7 与 §18.12.4。
- 本轮**未发现新缺陷**；`lib/` 由 task-31/35/39 改动，`tests/` 由 task-32/36/40 改动，本节只记录。

### 18.12 v9-T39/T40：气泡四边等距内边距（F10）

#### 18.12.1 根因

primitives 的 `.bubble` 自带 `padding: 3px 7px`——**上下 3px、左右 7px 天生不等**。
用户要求「间距调大、上下左右一样」。这是原语自身的值，插件侧不能改它（改 `.bubble` 等于
覆盖原语，且会波及所有使用 Tooltip 的地方），只能在**自己插入的那层 wrapper** 上补偿。

#### 18.12.2 修法与推导（v9-T39）

`lib/client.styles.js` 及其两个样式片段：

```
.piai-root .piai-root:has(> .piai-key), .piai-root:not(.piai-page):has(> .piai-key),
.piai-root .piai-root:has(> span),     .piai-root:not(.piai-page):has(> span) {
  padding: var(--piai-space-3) var(--piai-space-2);   /* 12px 8px */
}
```

- **推导**：原语 3（上下）/ 7（左右）+ wrapper 12/8 = **15 / 15** 视觉内边距；既「调大」又
  「四边一样」。`var(--piai-space-3)`/`var(--piai-space-2)` 都在 23-token allowlist 内
  （polish P3a 仍 `19/23`）。
- **门控理由**：嵌套 `.piai-root` 也出现在 Modal 的 portal wrapper 上（§18.9），若不加门控
  它会被一起补 12/8，把弹窗内容整体挤进去。气泡 wrapper 的直接子节点是 `.piai-key` 和/或
  `span`；Modal 的直接子节点是 `div.piai-item-actions`、`div.piai-catalog`、`p.piai-hint`
  → `:has()` 两条分支都不命中。两条选择器都成对写 `:not(.piai-page)` 变体（真实 portal 的
  wrapper 没有 `.piai-root` 祖先，理由同 §18.2 的配对证据）。
- 注意 `:has()` 是**子代**关系（`>`），所以 chip/hint 的**嵌套**内容不会误触发。

#### 18.12.3 夹具升级（v9-T40）

`tests/layout/primitives/Tooltip.module.css`（**新增**，3068B，md5 `f1f8bd16…`，源文件
`acb17103…`）取代了此前的内联模拟；r7 的 DOM 改为真实链
`span.bubble > span.label > span.piai-root`，页面按真实组件的方式给气泡内联 `left/top` 与
插件自己的 `maxWidth: 360px`。新增 4 条准则：

| 准则 | 判据（`tests/layout/measure-in-page.js`） |
| --- | --- |
| `bubbleInsetUniform` | `.bubble` 边框盒 → wrapper **内容盒**四边相等（`spread ≤ 1`）且每边 ≥ 12 |
| `bubbleInsetGrew` | 每边 **严格大于**原语最宽边（`> max(3,7,3,7) = 7`） |
| `modalWrapperUnaffected` | Modal 形 `.piai-root` 四边 padding 为 0，且其内容盒与 dialog 内容盒偏移 ≤ 0.5px |
| `modalGateDoesNotMatch` | 4 条门控 selector 对 Modal 全 false、对气泡 wrapper 至少一条 true（非空转） |

#### 18.12.4 我的独立复核（v9-T42）与边界

**两种测法**：

1. 夹具探针（contentBox 数学）：`bubbleInset.positive = {top:15,right:15,bottom:15,left:15}`、
   `spread 0`、`primitives = {3,7,3,7}`；`bubbleComputed.padding = 3px 7px`（原语真实值）、
   `position: fixed`、`maxWidth: 360px`、`animationName: none`（快照引用的 host token 未定义）。
2. 我自己的边框盒/内容盒重算（`/tmp/v9-evidence/t42-inset.js`）：bubble padding `3px 7px`、
   wrapper padding `12px 8px` → inset **`15/15/15/15`**、spread 0。

**两条内边距负对照（CSSOM、可逆）**：

| 负对照 | 结果 |
| --- | --- |
| A′：中和 T39 规则（`selectorText = '[data-t42-off]'`） | wrapper padding → `0`；inset → **`3/7/3/7`**、`spread 4` → `bubbleInsetUniform=false`、`bubbleInsetGrew=false`；Modal 仍 `0/0/0/0` |
| B′：去掉 `:has()` 门控 | 气泡仍 `15/15/15/15`；**Modal padding → `12/8/12/8`**，内容盒相对 dialog 偏移 `top 12 / left 8` → `modalWrapperUnaffected=false` |
| 恢复 | 回到 `15/15/15/15` + Modal `0/0/0/0` |

**判定：verified**——两种独立测法给同一组 `15/15/15/15`，两条负对照各自只打掉对应一半，
且 r1–r6 复测无扰动（r6 的 `scopePadding` 仍 `0/0/0/0`、`scopeGateMatches` 全 false）。

**边界**：`.bubble` 现为原语**真实快照**，但**定位**仍是夹具给的固定 `left/top`
（真实组件用 ResizeObserver 计算）、`data-side` transform 未设、箭头/`50vw` 上限被
`maxWidth:360` 覆盖；`Modal.module.css` 未快照，r7 的 dialog 用 16px 内联 padding 代表
原语 dialog padding（准则只要求"嵌套根不再额外加东西"，与 dialog 自带值无关）。

**过程教训（留档）**：我第一次写负对照 A′ 时把 `' [data-t42-off]'` 追加到**整条 selector
列表**上，CSS 只把它绑到列表最后一项，前三个选择器仍命中 → 看起来"负对照无效"。改成
`selectorText = '[data-t42-off]'` 才真正不匹配。负对照必须**自证注入后目标不再匹配**
（见 §18.2 的 `PROOF` 行），否则证明的是注入没生效，而不是夹具能判别。

---

## 19. v10：按功能模块拆分 lib/（2026-10-16，Lead 独立执行）

### 19.1 目标与验收口径

把 `lib/` 从「owner + 6 chunk」重整为「host 半 + owner + 18 chunk」，
**行为不变**：字段集、分组、控件分派、op 路径、DOM id/class/aria、文案、写入语义、
`settings.section` 注册、两条受控 remote 通道一律不动；只做搬迁、去重、文档同步。

拆分依据与边界见 [architecture.md](architecture.md) §1.1/§3/§4；
每个 chunk 的签名见 [interface-contract.md](interface-contract.md)。

### 19.2 原始输出（本次实测）

| 检查 | 命令 | 原始结果 | 判定 |
| --- | --- | --- | --- |
| 全量测试 | `node --test` | `tests 367 / suites 29 / pass 366 / fail 0 / todo 1` | **verified** |
| 模块契约 | `node --test tests/module-contract.test.js` | `tests 8 / pass 8 / fail 0` | **verified** |
| 语法检查 | `for f in lib/*.js; do node --check "$f"; done` | 20 个文件全部通过（无输出） | **verified** |
| 集成 harness | `node tests/verify.integration.mjs` | `checks passed : 38 / checks failed : 0 / unverified : 0` | **verified** |
| 渲染 harness | `node tests/verify.render.mjs` | `15 passed, 0 skipped, 0 failed` | **verified** |
| 样式/a11y harness | `node tests/verify.polish.mjs` | `42 passed, 0 failed` | **verified** |
| 布局夹具 | `node tests/layout/build-fixture.mjs` | `stylesheet 37317 bytes, sha256 8b626fdc…`（真实 STYLESHEET，非切片） | **verified** |
| 服务端字节新鲜度 | `verify.polish` P10a（`touch lib/client.js` 后） | `rev=af68ed45b3d9`；三个样式 chunk 的 `containsDiskFile` 全为 `true`（见 19.4） | **verified** |
| 字段零丢失 | `tests/coverage.test.js` + `tests/presentation.test.js` | 22/7/26 显式名单与 60 个 key 全部不变，测试未改断言 | **verified** |
| 写入语义零改动 | `git` 不可用；用 `cmp` 对照备份 | `lib/client.form.js` 与拆分前逐字节一致（`cmp` 无输出） | **verified** |

`todo` 仍是 1 条，即 v7 的 FINDING-3 既定偏离（inactive tab 的 `aria-controls` 指向未渲染面板），
与本次重构无关。

### 19.3 结构证据

- `lib/*.js` = 20 个文件；最大单文件 `lib/client.page.js` 917 行 / 650 代码行，
  拆分前最大者 `lib/client.panels.js` 4146 行 / 3101 代码行（约 5.4× 收敛）。
- **样式表逐字节不变**：`client.styles.chrome.css + client.styles.controls.css` 与拆分前
  `client.styles.js` 里的 `STYLESHEET` 逐字节相等（37153 B，用脚本对比原文件得出），
  因此布局夹具的 `sha256 8b626fdc…` 与拆分前同源，P2/P3 的解析结果不变。
- **写入/枚举/序列化三个纯 chunk 逐字节未改**：`cmp` 显示 `lib/client.form.js`、
  `lib/client.schema.js`、`lib/client.yaml.js`、`lib/index.js` 与拆分前完全一致。
- `tests/module-contract.test.js` 断言并实测通过：
  1. 磁盘上的 chunk 集合 ≡ owner `CHUNK_PLAN` ≡ `ensureChunks()` 实际请求集合；
  2. 每个 chunk 匹配 `^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$`、注册 id/chunk 唯一、
     保留 IIFE envelope、`var CHUNK` 等于自己的文件名；
  3. 每条依赖边（`fields`→两张数据表、`panels`→`core`+六个模块、`styles`→两个片段）
     的**被依赖者阶段严格早于依赖者**；
  4. 装载完成后 facade **未降级**（`fields.groups` 非空、`styles.COMPLETE === true`、
     `styles.STYLESHEET.length > 10000`、`panels.ProviderPanel/ProviderTabs` 为函数、
     `core.ui.StateDot` 已构建、`page.makePage` 可构建）；
  5. 每个交付文件 ≤700 代码行 / ≤1000 总行。

### 19.4 新增 chunk 可被服务端按需服务（实测）

拆分后新增了 12 个 chunk 文件。因为 `?rev=` 只由 owner 的 artifact stat 决定，
新文件不需要重启：P10a 在 `touch lib/client.js` 后对
`/plugins/dsh-llm-pi-ai-config/<file>?rev=af68ed45b3d9` 各取一次，得到

```
served lib/client.styles.js=7084B, lib/client.styles.chrome.js=24404B, lib/client.styles.controls.js=16661B
containsDiskFile lib/client.styles.js:true, lib/client.styles.chrome.js:true, lib/client.styles.controls.js:true
probes={"max-width: 719px":false,..."prefers-reduced-motion":true,".piai-tabs-bar":true,".piai-catalog":true}
```

即：**磁盘上刚创建的新 chunk 文件，服务端按当前 rev 就能取到，且字节与磁盘一致**。
这是「新 chunk 不需要 DSH 重启」的直接证据（旧规则只对 owner 的 rev 生效，见 §8）。

### 19.5 去重记录（同一功能不再有第二份实现）

| 合并项 | 拆分前 | 拆分后 |
| --- | --- | --- |
| `isComponent` / `symbolFor` | owner 与 panels 各一份 | 仅 `lib/client.core.js` |
| `FallbackDot`(owner) 与 `FallbackStateDot`(panels) | 两份等价 | 仅 `createUi()` 内一份 |
| `isExpression` | schema / yaml / panels 三份 | core 一份 + schema、yaml 各留本地一份（有意，见 architecture §5） |
| `readPathValue`(page) 与 `readPath`(core) | 两份等价 | 仅 `core.readPath` |
| `loadStylesChunk` / `loadYamlChunk` | 同一算法两份 | `lib/client.js` 的 `loadOptionalChunk()` 一份 |
| 原语解析与全部本地降级件 | owner + panels 两处 | 仅 `lib/client.core.js` 的 `createUi()` |

保留的重复（有意，已在 architecture §5 记录）：`hasOwn`/`isPlainObject` 在
`schema.js` 与 `form.js` 各一份（约 12 行），换来「三个纯 chunk 零依赖、可单独 import、
写入路径单文件可审计」。

### 19.6 GUI 层验证（用户重启 DSH 后补测）

用户重启 DSH 后，此前被缓存否定的「首次发现」被清除。实测（2026-10-16，重启后）：

| 检查 | 命令 / 方法 | 原始结果 | 判定 |
| --- | --- | --- | --- |
| 插件进入客户端 boot graph | `GET /plugins/events`（SSE，无需 cookie） | 74 条 entry，含 `{"id":"dsh-llm-pi-ai-config","url":"plugins/??dsh-llm-pi-ai-config/client.js&rev=af68ed45b3d9","rev":"af68ed45b3d9","inject":["@deepseek-ai/dsh-client-locale","@deepseek-ai/dsh-client-ui-settings"]}` | **verified**（首次发现不再是 blocked） |
| 全部 18 个 chunk 按当前 rev 可取且与磁盘逐字节一致 | 脚本遍历 `lib/client*.js`，逐个 `GET /plugins/dsh-llm-pi-ai-config/<file>?rev=af68ed45b3d9` 并 `body.includes(diskBytes)` | `chunks served byte-identical to disk: 18/18` | **verified** |
| 真实浏览器布局（拆出的样式片段） | ego-browser + `tests/layout/measure-in-page.js`，600×1200 | 7 个夹具（r1–r7）全部 `pass=true`，`measurements.missing=[]` | **verified**（v10 拆分后重测） |
| 设置页 DOM 渲染（导航格可见、tab/分组/字段行真的画出来） | 需要 GUI 会话 cookie | `GET /` 无 cookie 返回 401（`dsh web authentication required`）；launch token 是进程内随机值（`dsh-client-connection` 的 `processLaunchToken()`），无法从磁盘/进程外取得 | **untested**（等一条带 token 的 URL 才能测） |

**19.6.1 仍未验证**

- 设置页在 GUI 里的 DOM 渲染与观感：缺一条 `http://127.0.0.1:19387/?token=…` 形式的
  入口 URL（ego-browser 是独立 profile，没有桌面应用的 cookie 罐）。19.4 只证明
  **字节可服务且已进 graph**，不证明「页面真的画出来了」。
- 保存/写入路径不在验证范围（AGENTS §4：不得对用户真实 profile 作写操作）。
- `docs/interaction-design.md` / `docs/field-coverage.md` / `docs/research-findings.md`
  的行号引用已改为「文件 + 符号名」；`docs/verification.md` §1–§18 的历史行号改为
  文件级引用（旧行号对应已不存在的字节）。
- 未对用户真实 profile 做任何写操作（验证全程无损）。

### 19.7 三项待定项的处置（Owner 裁决 2026-10-16）

19.7 原本列出三个「需 Owner 决策」的项；Owner 已裁决，三项均已执行并复测全绿：

| # | 原问题 | 裁决 | 执行结果 |
| --- | --- | --- | --- |
| 1 | `lib/client.fields.groups.js` 的 `API_LABELS` / `lib/client.fields.js` 的 `rowsFor()` 无调用点 | **删** | 两处连同 `fields.apiLabels` 导出一起删除（约 36 行）；`tests/coverage/presentation/hints/compat` 全绿 |
| 2 | `lib/client.core.js` 的 `Switch` 绑定与 `FallbackSwitch` 无使用方 | **删** | 二者与 `fallbacks.Switch` 一并删除（约 18 行）；`ui.StateDot` **保留**（页面吸底条在用）；`tests/a11y.test.js` 的「布尔叶子不得解析 Switch」断言随之成为结构上更强的一条 |
| 3 | `client.page.js` 的 `ProviderDeleteButton()` 与 `client.panels.kit.js` 的 `ConfirmButton()` 是同一个两步确认的两份实现 | **只抽行为** | 新增 `lib/client.core.js` 的 `useArmedConfirm(react)`（上膛 + document/组内 Escape 取消），两处各自保留原有 chrome（吸底条原生 `.piai-btn` / 面板内 shipped `Button` 原语），DOM 与 aria 未改、无测试断言需要修改；`ProviderDeleteButton` 随之下沉到 `makePage()` 作用域内（它现在用 `chunks.core` 的 hook） |

复测（三项改动之后，`touch lib/client.js` 之前）：`node --test` **367 项：366 pass / 0 fail / 1 todo**；
`node --check` 20/20；`tests/module-contract.test.js` 8/8；三个 harness 38 / 15 / 42 全过；布局夹具重建正常。

### 19.8 GUI 实测（Owner 重启后，临时 profile）

19.6 记录的是「重启后 boot graph 已包含本插件」。为验证**页面真的渲染出来**，另起了一个
一次性 DSH home（`<repo>/.verify-home`，web profile 模板 + 本插件 symlink + 播种一个
provider），用 `--no-open --port 19411` 启动，取它打印的 token URL 在 ego-browser 里打开
（不触碰用户真实 profile，也不点任何「保存」）：

| 检查 | 原始结果 |
| --- | --- |
| 设置左栏出现本页 | 导航项依次为「通用设置 / 模型 / **模型扩展配置** / 内置插件 / Agent 预设」（order 12，紧随「模型」之后） |
| 页面根与文案 | `.piai-root.piai-page` ×1；标题「模型扩展配置」；副标题为「编辑 llm-pi-ai 的完整配置；未填写的字段保留为「默认（未设置）」，不会被写成 null。」 |
| tab 条 | `[role="tab"]` ×2：`演示提供商`、`添加`；`[role="tabpanel"]` ×1 |
| 分组卡片 | 9 个：基础信息 / 模型列表 / 逐模型覆盖 / 默认值 / 请求构造 / 超时 / 图片预算 / 重试 / 协议兼容（提供商级） |
| 字段行 | `.piai-row` ×22，`.piai-row-label` ×22，`.piai-info` ×22（与 22 个提供商级叶子一致） |
| 模型卡 | 展开后 `aria-expanded=true`，标题 `#1 演示模型`，卡内 32 行；标签含「模型 ID / 显示名称 / 上下文窗口 / 最大输出 Token / 输入模态 / 推理强度 / 透传 store 参数 / …」 |
| 兼容折叠 | 6 个分区头（`通用能力` 等）；展开后 `hidden=false`，首区 5 行 |
| 凭据行 | `DEMO_API_KEY` + 「未配置」+ 「复制」+ 「设置密钥」（按 schema role 识别，未出现密钥输入框以外的写入） |
| 吸底条 | `.piai-bar` ×1：「暂无改动 / 删除当前提供商 / 放弃修改 / 保存」 |
| 「原代码」只读面 | 切换后 `aria-pressed=true`，输出真实草稿 YAML（含 `models[].compat.chatTemplateKwargs: {}`、`modelOverrides: {}`、`defaultContextWindow: 262144` 等） |
| 错误状态 | `.piai-boundary` ×0、`.piai-error` ×0、`.piai-loading` ×0 |
| chunk 请求 | `performance.getEntriesByType('resource')` 里 `/plugins/dsh-llm-pi-ai-config/*` **18 条**，全部带 `?rev=af68ed45b3d9` |

判定：**设置页在真实 GUI 中 verified**（渲染、分组、控件、模型卡、兼容折叠、凭据行、只读原代码面）。

**19.8.1 三项裁决落地后的复测（同一实例，新 rev）**

三项改动后 `touch lib/client.js`，插件 rev 变为 `fa09e54c95d4`；刷新浏览器并重新进入设置页：

- 18 个 chunk 全部按新 rev 取到且与磁盘逐字节一致（脚本遍历比对）。
- 页面重绘：`.piai-page` ×1、tab ×2、分组 ×9、字段行 ×22、吸底条三键齐全、`.piai-error`/`.piai-boundary` 均为 0、chunk 请求 18 条（唯一 rev = `fa09e54c95d4`）。
- **共享的 `useArmedConfirm` 端到端实测**：点「删除当前提供商」→ 吸底条出现 `role="group"` 且文案为「确认删除提供商 demo？确认删除 取消」（上膛）；点组内「取消」→ `role="group"` 归 0、吸底条回到「暂无改动 / 删除当前提供商 / 放弃修改 / 保存」，状态仍是**暂无改动**（未产生任何写入、未点保存）。
  （Esc 的取消路径在 GUI 里被设置对话框自身的 Esc 关闭抢占，因此改用组内「取消」按钮验证同一条 `confirm.cancel()` 路径；Esc 本身的文档级监听由 `tests/a11y.test.js`/`tests/instances.test.js` 覆盖。）

**19.8.2 环境清理（无损）**

一次性 DSH home 位于 `<repo>/.verify-home`（web profile 模板 + 本插件 symlink），验证后已
`rm -rf` 删除；临时实例（`:19411`）已随后台任务终止；用户真实 GUI（`:19387`）未受影响、
未写入任何配置（全程只读；一次性 profile 也从未点「保存」）。

**未做**：保存/写入链路的 GUI 实测（AGENTS §4 明确禁止对真实 profile 做写操作来验证）、
真实网关下的「获取可用模型」（需要有效 baseURL 与密钥）。


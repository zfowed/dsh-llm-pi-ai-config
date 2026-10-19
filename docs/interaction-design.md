# 交互与视觉设计契约（interaction-design）

本文件是「模型扩展配置」页面美化改造的**唯一冻结契约**。三个并行实现者
（`impl-style` / `impl-ui3` / `impl-page3`）都只读本文件，不得各自发明类名、
颜色或组件。

所有事实来自只读调研，证据见 `docs/research-findings.md` 与本文件 §7。

---

## 1. 硬性边界

1. **`.css` 文件无法交付。** 插件路由只服务 `client.js`、`client.<name>.js`（须匹配
   `^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$`）与 `.map`。实测
   `/plugins/dsh-llm-pi-ai-config/client.css?rev=…` → **404**。
2. **样式只能由 JS 注入 `<style>`。** `dsh-client-modules` 的 `claimStyles(ownerId)`
   会把**未打 `data-plugin` 标签**的 `<style>` 打上"当前 materialize 者"的 id；
   `removeOwnedStyles(id)` 在失效/热重载时删除 `style[data-plugin=<id>]`。
   → **我们必须自己显式写 `data-plugin="dsh-llm-pi-ai-config"`**，否则会被下一个
   materialize 的插件抢走归属（届时热重载会误删别人的样式，或我们的样式被误删）。
3. **样式失败不得导致页面空白。** 上次空白页事故的根因是"渲染期抛错 → 槽位条目被
   abdicate"。样式 chunk 加载失败必须降级为"无样式但可用"。
4. **样式不得外泄。** Settings 是共享界面，我们的样式不能影响其它插件或内置页。
5. **不改字段真源与写入语义。** `lib/client.schema.js`、`lib/client.form.js`、
   `lib/client.fields.js` 本次**不动**；清空仍是 `form.remove`（`unset`），不是 `null`。
6. **不新增依赖、不引入打包器、不用 TypeScript。** `lib/*.js` 是手写的浏览器脚本：
   无 `import` / `export` / `module.exports`，遵守既有 chunk envelope。

---

## 2. 颜色：只允许平台外露的 14 个 token

Theme provider 外露的白名单（**仅**这 14 个）：

```
--dsw-alias-bg-base              --dsw-alias-border-l1
--dsw-alias-bg-layer-1           --dsw-alias-border-l2
--dsw-alias-bg-layer-2           --dsw-alias-brand-primary
--dsw-alias-bg-overlay           --dsw-alias-label-primary
--dsw-alias-state-error-primary  --dsw-alias-label-secondary
--dsw-alias-state-idle-primary   --dsw-alias-state-success-primary
--dsw-alias-state-warn-primary   --dsw-specific-sidebar-fill
```

全部 `requiresLightAndDark: true` —— 因此**只用 token 就自动适配亮/暗色**。

白名单是**逐轮累加**的，v7 起为 **23 个**：

| 轮次 | 新增 | 出处 |
| --- | --- | --- |
| 基础（14） | 上面 14 个 | §2 |
| v2 追加（4） | `--dsw-radius-md` `--dsw-alias-border-l4` `--dsw-alias-label-tertiary` `--dsw-alias-label-dimmed` | §10.5 |
| v6 追加（2） | `--dsw-alias-bg-module-platform` `--dsw-radius-lg` | §14.2 |
| v7 追加（3） | `--dsw-focus-ring-width` `--dsw-focus-ring-color`（官方焦点环）`--dsw-alias-label-primary-foreground`（R4 方框勾色） | §15.8 |

`--dsw-alias-state-business-primary` 在 v5 移出（它唯一的用途是我们自己画的焦点环，
见 §13）。**实测口径（2026-10-14）**：白名单 23 个，样式表实际用到 **19** 个；
4 个基础 token（`--dsw-alias-bg-overlay`、`--dsw-alias-state-idle-primary`、
`--dsw-alias-state-success-primary`、`--dsw-specific-sidebar-fill`）作为历史保留在名单内、
本轮未被引用；`tests/styles.test.js` 只要求**每个新增 token 被真实使用**。

**禁止**：`#rrggbb`、`rgb()`、`rgba()`、`hsl()`、颜色关键字（`red`、`white`…）、
以及白名单外的任何 `--dsw-*`（仓库里另有 400+ 个未外露变量，不得使用）。

间距 / 圆角 / 字号 **不使用** `--dsw-*`（未外露），统一用本地变量：

```css
.piai-root {
  --piai-space-1: 4px;  --piai-space-2: 8px;   --piai-space-3: 12px;
  --piai-space-4: 16px; --piai-space-5: 24px;  --piai-space-6: 32px;
  --piai-radius-sm: 6px; --piai-radius-md: 10px; --piai-radius-lg: 14px;
  --piai-font-sm: 12px;  --piai-font-md: 13px;  --piai-font-lg: 15px;
  --piai-line: 1.5;
}
```

---

## 3. 布局规范

- 页面根节点：`<div class="piai-root piai-page" data-piai="1">`。
  **`piai-root` 是所有选择器的前缀（见 §5）**。
- 内容列：`max-width: 880px; margin: 0 auto;` 左右留 `--piai-space-5`。
- 结构自上而下：

```
piai-root.piai-page
├─ piai-header       piai-title + piai-subtitle
├─ piai-tabs         SegmentedTabs（Routes / Advanced / Models）
├─ piai-notices      piai-warn / piai-error / piai-boundary（按需，role=alert）
├─ piai-body
│   ├─ piai-panel piai-providers     路由列表 + 路由基础字段
│   ├─ piai-panel piai-advanced      分组卡片
│   └─ piai-panel piai-models        模型列表 + 逐模型覆盖
└─ piai-bar          吸底操作条：状态 + 放弃 + 保存
```

- 卡片（`piai-group`）：`background: var(--dsw-alias-bg-layer-1)`，
  `border: 1px solid var(--dsw-alias-border-l1)`，`border-radius: var(--piai-radius-md)`，
  内边距 `--piai-space-4`，卡片间距 `--piai-space-4`。
- 字段行（`piai-row`）：
  - 视口 ≥ 720px：`grid-template-columns: 240px 1fr;`（label 左、control 右）
  - < 720px：单列，label 在上
  - 行间距 `--piai-space-3`；相邻行用 `border-top: 1px solid var(--dsw-alias-border-l1)` 分隔
- 提示（`piai-hint`）：`color: var(--dsw-alias-label-secondary)`，`font-size: --piai-font-sm`，
  位于 control 下方；长提示收进 `Tooltip`（触发钮 `piai-info`）。
- 操作条（`piai-bar`）：`position: sticky; bottom: 0;`
  `background: var(--dsw-alias-bg-layer-2)`，`border-top: 1px solid var(--dsw-alias-border-l1)`，
  内边距 `--piai-space-3`。
- **按下不改变布局**：所有交互态只用颜色/描边/位移 ≤1px，不允许尺寸跳动。
- **focus 可见**：焦点表现**交给平台控件**（§13）：输入框由 primitives 的
  `Input` 用 `:focus-within` 换边框色，`SegmentedControl` / `Switch` / `Checkbox`
  各自带 `:focus-visible` 环。**本插件样式表不声明任何 `:focus-visible` /
  `:focus-within` 规则**——v5 前叠加的容器环让一个聚焦输入框出现三层边框
  （事故记录：`docs/verification.md` §14）。我们自己的裸按钮沿用浏览器默认焦点环，
  因此任何地方都不允许 `outline: none` 而不给替代。
  （**v7 修订**：改为 §15.8 第 3 条的**白名单**——只允许命中我们自己的类/属性选择器，
  仍绝不允许命中 primitives 内部。）

---

## 4. 类清单（冻结，共 63 个；**v7 起 66，v8 起仍 66 但成员变动，v9 起 67**，见 §15.8/§16.5/§18.8）

CSS 选择器集合、JS 中出现的 `piai-*` 字面量集合、本清单**三者必须完全相等**。
多一个（死样式）或少一个（裸奔类名）都会让 `tests/styles.test.js` 失败。

| 分组 | 类名 |
|---|---|
| 作用域根（1） | `piai-root` |
| 页面骨架（8） | `piai-page` `piai-header` `piai-title` `piai-subtitle` `piai-tabs` `piai-notices` `piai-body` `piai-bar` |
| 状态（6） | `piai-dirty` `piai-loading` `piai-empty` `piai-error` `piai-warn` `piai-boundary` |
| 按钮（2） | `piai-btn` `piai-btn-primary` |
| 面板与分组（10） | `piai-panel` `piai-providers` `piai-provider-list` `piai-provider-add` `piai-tabs-bar` `piai-fields` `piai-group` `piai-group-title` `piai-disclosure` `piai-disclosure-body` |
| 字段行（12） | `piai-row` `piai-row-head` `piai-row-label` `piai-row-control` `piai-row-pair` `piai-hint` `piai-info` `piai-required` `piai-reset` `piai-unit` `piai-with-unit` `piai-key` |
| 复杂控件（20） | `piai-select` `piai-clear` `piai-bool` `piai-union` `piai-nested` `piai-nested-title` `piai-dict` `piai-dict-row` `piai-dict-key` `piai-dict-add` `piai-array` `piai-array-row` `piai-array-index` `piai-tags` `piai-tag` `piai-tag-add` `piai-checks` `piai-tiers` `piai-tier` `piai-catalog` |
| 实例卡头（3） | `piai-item-head` `piai-item-actions` `piai-item-remove` |
| 凭据（3） | `piai-cred` `piai-cred-editor` `piai-readonly` |
| 表达式（2） | `piai-expr` `piai-expr-body` |

（v5 新增 `piai-checks` `piai-tiers` `piai-tier` `piai-tier-key`，见 §13；v6 新增 `piai-row-pair`，见 §14；
v7 新增 `piai-item-head` `piai-item-actions` `piai-item-remove`，共 **66**；`piai-key` 保留但移入提示气泡，见 §15.8。
**v8 起仍 66，但成员变动**：**移除** `piai-count`（compat 分区不再显示计数徽标），
**新增** `piai-disclosure-body`（自写折叠头下方的分区体），见 §16.4/§16.5 W1。）

**已移除**：`piai-tab`（tab 交给 `SegmentedTabs`，它自带类与键盘语义）、
`piai-multi` / `piai-advanced` / `piai-models` / `piai-panel-title`（v3/v4 单页重排后不再存在）、
`piai-count`（**v8** 起 compat 分区删除计数徽标，见 §16.4）。
v7 **没有移除任何类**：上表 63 → 66 只增不减（`piai-provider-list` / `piai-provider-add`
仍分别作 tablist 与添加 panel 的容器，`piai-select` 仍作枚举组的容器）。`piai-tab` 属历史上
已被 `SegmentedTabs` 取代的名字，v7 起连 `SegmentedTabs` 也不再用于提供商条（见 §15.2）。
v8 是**等量替换**（−1 +1），数量仍 66。
**v9 是净 +1 → 67**：**新增** `piai-tabs-bar`（两槽 tab 条）与 `piai-catalog`
（发现结果列表），**移除** `piai-tier-key`（档位行改用普通 `Row`，key 进气泡），见 §18。
最终清单与 `tests/styles.test.js` 的 67 名集合、`tests/verify.polish.mjs` 的 `FROZEN_CLASSES` 三方一致。

---

## 5. 作用域与选择器规则

- 每条选择器**必须以 `.piai-root` 开头**。允许 `:is()`/`:where()` 组合，但首个复合选择器
  必须是 `.piai-root`。`@media` / `@keyframes` 内部的规则同样受此约束。
- 禁止：元素选择器（`div {}`）、全局属性选择器（`[class] {}`）、`*` 通配、`@import`、
  外部 `url(...)`、`!important`。
- `@keyframes` 名称统一以 `piai-` 前缀，避免与其它插件撞名。

---

## 6. 原生控件 → primitives 映射

| 现状 | 改为 | 依据 |
|---|---|---|
| 裸 `<button>` tab（`piai-tab`） | `SegmentedTabs({items,value,onChange,label})` | 自带 `tablist`/`tab` 语义 + ←/→/Home/End |
| 布尔三态（`piai-bool` + `Checkbox`） | `Switch({checked,onChange,label})` + 显式"未设置/清除" | `role="switch"`；保留 `false`/`undefined` 区分 |
| 枚举（原生 `h('select')`，`piai-select`） | ≤4 项 `SegmentedControl`；>4 项 `Menu`/`MenuItemButton` | 统一风格 + 键盘可达 |
| 长提示 / 协议门控说明 | `Tooltip({label,side})`，触发钮 `piai-info` | 渐进披露 |
| compat 26 键平铺 | 6 个折叠组（`piai-disclosure`），默认折叠 | 消除"26 个开关一屏"（**v8 起**：折叠头自写，标题**不再带 `piai-count` 计数**，见 §16.4） |
| 脏字段 | `piai-reset` 按钮（`Pill`/`Button`） | 见 §8 a11y 第 4 条 |
| 未保存状态 | `StateDot({state})` + `piai-dirty` + `aria-live="polite"` | 非纯颜色表达 |
| 破坏性删除（路由 / 字典键） | **内联二次确认**（按钮变为"确认删除？"） | 不引入需要 provider 的 `Modal`/`Toast` |

**禁止引入**需要额外 provider 的组件（`Modal`、`Toast`、`RiskConfirmation` 若依赖
provider）——缺 provider 会在渲染期抛错，直接触发 abdication（空白页事故的机制）。

> **本表是 v1 的目标映射，已被后续轮次逐条取代**（保留作历史依据）：
> tab 走 §15.2/§18.2（自建下划线条，不是 `SegmentedTabs`）；枚举走 §15.5（方框单选组，
> 不用 `SegmentedControl`/`Menu`）；**布尔走 §18.7.1（三态单选，`Switch` 已退役）**；
> 提示走 §15.3 + §18.6 / §18.6.1（气泡内容 + 逐选项追加行 + 嵌套作用域与无 `br` 的纵向栈）。
> **当前口径一律以最靠后的章节为准。**
> （唯一的例外是 `Modal`：v9 的模型发现选择器确实用了它——它由 primitives 自带、
> 不要求调用方提供 provider，因此不在上面「禁止引入」之列。）

### compat 的 6 个折叠组（键集冻结，共 26）

| 组 | 标题 | 键 |
|---|---|---|
| 1 | 通用能力 | `supportsStore` `supportsDeveloperRole` `supportsReasoningEffort` `supportsUsageInStreaming` `supportsFinishReason` |
| 2 | Token 与字段名 | `maxTokensField` `supportsMaxOutputTokens` `supportsThinkingTokenBudget` `thinkingTokenBudgetField` |
| 3 | 推理 / Thinking | `thinkingFormat` `requiresThinkingAsText` `requiresReasoningContentOnAssistantMessages` `forceAdaptiveThinking` `allowEmptySignature` |
| 4 | 工具调用 | `requiresToolResultName` `requiresAssistantAfterToolResult` `supportsStrictMode` `supportsStrictTools` `supportsEagerToolInputStreaming` `supportsCacheControlOnTools` |
| 5 | 缓存 | `cacheControlFormat` `supportsLongCacheRetention` |
| 6 | 模板与路由 | `chatTemplateKwargs` `chatTemplateArgs` `vllmPriority` `supportsTemperature` |

被当前协议 **withhold** 的键：置灰 + `Tag` 标注"该协议不支持"，但**仍可编辑**
（adapter 才是权威；提示只是 advisory，不得禁用写入）。

---

## 7. `lib/client.styles.js` 契约（chunk `styles`）

```js
// 注册：__ModuleLoader__.load({ id:'dsh-llm-pi-ai-config', chunk:'client.styles.js', factory })
// 发布：globalThis.__dshLlmPiAiConfig.styles
// 导出：
{
  STYLESHEET: string,        // 完整 CSS 文本
  CLASSES: string[],         // §4 的 63 个类名（v7 起 66、**v9 起 67**，见 §15.8/§18.8；排序后，供测试做集合比对）
  install(): () => void,     // 注入 <style>，返回幂等 disposer
  uninstall(): void,         // 显式移除（install 的 disposer 内部用它）
}
```

`install()` 要求：

1. 幂等：重复调用复用**同一个** `<style>` 节点，不产生第二份。
2. 显式打标签：`<style data-plugin="dsh-llm-pi-ai-config" data-plugin-css="llm-pi-ai-config">`。
3. 注入到 `document.head`；无 `document`（Node 测试）时**静默返回空 disposer**，不抛错。
4. disposer 只删除自己创建的那个节点；重复调用 disposer 安全。
5. `STYLESHEET` 是纯字符串，不含 `</style>`，不含任何模板占位符。

`lib/client.js` 的调用方式（由 `impl-page3` 实现）：

```js
ctx.effect(() => {
  let off
  ensureChunks().then((c) => { off = c.styles.install() }).catch(() => {})
  return () => { if (off) off() }
}, 'llm-pi-ai-config: stylesheet')
```

**加载/安装失败必须被吞掉，页面继续以无样式渲染。**

---

## 8. 无障碍清单（逐条可测）

1. tab：由 `SegmentedTabs` 提供 `tablist`/`tab`/`aria-selected` 与方向键；
   每个面板容器给 `role="tabpanel"` + `aria-labelledby`。
2. 每个控件有稳定 `id`，label 用 `<label htmlFor={id}>` 关联（不得只用邻近文本）。
3. 每个控件的字段级错误与提示用 `aria-describedby` 指向 `piai-hint` / 错误节点。
4. 校验失败的控件加 `aria-invalid="true"`；脏字段的"已修改"标识必须有文本，
   不得只靠颜色（`piai-reset` 的按钮文案即充当该文本）。
5. 保存失败/校验失败的消息容器 `role="alert"`；未保存状态容器 `aria-live="polite"`。
6. `Switch` 必须有 `label`；`Tooltip` 触发钮必须有 `aria-label`。
7. 折叠组必须可键盘展开（Enter/Space），标题即按钮语义。
    （**v8 起**：compat 折叠头改为自写（复用 `instanceCardHead`，常显 chevron 14px），
    不再是 `DisclosureRow`——见 §16.4。）
8. 删除路由/字典键：内联确认，且确认态可用键盘取消（Esc 恢复）。
9. 焦点必须可见且**只有一层**：由平台控件自带的焦点样式（Input 的 `:focus-within`
   边框色、SegmentedControl/Switch/Checkbox 的 `:focus-visible` 环）承担；本插件不得
   再叠加自己的环（§13、`docs/verification.md` §14）。
10. 不出现"仅图标无文本"的可聚焦控件。
    （**v7 修订**：允许官方 `_iconButton` 同款的图标按钮——它必须有本地化 `aria-label`
    与 `title`；被禁止的是**既无可见文本、又无无障碍名**的图标控件。实例卡的
    `.piai-item-remove` 属前者，见 §15.4。）
11. 复选组（`piai-checks`）用 `role="group"` + `aria-label`，组内每个 `Checkbox` 自带可见 label；
    档位表（`piai-tiers`）每行是 `<label htmlFor>` + 一个输入框（§13）。

**v7 补充（按实际实现，逐条可测）**：

12. 字段提示钮：每个有说明的字段行有一个常驻 `piai-info` `button`，`aria-label` 含
    中文标签与说明；控件的 `aria-describedby` 指向该按钮的 id（不是 portal 气泡），
    气泡 `role="tooltip"`（§15.3）。
13. 枚举单选组：容器 `role="radiogroup"` + `aria-label`，组内是同一 `name` 的原生 radio；
    行标签不再用 `htmlFor`（`useHtmlFor: false`，§15.5.7）。
14. 实例卡自写卡头：展开钮是 `button`，带 `aria-expanded` 与 `aria-controls`（指向卡体 id），
    标题文本在同一个按钮内（点标题即可展开）；删除钮是该按钮的**兄弟**，
    带本地化 `aria-label`（含实例名/序号）+ `title`，`opacity: .5` 但在
    `:hover` 与 `:has(:focus-visible)` 时显形——键盘/触屏可达（§15.4）。
15. tab：v7 起由自建下划线 tablist 提供 `role="tablist"`/`role="tab"`/`aria-selected`/
    roving `tabIndex`/方向键（§15.2；§8 第 1 条的 `SegmentedTabs` 表述在 v7 作废）。

**v8 补充（按实际实现，逐条可测）**：

16. compat 分区折叠头：复用自写折叠头（`instanceCardHead`），常显 14px chevron，
    原生 `button` 承载箭头 + 标题（整条可点、Enter/Space 可切换），带 `aria-expanded`
    与 `aria-controls`（§16.4）。**不再用 `DisclosureRow`**，也不再有计数徽标。
17. 分区体**常驻 DOM** + `hidden`：`aria-controls` 永远有真实目标（不是「折叠即移除」），
    字段行只在展开时挂载；分区 id 由 **index** 派生（中文标题会导致 id 碰撞，§16.4.7）。
18. 复选框组（`input` / `defaultInput`）：标签文字**必须可见**——这是 v8 的可见性要求，
    用 `tests/layout/` 的真实浏览器夹具检查（`node --test` 的 DOM 断言看不见布局，
    §16.5 W5/W6、`docs/verification.md` §17）。

---

## 9. 冻结的类→结构映射细节（供 CSS 与 JS 双方对齐）

- `piai-page` 与 `piai-root` 同时在根节点上。
- `piai-panel` 与 `piai-providers` 同时出现在提供商面板容器上（v3 起单页，`piai-advanced` /
  `piai-models` 已移除）。
- `piai-row-head` 只包 label 行（`piai-row-label`、`piai-info` 提示钮、`piai-required`、`piai-reset`）；
  **v7 起原始 key chip（`piai-key`）不在这里**，它在 `piai-info` 的气泡内容里（§15.3）。
- `piai-row-control` 只包控件本体（v7 起 `aria-describedby` 指向 head 里的 `piai-info`，
  见 §15.3.6）；`piai-with-unit` 包"控件+`piai-unit`"。
- `piai-multi` 用于多选枚举（`input: text/image`）；`piai-bool` 用于布尔行。
  （v5 起多选枚举改用 `piai-checks`，见 §13；`piai-multi` 已移除。）
- `piai-select` 仅作为枚举控件的外层包裹（不再代表原生 `<select>`，也不再代表
  `SegmentedControl`）：v7 起它是 `role="radiogroup"` 的**方框单选组**容器，最后一项是
  「默认（未设置）」（**v9 文案**，见 §18.7），选项用 `.piai-select > label` /
  `> label > span` / `input` 后代选择器命中
  （不新增类，见 §15.5）；`piai-clear` 只留给其它需要显式空值/清空的地方（字典行的 `null` 开关）。
- `piai-checks` 包住一个闭集枚举多选的复选组；`piai-tiers` / `piai-tier`
  是一个闭集字典（`keyEnum` + 标量值）的档位表（v5）。**v9 起**每个档位行内部改由共享
  `Row` 渲染（label + `piai-info` + `input`），裸 key chip 与 `piai-tier-key` 已移除（§18.5）。
- `piai-tabs-bar`（v9）是 tab 条的**两槽容器**：左槽 `.piai-provider-list`（tablist），
  右槽 `.piai-item-actions`（操作节点，可空）；`piai-catalog`（v9）是发现选择器里的
  勾选列表容器（§18.2/§18.3）。
- `piai-item-head` / `piai-item-actions` / `piai-item-remove`（v7）只在 `models[]` /
  `modelOverrides` 的实例卡上：`piai-item-head` 是自写卡头（展开钮 + 标题 + `piai-item-actions`），
  `piai-item-actions` 是右侧动作槽，`piai-item-remove` 是常驻的图标删除钮（§15.4）。
- `piai-disclosure` 仅加在 compat 分区容器上；`piai-disclosure-body` 是自写折叠头下方的
  分区体（**v8 起**，常驻 DOM + `hidden`，`padding-left: 18px` 对齐标题文字）。
  **v8 已删除** `piai-count` 计数徽标（§16.4）。
- `piai-expr` / `piai-expr-body` 用于只读 `!!js` 表达式展示。
- `piai-row-pair`（v6）是 `piai-fields` 下的一个两列网格，只包**连续的、`pair` id 相同的**若干
  `piai-row`；不属于任何 pair 的行仍然由 `piai-fields` 直接承载。

---

## 10. v2 修订：窄容器适配 + 控件观感（2026-10-13）

用户实测反馈两个缺陷，均已定位到具体原因（见 §10.1）。本节**覆盖** §2/§3/§5 中与之冲突的条款；
其余条款不变。类清单 §4 在 v2 当时**保持不变（52 个）**；v4 为 58、v5 起为 62。

### 10.1 实测根因

1. **控件宽度不齐 / 输入框不美观**
   primitives 的 `Input` 内部是 `display: inline-flex`，**按内容宽度收缩**，因此同一列里的三个输入框
   宽度各不相同（截图中 `API_0D000721_CV_API_` 最宽、`Deepseek 月卡` 较窄、`https://api.0d000721.cv/`
   又不同）。且官方皮肤使用的是 `--dsw-radius-md`、`--dsw-alias-border-l4`、
   `--dsw-alias-label-dimmed`、`--dsw-alias-label-tertiary`、`--dsw-alias-state-business-primary`
   —— 这些**不在** §2 的 14 个 token 白名单内，导致我们无法与之对齐外观。
2. **设置弹窗比视口窄时溢出**
   原 §3 用 `@media (max-width: 719px)`，那是**视口**断点。设置弹窗的内容列远窄于视口，断点不触发，
   于是仍按 `240px + 1fr` 硬排：`协议类型` 的 `SegmentedControl` 冲出卡片（`openai-responses` 被裁切）、
   `添加路由` 一行把输入框挤到裁切。`minmax(0,1fr)` 只允许**栅格轨道**收缩，无法阻止轨道内
   `nowrap` 控件的 min-content 宽度外溢。

### 10.2 布局：用「流式换行」，不用视口断点

`.piai-row` 改为 flex + 换行，靠**自身可用宽度**决定排布，不做任何宽度断点：

```css
.piai-root .piai-row      { display: flex; flex-wrap: wrap; align-items: flex-start;
                            gap: var(--piai-space-2) var(--piai-space-4); }
.piai-root .piai-row-head { flex: 0 1 200px; min-width: 132px; }   /* 标签列：可压缩 */
.piai-root .piai-row-control { flex: 1 1 320px; min-width: 0; max-width: 100%; }
.piai-root .piai-hint     { flex: 1 1 100%; }                        /* 提示独占一行 */
```

- 容器够宽 → 标签与控件并排；容器变窄 → 控件**自动换到下一行**（无需媒体查询、无需 `@container`）。
- **禁止**用 `@media` 宽度断点控制本页布局。`@media` 仅允许用于 `prefers-reduced-motion`、
  `prefers-contrast` 等**非宽度**偏好。这使行为不依赖 Chromium 的 `@container` 支持。
- 内容列 `max-width: 880px` 保留，但**必须**同时 `min-width: 0`，且祖先链上不得出现固定宽度。

### 10.3 控件必须吃满所在列（修「宽度不齐」）

```css
.piai-root .piai-row-control > * { width: 100%; min-width: 0; max-width: 100%;
                                   box-sizing: border-box; }
.piai-root .piai-row-control input { width: 100%; min-width: 0; }
.piai-root .piai-select, .piai-root .piai-multi, .piai-root .piai-bool {
  display: flex; flex-wrap: wrap; gap: var(--piai-space-2); min-width: 0; max-width: 100%;
}
.piai-root .piai-provider-add > * { min-width: 0; }
.piai-root .piai-provider-add input { flex: 1 1 160px; width: auto; }
```

效果：同一列的所有输入框宽度一致、随容器伸缩；多选项的分段控件与多选枚举**换行而不是溢出裁切**；
`添加路由` 行的输入框可压缩、按钮不越界。

### 10.4 观感对齐官方控件

- 控件高度、圆角、描边、占位符颜色一律**复用官方 primitives 同款 token**，不自定义近似色。
- 焦点态（v5 修订，见 §13）：**不自己画环**。官方 `settings-form/fields.module.css` 对输入框
  就是 `outline: none` + `border-color: var(--dsw-alias-state-business-primary)`；primitives
  的 `Input` 自带 `:focus-within` 边框色，`SegmentedControl` / `Switch` / `Checkbox` 自带
  `:focus-visible` 环。v5 前我们额外加的 `.piai-row-control:focus-within` 容器环与
  `.piai-root :focus-visible` 让聚焦的输入框出现**三层**边框。

### 10.5 token 白名单 v2（§2 的扩充）

在 §2 的 14 个 token 之外**追加**以下官方 primitives 自用 token（均已在应用内广泛使用，
实测出现次数：`--dsw-radius-md` 92、`--dsw-alias-border-l4` 50、`--dsw-alias-label-tertiary` 361、
`--dsw-alias-label-dimmed` 12）：

```
--dsw-radius-md                    --dsw-alias-label-tertiary
--dsw-alias-border-l4              --dsw-alias-label-dimmed
```

v6（§14）再追加 shipped「模型」页自己用来画卡片与网格的两个 token：`--dsw-alias-bg-module-platform`
（`_editor`/`_addCard` 的背景）与 `--dsw-radius-lg`（卡片圆角）。

v7（§15.8 no.2）再追加 3 个，**v7 起白名单共 23 个（实测用到 19 个，见 §2 的口径）**：
`--dsw-focus-ring-width`、`--dsw-focus-ring-color`（官方 tab / 提示钮 / 图标钮的焦点环）、
`--dsw-alias-label-primary-foreground`（R4 自画方框的勾色，§15.9 D3 只放行这一个前景 token）。

（v5 修订：`--dsw-alias-state-business-primary` 曾因焦点环在册，环移除后一并移出——它是
“可用的 token”，不是“必须用到的 token”。§15.9 D3 裁决：官方 `.helpButton:hover` /
`_iconButton:hover` / `--dsw-radius-sm` 等白名单外 token **不引入**，用等价的
`--dsw-alias-bg-layer-2` 与本地 `--piai-radius-sm` 代替。）

理由：要与官方控件外观对齐，就必须使用官方控件自身使用的 token。仍**禁止**白名单外的其它
`--dsw-*`，以及一切写死颜色（hex/rgb/hsl/关键字）。

### 10.6 选择器规则 v2（§5 的放宽）

仍然要求**每条选择器的首个复合选择器是 `.piai-root`**（这保证零外泄）。但**允许**
`.piai-root` 之后的**后代元素/属性选择器**，以便命中 primitives 内部节点：

```css
/* 允许 */  .piai-root .piai-row-control input { width: 100%; }
/* 允许 */  .piai-root .piai-row-control input::placeholder { color: var(--dsw-alias-label-dimmed); }
/* 仍然禁止 */  input { width: 100%; }        /* 未以 .piai-root 开头 */
/* 仍然禁止 */  .piai-root * { box-sizing: border-box; }   /* 禁止 `*` 通配 */
/* 仍然禁止 */  @import / 外部 url( / !important
```

### 10.7 测试必须相应更新（`tests/styles.test.js`）

1. 断言**不存在**用于布局的 `@media` 宽度断点（`@media` 内不得出现 `width`/`min-width`/`max-width`
   条件；仅允许 `prefers-*`）。
2. 断言存在换行式布局：`.piai-row` 有 `flex-wrap: wrap`，`.piai-row-control` 有 `flex: 1 1 …` 且
   `min-width: 0`。
3. 断言控件流式规则存在：`.piai-row-control > *` 与 `.piai-row-control input` 均有 `width: 100%`
   与 `min-width: 0`。
4. 断言 `.piai-select` / `.piai-multi` / `.piai-bool` 有 `flex-wrap: wrap` 与 `max-width: 100%`。
   （v5：`.piai-multi` 已移除，多选枚举改 `piai-checks`；断言改为
   `.piai-select` / `.piai-tags` / `.piai-bool` / `.piai-checks` / `.piai-tiers`。）
5. token 白名单更新为 v2（v5 起为 **18** 个，见 §13）；白名单外仍必须为 0。
6. 选择器规则放宽后，仍断言：每条选择器以 `.piai-root` 开头、无 `*` 通配、无 `@import`/`url(`/`!important`。
7. 类覆盖三方集合相等（v2 为 52，v4 为 58，**v5 起为 62**，见 §13）。
8. v5：断言样式表里**没有任何** `:focus-within` / `:focus-visible` 选择器（§13）。

### 10.8 验收

- `node --test` 全绿（v2 当时 168；当前计数见 §13）；`node tests/verify.integration.mjs` 34/0；
  `node tests/verify.render.mjs` 15/0；`node tests/verify.polish.mjs` 34/0（均为 v2 当时）。
- **变更后必须让 owner 的 rev 变化**，否则浏览器仍拿旧字节（见 `docs/development.md` §5）。
- 最终观感由用户确认；窄容器下的真实视觉效果无法在本环境自动化验证，只能以「结构性保证 +
  用户肉眼」两者合并判定。

---

## 11. v3 修订：提供商 Tab + 单页全量字段（2026-10-13）

本节**覆盖** §3（结构）、§4（类清单）、§6（tab → `SegmentedTabs` 的映射）与 §9
（面板结构）中与之冲突的条款；其余（§2/§10 的 token、选择器、流式布局规则）不变。

### 11.1 布局

```
piai-root.piai-page
├─ piai-header       piai-title + piai-subtitle
├─ ProviderTabs      piai-tabs
│   ├─ piai-provider-list [role=tablist]   每个提供商一枚 Pill（role=tab）
│   └─ piai-provider-add                   添加提供商 / 删除当前提供商
├─ piai-notices      piai-warn / piai-error / piai-boundary（按需，role=alert）
├─ piai-body         [role=tabpanel]（仅有选中提供商时）
│   └─ ProviderPanel  piai-panel piai-providers
│       └─ piai-group × N  基础信息 / 模型列表 / 逐模型覆盖 / 默认值 / 请求构造 /
│                          超时 / 图片预算 / 重试 / 协议兼容 / 其他
└─ piai-bar          吸底操作条：状态 + 放弃 + 保存
```

不再有「路由 / 高级 / 模型」三个标签页：分组只作为**页内分节**，任何分组都不得被
藏进另一个标签。

### 11.2 tab 不再用 `SegmentedTabs`，改写自建 chip tablist

> **历史（v3）**：本节描述的 `Pill` chip tab（24px/12px）在 **v7 被推翻**——改为照抄
> 官方「内置插件」页的下划线 tab（`role="tab"` 裸按钮 + `data-active`），并新增末尾
> 「添加」tab、删除移入吸底条。当前契约见 §15.2；本节保留为版本历史，不再作为实现依据。

`SegmentedTabs` 把 tab 排成等宽的 `gridTemplateColumns: repeat(N, minmax(0,1fr))`，
行高 34px、字号 14px；提供商一多就必然挤压/裁切，且它的内联栅格无法用非 `!important`
样式覆盖。因此顶部 tab 改为**一列小的 `Pill`（24px 高 / 12px 字号）**：

- 容器 `piai-tabs`：纵向 flex（tab 行 + 添加行），`width: 100%`、`min-width: 0`。
- tab 行 `piai-provider-list`：`flex-wrap: wrap`，chip 换行而不是溢出。
- 语义与键盘模型与 shipped `SegmentedTabs` **完全一致**（在其实现中复刻）：
  `role="tablist"` + `aria-label`；每枚 chip `role="tab"`、`id`、`aria-selected`、
  `aria-controls`、roving `tabIndex`（仅选中项为 `0`）；`ArrowLeft`/`ArrowRight`/`Home`/`End`
  先 `preventDefault`/`stopPropagation`，再聚焦邻居并请求切换。
- `aria-controls` 指向页面根部那个 `role="tabpanel"`，其 `aria-labelledby` 是选中 tab 的 id。
- 空提供商列表：不渲染 tablist，也不渲染 `tabpanel`。

### 11.3 实例卡片（`models[]` / `modelOverrides`）

- `models[]` 的每个元素、`modelOverrides` 的每个键各一张可折叠卡片，
  **默认折叠**。
  （**v7 起改为自写卡头**，v8 起连 compat 折叠组也不再使用 `DisclosureRow`——
  该 primitive 从 v8 起不再被解析，见 §15.4 与 §16.4。）
- 卡片标题 = `#序号` + 该实例第一个 `required` 且 `kind === 'string'` 的叶子值
  （由 schema 元数据取，不写字段名；`models[]` 命中 `id`，`modelOverrides` 通常没有
  required 字符串叶子，于是只显示键）。
- 卡片体是成员字段块 + 删除控件；列表底部是「添加一项 / 添加键」。
- 写入路径必须带实例段：`providers.<p>.models.<i>.<field>` /
  `providers.<p>.modelOverrides.<id>.<field>`。这是 host `applyPathOp` 唯一接受的形状
  （缺实例段会抛 `Config array index "<field>" is out of range`）。
- 容器的值是 `!!js` 表达式时：只读展示，不提供增删。

### 11.4 类清单 v3（52 → 49）

**移除**：`piai-panel-title`（单页无需面板标题）、`piai-advanced`、`piai-models`
（三个标签页合并成一个面板）。其余 49 个类名不变；CSS 选择器集合、`CLASSES`
导出与 JS `piai-*` 字面量仍必须三方集合相等。

### 11.5 测试必须相应更新

1. `tests/styles.test.js`：类计数 49；新增 `.piai-tabs` 为纵向 flex、`.piai-provider-list`
   换行、`.piai-provider-list [role="tab"]` 不超宽的断言；§10.2–§10.4 的流式布局与
   token 规则不变。
2. `tests/render.test.js`：tab 断言改为「一条 tablist、每个提供商一个 tab、
   `aria-controls`/`aria-labelledby` 交叉一致、切换提供商后 tabpanel 指向新 id、
   无提供商时无 tabpanel」；`piai-tabs` 的源检查移到 `lib/client.panels.js`。
3. `tests/a11y.test.js`：`ProviderTabs` 的 tablist/roving tabindex/箭头键断言；
   `ProviderPanel` 一次渲染全部分组；compat 6 组 26 键、withheld 标记、二次确认不变。
4. `tests/instances.test.js`（新增）：模型/覆盖卡片的默认折叠、标题、以及每张卡片
   发出的 op 路径（`edit`/`remove` 均带实例段）。
5. `tests/verify.polish.mjs`：`FROZEN_CLASSES` 49；P5a 改为自建 tablist 语义断言；
   `renderCell({tab})` 改为 `renderCell({provider})`。

### 11.7 原语解析与控件视觉（2026-10-13 补充）

**解析规则（硬性）**：平台原语的可用性按「React 组件类型」判断，而不是
`typeof === 'function'`。shipped primitives 把 `Button` / `Input` 导出为
`React.forwardRef(...)`、`DisclosureRow` 导出为 `React.memo(...)`——它们是对象，
被判成「缺失」就会静默换成原生控件（缺陷与证据见 `docs/verification.md` §11）。
规则：接受 function 与 `forwardRef`/`memo`/`lazy` 包装对象；拒绝
`react.element` 与普通对象；`Symbol.for` 不可用时退回「只接受函数」。
（**v8 起**：`DisclosureRow` 被移出解析，memo 包装形态的覆盖要改指向一个**仍在解析**的
primitive，否则该解析路径失去测试覆盖——见 §16.5 W7。）

**控件视觉**：
- 行内动作按钮统一 `Button variant="outline" size="sm"`；破坏性动作仍用二次确认。
- 折叠卡片（模型 / 逐模型覆盖）用卡片外观，但标题行、箭头、hover、键盘展开由
  `DisclosureRow` 自己提供；卡片的字段块吃满宽度，动作按钮保持紧凑。
  （**v7 起改为自写卡头**；**v8 起** `DisclosureRow` 不再被解析——compat 分区也改自写头，
  见 §15.4、§16.4。）
- add 行的弹性给到**原语的包装元素**（`Input` 渲染包装 span），不能用 `input` 选择器。
- 类清单仍为 49，token 白名单仍为 19，不新增 `piai-*` 类。

### 11.6 验收

- `node --test` 200/200；`node tests/verify.integration.mjs` 38/0；
  `node tests/verify.render.mjs` 15/0；`node tests/verify.polish.mjs` 42/0。
- 类覆盖 49 / 49 / 49；token 白名单仍 19；无宽度 `@media`。
- **变更后必须让 owner 的 rev 变化**，否则浏览器仍拿旧字节（见 `docs/development.md` §5）。
- 最终观感由用户确认；真实视觉效果无法在本环境自动化验证。

---

## 12. v4 修订：竖向行版式 + 组件规范 + 凭据行（2026-10-13）

本节**覆盖** §3 与 §10.2 的横向两列行版式；§2/§10.5 的 token 白名单与 §10.6 的选择器规则不变。

### 12.1 行版式：竖向（= 官方 settings-form）

```
.piai-row                 label 行 → 控件 → 说明（flex-direction: column）
.piai-row + .piai-row     border-top: 0.5px solid var(--dsw-alias-border-l2)
.piai-row-head            中文标签 + 原始 key chip + 必填/已改
.piai-hint                常态块级，永远在控件块下方
```

横向两列 + `flex-wrap` 的问题是：控件一宽就整行换行、落到标签下方重新排列，
表现为「标签和控件错位、说明被挤在一起」（用户截图即此）。竖向版式在任何容器宽度下
都不会漂移，也不需要宽度 `@media`。

### 12.2 组件规范（按 kind / 结构分派，面板不写字段名）

| 组件 | 用于 | 形制 |
| --- | --- | --- |
| 文本/数字输入 | `string`/`number`/`integer` | 32px、全宽、placeholder=默认值、单位后缀；空 = `unset` |
| 开关 | `boolean` | `Switch` + 「已开启/已关闭/未设置（继承）」 |
| 单选（≤4） | `enum`/`const` | ~~`SegmentedControl`~~ **v7 作废**：改为方框单选组（原生 radio + `role="radiogroup"`），见 §15.5 |
| 单选（>4） | `enum` | ~~`Menu` 下拉~~ **v7 作废**：任意项数都用同一套方框单选项，见 §15.5 |
| 多选标签 | `array` + `enum`（`input`/`defaultInput`） | **v5：`piai-checks` 复选组**，每个允许值一个 `Checkbox`（v4 为 chip + 「添加」菜单） |
| 可编辑标签 | `array` 无 enum（`retryableCodes`） | 自由文本 chip：Enter/按钮添加、× 删除、去重 |
| 键值字典 | `dict` | **开放字典**（`headers`、`compat.chatTemplate*`）：行 = 原始 key + 中文标签 + 值控件 + 删除；`valueEnum` 时值为单选，值可 `null` 时给显式 `null` 开关。**闭集字典**（`keyEnum` + 标量值，如 `reasoningEfforts`）v5 起走档位表 |
| 档位表（v5） | `dict` + `keyEnum`（标量值） | `piai-tiers` / `piai-tier` / `piai-tier-key`：`keyEnum` 里每个键一行（key chip + 中文档位 + 一个输入框），**留空 = 删除该键（不声明）**，全空 = 字段 `unset`；没有增删行、没有 null 开关 |
| 联合分支 | `union` | 分支选择器（中文名，`<field>.branch.<value|kind>`）+ 「分支参数」嵌套块（`piai-nested`）；同路径 const 分支不再重复渲染；分支选择按值形态判定并**写回分支本身的字面量/判别键**（v5） |
| 实例卡片 | `container` | 可折叠卡片（模型/覆盖），卡内字段同为竖向 |
| 凭据行 | `meta.role === "credential-ref"` | 只读引用名（`piai-readonly`）+ 状态 + 复制 + 设置/更新/清除密钥（`piai-cred`，密码行 `piai-cred-editor`） |
| `!!js` 表达式 | 任意 | 只读展示、原样保留 |

区块间距：页面 `.piai-page` 的列间距提到 `--piai-space-5`；`.piai-provider-add` 内所有
按钮与 32px 的输入框等高。

### 12.3 类清单与 token（v4 为 58 类 / 仍为 19 token；v5 起 62 类 / 18 token、v6 起 63 类 / 20 token，见 §13、§14）

新增（v4）：`piai-clear` `piai-key` `piai-nested` `piai-nested-title` `piai-tag` `piai-tag-add`
`piai-tags` `piai-cred` `piai-cred-editor` `piai-readonly`；**移除**：`piai-multi`（复选框排被标签编辑器取代）。
`CLASSES` / CSS / JS 三方集合仍必须相等（v4 为 58，v5 为 62，v6 起 63，**v7 起 66**），token 白名单
（v5 为 18，v6 起 20，**v7 起 23**，见 §15.8）。

### 12.4 验收（本轮实测）

- `node --test` **200/200**；`verify.integration.mjs` 38/0；`verify.render.mjs` 15/0；
  `verify.polish.mjs` 42/0。
- 每个配置项 key + 中文标签 + 中文说明：`tests/presentation.test.js`（60 key / 125 渲染期叶子）。
- 凭据：只读引用、状态、设置/清除密钥走后端 remote，密钥不进配置。
- 观感仍需用户 F5 目视确认。

---

## 13. v5 修订：焦点单一化 + 继承入 tab + 复选组 + 档位表 + 提示文案（2026-10-13）

用户带着 5 张截图提出 5 个问题。本节**覆盖**与之冲突的旧条款：§3 的 focus 条款、
§8 第 9 条、§9 的映射、§10.4 的焦点态、§10.5 的白名单、§12.2 的三行（单选/多选/字典）。
风格规则（§5、§10.6、§10.7）、写入语义（`unset`，不写 `null`）不变。

### 13.1 焦点：只保留平台自己的一层

删除 `.piai-root .piai-row-control:focus-within { outline… }` 与
`.piai-root :focus-visible { outline… }`。依据：官方 `settings-form/fields.module.css`
对输入框就是 `outline: none; border-color: var(--dsw-alias-state-business-primary)`；
primitives 的 `Input` 自带 `.wrap:focus-within` 边框色，`SegmentedControl` / `Switch` /
`Checkbox` 各自带 `:focus-visible` 环。**本插件样式表不声明任何焦点规则**，我们自己的裸按钮
（`.piai-clear`、`.piai-tag button`、provider tab）沿用浏览器默认焦点环。
测试反过来断言：`tests/styles.test.js` 解析出的选择器里不得出现 `:focus-within` /
`:focus-visible`；白名单随之从 19 收到 18（移除 `--dsw-alias-state-business-primary`）。

（**v7 修订**：v7 抄官方 `.tab:focus-visible` / `.helpButton:focus-visible` /
`_iconButton:focus-visible`，因此「全表禁止」改为 §15.8 第 3 条的**白名单**：
只允许命中我们自己的类/属性选择器，仍绝不允许命中 primitives 内部。）

### 13.2 「继承」是 tab 里的一段

> **历史（v5）**：本节基于 `SegmentedControl` 的滑轨。**v7 改为方框单选组**，
> 「继承」是组内最后一个单选项（值仍是字符串哨兵 `__unset__` → `onClear()`），
> 当前契约见 §15.5；本节保留哨兵语义的由来。

`SegmentedControl` 用 `options.findIndex(o => o.value === value)` 决定指示块位置：
选不中任何项时 index = `-1`，白色指示块被平移到轨道外（截图里卡片左侧的漂浮白块）。
因此 `EnumControl` 在 ≤4 个真实选项时，把「继承」作为**最后一段真实选项**放进同一轨道
（值是一个字符串哨兵 `__unset__`：tab id 会被拼成 `${id}-${value}`，Symbol 无法拼接，
`null` 会与可空枚举自身的 `null` 选项撞车）；`onChange(哨兵)` → `onClear()`。
段内短标签「继承」，完整「继承（未设置）」留在 `title` 与 >4 项的 Menu 行里。
（**v9 起**：`Menu` 早已不在枚举路径上，且这一项的可视文案统一改为
「默认（未设置）」——**历史小节保留原文，当前口径见 §18.7**。）
手写的越界值会被追加成一段「未识别」，保证控件**永远拿得到一个自己列出的值**。

`UnionControl` 同步改为**按值形态**判定分支并写回分支本身：const 分支写该字面量
（`reasoningEfforts: false`，旧实现写的是 `{}`）；判别式对象分支写
`{ <discriminator>: <值> }`（`leaf.discriminator` 现在由 schema 走查补上，旧实现同样写 `{}`）；
没有字面量的结构化分支（档位表）只把分支体显示出来，**不落盘**，由它自己的控件写第一个值。

### 13.3 闭集多选 = 复选组（`piai-checks`）

`array` + `enum`（`input` / `defaultInput`，值集 `text`/`image`）改为每个允许值一个
`Checkbox`（中文名 + 原始 YAML 值：`文本（text）` / `图片（image）`，来自 fields 的
`VALUE_LABELS`）。取消最后一个勾选 = `form.remove`（`unset`）。`TagListControl` 只留自由
标量数组（`retryableCodes`），不再有「添加」菜单分支。

（**v8 修订**：复选框曾被 `.piai-row-control input{width:100%}` 拉伸、标签文字被压成 0 宽
而不可见；v8 把盒子钉在 16×16、文本只留 `white-space: nowrap`，见 §16.2。）

### 13.4 闭集字典 = 紧凑档位表（`piai-tiers`）

`dict` + `keyEnum` + 标量值（`reasoningEfforts`）改为：`keyEnum` 里**每个键固定一行**
（key chip + 中文档位名 + 一个输入框），没有增删行、没有每档卡片、没有 `null` 开关。
写入语义：**留空 = 删除该键（不声明该档位）**，填值 = 写该字符串，全部留空 = 字段 `unset`。
依据：adapter 只允许 `off` 为 `null`，其它档位写 `null` 或空串都会被判非法；因此界面不产生
非法值。代价（已记录）：`off: null`（支持关闭思考但不发参数）没有 UI 入口，只能手写 YAML。
开放字典（`headers`、`compat.chatTemplate*`）仍走原来的 `DictControl`。

### 13.5 提示文案：说清作用，不复述字段名

`lib/client.fields.js` 的 `hint` 统一按「作用 + 生效条件/默认 + 不支持的后果」写，
禁止出现「是否支持 X 参数」「X 的字段名」「X 的格式」这类空话；26 个 compat 键的语义取自
pi-ai 安装实现（`@earendil-works/pi-ai/dist/api/openai-completions.js`、
`anthropic-messages.js`）与 `README.md` 的 compat 接口注释。长度 ≤ 48 汉字时内联显示，
更长的收进官方 settings-form 同款「提示」气泡（`piai-info` + `Tooltip`，`LONG_HINT_LIMIT`）。
（**v7 起作废**：所有字段级说明一律进气泡，`LONG_HINT_LIMIT` 已从实现移除，见 §15.3.4；本节
保留为 v5 文案标准的由来——文案内容与写作要求仍然有效。）

### 13.6 验收（本轮实测）

- `node --check` 全部 `lib/*.js` 通过；`node --test` 当时 **207/207**（v6 起 209，见 §14）。
- `verify.integration.mjs` 38/0；`verify.render.mjs` 15/0；`verify.polish.mjs` **42/0**
  （改动 chunk 后必须 `touch lib/client.js`，否则 P10a 只会报告「服务端仍是旧字节」，
  见 `docs/development.md` §5）。
- 先证伪：把老行为放回（恢复焦点环 / 档位表不删键 / 去掉「继承」段 / union 写 `{}` /
  去掉 `leaf.discriminator`）→ 对应新断言全部失败，记录见 `docs/verification.md` §14。
- GUI 目视确认仍为 `untested`：需要用户点「重启」加载修复后的字节。

---

## 14. v6 修订：对齐官方「模型」页观感（2026-10-13）

用户贴了 shipped「模型」设置页（`@deepseek-ai/dsh-client-ui-settings-models`）的截图，要求
"参考这样子的样式"。本节是**照抄该页自己的 CSS**（从 `lib/client.js` 里取出的
`_6fYtdq_*` 规则）而不是凭截图目测，因此覆盖 §4 的类清单、§9 的映射、§12.1 的行版式
（去掉逐行细线）与 §10.5 的 token 白名单；功能与结构（控件分派、写入语义、tab、key chip、
档位表、复选组）不变。

### 14.1 抄到的官方规则（证据）

| 官方类 | 规则 | 我们的对应 |
| --- | --- | --- |
| `_field` | `flex-direction:column; gap:6px` | `.piai-row`（不再是"行 + 0.5px 分隔线 + 上下 12px"） |
| `_fieldLabel` | `color:label-secondary; font-size:12px; font-weight:500` | `.piai-row-label` |
| `_input` | `height:32px; border:.5px border-l4; radius-md; background:bg-layer-1; padding:0 10px; font-size:14px` | 我们直接用 primitives 的 `Input`，同款尺寸/描边/底色 |
| `_input:focus` | `border-color:business-primary; outline:none` | v5 起不再叠加自己的环（§13.1） |
| `_advancedHint` / `_modelCatalogMeta` | `color:label-tertiary; font-size:12px; line-height:18px` | `.piai-hint` |
| `_editor` | `background: bg-module-platform; border-radius: radius-lg; gap:14px; padding:14px 16px` | `.piai-group`（无边框、官方底色/圆角/padding） |
| `_modelCatalogTitle` | `color:label-secondary; font-size:12px; font-weight:500` | `.piai-group-title` |
| `_modelAdvanced` | `grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px` | `.piai-row-pair` |
| `_modelEntry` | `border:.5px border-l4; border-radius:radius-lg; padding:6px` | `.piai-array-row` / `.piai-dict-row` |
| `_modelInputChoices` | `flex-wrap:wrap; align-items:center; gap:16px; min-height:32px` | `.piai-checks`（输入模态复选组，v5 已同构） |

### 14.2 落地规则

1. **间距来自容器，不再来自分隔线**：`.piai-row` 去掉 `border-top` 与上下 padding，
   `.piai-fields` 给 12px 间距；细分隔线只保留在分节边界（与官方一致）。
2. **字号/颜色就位**：字段标签 12px/500/`label-secondary`；说明 12px/`label-tertiary`；
   分节标题 12px/500/`label-secondary`。
3. **成对短字段两列**：新增 `piai-row-pair`（`repeat(2, minmax(0,1fr))`，行距 8px、列距 12px），
   由 `lib/client.fields.js` 的 `pair` 字段决定分组（与既有 `unit`/`rows` 同类，属于呈现元数据，
   不决定字段是否存在）。当前分组：`identity`（模型 id + 显示名）、`size`（上下文窗口 +
   最大输出 token）、`timeout`（请求超时 + WebSocket 连接超时）、`image`（图片字节 + 总量）、
   `backoff`（退避初始/上限）、`budget`（thinking 预算六档，3×2）。**连续且同 id** 才合并成网格，
   单成员仍渲染成普通行（例如 `modelOverrides` 里没有 `id`，`name` 就单独一行）。
4. **卡片**：分组卡 `bg-module-platform`/`radius-lg`/`14px 16px`；模型与覆盖的实例卡
   `.5px border-l4` + `radius-lg` + `6px` 内边距。
5. **token 白名单**扩到 **20**：新增 `--dsw-alias-bg-module-platform`、`--dsw-radius-lg`
   （都是官方页自己在用的 token）。类清单扩到 **63**（新增 `piai-row-pair`）。
   （**v7 起**：23 token / 66 类，见 §15.8；§15 还推翻了本节的实例卡外观——卡头自写、
   不再由 `DisclosureRow` 承担，见 §15.4。）

### 14.3 测试与验收

- `tests/styles.test.js`：断言 `.piai-row` **没有** `border-top`、`.piai-fields` 有 12px gap、
  `.piai-row-label` / `.piai-hint` 的颜色与字号、`.piai-row-pair` 是两列网格；类集合 63；
  token 白名单 20（且每个新增 token 必须真的被用到）。
  （**v7 起**：类集合 66、token 白名单 23，计数以 §15.8 与 `tests/styles.test.js` 为准；
  本节其余 v6 断言继续有效。）
- `tests/instances.test.js`：模型卡里 `id`+`显示名称`、`上下文窗口`+`最大输出 Token` 各自落在
  一个两列网格里；网格里至少两行；复选组与档位表**不在**网格里（整行）。
- `tests/presentation.test.js`：每个 `pair` id 至少覆盖两个渲染期叶子（防止"写了没用"）。
- `tests/verify.polish.mjs`：P9a 改为探针 `.piai-fields` 的 gap 与 `.piai-row-pair` 的网格，
  并断言 `.piai-row` 不再有分隔线。
- 验收：`node --test` **209/209**；`verify.integration.mjs` 38/0；`verify.render.mjs` 15/0；
  `verify.polish.mjs` 42/0（先 `touch lib/client.js`）。GUI 观感仍待用户目视。

---

## 15. v7 修订：官方 tab / 提示气泡 / 实例卡头 / 方框单选 / 复选组间距 / 同行按钮（2026-10-14）

本节是 v7 轮次（用户 6 项需求 **R1–R6**）的冻结契约。本节**覆盖** §4 的类清单与计数、
§6 的组件映射、§3/§8 第 9 条与第 10 条、§10.7 第 7/8 条、§13.1 的焦点条款、
§9 的行结构、§11.2 的 Pill tab、§12.1 的行内 key chip、§12.2 的枚举与实例卡片、
§13.2/§13.3 的枚举/复选组、§14.2 的实例卡外观与 §14.3 的类/token 计数。

> **编号提醒**：本节的 R1–R6 是 v7 轮次用户需求的编号，与 `docs/requirements.md` §3 的
> R1–R8 是**两套编号**，映射见 `docs/requirements.md` §6。
> 写入语义（清空 = `unset`、永不写 `null`、adapter 权威、字段真源仍是运行时 schema）
> 与 §1 的硬性边界**完全不变**。

### 15.1 官方出处（每条规则的证据）

| # | 事实 | 出处（安装内路径） | 原文关键片段 |
| --- | --- | --- | --- |
| E1 | 提供商 tab 的容器/按钮/下划线/焦点环 CSS（hash `_WKSsG_`） | `@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js`（内联 CSS，`PluginsSettingsSection.module.css`） | `._WKSsG_tabs{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:flex-end;gap:22px;margin-top:2px;display:flex}`；`._WKSsG_tab{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:0;padding:7px 1px 9px;font-size:13px;line-height:20px;position:relative}`；`._WKSsG_tab[data-active=true]:after,._WKSsG_tab:focus-visible:after{background:var(--dsw-alias-label-primary);content:"";border-radius:2px 2px 0 0;height:2px;position:absolute;bottom:-1px;left:0;right:0}`；`._WKSsG_tab:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px;color:var(--dsw-alias-label-primary);border-radius:2px}`；`._WKSsG_panel{min-width:0;padding-top:2px}` |
| E2 | tab 的语义与键盘模型 | 同上（`PluginsSettingsSection.js`） | 容器 `role:"tablist"` + `aria-label`；每个 `<button type="button" role="tab" id=… aria-selected aria-controls data-active tabIndex>`（`tabIndex: selected ? 0 : -1`）；`onKeyDown` 处理 `ArrowRight`/`ArrowLeft`/`Home`/`End`，`event.preventDefault()` 后 `setActiveId` + `nextTab.focus()` |
| E3 | 字段提示钮的外观与语义 | `@deepseek-ai/dsh-client-ui-primitives/lib/index.js`（`settings-form/fields.js` region，`SettingsValueField`）+ `lib/settings-form/fields.module.css` | `.helpButton{display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-tertiary);cursor:pointer}`；`jsx(IconInfoOutlineRegular,{size:12})`；button 带 `aria-label`、`aria-expanded:helpOpen`、`aria-controls:helpId`，展开时渲染 `<div id=helpId role="region" aria-label=…>` |
| E4 | Tooltip 的可点击/传送门/方位 props | `@deepseek-ai/dsh-client-ui-primitives/lib/index.js`（`Tooltip`） | `Tooltip({label,shortcutKeys,side="right",align="center",delayMs=0,focusDelayMs=0,gap=8,disabled=false,portal=false,maxWidth,openOnClick=false,children})`；`openOnClick` 注释：*"clicking also pins the bubble for reading; another click, Escape, Tab, or an outside pointerdown dismisses it"*；`portal` 注释：*"render the bubble under document.body, so an ancestor's clipping or its stacking context … cannot hide it"*；`openOnClick` 时气泡带 `id`，锚点被自动补 `aria-describedby`，气泡 `role="tooltip"` |
| E5 | 实例卡的外观（hash `_6fYtdq_`） | `@deepseek-ai/dsh-client-ui-settings-models/lib/client.js`（内联 CSS，`ModelsSection.module.css`） | `._6fYtdq_modelEntry{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);padding:6px}`；`._6fYtdq_modelRow{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto auto;align-items:center;gap:6px;display:grid}`；`._6fYtdq_iconButton{box-sizing:border-box;border-radius:var(--dsw-radius-sm);width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;display:inline-flex}`；`._6fYtdq_rowActions{align-items:center;gap:4px;margin-left:auto;display:inline-flex}`；`._6fYtdq_iconButton:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline:none}` |
| E6 | 实例卡的卡头结构（shipped 模型页自写） | 同上（`ModelRow`） | `div._modelEntry > div._modelRow > [input id, input name, button._iconButton(aria-expanded, chevron), button._iconButton._iconButtonDanger(trash)]`；展开体是 `div._modelAdvanced`（两列网格） |
| E7 | `DisclosureRow` 没有右侧动作槽，`collapsedContent` 在 24px 行内 | `@deepseek-ai/dsh-client-ui-primitives/lib/index.js`（`DisclosureRow`）+ `lib/DisclosureRow.module.css` | props 仅 `{icon,title,open,expandable,onToggle,…,collapsedContent,children,className,rowClassName,…}`；`collapsedContent` 渲染在 `.row` 内（`(keepContentWhenOpen || !open) && collapsedContent`）；`.row{position:relative;overflow:hidden;display:flex;align-items:center;height:calc(24px + var(--dsh-content-font-delta,0px));min-width:0;…}` |
| E8 | `SegmentedControl` 的指示块按 `findIndex` 定位，且没有 Radio 原语 | `@deepseek-ai/dsh-client-ui-primitives/lib/index.js` + `lib/SegmentedControl.module.css` | `const selected = options.findIndex((option) => option.value === value)`；`.indicator{…transform:translateX(calc(var(--dsh-segment-index) * (100% + 2px)))}`；tab id 为 `${id}-${option.value}`。全 bundle 检索 `Radio` **零命中** → 方框外观只能自绘 |
| E9 | 复选组原语的内部间距与选项尺寸 | `@deepseek-ai/dsh-client-ui-primitives/lib/Checkbox.module.css` | `.checkbox{display:inline-flex;align-items:center;gap:6px;font-size:14px;line-height:20px;…}`；`.checkbox input{flex:0 0 auto;width:16px;height:16px;margin:0;…}` |
| E10 | 官方模型页的复选组容器 | `@deepseek-ai/dsh-client-ui-settings-models/lib/client.js` | `._6fYtdq_modelInputChoices{flex-wrap:wrap;align-items:center;gap:16px;min-height:32px;display:flex}` |
| E11 | 按钮高度的官方档位 | `@deepseek-ai/dsh-client-ui-primitives/lib/Button.module.css` | `.md{height:36px}`；`.sm{height:28px;font-size:12px;line-height:18px;padding:0 10px;border-radius:var(--dsw-radius-sm)}`；输入框 32px 见 `._6fYtdq_input{…height:32px…}`（E5 同文件） |
| E12 | 焦点环的两个官方 token | E1/E3/E9 与 `Button.module.css` | `var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))` |
| E13 | 官方用 CSS 边框画勾/箭头（不用图片） | `@deepseek-ai/dsh-client-ui-settings-models/lib/client.js`（hash `_6fYtdq_`） | `._6fYtdq_customizedSummary:before{content:"";border-bottom:1.5px solid;border-right:1.5px solid;width:5px;height:5px;transition:transform .12s;transform:rotate(-45deg)translate(-1px,-1px)}` |

### 15.2 R1 提供商 tab 条

**规则**（tab 外观与语义照抄 E1/E2，两处有意偏离见下）：

1. 结构（tab 条两级 + 添加 panel 本体）：`piai-tabs`（外层）→ `piai-provider-list`
   （**承载 `role="tablist"` + `aria-label`** 的 tab 行）；「添加」panel 的本体仍是
   `piai-provider-add`。
2. 每枚 tab 是原生 `<button type="button" role="tab">`，带 `id`、`aria-selected`、
   `aria-controls`、选中时 `data-active="true"`、roving `tabIndex`（仅选中项 `0`）。
   **不再使用 `Pill`** —— v7 推翻 §11.2 的「小 `Pill`（24px/12px）」方案。
3. 外观逐条抄 E1：
   - 非选中 `color: var(--dsw-alias-label-tertiary)`；`hover` 与 `[data-active="true"]`
     `color: var(--dsw-alias-label-primary)`；
   - `[data-active="true"]::after` 与 `:focus-visible::after` = 2px 下划线，
     `background: var(--dsw-alias-label-primary)`，`border-radius: 2px 2px 0 0`，
     `bottom: -1px; left: 0; right: 0`；
   - `:focus-visible` = E1 的官方环（`--dsw-focus-ring-width` / `--dsw-focus-ring-color`，
     `outline-offset: 2px`，`border-radius: 2px`，同时 `color: label-primary`）；
   - tab 自身 `font: inherit; background: 0 0; border: 0; cursor: pointer; position: relative;
     padding: 7px 1px 9px; font-size: 13px; line-height: 20px`；
   - 行容器 `border-bottom: .5px solid var(--dsw-alias-border-l2); align-items: flex-end;
     gap: 22px`；panel 侧 `min-width: 0; padding-top: 2px` 落到 `piai-body`。
   - **等价写法（T7 核对的实现口径，OBS-5）**：实现里 `background: none` 等价于官方的
     `background: 0 0`；`[role="tab"]` 上多出 `min-width: 0; max-width: 100%` 两条
     **防御性声明**（E1 没有，用来保证长标签在窄容器里可收缩、不外溢），属有意偏离；
     焦点环**故意不带**官方的 `, var(--dsw-alias-state-business-primary)` fallback，
     因为该 token 不在 23 个白名单内（§13 已移除）。两者都不改变 E1 的观感。
4. **有意偏离 1（任意提供商数量）**：`piai-provider-list` 加 `flex-wrap: wrap`。
   理由：官方 `_WKSsG_tabs` 只有一行、官方页最多几个 tab；本页提供商数量由用户输入决定，
   `gap:22px` 一行会溢出裁切（§10.2 早已确立「流式换行，不用宽度断点」）。
5. **有意偏离 2（与下方内容留白）**：`piai-tabs` 加 `margin-bottom`（用 `--piai-space-4`）。
   理由：官方靠 `_WKSsG_section{gap:12px}` 在同一 flex 列里留白，我们的 tab 条与
   `piai-notices`/`piai-body` 不在同一 flex 容器，需要自己留白。
6. 键盘：`ArrowRight`/`ArrowLeft` 环绕、`Home`/`End`，`preventDefault()` 后聚焦邻居并请求切换
   （E2）。**沿用 §11.2 既有的 `stopPropagation()`**（官方只 `preventDefault`；这是 v3 起的
   保守做法，只影响冒泡，不影响选择规则，本项目已有实现保留）。
7. tab 与 panel 的 DOM id 保持位置式：`model-extended-tab-<index>-<sanitized>`、
   `model-extended-panel-<index>-<sanitized>`；「添加」tab 用固定 id
   `model-extended-tab-add` / `model-extended-panel-add`。
8. **添加 = 真 tab（已确认）**：tab 行的**末尾**固定一枚 `role="tab"` 的「添加」tab，
   与提供商 tab 完全同语义；选中它时，同一个 `role="tabpanel"`
   （id `model-extended-panel-add`，`aria-labelledby="model-extended-tab-add"`）显示新增表单
   （名称输入 + 添加按钮，容器仍为 `piai-provider-add`），**不**显示所选提供商的字段。
   新增成功后按既有 `onAdd` 写入 `providers.<name> = {}`，选中该提供商，活动 tab 切到它。
   因此「带 `role="tabpanel"`」的条件从「有提供商被选中」放宽为「有活动 tab」。
9. **删除提供商 = 挪到 `.piai-bar`（已确认）**：`ProviderTabs` 不再渲染任何删除控件；
   owner 传给页面面、由 `lib/client.page.js` 的 `makePage()`（`ProviderDeleteButton()`）
   在吸底操作条渲染「删除当前提供商」，保留内联二次确认
   （§6 的 `ConfirmButton` 语义、§8 第 8 条的 Esc 取消）。§11.1 里「添加行 = 添加 + 删除」
   的删除半边作废。
10. **空提供商列表（D2 已裁决）**：**0 个**提供商时**不渲染** `role="tablist"`、也不渲染
    `role="tab"`/`role="tabpanel"`，直接在原位渲染添加表单；有 **≥1** 个提供商时才渲染
    tabs + 末尾「添加」tab。

### 15.3 R2 字段提示

**规则**（触发钮外观抄 E3，交互换成 E4）：

1. 触发钮**保留类名 `piai-info`**（类清单不因它变化），外观抄 E3 的 `.helpButton`：
   `inline-flex` 居中、24×24、`padding: 0; border: 0; border-radius: var(--piai-radius-sm);
   background: none; color: var(--dsw-alias-label-tertiary); cursor: pointer`；
   `:focus-visible` 用官方环、`outline-offset: 1px`。
   （官方用的是 `var(--dsw-radius-sm)`，该 token **不在**白名单内，故用等值的本地
   `--piai-radius-sm`（6px）——见 §15.9 D3。）
   hover / 展开态：`color: var(--dsw-alias-label-secondary)`，背景用白名单内的
   `--dsw-alias-bg-layer-2`（官方用 `--dsw-alias-bg-layer-4`，白名单外——见 §15.9 D3）。
2. **图标 = `IconInfoOutlineRegular` size 12**（E3 同款）——已定假设（§15.9 A2）。
3. 交互改为 `Tooltip`（E4）：`openOnClick: true`（点击钉住可读，再点/Esc/Tab/外部指针关闭）、
   `portal: true`（逃出卡片裁切与层叠上下文）、`side: "right"`。**不**再用原生
   `title` 属性，也**不**再自建 `aria-expanded` 的内联帮助区。
4. **气泡内容 = 原始 key chip（`piai-key`）+ 该字段的中文说明**（`fields.hintFor(leaf)`）。
   `piai-key` 类保留，但**从行内移到气泡内**（已定假设 §15.9 A3）。
   随之作废：§3/§12.1 的「label 行 = 中文标签 + 原始 key chip」行内结构，
   以及 `LONG_HINT_LIMIT` 决定「内联 vs 气泡」的规则。
   （**v9-T20 起**：气泡的 **DOM 形状与作用域**变了——单个 `span.piai-root` 纵向栈、
   不再用 `<br>`、portal 内自带嵌套根，见 §18.6.1。上面这条「内容 = chip + 说明」不变。）
5. 行内不再渲染**字段级** `.piai-hint`；触发钮在有说明的每个字段行常驻。
   **分组级说明保留内联**（`GroupBlock` 的 `group.hint`，仍是 `.piai-hint`），
   `!!js` 表达式行与提示区也仍用 `.piai-hint`。
6. 无障碍：触发钮 `aria-label` = 字段中文标签（含说明）；`aria-describedby` 由 `Tooltip`
   在 `openOnClick` 且可见时自动挂到锚点上（E4），气泡 `role="tooltip"`。
   §8 第 3 条的「提示用 `aria-describedby` 指向 `piai-hint`/错误节点」在 v7 改为：
   **字段说明**走 Tooltip 自动注入的 `aria-describedby`（实现里是控件 `aria-describedby`
   指向常驻的 `piai-info` 锚点，**不是** portal 气泡——气泡不在渲染树里，指过去会悬空）；
   **校验错误**没有逐字段错误节点，而是控件 `aria-invalid="true"` + owner 页级
   `piai-notices > [role="alert"]` 原样回显 adapter 的报错（§15.12 口径偏差 / OBS-4）。

### 15.4 R3 实例卡（`models[]` / `modelOverrides`）

1. **卡头自写，不再用 `DisclosureRow` 承载实例卡**（已定假设 §15.9 A6）。官方依据：
   - `DisclosureRow` 的插槽只有 `icon`/`title`/`children`/`collapsedContent`，**没有右侧
     动作槽**（E7）；shipped 模型页的右侧动作来自它自写的 `_rowActions{margin-left:auto}`
     （E5/E6）。
   - `collapsedContent` 渲染在 `.row` 内部，而 `.row` 是
     `height: calc(24px + delta); overflow: hidden`（E7）——放动作按钮会被裁切，行高也不会
     为按钮让位。
   - 三个 harness stub 都只实现 `title` + 展开后的 `children`，没有实现 `collapsedContent`
     （`tests/a11y.test.js:313`、`tests/instances.test.js:207`、`tests/verify.polish.mjs` 的
     `DisclosureRow` stub），靠它承载交互会让测试与真实组件行为分叉。
   - `DisclosureRow` 仍只用于 compat 的 6 个折叠组（`piai-disclosure`），§6/§13 不变。
     （**v8 作废**：compat 也改自写折叠头——复用 `instanceCardHead` + `actions: []`，
     `DisclosureRow` 不再被解析，见 §16.4。）
2. **新增三个类**（这是 §4 类清单 63 → 66 的 +3）：
   - `.piai-item-head`：卡头行，`display: flex; align-items: center; gap: 6px`（E5 的
     `_modelRow` gap），标题 `flex: 1 1 auto; min-width: 0`。
   - `.piai-item-actions`：右侧动作槽，抄 E5 的 `_rowActions`
     （`align-items: center; gap: 4px; margin-left: auto; display: inline-flex`）。
   - `.piai-item-remove`：图标按钮，抄 E5 的 `_iconButton`
     （28×28、`border-radius: var(--piai-radius-sm)`、`color: var(--dsw-alias-label-tertiary)`、
     `background: 0 0; border: none; display: inline-flex; justify-content: center;
     align-items: center`；官方 `--dsw-radius-sm` 在白名单外，用等值本地变量替代——§15.9 D3）；
     必须有本地化 `aria-label` + `title`（§8 第 10 条的 v7 修订：
     图标可以有，但无障碍名不能缺）；删除属破坏性动作，hover 用
     `color: var(--dsw-alias-state-error-primary)` 与背景 `--dsw-alias-bg-layer-2`
     （官方 `_iconButtonDanger` 的 `--dsw-alias-interactive-bg-hover-danger` 在白名单外，
     见 §15.9 D3），并保留二次确认。
3. **展开开关（实际实现，T7 核对）**：`piai-item-head` 里的**第一个 `<button>`** 同时承载
   箭头图标与标题文本（所以点标题即可展开），带 `aria-expanded` 与 `aria-controls` 指向卡片体
   id；键盘展开走原生 button 的 Enter/Space。**删除按钮是它的兄弟节点，不是子节点**——
   卡头里不存在嵌套的可交互控件（`interactive-inside-interactive`）。卡体在折叠时**不渲染**
   （`hidden` 由「不渲染」等价实现；官方 `DisclosureRow` 同样是关闭时不渲染 children）。
4. 卡片容器仍是既有类 `piai-array-row` / `piai-dict-row`，外观继续按 §14.2 第 4 条
   （0.5px `border-l4` + `radius-lg` + 6px，即 E5 的 `_modelEntry`）。
5. **删除控件常驻卡头右侧**（`.piai-item-remove`，trash 图标），不再要求先展开；
   默认 `opacity: .5` 低对比，`.piai-item-head:hover` **或**
   `.piai-item-head:has(:focus-visible)` 时变实色——键盘/触屏也能显形，且使用的是
   §15.8 第 3 条白名单允许的形态（命中我们自己的 `.piai-item-head`，**不是** `:focus-within`）。
   `remove` 的写入路径不变（`providers.<p>.models.<i>` / `providers.<p>.modelOverrides.<id>`，
   §11.3 的实例段规则不变），二次确认语义保留。
6. **标题规则（已确认）= `name` → `id` → `#n`**；`modelOverrides` **保持字典键标题**。
   - 实现约束：AGENTS §3.2 与验收 A9 禁止面板写死 provider/model 字段名。因此优先序由
     **呈现元数据**表达：`lib/client.fields.js` 的 `describeField(path)` 返回
     `titleRank?: number`（小者优先；`name` 标记为 `1`）。面板按 rank 取第一个「值为非空字符串」
     的叶子 → 取不到则**回落到 `required` 的 string 叶子** → 再取不到用 `#n`。
     `modelOverrides` 的卡标题始终取字典键，不进入该候选流程。
     （面板内不出现字段名字面量；接口见 `docs/interface-contract.md`。）
   - 裁决：§15.9 D1 已定「接受 `titleRank`」，A9 不放宽。
7. 默认折叠保留（首屏可控）；展开状态仍由卡片自身持有。

### 15.5 R4 枚举：单选语义 + 方框外观

1. **语义 = 单选**：每个选项是一个**原生 `<input type="radio">`**（同一 `name`），
   外观用 `appearance: none` 自画方框。理由：E8 证实 primitives **没有** Radio 原语，
   而原生 radio 免费提供单选语义、方向键/空格、表单语义。
2. **外观 = 方框，不是原生圆形**（已定假设 §15.9 A1，**实际实现**）：16×16（与 E9 的
   `.checkbox input` 同尺寸）、`border: 0.5px solid var(--dsw-alias-border-l4)`、
   `border-radius: var(--piai-radius-sm)`、底色 `--dsw-alias-bg-layer-1`；选中态
   `background: var(--dsw-alias-brand-primary)` + `border-color: brand-primary`
   + 对勾（前景色用 `--dsw-alias-label-primary-foreground`，这是白名单第 23 个 token，
   **仅**用于此处，见 §15.8）。
   对勾由 `.piai-select input:checked::after` **用 CSS 边框绘制**
   （`content: ""; border-bottom: 1.5px solid; border-right: 1.5px solid;
   transform: translate(-50%, -50%) rotate(45deg)`，`width: 4px; height: 7px`，
   即 shipped 模型页 `_6fYtdq_customizedSummary:before` 同款手法）——§5/§10.7 禁止一切
   `url(...)`，因此不得用 `background-image` 贴图。
   **残余风险（untested）**：`input:checked::after` 只在真实 Chromium 里验证像素；
   harness 只能证明规则存在，不能证明对勾真的可见（§16 判定）。
3. **`>4` 项不再用 `Menu`**（推翻 §6 第 3 行、§12.2 的两行、§13.2 的「>4 项 Menu」）：
   任意项数的枚举都用同一套方框单选项。实现里 `SegmentedControl` / `Menu` /
   `MenuItemButton` 已从 panels 的 primitive 解析与代码中移除。
4. **换行与选项形状（实际实现）**：容器 `.piai-select` 用
   `display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px`（与 R5 同一套间距）、
   `min-width: 0; max-width: 100%`；每个选项是 `.piai-select > label`（`inline-flex`、
   `flex: 0 1 auto`、`gap: 4px`），文本是 `.piai-select > label > span`
   （`min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis`）。
5. **「继承」仍是最后一个选项**，语义沿用 §13.2：值用字符串哨兵 `__unset__`，选中它 =
   `onClear()`（`unset`）；短标签「继承」，完整「继承（未设置）」留在 `title`；
   **v9 起这一项的可视文案统一为「默认（未设置）」，见 §18.7**；
   手写的越界值追加成一项「未识别」并保持选中，保证控件永远有一个被选中的值。
6. 包裹类仍是既有 `piai-select`（不再代表 `SegmentedControl`，也不再代表原生 `<select>`）；
   **不新增枚举选项类**（D4 裁决）：选项用 `.piai-select > label` / `> label > span` / `input`
   三条后代选择器命中（§10.6 允许 `.piai-root` 之后的后代元素选择器），类数保持 66。
7. `renderRow` 的 `useHtmlFor` **对 `enum`/`const` 必须为 `false`**（实际实现即如此）：
   控件是一组选项（多个同名 radio），行标签不能 `htmlFor` 指向单个控件 id；
   组的可访问名由容器 `role="radiogroup"` + `aria-label` 承担。

### 15.6 R5 复选组（`.piai-checks`）

1. 容器：`display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px`（行距 8px、
   列距 16px；列距抄 E10 的 `gap:16px`，行距收紧是**本项目决定**，避免换行后过散）、
   `min-width: 0; max-width: 100%`。
2. 每个选项仍是原语 `Checkbox`（E9：`label` + `input` + `span`，内部 `gap: 6px`）。
3. **框 ↔ label 间距 4px（实际实现，OBS-8）**：用后代元素选择器覆盖原语内部 6px——
   `.piai-root .piai-checks > label { gap: var(--piai-space-1) }`（本项目决定；不触碰原语类名）。
   规则依赖原语 `label > input > span` 的**形状耦合**：原语若换了嵌套，这两条规则失效，
   退回 6px / 可换行，但仍可用（安全的失败方式）。
4. **label 不换行（实际实现，OBS-8）**：规则落在文本节点而不是 label 本身——
   `.piai-root .piai-checks > label > span { white-space: nowrap }`（**v8 起**只保留这一条，
   见 §16.2；旧实现还带 `min-width: 0; overflow: hidden; text-overflow: ellipsis`，
   正是它和 `.piai-row-control input{width:100%}` 一起把输入模态的文字压成 0 宽）。
   行为等价于「label 不换行」。
5. 组语义不变：`role="group"` + `aria-label`（§8 第 11 条）。

### 15.7 R6 同行按钮 32px

1. 五处的行内按钮高度 = **32px**，与同行输入框（shipped `_input{height:32px}`，E5）等高：
   `piai-provider-add`（既有）、`piai-dict-add`、`piai-tag-add`、`piai-cred-editor`、`piai-cred`。
2. **只改 CSS 高度，不改 `Button` 的 `size` 属性**：仍传 `size: 'sm'`，字号/内边距/圆角继续来自
   官方 `.sm`（28px/12px/`0 10px`/`radius-sm`，E11），仅高度被覆盖为 32px。
   理由：改 `size` 会同时改变字号与圆角，超出「只对齐高度」的范围。
3. 覆盖方式：`.piai-root .piai-<scope> button { height: 32px }`（后代元素选择器，不新增类）。
   `piai-provider-add` 既有规则 `.piai-provider-add button { height: 32px }` 保持。

### 15.8 不变量与推翻项

1. **类清单**：63 → **66**。新增 `piai-item-head` `piai-item-actions` `piai-item-remove`；
   `piai-key` **保留**（移到气泡内）；无其它增删。CSS 选择器集合 / `CLASSES` 导出 /
   JS `piai-*` 字面量仍必须**三方集合相等**（§4/§7 的规则不变）。
2. **token 白名单**：20 → **23**（实际数量，T7 核对），新增
   `--dsw-focus-ring-width`、`--dsw-focus-ring-color`
   （E12：官方 tab/按钮/复选框的焦点环就用这两个）与
   `--dsw-alias-label-primary-foreground`（R4 自画方框的勾色，§15.9 D3）。
   白名单外仍必须为 0；**实测口径**：23 个在册、样式表实际用到 **19** 个，
   4 个基础 token 为历史保留未被引用（§2）；`tests/styles.test.js` 要求的是
   **每个新增 token 被真实使用**，不是 23 个全部被用到。
   **不得**因为抄官方 hover 背景而引入 `--dsw-alias-bg-layer-4`、
   `--dsw-alias-interactive-bg-hover`、`--dsw-radius-sm`、
   `--dsw-alias-interactive-bg-hover-danger` 等未列入的 token（见 §15.9 D3）。
3. **`:focus-visible` / `:focus-within` 不变量：从「全表禁止」改为白名单（最终形态，T7 核对）。**
   样式表里**恰好**只允许这 4 条焦点选择器（`tests/v7.audit.test.js` 的 §15.8.3 断言全等）：
   1. `.piai-root .piai-provider-list [role="tab"]:focus-visible`
   2. `.piai-root .piai-provider-list [role="tab"]:focus-visible::after`
   3. `.piai-root .piai-info:focus-visible`
   4. `.piai-root .piai-item-head:has(:focus-visible) .piai-item-remove`
   - 允许的判据：选择器命中**我们自己的类/属性**；`.piai-item-head` 那条用 `:has(:focus-visible)`
     而不是 `:focus-within`（`:focus-within` 被**完全禁止**）。
   - 禁止：任何命中 primitives 内部结构的选择器——`.piai-root .piai-row-control input`、
     `.piai-root .piai-checks input`、`.piai-root .piai-checks label`、
     `.piai-root .piai-provider-add input`、`.piai-root .wrap` 等。
   - R4 的方框图**不声明自己的焦点选择器**（`input`/`label` 留给浏览器默认 radio 焦点环）。
   - 理由：v7 抄官方 `.tab:focus-visible`（E1）、`.helpButton:focus-visible`（E3）——
     这些官方焦点样式必须存在，但绝不能再给 primitives 内部叠加第二层
     （§13.1 的空白/三层边框事故不变）。
4. `piai-select` 的语义从「`SegmentedControl` 包裹」改为「方框单选组包裹」；
   `piai-clear` 仍只留给字典行的 `null` 开关（§9 不变）。
5. 写入语义、字段真源、chunk envelope、`remote.credentials` 通道：**全部不变**。

### 15.9 已定假设与 Lead 裁决

**已定假设**（Lead 已按推荐值定下）：

- **A1** R4 用「原生 radio + `appearance: none` + 自画方框」，而非原生圆形；启用 +1 token
  `--dsw-alias-label-primary-foreground`。
- **A2** R2 提示钮图标用 `IconInfoOutlineRegular` size 12。
- **A3** R2 行内不再显示 key chip：key chip 与字段说明一起进气泡；字段级行内 `.piai-hint`
  取消，分组级说明保留。
- **A4** R1 添加 = 真 tab 打开添加 panel；提供商删除挪到 `.piai-bar`。
- **A5** R3 卡标题 `name` → `id` → `#n`；`modelOverrides` 保持字典键标题。
- **A6** R3 实例卡卡头自写（不用 `DisclosureRow` 的 `collapsedContent`）。

**Lead 已裁决**（2026-10-14；D1–D5 全部落定，**不再是待决策项**）：

- **D1（A9 冲突）→ 接受 `titleRank` 方案。** R3 的「`name` → `id` → `#n`」**不得**在面板里写
  `name`/`id` 字面量；AGENTS §3.2 与验收 A9 不放宽。实现口径：`lib/client.fields.js` 的
  `describeField(path)` 返回 `titleRank?: number`（小者优先，纯呈现元数据）；面板按 rank 取
  **第一个值为非空字符串**的候选叶子 → 取不到则**回落到 `required` 的 string 叶子** →
  再取不到用 `#n`；`modelOverrides` 的卡标题始终是字典键，不进入该流程。
  （任务描述口径已统一为 `titleRank`，不再是 `instanceTitle: true`。）
- **D2（空列表）→ 0 个提供商时不渲染 tablist。** 有 **0** 个提供商时**不渲染**
  `role="tablist"`、**不渲染** `role="tab"`/`role="tabpanel"`，直接在原位渲染「添加表单」区块
  （容器仍为 `piai-provider-add`）——保留「无提供商就没有 tab/tabpanel」的旧不变式，
  `tests/render.test.js:847` 基本不变。有 **≥1** 个提供商时才渲染 tabs（末尾「添加」tab），
  由该 tab 的 `aria-controls` 指向真实 panel。
- **D3（token 近似）→ 接受等价替换，不扩充白名单。** hover 背景用白名单内的
  `--dsw-alias-bg-layer-2`，圆角用等值的本地 `--piai-radius-sm`（6px）；**不**引入官方那三个
  白名单外 token（`--dsw-alias-bg-layer-4`、`--dsw-alias-interactive-bg-hover`、
  `--dsw-radius-sm`）以及 `--dsw-alias-interactive-bg-hover-danger`。
  白名单只 **+2**（`--dsw-focus-ring-width`、`--dsw-focus-ring-color`）**+1**
  （`--dsw-alias-label-primary-foreground`，**仅**用于 R4 自画方框的勾色），即 §15.8 第 2 条的
  **23** 个。
- **D4（枚举选项行的类归属）→ 接受 `.piai-select` 方案。** `.piai-select` 作 radiogroup 容器
  + 后代选择器，**不新增**枚举选项类，类数保持 §15.8 第 1 条的 **66**。
- **D5（需求表述同步）→ 交 T7（task-8）统一收口。** A3 推翻的旧表述——
  `README.md`（第 33、44 行「行内展示原始 YAML key」）、`AGENTS.md`、
  `docs/verification.md`、`docs/development.md` 的表述与计数——由 T7 收口；
  `docs/requirements.md` 已在 T0 按本规格更新。

### 15.10 必须同步改的测试 / harness 锚点清单（25 条，**已在 T5 落地**）

> **v8 作废说明（D8）**：C10 / C13 / C25 三条关于 `DisclosureRow` stub 的指令在 v8 **不再有效**——
> compat 分区也改成自写折叠头后，`DisclosureRow` 从解析表中删除，这三个 stub 没有对象可断言。
> 替代口径见 §16.5 W7（memo 覆盖已改指 `Tooltip`，且是合成解析器测试）与 W10（stub 只服务
> 历史用例，不得再断言 compat 结构）。其余 C1–C9、C11–C12、C14–C24 继续有效。

只列锚点，不在本任务改测试文件。行号是 T0 冻结时的仓库现状；**T5（task-6）已按下表逐条迁移**，
本节保留为「规格 → 测试」的追溯记录，实际断言行号以当前测试文件为准。

| # | 文件:行 | 要改什么（T5 已落地） |
| --- | --- | --- |
| C1 | `tests/styles.test.js:553-574` | 三方类集合 63 → 66（`CLASSES` 长度、CSS 选择器集合、JS 字面量集合） |
| C2 | `tests/styles.test.js:371-390` | token 白名单 20 → 23（+`--dsw-focus-ring-width`、`--dsw-focus-ring-color`、`--dsw-alias-label-primary-foreground`）；新增 `V7_TOKENS`；白名单外仍为 0 |
| C3 | `tests/styles.test.js:484-493` | 焦点断言从「无 `:focus-(within\|visible)`」改为 §15.8 第 3 条的白名单断言 |
| C4 | `tests/styles.test.js`（新增） | tab CSS 抄 E1 的断言、`.piai-select` 方框/换行、`.piai-checks{gap:8px 16px}` + `label{white-space:nowrap;gap:4px}`、五处行内按钮 32px |
| C5 | `tests/a11y.test.js:876-935` | 提供商 tablist/roving：从 `Pill` 调用改为遍历 `role="tab"` 按钮；新增「添加 tab」的 `role/aria-controls/tabIndex` 断言 |
| C6 | `tests/a11y.test.js:937-985` | 键盘模型：`preventDefault`/`stopPropagation` + 聚焦邻居（E2） |
| C7 | `tests/a11y.test.js:675-735` | 枚举：删除「5+ 走 `Menu`」断言；改为任意项数都是方框单选组（同名原生 radio、无 `Menu`/`MenuItemButton` 调用） |
| C8 | `tests/a11y.test.js:757-800` | 提示：`piai-info` 常驻；断言 `Tooltip(openOnClick/portal/side:'right')` 与触发钮 `aria-label`；`aria-describedby` 由 Tooltip 注入（不再断言手写 hintId）；行内无字段级 `.piai-hint` |
| C9 | `tests/a11y.test.js:1301+` | `piai-checks` 组：`role="group"` + `aria-label` 保留；间距断言移到 styles（C4） |
| C10 | `tests/a11y.test.js:313` | `DisclosureRow` stub：补 `collapsedContent` 缺口说明（实例卡不再走它，但 stub 与真实组件行为要一致） |
| C11 | `tests/render.test.js:773-880` | tab 断言保留交叉一致；新增「添加 tab」；空列表断言按 §15.9 D2 改 |
| C12 | `tests/render.test.js`（新增） | 删除提供商控件出现在 `.piai-bar`（owner 侧），不再在 strip 内 |
| C13 | `tests/instances.test.js:207` | `DisclosureRow` stub：同上（C10） |
| C14 | `tests/instances.test.js:450-475` | 模型卡标题：`#n` + required string → `titleRank` 优先序（`name` → `id` → `#n`） |
| C15 | `tests/instances.test.js:517-532` | `modelOverrides` 卡标题仍为字典键 |
| C16 | `tests/instances.test.js:685-725` | 删除控件：从「展开后卡内 `Button`」改为卡头常驻 `.piai-item-remove` 图标钮；`remove` op 路径不变 |
| C17 | `tests/instances.test.js:685-725` | 展开：`aria-expanded` 移到自写 `.piai-item-head`；删除对实例卡 `DisclosureRow` 的断言 |
| C18 | `tests/verify.polish.mjs:1909` | `renderCell({provider})` 取 tab：`Pill && role==='tab'` → 遍历树 `role="tab"` |
| C19 | `tests/verify.polish.mjs:1963-1980` | P5a：`Pill` 过滤 → `role="tab"`；「添加 tab」不计入提供商数 |
| C20 | `tests/verify.polish.mjs:2011` | 切换提供商后的选中 tab：`Pill` 过滤 → `role="tab"` + `data-active` |
| C21 | `tests/verify.polish.mjs:1159` | P9e：新增四处（dict-add/tag-add/cred-editor/cred）的 32px 断言 |
| C22 | `tests/verify.polish.mjs:2862-2893` | P10a 的 `.piai-key` 探针保留（key chip 仍在样式表内，改在气泡内）；断言按 §15.3 |
| C23 | `tests/verify.polish.mjs:124-160` | `FROZEN_CLASSES` 63 → 66 |
| C24 | `tests/presentation.test.js` | `titleRank` 至少要有一个渲染期叶子命中（防止「写了没用」），与 §14.3 的 `pair` 断言同类 |
| C25 | `tests/verify.polish.mjs:1284,1314` | 第三个 `DisclosureRow` stub：同上（C10）；实例卡改走自写卡头后，polish 的展开/标题断言改按 `piai-item-head` 遍历 |

### 15.11 验收（v7 实测计数，原始输出见 `docs/verification.md` §16）

- `for f in lib/*.js; do node --check "$f"; done`：**7/7 通过**。
- `node --test`：**tests 249 / suites 11 / pass 248 / fail 0 / todo 1**（含新增的
  `tests/v7.audit.test.js`：35 项，34 pass + 1 todo = FINDING-3）。
  （**v8 起为 272 项**：271 pass + 1 todo，见 §16.6 与 `docs/verification.md` §17.1；
  **v9-T32/T35 后为 359 项**（**v10 后为 364 项**：363 pass + 1 todo），见 §18.8；
  本节其余计数是 v7 当时的实测记录。）
- `node tests/verify.integration.mjs`：**38 passed / 0 failed**；
  `node tests/verify.render.mjs`：**15 passed / 0 failed**；
  `node tests/verify.polish.mjs`：**42 passed / 0 failed**（chunk 改动后先
  `touch lib/client.js`，见 `docs/development.md` §5；本轮 P10a 仍是 OBS，见 §16）。
- 三方类集合 = **66**（CSS 选择器集合 / `CLASSES` / JS 字面量 / polish `FROZEN_CLASSES` 一致）。
- token 白名单 = **23**（实测样式表用到 **19**，v7 新增的 3 个都被真实使用），白名单外为 0。
- 焦点选择器**恰好等于** §15.8 第 3 条枚举的 4 条，且不命中 primitives 内部。
- GUI 观感仍由用户目视确认，判定为 `untested`——本环境无法自动化视觉验证（§10.8 不变）；
  凭据真实写入仍为 `blocked`（§16 判定表）。

### 15.12 本轮实际实现选择、口径偏差与既定偏离（T7 收口）

本节把「规格」与「实现」之间的差异一次写清；凡偏离都标注性质，不留悬空描述。

1. **R4 的实际实现**：`.piai-select` 作 `role="radiogroup"` 容器 + 三条后代选择器
   （不新增类，类数保持 66）；方框 `16px / border: 0.5px / radius: --piai-radius-sm`；
   勾由 `.piai-select input:checked::after` 的两条 CSS 边框绘制，前景色
   `--dsw-alias-label-primary-foreground`；`SegmentedControl` / `Menu` / `MenuItemButton`
   已从 panels 移除。**残余风险（untested）**：对勾的像素观感只能在真实 Chromium 里看，
   harness 仅能证明规则存在（E13 是官方同类手法的出处）。
2. **R3 的实际实现**：自写卡头（不复用 `DisclosureRow`，理由见 §15.4.1 与三个 harness
   stub 未实现 `collapsedContent`）：head 的第一个 `button` 承载箭头+标题并带
   `aria-expanded`/`aria-controls`，删除按钮是它的**兄弟**（无嵌套交互控件），
   折叠时卡体不渲染；删除按钮常驻、`opacity: .5`，
   `.piai-item-head:hover` 或 `.piai-item-head:has(:focus-visible)` 时变实色。
3. **焦点白名单最终形态**：§15.8 第 3 条的 4 条选择器；`:focus-within` 一律禁止。
4. **口径偏差 OBS-4（R2 错误呈现）**：没有逐字段错误节点。实现是控件
   `aria-invalid="true"` + owner 页级 `.piai-notices > [role="alert"]` 原样回显 adapter
   报错；`aria-describedby` 只指向常驻的 `piai-info` 锚点（气泡是 portal，不在渲染树内，
   不能作为 `aria-describedby` 目标）。
5. **口径偏差 OBS-5（tab 的等价写法）**：`background: none` ≡ 官方 `background: 0 0`；
   `[role="tab"]` 上另有 `min-width: 0; max-width: 100%` 两条防御性声明；
   焦点环不带官方 `, var(--dsw-alias-state-business-primary)` fallback（该 token 不在
   23 个白名单内）。均为有意偏离，不改变 E1 观感。
6. **口径偏差 OBS-8（R5 nowrap）**：规格草案写 `.piai-checks label`，实现落在
   `.piai-checks > label > span`（原语自身的文本 span），行为等价。
   （**v8 修订**：该 span 只保留 `white-space: nowrap`，删除 `min-width/overflow/text-overflow`
   ——那些属性和 R1 的拉伸规则一起把输入模态的文字压没了，见 §16.2。）
7. **既定偏离 FINDING-3（不修）**：非活动 tab 的 `aria-controls` 指向**未渲染**的 panel。
   官方「内置插件」页把访问过的 panel 常驻并 `hidden`；本页只有单面渲染（v6 起的设计）。
   这是**有意的单面设计取舍**，已记录在 `tests/v7.audit.test.js` 的 todo 守卫里，
   不视为发布阻断项。
8. **复核闭环（FINDING-1/2）**：`DictControl` 给 `Checkbox` 传的无用 `id` 已删；
   `UnionControl` 的 pending 优先（结构化分支「已选但未落盘」）已修，
   两者都有 `tests/v7.audit.test.js` 的硬回归断言。FINDING-1/2 属实现缺陷，**已修**。

---

## 16. v8 修订：复选框标签可见性 / 分支参数块 / 协议兼容折叠项（2026-10-14）

本节是 v8 轮次（用户 3 项反馈 **R1–R3**）的冻结契约。本节**覆盖** §4 的类清单成员、
§6 的 compat 映射、§8 第 7 条、§9 的折叠组映射、§11.3/§11.7 的历史做法、
§15.4.1 的「`DisclosureRow` 仍用于 compat」与 §15.6.4 的 nowrap + ellipsis 口径。
写入语义（清空 = `unset`、永不写 `null`、adapter 权威、字段真源仍是运行时 schema）
与 §1 的硬性边界**完全不变**。

### 16.1 官方出处（本节引用的官方原文）

| # | 事实 | 出处 | 原文关键片段 |
| --- | --- | --- | --- |
| E9 | 复选框原语的尺寸与内部间距（**沿用 §15.1 E9**） | `@deepseek-ai/dsh-client-ui-primitives/lib/Checkbox.module.css` | `.checkbox{display:inline-flex;align-items:center;gap:6px;font-size:14px;line-height:20px;…}`；`.checkbox input{flex:0 0 auto;width:16px;height:16px;margin:0;…}` |
| E7 | `DisclosureRow` 的箭头只在 hover 时浮出，children 与 `.row` 同级、无缩进（**沿用 §15.1 E7**） | `@deepseek-ai/dsh-client-ui-primitives/lib/index.js`（`DisclosureRow`）+ `lib/DisclosureRow.module.css` | `const collapsedLeading = previewChevron ? [<span className={iconIdle}>{icon}</span>, <IconChevronDownOutlineRegular className={chevronHover}/>] : icon`；`const leading = open ? <IconChevronUpOutlineRegular/> : collapsedLeading`；`.leading svg:not([data-state]){width:calc(14px + …);height:…}`；children 渲染在 `.row` **之后**（`jsxs("div", {className: css.root}, [row, open && children])`） |
| E14 | 官方 chevron 图标（自写折叠头的常显箭头） | `@deepseek-ai/dsh-client-ui-primitives/lib/index.js` | `IconChevronRightOutlineArtwork = ({size = 14, …})` / `IconChevronDownOutlineArtwork = ({size = 14, …})`（chevron 系列默认 14px，`viewBox 0 0 16 16`）；实例卡头已传 `size: 14`（§15.4） |

R1 的根因**不是**官方行为，而是本项目 §10.3 的宽泛规则（`.piai-row-control input{width:100%}`）
误伤原语内部节点——按本项目规则，这属于**本项目缺陷 / 本项目决定修复**；
尺寸基准仍是 E9（16×16）。

### 16.2 R1 输入模态的复选框标签不可见

**现象**（Lead 在真实 Chromium 复现）：`input` / `defaultInput` 行里「文本（text）」/
「图片（image）」的**文字标签看不见**，两个复选框之间出现约 121px 的空档。

**根因链**：`.piai-root .piai-row-control input { width:100%; min-width:0;
box-sizing:border-box }`（§10.3，本项目 v2 写的宽泛后代选择器）**同时命中
`.piai-checks` 内的复选框** → 复选框被拉伸到所在 `<label>` 的整宽 → label 宽度由内容
max-content 反推、而 `.piai-checks > label > span` 又带 `min-width:0; overflow:hidden;
white-space:nowrap` → span 被压成 **0 宽**，文字静默消失。实测（v7 状态，600×1200 的
Chromium 夹具）：input 宽 = label 宽 **97.84px**、span 宽 **0px**；字典的
`omitWhenOff` 行同样中招（input **87px**、span **0px**）。

**修复规则（三条，冻结）**：

1. 收窄 v2 的拉伸规则，**排除复选框与单选框**：
   ```css
   .piai-root .piai-row-control input:not([type="checkbox"]):not([type="radio"]) {
     width: 100%; min-width: 0; box-sizing: border-box;
   }
   ```
   理由：该规则的本意是让**文本输入框**吃满列宽（§10.3）；原语的复选框尺寸由 E9
   自己定，枚举方框图由 §15.5 自己定，都不该被它拉伸。
2. 给**复选组**的原语复选框显式尺寸，防再次被拉伸——**只覆盖 `.piai-checks` 这一处结构**：
   ```css
   .piai-root .piai-checks > label > input {
     flex: none; width: 16px; min-width: 16px; height: 16px;
   }
   ```
   （尺寸 = E9 的 `.checkbox input{width:16px;height:16px}`。**它不是**对原语所有复选框的
   通用加固：选择器只命中 `.piai-checks > label > input` 这一条路径，字典行的
   `omitWhenOff` 复选框不在覆盖范围内——见下方「影响面」。）
3. `.piai-checks > label > span` **只保留 `white-space: nowrap`**，删除
   `min-width: 0` / `overflow: hidden` / `text-overflow: ellipsis`。
   理由：`min-width:0 + overflow:hidden` 正是让文字在布局压力下静默消失的机制
   （§15.6.4 的旧口径）；长标签宁可换行/溢出也不允许消失。若要截断，必须由
   `.piai-checks` 的 `flex-wrap` 换行承担，而不是把宽度压到 0。
   实测（修复后）：input **16×16**、span **80.84px / 95.43px**、两框间距 **16px**
   （列距 = E10 的 `gap:16px`）。

   出处标注：规则 2 的尺寸基准 = **官方 E9**；规则 1、3 是**本项目决定**（修的是本项目
   §10.3 自己的宽泛选择器与 §15.6.4 自己的收缩口径，不是官方行为）。

**影响面（两种结构，加固程度不同——D1 更正）**：

- **同一结构、受钉死规则覆盖**：`input` / `defaultInput` 的复选组
  （`.piai-checks > label > input`，`CheckboxGroupControl`）。修复后实测
  `16×16` + span `80.84px / 95.43px`。
- **不同结构、只靠「规则 1 不再匹配」+ 原语自带 CSS**：字典行的
  `omitWhenOff`（「关闭时省略」）复选框挂在 `.piai-dict-row`
  （`lib/client.panels.collections.js` 的 `DictControl()`）→ `.piai-dict`
  → `.piai-row-control`，**不在 `.piai-checks` 下**，因此规则 2 **不覆盖它**。
  它今天 16px 靠的是「规则 1 的 `:not(...)` 不再命中」+ `Checkbox.module.css`（E9）
  自身的尺寸。修复后实测 = `16×16`、span `70px`；v7 状态实测 = `87px`、span `0px`。
  **残余依赖（已知）**：将来若有人再给 `.piai-dict-row` 里的 `input` 加宽规则，
  该复选框会重新被拉伸且没有本地钉死规则兜底（见 `docs/verification.md` §17 的负向控制与判定）。

**不在此列（避免误伤）**：枚举单选组的 `.piai-select > label > span` 仍保留
`min-width: 0; overflow: hidden; text-overflow: ellipsis`（§15.5.4）——因为单选组的
`input` 由 `.piai-select input` 显式定为 16px、不会被 `width:100%` 拉伸，文本不会静默消失；
本轮只改复选组（`.piai-checks`）。

**验收判据**（可判定）：

- 样式断言（harness 可做）：存在 `input:not([type="checkbox"]):not([type="radio"])` 的拉伸规则；
  存在 `.piai-checks > label > input` 的 `16px`/`flex:none`；`.piai-checks > label > span`
  **不含** `min-width`/`overflow`/`text-overflow`，只含 `white-space: nowrap`。
- 计算布局断言（**只有真实浏览器夹具能看见**）：复选框 `offsetWidth === 16`、
  label 内 span 的 `offsetWidth > 0`、相邻两项间距 = 16px。
  见 §16.5 W5/W6 与 §16.6 判定：这是本轮唯一必须靠浏览器夹具兜住的检查。

**已知残余风险 FINDING-V8-1（本轮明确不改，见 `docs/verification.md` §17.4）**：规则 1 加了两个
`:not([type=…])` 之后特异性升到 **(0,4,1)**，会盖过规则 2 的 **(0,2,2)**——对
**没有 `type` 属性**的 `<input>`，拉伸规则仍然生效（实测 **216px** 宽）。
真实情况不可达：`primitive('Checkbox', 'input')` 的降级路径才产出无 `type` 的裸
`<input>`，而 shipped `Checkbox` 恒输出 `type="checkbox"`。建议过的
`:where()` 归零特异性**不能**修好该降级路径（规则 2 要求 `label` 包裹，降级路径没有），
故不采纳，只记录。特异性是 T7 从 CSS 复算的
（`.piai-root .piai-checks > label > input` = 2 类 + 2 元素 = (0,2,2)；
`.piai-root .piai-row-control input:not([type="checkbox"]):not([type="radio"])`
= 2 类 + 2 个属性 = (0,4,1)；`tests/layout/README.md` 里写作 (0,3,2)，按 CSS 复算应为 (0,2,2)）。

### 16.3 R2 分支参数块（`.piai-nested`）

**事实**：`retryPolicy` 是判别式联合（`normal` / `always`）。normal 分支自带
`maxRetries` / `retryableCodes` / `backoff.*`，这些叶子路径比联合路径长一级，但它们属于
**当前选中的那个分支本身**，不是另一个子对象键。用户问「分支参数是什么？子对象参数吗？」
——答案是「当前分支的参数」，因此标题必须点名分支。

**规则（冻结，本项目决定）**：

1. `.piai-nested` **删除** `padding-left` 与 `border-left`（不再画左竖线）。
   理由：分支已由 `.piai-nested-title` 引入，竖线只在外层卡片边框旁多加一条平行线，
   并吃掉窄面板的横向空间；改用间距（`gap: var(--piai-space-2)`）分隔。
2. `.piai-nested-title` 的文案 = `fields.branchLabelFor(leaf, active) + '的参数'`：
   例如 `normal（按次数重试）的参数`、`always（总是重试）的参数`；
   `branchLabelFor` 拿不到/返回空时**回落**「分支参数」。
   `active` 是 `UnionControl` 当前选中的分支（`pendingId ?? realId`，§15.5/FINDING-2）；
   该标题随选择变化。样式保持 `.piai-nested-title` 的 `label-secondary / 12px / 500`。
   分支中文名来自 `lib/client.fields.js` 的 `retryPolicy.branch.normal|always`，
   面板不写死字段名。

**验收判据**：`.piai-nested` 无 `padding-left`/`border-left`；`retryPolicy` 行渲染出的
`.piai-nested-title` 文本包含当前分支的中文名与「的参数」；未知分支回落「分支参数」。

### 16.4 R3 协议兼容折叠项（compat 分区）

**事实（官方 E7）**：`DisclosureRow` 收起时**不显示箭头**（只有 hover 才浮出 ▾），
展开固定 ▴；children 是 `.row` 的兄弟节点、没有任何缩进。我们此前把
`<span class="piai-count">{n}</span>` 塞进 title，因此每项右侧多了一个计数器。

**规则（冻结）**：compat 的 6 个分区改用**与模型卡一致的自写折叠头**。
出处标注：第 2 条的图标与尺寸 = **官方 E14**；第 1/3/5/6/7 条是**本项目决定**
（复用自写头、常显箭头、body 常驻、18px 对齐、id 用 index，都是对本项目自己结构的安排）；
第 4 条删除计数徽标 = **本项目决定**（计数器本来就是我们自己塞进 title 的）。

1. 复用 `instanceCardHead`（§15.4），动作槽传空：`actions: []`（compat 没有删除动作，
   不渲染 `.piai-item-remove`）。
2. 箭头**常显**：收起 `IconChevronRightOutlineRegular size=14`，展开
   `IconChevronDownOutlineRegular size=14`（E14；与实例卡同尺寸）。
3. 整条标题可点：原生 `<button type="button">` 同时承载箭头与标题文本，
   `aria-expanded` + `aria-controls` 指向分区体 id，Enter/Space 由原生 button 提供。
4. **删除** `piai-count` 计数徽标（类名一并从类清单移除，见 §16.5）。
5. 分区体**常驻 DOM**：`<div class="piai-disclosure-body" id=… hidden={!expanded}>`，
   让 `aria-controls` 永远有真实目标；**字段条件挂载**（折叠时不渲染 `FieldsBlock`，
   保留「首屏不渲染 26 个开关」的原有收益）。
6. 内容左对齐：新增 `.piai-disclosure-body { padding-left: 18px }` =
   14px chevron + `piai-item-head > button` 的 4px gap（`--piai-space-1`），
   使内容左缘与标题文字左缘对齐（**本项目决定**；官方 E7 的 children 无缩进，
   我们主动对齐是因为自写头把标题右移了 18px）。
   **前置条件（D6）**：这个 18px 只在**真原语图标**下成立（`IconChevron*` 渲染
   `svg width=14`）。若图标解析降级到 `FallbackIcon`（panels.js 的
   `h('span', {className, 'aria-hidden':'true'})`，**不设尺寸**），标题右移量就不是 14px，
   18px 的对齐前提失效。因此浏览器夹具必须**自带真图标形状**（见 `docs/verification.md` §17 的夹具方法），
   不能拿降级 span 去量对齐。
7. 分区 id **必须用 index**（实现当前是 `controlIdOf(['compat-section', String(index)])`）：
   `controlIdOf` 会把中文标题里的非 ASCII 替换成 `-`，若用标题拼 id，多个中文标题会拼成
   同一个 id，导致 `aria-controls` 指向错误节点。id 只要求在同一页内唯一且稳定。
   **测试不得钉死 id 字面量**（例如 `piai-field-compat-section-0-body`）：应断言
   「6 个 id 互不相同、每个 `aria-controls` 都能 `getElementById` 解析到真实节点」；
   钉死字面量会把任何无害的 id 调整变成假红（现存测试是否已按此口径，见 `docs/verification.md` §17.6 遗留）。

**验收判据**：6 个分区各有一个常显 chevron 按钮（收起是 right、展开是 down）；
`aria-expanded`/`aria-controls` 正确且指向同页唯一节点；页面上**没有** `piai-count`；
折叠时 `.piai-disclosure-body` 仍在 DOM 且有 `hidden`、其内部无字段行；
`.piai-disclosure-body` 的 `padding-left` = 18px。

### 16.5 耦合 / 涟漪清单（11 条）

| # | 位置 | 必须同步的改动 |
| --- | --- | --- |
| W1 | `lib/client.styles.js` `CLASSES` | **删** `piai-count`，**加** `piai-disclosure-body`：数量仍 **66**（净 0）。CSS 选择器集合 / `CLASSES` / JS 字面量 / polish `FROZEN_CLASSES` 四方继续相等 |
| W2 | `lib/client.panels.js`（v10 前） | 删除 `primitive('DisclosureRow', FallbackDisclosureRow)` 解析与 `FallbackDisclosureRow` 本体（不再有调用点）——v10 拆模块后**整条解析链已不存在**（原语解析只在 `lib/client.core.js` 的 `createUi()` 里） |
| W3 | `lib/client.panels.instances.js` 的 `CompatDisclosures()` | 改用 `instanceCardHead` + `actions: []`；删 `piai-count`；body 常驻 + `hidden`；id 用 index |
| W4 | `lib/client.panels.instances.js` 的 `instanceCardHead()` | 增加 `actions`（可选数组）：缺省仍渲染删除钮，compat 传 `[]`；接口见 `docs/interface-contract.md` |
| W5 | `tests/layout/primitives/*.css` 夹具快照 | 浏览器夹具需要原语 CSS（`Checkbox.module.css` 等）才能算布局；快照要随 primitives 版本更新 |
| W6 | harness 盲区 | 现有 stub/mini-renderer **不算布局**，看不到 R1；**真实浏览器夹具是唯一能看见 R1 的检查**（对照断言见 §16.2 验收判据） |
| W7 | memo 形态覆盖 | `DisclosureRow` 被移出解析后，**已重指 `Tooltip`**（`tests/a11y.test.js:1360-1370`、`tests/verify.polish.mjs:1352` 的 `WRAPPED_TYPES = {Button:'forwardRef', Input:'forwardRef', Tooltip:'memo'}`）。该覆盖从此是**合成的解析器形态测试**（真实 bundle 里我们已不再解析任何 memo 组件），断言的是「`isComponent` 接受 memo 包装对象」这条解析规则本身，不再声称某个 shipped memo primitive 被采用。W10 那两处若仍传 `{DisclosureRow:'memo'}` 就是**硬失败**（stub 名字对不上解析表） |
| W8 | `tests/a11y.test.js`（`piai-count` 断言处）与 `tests/verify.polish.mjs`（`FROZEN_CLASSES` 与计数徽标断言处） | 删除 `piai-count` 相关断言/名单项，新增 `.piai-disclosure-body` 与常显 chevron 断言。**另需同步三处过时文档**：`docs/development.md:101`（仍以 `DisclosureRow` 当 memo 范例）、`docs/verification.md:289`（P5d 的「6 个 `DisclosureRow`」契约）、`docs/verification.md:457` 附近（P5c/P5d 按 `DisclosureRow` 子树解析键集的方法）——历史段加「v8 起改为…」，本任务已处理 |
| W9 | `tests/styles.test.js` | 类集合仍是 66 但**成员变了**；`.piai-checks > label > span` 断言改为「只有 nowrap」；新增 `input:not([type=checkbox]):not([type=radio])` 与 `> label > input` 断言。**两处易错点**：`:357` 之前的**子串**写法（`code.includes('.piai-root .piai-row-control input')`）会被任何带前缀的选择器骗过——必须改成按选择器集合过滤（现为 `selectorsOf(...).filter(...)` + 两条 `:not` 的全量校验）；`:491` 的 `rule(...)` 是**精确查找**，选择器一改就红，改规则时必须同步 |
| W10 | 三个 harness 的 `DisclosureRow` stub（`tests/a11y.test.js`、`tests/instances.test.js`、`tests/verify.polish.mjs`） | compat 改自写头后 stub 不再被用到；**W7 的 memo 覆盖已改指 `Tooltip`**，因此这几个 stub 若保留只服务历史用例，**不得**再用它断言 compat 结构，也不得继续用 `DisclosureRow` 作为 memo 包装对象 |
| W11 | `tests/v7.audit.test.js`（**D2 补**） | 该文件有 **5 处 v8 敏感断言**，T5 已修：① 头部 OBS-8 记录「span 只留 nowrap」；② 头部 OBS-9 记录 `DisclosureRow` 退役、`.piai-item-head` 变**共享类**；③ 实例卡标题断言必须**限定在 `.piai-array-row`/`.piai-dict-row` 内**取 `.piai-item-head`（否则会抓到 6 个 compat 头）；④ 折叠头是**原生 `<button>`**（不是 `div[role=button]`）；⑤ §15.4/E7 用例断言 `DisclosureRow` 调用数为 0、compat 头自写。修法即上述 5 条；后续任何回到旧形状的改动都会被这 5 处拦住 |

清单合计 **11 条**。

### 16.6 判定

- **规格本身**：本节冻结，每条规则都标了官方出处（E7/E9/E14）或「本项目决定」。
- **R1**：样式规则可静态断言；**「标签真的可见」只有真实浏览器夹具能证明**。
  夹具已落地（`tests/layout/`，T5）且修复后测量通过，判定见 `docs/verification.md`
  §17：结构/CSS 层面 **verified**，真实 GUI 观感仍 **untested**。
- **R2 / R3**：结构、文案与 CSS 均可在 harness 内断言（`tests/v8.audit.test.js` 24 项全绿，v9-T20 起）；
  浏览器层的对齐与「无计数徽标」在 `tests/layout/` 夹具中测量通过。判定见 `docs/verification.md` §17。
- **残余风险**：FINDING-V8-1（无 `type` 的降级 `<input>` 会被 (0,4,1) 规则拉伸）与
  字典 `omitWhenOff` 复选框的**无本地钉死规则**兜底，均记录在 `docs/verification.md` §17，**本轮不改**。
- **不变式**：类集合仍 66（−`piai-count` +`piai-disclosure-body`）、token 白名单仍 23、
  焦点选择器仍 4 条（§15.8）、写入语义与 §1 边界不变。

---

## 18. v9 修订：tab 行分栏 + 原代码、模型发现选择器、模板行、档位行、逐选项提示、默认文案（2026-10-15）

本轮**不改字段真源、不改写入语义、不加依赖**（§1 第 5/6 条仍然生效）。
唯一的类集合变化见 §18.8：**66 → 67**（`+piai-tabs-bar` / `+piai-catalog` / `−piai-tier-key`）。

### 18.1 官方出处（本节每条规则引用的 shipped 源码）

| 别名 | asar 内路径 |
| --- | --- |
| `PICKER` | `dsh/node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js` |
| `PLUGTABS` | `dsh/node_modules/@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js` |
| `SHELLCHROME` | `dsh/node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js` |
| `PRIM` | `dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js` |

| # | 规则 | 官方证据 |
| --- | --- | --- |
| E15 | 下划线 tab 条（`role="tablist"`/`role="tab"`、`data-active`、roving tabindex、Arrow/Home/End、`::after` 指示条） | `PLUGTABS:11`（`._WKSsG_tabs` / `._WKSsG_tab` 的 CSS）、`PLUGTABS:70-100`（JSX 与键盘处理）。v7 已照抄，本轮不变 |
| E16 | 「左内容 / 右操作」的两槽行 | `SHELLCHROME:60`：`._Dws9Sa_header{justify-content:space-between}` + `._Dws9Sa_actions{justify-content:flex-end;margin-left:auto}`。我们的 `.piai-tabs-bar` 用同一版式（左 `.piai-provider-list`、右 `.piai-item-actions`） |
| E17 | 模型发现流程：请求 → 可搜索选择器 → 「添加所选」才写入；已有行不被覆盖 | `PICKER:2810`（`ctx.remote.llm.discoverModels(settingsNs, request)`）、`:662-667`（请求由草稿组装）、`:824-878`（`Modal` + 搜索框 + 全选/取消全选 + 勾选列表 + 取消/添加所选）、`:694-703`（按 id 合并、已有行原样保留）、`:574-583`（采纳字段 `id`/`name`/`contextWindow`/`maxTokens`/`input`） |
| E17b | **候选行只渲染原始 id**，显示名放进 `title`（缺失时回退 id） | `PICKER:874-878`：每行一个 `span.candidateId`，`title: candidate.name ?? candidate.id`、`children: candidate.id` —— 页面上只有 id 一段文本，名称靠悬停看 |
| E18 | 只读代码块（可高亮、可显示行号） | `PRIM:10769`：`CodeBlock({code, lang, streaming, className, contentRef, lineNumbers, showHeader, copyLabel, copiedLabel, toolbarLabels, wrap})` —— **没有**可编辑变体 |
| E19 | 官方设置页对「未覆盖」的措辞是「恢复默认 / 留空表示使用默认值」，**没有**「默认（未设置）」这种三段式选项 | `dsh-client-ui-settings-shell/lib/client.js`（第 37、43 行）（`reset: "恢复默认"`、`invalidNumber: "请填数字；留空表示使用默认值。"`）等同族页面。**本页的「默认（未设置）」是本项目自定的文案**（E19 只用来证明它不是抄错，而是新措辞） |
| E20 | 官方**没有**任何「表单 ↔ 原代码」切换，也没有 YAML/代码编辑器 | v9 调研：整个 archive 搜 `CodeEditor`/`CodeMirror`/`codemirror`/`monaco` 零命中；`@deepseek-ai/dsh-client-ui-settings*` 各 bundle 搜 `textarea` 零命中。官方「模型」页把进阶字段推出界面（`PICKER:3031` 的 `advancedHint`）。因此 §18.2 的只读预览是**本项目决定** |

### 18.2 R1 tab 行分栏 + 「原代码」只读切换

- `.piai-tabs` 的内层改为 `.piai-tabs-bar`：**左槽**有提供商时是 `.piai-provider-list`（tablist），
  **右槽**恒为 `.piai-item-actions`（无 actions 时留空）。`.piai-tabs` 仍是条的外层容器，
  tablist/tab/tabpanel 的 aria 契约与 DOM id（`model-extended-tab-*`）**一条不变**；
  添加表单仍是条内、bar 的**兄弟**节点，不进入右槽。
- 右槽内容是 owner 传进来的 ReactNode（`ProviderTabs.actions`）：一枚 `.piai-btn`
  「原代码」/「配置表单」，带 `aria-pressed`。**只切换呈现**：不 stage op、不动 revision、
  吸底操作条的行为不变。
- 「原代码」面是**只读预览**：`CodeBlock({code: yaml.toYaml(draft), lang:'yaml', lineNumbers:true})`；
  `CodeBlock` 缺席时降级为 `<pre class="piai-expr-body">`；YAML chunk 缺席时显示一行
  `原代码视图不可用`。草稿 `dirty` 时在代码上方显示 `.piai-hint`
  「只读预览：以下是当前草稿的完整 llm-pi-ai 配置，含未保存的修改。」
- 内容**就是整个 `llm-pi-ai` 配置的当前草稿**（`providers` 全量，含未保存修改），
  不是磁盘内容、不是提交值。

验收判据：切换前后 `mutate` 调用数为 0；raw 面存在唯一的代码节点（`CodeBlock` 或
`<pre class="piai-expr-body">`）；`dirty` 时提示节点存在；切回表单后原分组/字段节点仍在。

### 18.3 R2 「获取可用模型」＋选择器 Modal（照 E17）

- 触发钮只出现在 **`group.catalog === true`** 的分组（当前 = `models`）的组标题右侧
  `.piai-item-actions` 里：`Button(variant:'outline', size:'sm')`，常显文案
  `获取可用模型`，忙时 `正在询问提供商…`，禁用时 `title` 说明原因
  （宿主不支持 / 发现错误 / 容器是 `!!js` 表达式）。
- 点击 → `catalog.discover()`（owner 包装的 `ctx.remote.llm.discoverModels('llm-pi-ai',
  {provider, baseURL?, api?})`）。**发现是读**：失败/空结果只显示 `.piai-error`
  （`role="alert"`）或 `.piai-hint`，不写任何东西。
- 结果进 `Modal`：`type="search"` 的搜索框（匹配 id **与名称**，忽略大小写子串）、
  全选/取消全选（只作用于**可见**项；全选后再点 = 清空全部已选）、
  `.piai-catalog` 勾选列表、页脚 `取消` / `添加所选`；无匹配时 `role="status"` 的
  「没有匹配的模型。」。
- **候选行只显示原始 id（v9-T25，照 E17b）**：一行 = 一个复选框 + 一个等宽的
  `code.piai-dict-key`，文本就是原始模型 id；显示名不另起一段，而是放进 `title`
  （`title = 名称 || id`，悬停可见）。这样 `name === id` 的常见情形不会读成同一段文字两遍，
  而名称仍然**参与搜索**（过滤同时匹配 id 与名称）。体现「保留原始 id」的既有口径
  （采纳时仍取原始 id，见 E17 的 `:574-583`）。
- **采纳**才写：按身份键去重，**已有行原样保留**（用户改过的行不被覆盖），只有新条目
  追加，落点是 `form.edit(container.path, rows)` 的一次暂存写入（不自动保存）。
  空结果显示「该提供商没有列出任何模型，请手动添加。」。

### 18.4 R3 模板参数行（`compat.chatTemplateKwargs` / `chatTemplateArgs`）

判定完全按结构：`kind === 'dict'` 且 `keyEnum === undefined`、`valueEnum === undefined`、
`valueNullable === true`（放在「闭集字典 = 档位表」判定**之后**，因此 `reasoningEfforts`
不会被误配）。每行：

- 键名只显示一次（中文名与原始 key 同名时只留 `code.piai-dict-key`）；
- 一个「`字面值` / `$var 变量`」**二选一**单选（`includeUnset: false`：模式不是三态，
  没有「未设置」）；
- 字面值 → 文本输入（另有显式 `null` 按钮，写入字面 `null`）；
- `$var 变量` → 变量名单选（取自 schema 的 `valueVarNames`）+「关闭时省略」复选框；
- 删除该行 = 删键；**删掉最后一行 = `unset` 整个字段**（adapter 视空 dict 与缺键等价，
  见 §18.7 与 `docs/field-coverage.md` 的清空语义依据）。

### 18.5 R4 档位行 = 普通 `Row`

`reasoningEfforts` 的 7 个档位仍是 `piai-tiers` 的 7 行，但**每一行改由共享 `Row` 渲染**：
`label` = 该档位的中文名（如「off 档位」），`keyLabel` = `reasoningEfforts.<level>`，
说明进 `piai-info` 气泡。**裸 key chip 与 `.piai-tier-key` 已删除**，语气与其它字段行一致。
语义不变：输入留空 = 删该键；全空 = `unset`。

### 18.6 R5 逐选项提示（气泡多行）

- `valueHintFor(leaf, value)` 给**每个选项**一句中文说明；`Row.hintLines` 把它排成
  `「标签」：说明` 的多行，追加在字段说明之后。**气泡结构（v9-T20 起，见 §18.6.1）**：
  `[ span.piai-root > (code.piai-key?, span(字段说明)?, span(选项行)*) ]` ——
  恰好一个子元素，**不再使用 `<br>`**；chip 与说明都是这个纵向栈的直接子元素，
  第一个 `span` 仍是字段说明，选项说明只在其后**追加行**，不另开节点。
- 单选/多选/字典三处都接：枚举与 `const` 的每个 radio 带 `title` = 该选项说明；
  复选组（`input`/`defaultInput`）每个 `Checkbox` 带 `title`；字典的 `valueEnum` 行同理。
- 模板模式的四段文案（`字面值`/`$var 变量` 的标签与说明）来自 `modeHintFor(leaf)`，
  缺条目时回落内置默认，面板不写死字段名。

#### 18.6.1 气泡与 Modal 的嵌套作用域（v9-T20；T31 正文 `color: inherit`，T35 撤回 chip 的继承，T39 四边等距 padding）

`Tooltip` 的气泡（以及原语 `Modal` 的内容）都通过 `createPortal(…, document.body)`
渲染，因此它们**没有 `.piai-root` 祖先**——只写后代形式的 scoped 规则在真实 GUI 里
一条也匹配不到（v9-T16 的 portal 逃逸缺陷，`docs/verification.md` §18.9 有复盘：
真实 GUI 里候选列表失去全部布局、行与行粘连（`deepseek-flashdeepseek-flash…`），气泡里的 chip
只剩裸 `<code>`）。修法是让 portal 子树**自带一个嵌套根**：

- `hintBubble` 把内容包进 `span.piai-root`（`lib/client.panels.kit.js` 的 `hintBubble()`）；
  Modal 内容包一层 `div.piai-root`（`lib/client.panels.catalog.js` 的 `ModelCatalogPicker()`；关闭时整棵子树不挂载）。
- 样式表用**成对选择器**同时覆盖两种情况（逐字原文见 `lib/client.styles.chrome.js`（见该 chunk 的 `api.css`），下面是要点摘录）：

  ```css
  .piai-root .piai-root,          /* 页内嵌套根（本地 Modal stand-in 等） */
  .piai-root:not(.piai-page) {    /* 真实 portal 根：没有 .piai-root 祖先 */
    background: none;
    color: inherit;               /* T31：不重上主题文字色，继承 portal 落点的 surface */
    display: flex; flex-direction: column;
    gap: var(--piai-space-1);     /* = 4px 行距，替代已删除的 <br> */
    min-width: 0; max-width: 100%;
  }
  .piai-root .piai-root > .piai-key,
  .piai-root:not(.piai-page) > .piai-key { align-self: flex-start; }  /* T35：chip 不继承前景 */
  .piai-root .piai-root > span,
  .piai-root:not(.piai-page) > span { min-width: 0; }
  .piai-root .piai-root > .piai-item-actions,
  .piai-root:not(.piai-page) > .piai-item-actions { margin-left: 0; align-self: stretch; }
  /* T39：primitives 的 .bubble 自身 padding: 3px 7px（上下 ≠ 左右），内容层在它内部，
     只能补偿：3 + 12(space-3) = 7 + 8(space-2) = 四边 15px。仅气泡命中，Modal 不加。 */
  .piai-root .piai-root:has(> .piai-key), .piai-root:not(.piai-page):has(> .piai-key),
  .piai-root .piai-root:has(> span),      .piai-root:not(.piai-page):has(> span) {
    padding: var(--piai-space-3) var(--piai-space-2);
  }
  ```

- **为什么必须成对写 `:not(.piai-page)`**：真实 portal 里的嵌套根**没有** `.piai-root`
  祖先，只写后代形式在真实 GUI 里不匹配；页面根恒为 `piai-root piai-page`，因此
  `:not(.piai-page)` 这一半不会误伤页面底色。
- **`align-self: flex-start`** 让 chip 保持内容宽度（否则被 flex 拉满整行，背景/边框/圆角
  失去形状）；最后一条 companion 规则把 `.piai-item-actions` 的 `margin-left:auto` 归零，
  否则发现选择器的整条工具栏会被右推、搜索框被压窄（反证实测：不归零时工具栏右移 `226.34px`、
  收窄到 `193.66px`，见 `docs/verification.md` §18.9）。
- **嵌套根 `background: none` + `color: inherit`，但 chip 例外（v9-T31 + v9-T35）**：
  - **正文与逐选项说明**：嵌套根规则对必须 `color: inherit`（`lib/client.styles.chrome.js` 的 `api.css`）。
    气泡在 primitives 里是**永久深底**，`Tooltip.module.css` 的 `.bubble` 用静态浅色
    `--dsw-static-neutral-bluish-00` 固定了正文色；T20 的嵌套 `span.piai-root` 以更高 specificity
    命中它后，本插件的 `.piai-root { color: var(--dsw-alias-label-primary) }` 会在**浅色主题**
    把它压成深字——这就是用户报的「深字压深底」（错误态对比度 **1.21:1**，几乎不可读）。
    `color: inherit` 让文字色继承气泡/对话框真正被 portal 到的那个 surface；修复后正文
    `rgb(230,236,245)` on 气泡底 `rgb(35,42,54)` = **12.14:1**。
  - **raw-key chip（`> .piai-key`）不继承**（`lib/client.styles.chrome.js` 的 `api.css` 只钉宽度，
    `color: inherit` 已由 T35 撤回）：chip 继续用 base `.piai-key` 的**同族主题 token 色对**
    （文字 `--dsw-alias-label-secondary` `rgb(78,89,105)` + 底 `--dsw-alias-bg-layer-2`
    `rgb(244,245,247)` + 边框 `--dsw-alias-border-l1`），浅色主题下是**浅底深字** = **6.51:1**。
    若让它继承气泡的浅前景则变成 **1.09:1**，chip 几乎不可见——那正是 T31 一度引入、T35 撤回的问题。
  - **不引用** primitives 的静态 token：它在 23-token 白名单之外，引用会让 `tests/styles.test.js`
    变红；白名单仍 **23**（实测用到 19）。
  - 负对照（嵌套根去掉 `color: inherit`）：wrapper `rgb(21,26,35)` on 气泡深底 = 错误态。
- **气泡四边等距：`padding` 是补偿值，不是对称值（v9-T39，第三次 GUI 反馈）**：primitives 的
  `.bubble` 自己写着 `padding: 3px 7px`（上下 3、左右 7，天生不等），而我们的内容层在它**内部**，
  要「四边一样、而且更大」只能在这里补偿：`padding: var(--piai-space-3) var(--piai-space-2)`
  （12/8）→ 视觉总内边距 = `3 + 12` = `7 + 8` = **15px**，四边实测 **15/15/15/15**
  （±1 内相等；wrapper 内容盒法与「子节点 union」法两种测量一致）；负对照（移除该规则）
  回到 **3/7/7/3**。**只针对气泡**：四条选择器用 `:has(> .piai-key)` / `:has(> span)`
  两条分支（各带 `:not(.piai-page)` 配对）门控，命中不了直接子节点是
  `div.piai-item-actions` + `div.piai-catalog` / `p.piai-hint` 的 Modal 内容层——发现选择器
  因此**不加 padding**（实测 wrapper padding `0`、两条分支 `matches() === false`），
  对话框间距不受影响（`lib/client.styles.chrome.js` 的 `api.css`）。
- **真实浏览器证据**：`r7` 夹具（task-22）正向测得 chip `background rgb(244,245,247)` /
  `border-radius 6px` / `padding-left 4px` / `align-self: flex-start`、四行 tops
  `[117,140,163.5,187]`（相邻 gap 4px）；负对照（解包内层 `.piai-root`）chip 透明、
  radius 0、行内联且 tops 非递增。逐项判定以 `docs/verification.md` §18 为准
  （本条不再是 F7 的「已知未修」；其余仍为 `partial`/`blocked` 的项不动）。

### 18.7 R6 「默认（未设置）」文案

| 位置 | 文案 |
| --- | --- |
| 枚举 / `const` 的末项（含 `title`） | `默认（未设置）` |
| 布尔三态 | `开启` / `关闭` / `默认（未设置）` |
| 字典 `valueEnum` 行 | `默认（未设置）` |
| 联合分支选择器 | `默认（未设置）` |
| 模板行模式 | `字面值` / `$var 变量`（二选一，无「默认」项） |

所有「默认（未设置）」都走 `form.remove`（`unset`），**绝不写 `null`**（§1 第 5 条）。
页面副标题同步改为「未填写的字段保留为『默认（未设置）』，不会被写成 null。」
（依据：§18.1 的 E19 —— 官方没有同款措辞，这是本项目自己的说法。）
`lib/client.fields.js` 里仍有两处 **hint 文案**含「继承」二字：它们描述的是
「不声明时跟随模型目录能力」这一**行为**，不是选项文案，按需求原文保留。

### 18.7.1 布尔字段：三态单选（`Switch` 退役）

布尔叶子（`compat.*` 的各个开关等）不再用原语 `Switch`，改走 §15.5 的同一个
`EnumControl`：`role="radiogroup"` + 三个原生 radio —— `开启`（写 `true`）、
`关闭`（写 `false`）、`默认（未设置）`（`__unset__` → `form.remove`）。

- **`false` 与「未写」是两个状态**：`false` 是 adapter 真的看到的一个关掉的开关，
  第三个 radio 才是「这个键不在配置里」（跟随模型目录与协议默认）。
- 第三个 radio 是回到「未写」的**唯一**路径，且它走 `unset`，**绝不** `form.edit(path, null)`。
- 手写的越界值仍会被追加成一项「未识别」并保持选中（§15.5 的既有规则），
  因此控件永远拿得到一个自己列出的值。
- **v10 更新**：原语绑定 `Switch`（连同它的降级件 `FallbackSwitch`）已**删除**——
  v9 之后没有任何控件调用它，留着只会让人以为布尔还能配置成开关。原语解析现在只在
  `lib/client.core.js` 的 `createUi()` 里，`Switch` 已不在其中；`tests/a11y.test.js`
  与 `tests/v8.audit.test.js` 关于「布尔行**不得**解析 `Switch`」的断言因此从
  「绑定存在但不调用」升级为「这一层根本没有 Switch」，断言本身不变。

出处：`lib/client.panels.controls.js` 的 `BooleanControl()`、`renderControl()`（`case 'boolean'`）。

### 18.8 计数、验收与不变量

- 类集合 **67**（+`piai-tabs-bar` +`piai-catalog` −`piai-tier-key`）；token 白名单仍 **23**
  （实测用到 19）；`:focus-*` 仍恰好 **4 条**白名单选择器；**未新增** `--dsw-*` token。
- **v10 更新**：`lib/*.js` 现为 **20** 个文件（host 半 `index.js` + owner `client.js` + 18 个 chunk：
  `core` / `schema` / `form` / `fields.{groups,hints}` / `fields` / `yaml` / `page` /
  `panels.{kit,controls,collections,render,instances,catalog}` / `panels` /
  `styles.{chrome,controls}` / `styles`），单文件 ≤700 代码行；
  `inject` 仍为 **8** 项（v9 新增 `remote.llm`）；**未新增依赖**。
- 字段覆盖（22 / 7 / 26）、叶子总数、写入语义（清空 = `unset`）与 §1 边界**全部不变**；
  `tests/coverage.test.js`、`tests/form.test.js`、`tests/compat.test.js` 的既有断言不因本轮改动。
- 判定：结构/文案/token/类集合可在 harness 内静态断言（`tests/{yaml,hints,catalog,raw}.test.js`
  与更新后的 `tests/v8.audit.test.js` 等）；**计算布局（档位 label 是否被压成 0 宽、
  tab 行两栏是否对齐、选择器是否可滚动）只有 `tests/layout/` 的真实浏览器夹具能看见**，
  其结论与逐项判定记在 `docs/verification.md` §18.2 / §18.6 —— 本文件不代替它下结论。
- **已实测的布局判定**（`tests/layout/`，v9-T13 修夹具 + v9-T14 独立复测，逐项见
  `docs/verification.md` §18.2 / §18.6）：档位行 **verified**（`tierInputFillsRow` delta 0 +
  `tierInfoVisible` ⓘ 24×24）、布尔三选一 **verified**（`boolRadios16` / `boolLabelsVisible`）、
  模板参数行 **verified**（`templateRowReadable` + `templatePartOrder` = 键名→模式→值→删除）、
  tab 两栏 **verified**（`barIsOneRow` overlap 27.5 / bottomDelta 0、`actionsFlushRight` gap 0、
  `actionsRightOfList` 0px、`actionVisible`、`actionSlotDoesNotWrap`）。
- **条目内竖排是既有设计，不是缺陷**：`.piai-dict-row` 是卡片容器（§14.2），v9 早期的旧准则
  `templateRowOnOneLine` 已被**删除并重写**为上面的两条新准则（F2 已裁决，
  `docs/verification.md` §18.8）。「原代码」视图与模型目录 Modal 仍为 `partial`
  （§18.6：前者夹具只覆盖回退形状、后者是自建 DOM），A13 仍为 `blocked`。

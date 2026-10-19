# Browser layout fixtures (v8 R1–R3, T7 R4–R5, T16 R6, T20 R7, T40 R7 inset half)

These fixtures exist because **no other harness in this repo can see layout**.
`node --test`, `verify.integration.mjs`, `verify.render.mjs` and
`verify.polish.mjs` all assert the DOM, props, or CSS *text*. The R1 defect was
invisible to every one of them:

> `.piai-root .piai-row-control input { width: 100% }` also matched the
> primitive Checkbox and stretched it to its label's full width; the label
> span's `min-width: 0; overflow: hidden; text-overflow: ellipsis` then resolved
> to **zero width**. The 输入模态 option labels (文本 / 图片) disappeared in a real
> Chromium while every DOM-level assertion kept passing.

Only a real browser computes layout, so the measurement runs through
**ego-browser** on static HTML and is deliberately **not** part of `node --test`.

## Files

| File | Role |
| --- | --- |
| `build-fixture.mjs` | Loads the REAL `STYLESHEET` out of the stylesheet chunks (`lib/client.styles.js` + the two `lib/client.styles.*.js` fragments, via `node:vm`, never a hand-copied subset), concatenates the primitive module-CSS snapshots, and writes static pages to `/tmp/piai-layout/`. |
| `primitives/Checkbox.module.css` | Byte-exact snapshot of `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` `lib/Checkbox.module.css` (header carries source + md5). |
| `primitives/Input.module.css` | Same for `lib/Input.module.css`. |
| `primitives/Tooltip.module.css` | Same for `lib/Tooltip.module.css` — the T40 bubble surface: `padding: 3px 7px`, `position: fixed`, its own dark background + static light foreground. |
| `measure-in-page.js` | One self-contained in-page expression returning raw pixel measurements + verdicts for whichever probe page is open. |

No dependency is added (AGENTS §3.4): the fixture pages are static HTML, and the
browser is driven externally.

## Build

```bash
node tests/layout/build-fixture.mjs            # -> /tmp/piai-layout
PIAI_LAYOUT_OUT=/tmp/other node tests/layout/build-fixture.mjs
```

Output: `r1-checks.html`, `r2-nested.html`, `r3-disclosure.html`,
`r4-tabs.html`, `r5-raw.html`, `r6-catalog.html`, `r7-bubble.html`,
`index.html`, `manifest.json` (stylesheet sha256 + primitive md5s + the criteria
list). The build is deterministic — rerunning yields identical bytes.

The primitive snapshots were taken from the installed bundle at
`/tmp/asarx/out/dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/`
(the ASAR extracted by the polish harness); regenerate them from that path if the
primitive version changes. Each snapshot carries its source path and the **source**
file's md5 in a header comment; `manifest.json` records the md5 of the snapshot
itself, so an accidental edit is visible in both places.

The host-theme block inside `build-fixture.mjs` declares the plugin's 19-token
allowlist **plus** the three tokens the snapshots additionally consume
(`--dsw-alias-tooltip-bg`, `--dsw-static-neutral-bluish-00`, `--dsw-radius-sm`).
The bubble's two colours are derived from the same constants the probe compares
against (`BUBBLE_BG` / `BUBBLE_SURFACE` → hex via `rgbHex()`), so the theme block
and the measurement cannot drift. `--dsw-radius-sm` is read by no project rule
(`grep -- --dsw-radius-sm lib/*.js` is empty).

### Why the fixture draws the chevron and the ⓘ icon itself

The panels' icon resolution falls back to `FallbackIcon`, which renders an
unsized `<span>`. In the fixture that would make the "title span is 18px in",
"collapsed chevron is visible at 14×14" and "the tier ⓘ trigger is visible"
criteria lie. So the fixture renders the real primitive's icon shapes instead: a
real `<svg width="14" height="14">` chevron, and a real 12×12 glyph inside a
`.piai-info` button.

### Probing is structural and non-fatal

`measure-in-page.js` reaches every required node through `probeEl()` / `need()`
/ `q()`. A node the fixture no longer renders is recorded in
`measurements.missing` and its checks read `false` — the page never throws, so
one drifted selector cannot make the other criteria unmeasurable (the T13 F1
bug: `.piai-row[data-probe="tier"]` against a `.piai-tier[data-probe="tier"]`
root threw `TypeError` and blanked all of R1). `checks.probeStructure` is the
single verdict for "every required node was found".

### The portal pages have no page-level root (`bare`)

R6 and R7 exist because the shipped `Modal` **and** the shipped `Tooltip` render
through `createPortal(…, document.body)`: their content has **no** `.piai-root`
ancestor, so every scoped rule stopped matching. R6's picker rows collapsed into
glued, wrapping text; R7's bubble lost its chip box and its line breaks.
`page({bare: true})` therefore omits the usual `.piai-root piai-page` wrapper,
and the probe body supplies the portal shape itself (a container that is not a
root → the nested `.piai-root` T16/T20 added). If the page-level root were kept,
the nested wrapper would match `.piai-root .piai-root` (the in-page stand-in)
instead of the real portal case, which `.piai-root:not(.piai-page)` covers.

## Measure (ego-browser)

```bash
ego-browser nodejs <<'EOF'
const fs = await import("node:fs/promises");
const task = await taskSpace("piai layout fixtures");
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 600, height: 1200, deviceScaleFactor: 1, mobile: false });
const code = await fs.readFile("tests/layout/measure-in-page.js", "utf8");
for (const name of ["r1-checks", "r2-nested", "r3-disclosure", "r4-tabs", "r5-raw", "r6-catalog", "r7-bubble"]) {
  await page.goto("file:///tmp/piai-layout/" + name + ".html");
  console.log(name, JSON.stringify(await page.evaluate(code), null, 2));
}
await task.finish({ keep: [] });
EOF
```

Pass `page.evaluate()` the file text; it returns
`{probe, viewport, measurements, checks, pass}`. Every verdict is derived from
the printed raw numbers, so it can be recomputed by hand.

## Criteria and the baseline measurements

Measured at 600×1200 CSS px, light theme, build
`stylesheet sha256 8b1fdfb79418a8acf795ba8107674b5d07ad05283726af7ae5404e17ceda6994`
(37316 bytes — T39's bubble-compensation rule). All seven pages were re-measured
with ego-browser in the T40 pass against the current sheet and return `pass: true`
with `measurements.missing: []` (the R7 negative controls return `pass: false`, as
they must).

> **T36 note (the adjudicated colour split).** T31 gave the nested/portalled root
> `color: inherit` so a portalled bubble would not paint the page's dark theme
> alias on its own surface — correct for the **body** (12.14:1) but, applied to
> the chip as well, it put the bubble's light foreground on the chip's own light
> `--dsw-alias-bg-layer-2` box (1.09:1). T35/T36 settled it: **only the body
> inherits**; the nested `> .piai-key` rule declares no colour at all, so the base
> `.piai-key` keeps `--dsw-alias-label-secondary` on its own box (6.51:1). R7's
> criteria are therefore contrast-based (`bubbleBodyContrast` /
> `bubbleChipContrast`, WCAG AA ≥ 4.5:1, each against its own background) rather
> than colour-identity based, and carry two CSSOM negative controls — one per
> half. `tests/styles.test.js` pins the same split at CSS-text level. The sheet
> hash moved on from T32's `e80b3eb…`. R1–R6 were re-measured: unchanged and
> still passing. The measurement is static HTML + the REAL sheet + primitive CSS
> snapshots — the panels chunk itself is not mounted, so this remains a
> **partial** check of the delivered UI (it proves layout and computed colour,
> not wiring).
>
> **T40 note (the bubble inset).** The third GUI report asked for the tooltip's
> spacing to be *larger and equal on all four sides*. The shipped
> `Tooltip.module.css` gives `.bubble` `padding: 3px 7px` (3 top/bottom vs 7
> left/right), so T39 adds a `:has()`-gated compensation on our wrapper:
> `3 + space-3 = 7 + space-2 = 15px` on every side. The fixture now draws the
> **real** primitive surface (its CSS is snapshotted) instead of a hand-simulated
> `.bubble` with only the colours, so the unequal 3/7 is a measurable baseline
> rather than a comment: `bubbleInsetUniform` (spread ≤ 1px, every side ≥ 12px)
> and `bubbleInsetGrew` (every side strictly beyond the primitives' widest side)
> are the new criteria, and two more cover the gate — `modalWrapperUnaffected`
> and `modalGateDoesNotMatch`. R1–R6 were re-measured with the Tooltip snapshot
> added to the page styles: unchanged and still passing. The sheet hash moved on
> from T36's `bd0025a8…`. This is still a **partial** check of the delivered UI
> (static HTML + the REAL sheet + primitive CSS; not the mounted panels chunk).

### R1 — `r1-checks.html` (`pass: true`, `missing: []`)

| Criterion | Raw measurement |
| --- | --- |
| two `input[type=checkbox]` are 16×16 | `16×16`, `16×16` |
| two `.piai-checks > label > span` are > 40px wide and non-empty | `"文本（text）"`, `"图片（image）"` both > 40px |
| adjacent `.piai-checks` labels are exactly 16px apart | `16` |
| a normal text input fills its `.piai-row-control` content box ±1px | `wrap 600px` vs `control content 600px` → delta `0` |
| `.piai-select input` stays 16×16 | all `16×16` |
| three boolean radios 16×16 with visible labels (`boolRadios16`, `boolLabelsVisible`) | 3 × `16×16`, labels `开启` / `关闭` / `默认（未设置）` |
| tier input fills its control box ±1px (`tierInputFillsRow`) | control `600px`, wrap `600px` → delta `0` |
| tier ⓘ trigger visible (`tierInfoVisible`) | `24×24` at `x 47.45` |
| `templateRowReadable` — all four parts visible, unclipped, inside the card | key/mode/value/delete all `visible`, every part inside `card.left 8.5 → right 591.5` |
| `templatePartOrder` — DOM order 键名 → 模式 → 值 → 删除 | indices `[0, 1, 12, 14]` (strictly increasing) |

**`.piai-dict-row` is a card, not a single line.** The sheet declares
`.piai-root .piai-dict-row { flex-direction: column; border: 0.5px solid …; border-radius: var(--dsw-radius-lg) }`,
so a dict entry stacks its parts; `docs/interaction-design.md` §14.2 makes that
the intended container. Measured part tops in the template row:
`[434, 460, 524, 600.5]` → `distinctRows: 4`. The criterion is therefore
**readability** (all parts render, stay inside the card, keep the
键名 → 模式 → 值 → 删除 order) — never "one line". The old
`templateRowOnOneLine` name was removed because it contradicted the design.

### R2 — `r2-nested.html` (`pass: true`, `missing: []`)

| Criterion | Raw measurement |
| --- | --- |
| `.piai-nested` computed `borderLeftWidth === "0px"` | `0px` |
| `.piai-nested` computed `paddingLeft === "0px"` | `0px` |
| `.piai-nested-title` has the branch name + 「的参数」 | `按档位表设置的参数` |

### R3 — `r3-disclosure.html` (`pass: true`, `missing: []`)

| Criterion | Raw measurement |
| --- | --- |
| `.piai-count` nodes | `0` |
| six permanent `.piai-disclosure-body`, five collapsed with no box | 6 present; 5 × `hidden`, `display:none`, rect `0×0` |
| expanded body content left edge == title span left edge ±1px | delta `0` |
| collapsed chevron visible and 14×14 | 5 × `14×14` |
| six distinct `aria-controls`, all resolved by `getElementById` | 6 distinct ids, 6/6 resolve |

### R4 — `r4-tabs.html` (`pass: true`, `missing: []`)

| Criterion | Raw measurement |
| --- | --- |
| `barIsOneRow` — the two slots vertically overlap **and** their bottom edges coincide | overlap `27.5px`, `bottomDelta: 0` (tops differ: list `100.5` vs actions `109.5`) |
| `actionsRightOfList` — slot starts at/right of the tablist right edge | `actions.left 536` vs `list.right 149.83` |
| `actionsFlushRight` — slot pinned to the bar right edge | `bar.right 600` − `actions.right 600` = `0` |
| `actionVisible` | `64×27.5` |
| `actionSlotDoesNotWrap` | slot height `27.5` == action height `27.5` |

**Why not "top edges equal".** `.piai-root .piai-tabs-bar { align-items: flex-end }`
aligns the slots on their **baseline**, so the taller tablist legitimately starts
9px higher. The old `barIsOneLine` (top diff ≤ 1) reported a false red on
correct layout; `barIsOneRow` tests overlap + bottom alignment instead.

### R5 — `r5-raw.html` (`pass: true`, `missing: []`) — **partial**

The read-only raw face. The real page mounts the primitives `CodeBlock`; that
primitive's DOM/CSS is **not** snapshotted here (doing so would need a Modal/CSS
snapshot the task explicitly excluded), so the fixture draws the documented
fallback `<pre class="piai-expr-body">` instead. Only the read-only chrome is
therefore checked:

| Criterion | Raw measurement |
| --- | --- |
| `rawNoticeVisible` — the unsaved-draft notice renders with text | `只读预览：…含未保存的修改。`, 600×18 |
| `rawCodeVisible` — the code body renders with text | 600×180 |
| `rawCodeContained` — stays inside `.piai-body` | `code.right 600` ≤ `body.right 600`; `scrollWidth 598` == `clientWidth 598` |

Not in this fixture: the primitive `CodeBlock`'s own DOM (only the documented
`<pre>` fallback shape is drawn), so R5 stays **partial**.

### R6 — `r6-catalog.html` (`pass: true`, `missing: []`)

The model picker inside a **portal**: the dialog container is not a
`.piai-root`, and only T16's nested `.piai-root` re-enters the scope. Before
that wrapper existed, the user hit exactly this in the real GUI — ids glued to
names (`deepseek-flashdeepseek-flash…`) and rows wrapped into a single block.

**T25 shape.** A candidate row is `label > input[type=checkbox] +
code.piai-dict-key`: the raw id is the **only** visible text, and the display
name lives in the chip's `title` (falling back to the id). The four fixture rows
cover a distinct name, a name equal to the id, and a listing with no name.

| Criterion | Raw measurement |
| --- | --- |
| `portalCatalogScoped` — the nested `.piai-root` wrapper is present | `scope` found (`600` wide) |
| `portalCatalogSearch` — the search Input renders inside that scope | `type=search`, visible |
| `portalCatalogRows` | `4` |
| `portalCatalogRowsSingleLine` — checkbox and chip overlap and share the row baseline | `bottomSpread 1.75` on all four rows |
| `portalCatalogNoOverflow` — row `scrollWidth <= clientWidth + 1` | `600 == 600` on all four rows (incl. the 74-char id) |
| `portalCatalogInput16` | `16×16` ×4 |
| `portalCatalogCheckboxIdGap8` — checkbox → id chip gap | `11` on all four rows (the scoped flex `gap: 8px` plus the UA checkbox `margin-right: 3px`) |
| `portalCatalogIdSingleLine` — no extra span, the only visible text is the id, chip does not overflow itself | `spanCount 0`, `textContent === id`, `codeScrollWidth == codeClientWidth` (e.g. `535/535`) |
| `portalCatalogStacked` — rows stack, no vertical overlap | tops strictly increasing |

Scope-independent diagnostics recorded alongside (not asserted):
`listComputed: {display:flex, flexDirection:column, gap:4px, overflow:auto}`,
`rowComputed: {display:flex, gap:8px, alignItems:center}`,
`firstRowId` / `firstRowTitle` (the id is visible, the name only in the title),
`firstRowSpanCount: 0`, `firstRowGap: 11`, plus — for T39's `:has()` gate — the
portal root's `scopePadding: 0px ×4` and `scopeGateMatches:
[false, false, false, false]`. The picker is the shape the gate has to exclude
(its direct children are divs: `dialog-title`, `piai-item-actions`,
`piai-catalog`, `dialog-footer`), so the real portal root is unpadded too; R7 owns
the asserted criterion.

**Negative control (T17/T26, run in-page — no repo copy needed).** Unwrapping the
inner `.piai-root` from `r6-catalog.html` and re-running the same probe:

| | positive (T16 wrapper) | negative (wrapper removed) |
| --- | --- | --- |
| `pass` | `true` | `false` |
| all 9 `portalCatalog*` checks | `true` | `false` |
| `portalCatalogScoped` / `probeStructure` | `true` / `true` | `false` / `false` |
| `.piai-catalog` computed | `display:flex; flex-direction:column; gap:4px; overflow:auto` | `display:block; gap:normal; overflow:visible` |
| row computed | `display:flex; gap:8px; align-items:center` | `display:inline; gap:normal` |
| chip computed | `display:block` | `display:inline` |
| first-row checkbox | `16×16` | `13×13` (native default) |
| first-row checkbox → chip gap | `11` | `3` |
| first-row visible text | the raw id only (`spanCount 0`) | the raw id only (`spanCount 0`) |

Screenshots: `/tmp/piai-t26-r6-positive.png` (rows aligned, long ids clipped by
the row box) and `/tmp/piai-t26-r6-negative.png` (the reported porridge).

**T20 companion rule.** Because the nested root is now a flex column, the
picker's own `.piai-item-actions` would inherit its `margin-left: auto` and push
the whole toolbar 226px right. The sheet neutralises that inside a nested root
(`margin-left: 0; align-self: stretch`); the re-measurement confirms it — the
search box sits at `left 8.5` with the list full-width (`600`), and
`portalCatalogCheckboxIdGap8` / `portalCatalogNoOverflow` still pass.

### R7 — `r7-bubble.html` (`pass: true`, `missing: []`)

The Tooltip bubble inside a **portal** (same `bare` shape as R6). T20 replaced
the `<br>` separators with a flex column and restored the chip's own box, so
this page pins three things the DOM-only harnesses cannot see: the wrapper is a
column with a 4px gap, the chip keeps its background/radius/padding and its
content width, and every part occupies its own row. T40 added the fourth thing:
the **inset**.

**T40 shape (the primitive's own DOM).** `.bubble` is no longer a simulation: the
shipped `Tooltip.module.css` is snapshotted, so the element carries its real
`padding: 3px 7px`, `position: fixed`, dark `--dsw-alias-tooltip-bg` background
and static light foreground. The nesting is the primitive's own render —
`span.bubble > span.label > span.piai-root` — where `span.label` is the
primitive's label box (`min-width: 0`, no padding of its own), so the 15px inset
is measured through the real chain rather than against a wrapper glued to the
bubble. `left`/`top` are set inline exactly as the component's own `fit()` does
(`max-width: 360px` is the plugin's `maxWidth: 360` prop); the `data-side`
transform is deliberately omitted — it would translate the fixed bubble off this
small viewport and every inset criterion is internal to the bubble.

**T31 colour.** The outer `.bubble` (the primitives' Tooltip surface) paints its
own **static light** foreground `rgb(230, 236, 245)`, while the page pins
`--dsw-alias-label-primary` to a clearly different dark `rgb(21, 26, 35)` via
`page({shellStyle})`. That way "inherited the surface" can never be mistaken for
"resolved the theme alias" — with both equal, the colour criteria would prove
nothing.

| Criterion | Raw measurement (scoped branch) |
| --- | --- |
| `bubbleWrapperScoped` | `display:flex; flex-direction:column; gap:4px` |
| `bubbleKeyChipStyled` | `background rgb(244,245,247)`; `border-radius 6px`; `padding-left 4px`; `align-self:flex-start`; chip `218.52px` < wrapper `360px` |
| `bubbleTextInheritsSurface` | wrapper and all three explanation spans `rgb(230, 236, 245)` == surface, and `!= alias rgb(21, 26, 35)` |
| `bubbleBodyContrast` | body `rgb(230,236,245)` on bubble `rgb(35,42,54)` → luminance `0.8341` / `0.0228` → **12.14:1** |
| `bubbleChipContrast` | chip `rgb(78,89,105)` on chip's own `rgb(244,245,247)` → luminance `0.0978` / `0.9125` → **6.51:1** |
| `bubbleInsetUniform` | wrapper content box → `.bubble` border box: top `15`, right `15`, bottom `15`, left `15` → spread `0` (≤ 1) and every side ≥ 12 |
| `bubbleInsetGrew` | each of the four is strictly larger than the primitives-only `3 / 7 / 3 / 7` (the snapshot's own `padding: 3px 7px`) |
| `bubbleLinesStacked` | tops `[105, 128, 171, 214]` strictly increasing; adjacent overlaps `≤ 0` |
| `bubbleLineGapAtLeast1` | adjacent gaps `[4, 4, 4]` |
| `modalWrapperUnaffected` | the Modal-shaped `.piai-root` padding is `0px` on all four sides and its content box sits exactly on the dialog's own content box (dialog padding `16px`) → inset `0 / 0 / 0 / 0` |
| `modalGateDoesNotMatch` | T39's four selectors `matches()` → `[false, false, false, false]` on the Modal wrapper, while the SAME selectors give `[false, true, false, true]` on the bubble wrapper (so the verdict is not vacuous) |
| `bubbleNegativeIsUnstyled` | the unwrapped branch is NOT a flex column and its chip has no radius |

Diagnostics recorded alongside (not asserted): `bubbleComputed` = `position
fixed`, `padding 3px 7px`, `max-width 360px`, `width 360px`, `background
rgb(35,42,54)`, `border-radius 6px`, `animation-name none`, `visibility visible`.
The last two are deliberate: the snapshot's
`animation: tooltip-in 150ms var(--ds-ease-in-out)` resolves to no animation
because the fixture leaves `--ds-ease-in-out` undefined (the shorthand is then
invalid at computed-value time), which keeps screenshots deterministic.

`measurements.bubbleInset` prints the four sides, the spread, the primitives-only
baseline and the Modal numbers, so every verdict above can be recomputed by hand.

Unwrapped branch (same parts, no `.piai-root`, behind the same real `.label` box):
wrapper `display:block; gap:normal`, chip `background rgba(0,0,0,0);
border-radius 0px; padding-left 0px`, tops `[335.5, 333.5, 353.5, 373.5]` → not
strictly increasing, `stacked:false`, `disjoint:false`, gaps
`[-17, -18.5, -18.5]`.

**Negative control 1 (T22) — geometry.** Unwrapping the wrapper of the *positive*
branch and re-running the same probe: the four geometry `bubble*` checks go
`false` and `pass` becomes `false`.

**Negative control 2 (T36a) — body contrast.** Removing the nested root's
`color: inherit` via CSSOM (exactly T31's absence) and re-running the same probe:

| | positive (T31 present) | negative (`color: inherit` removed) |
| --- | --- | --- |
| `pass` | `true` | `false` |
| `bubbleBodyContrast` | `12.14:1` → `true` | **`1.21:1` → `false`** |
| `bubbleTextInheritsSurface` | `true` | `false` |
| body colour | `rgb(230,236,245)` | `rgb(21,26,35)` (the dark alias) |
| body luminance | `0.8341` | `0.0102` |
| `bubbleChipContrast` | `6.51:1` → `true` | still `true` (only the body changed) |

That is the user-reported defect: dark body text on the bubble's own surface.

**Negative control 3 (T36b) — chip contrast.** Injecting `color: inherit` back
onto the nested `> .piai-key` rule via CSSOM (exactly the T32/T31 chip state) and
re-running the same probe:

| | positive (T35 present) | negative (`color: inherit` injected) |
| --- | --- | --- |
| `pass` | `true` | `false` |
| `bubbleChipContrast` | `6.51:1` → `true` | **`1.09:1` → `false`** |
| chip colour | `rgb(78,89,105)` (theme secondary) | `rgb(230,236,245)` (the bubble surface) |
| chip luminance | `0.0978` | `0.8341` |
| `bubbleBodyContrast` | `12.14:1` → `true` | still `true` (only the chip changed) |

The two negatives isolate the two halves: each CSS mutation fails exactly its own
criterion and leaves the other passing. The CSS-text half of the same contract is
pinned by the `nested/portalled root inherits the surface colour` test in
`tests/styles.test.js` (nested root: `color: inherit`; nested chip: **no**
`color`, so the base `.piai-key` keeps `--dsw-alias-label-secondary`).

**Negative control 4 (T40a) — the compensation removed.** Deleting T39's rule
from the page's CSSOM (`sheet.deleteRule(i)` for the rule whose `selectorText`
contains `:has(> .piai-key)`) and re-running the same probe. The real `.bubble`
padding stays 3/7, so the wrapper's inset collapses back to it:

| | positive (T39 present) | negative (rule deleted) |
| --- | --- | --- |
| `pass` | `true` | `false` |
| inset top/right/bottom/left | `15 / 15 / 15 / 15` | **`3 / 7 / 3 / 7`** |
| spread | `0` | **`4`** |
| `bubbleInsetUniform` | `true` | **`false`** |
| `bubbleInsetGrew` | `true` | **`false`** |
| `.bubble` computed padding | `3px 7px` | `3px 7px` (the primitive's own, untouched) |
| modal padding / inset | `0 / 0` | `0 / 0` (only the bubble changed) |
| `bubbleBodyContrast` / `bubbleChipContrast` | `12.14:1` / `6.51:1` → `true` | still `true` (only the inset changed) |

That is precisely the reported complaint: 3px top/bottom against 7px left/right.

**Negative control 5 (T40b) — the gate forced open.** Retargeting the same rule
to `.piai-root:not(.piai-page)` via CSSOM (dropping the `:has()` gate, i.e. the
developer mistake the gate exists to prevent) and re-running the same probe. The
Modal-shaped wrapper gets the compensation instead of the bubble:

| | positive (gate intact) | negative (rule retargeted) |
| --- | --- | --- |
| `pass` | `true` | `false` |
| Modal wrapper padding | `0px / 0px / 0px / 0px` | **`12px / 8px / 12px / 8px`** |
| Modal content inset vs the dialog | `0 / 0 / 0 / 0` | **`12 / 8 / 12 / 8`** |
| `modalWrapperUnaffected` | `true` | **`false`** |
| bubble inset | `15 / 15 / 15 / 15` | `15 / 15 / 15 / 15` (the bubble is unaffected) |
| `bubbleInsetUniform` / `bubbleInsetGrew` | `true` / `true` | still `true` / `true` |

The two T40 controls isolate the halves the other way round: (a) fails only the
two inset criteria, (b) fails only the Modal criterion. `matches()` in the
positive run answers "does this element match this selector" — retargeting the
*rule* cannot change that, which is why the same `[false, false, false, false]`
is printed in both runs and the Modal guard is the check that moves.

### The adjudicated colour split (T31 → T35/T36)

| | text | on | WCAG contrast |
| --- | --- | --- | --- |
| bubble body | `rgb(230,236,245)` (inherited surface) | bubble `rgb(35,42,54)` | **12.14:1** |
| chip | `rgb(78,89,105)` (`--dsw-alias-label-secondary`) | chip's own `--dsw-alias-bg-layer-2` `rgb(244,245,247)` | **6.51:1** |
| body, `color: inherit` removed | `rgb(21,26,35)` | `rgb(35,42,54)` | 1.21:1 (the reported defect) |
| chip, `color: inherit` injected | `rgb(230,236,245)` | `rgb(244,245,247)` | 1.09:1 (light-on-light) |

Only the **body** inherits the surface; the chip keeps its own theme token pair.
Since T40 the real Tooltip CSS is used verbatim
(`primitives/Tooltip.module.css`: `background: var(--dsw-alias-tooltip-bg);
color: var(--dsw-static-neutral-bluish-00)`, `padding: 3px 7px`) and it does
**not** re-scope `--dsw-alias-bg-layer-2`, which is why the chip's own box stays
light and why inheriting the light foreground there made the chip nearly
disappear. The two token *values* come from the fixture's host-theme block
(`rgb(35,42,54)` / `rgb(230,236,245)`) because DSH's runtime theme is not part of
the snapshot set — the relations the criteria assert (light-on-dark body, chip on
its own light box, and the 3/7 box model) are the primitive's, not invented.

Screenshots (`/tmp/piai-t40-*`, taken in the T40 pass): `r7-positive.png` (15px on
all four sides, light body text + readable chip on the real dark surface),
`r7-negA-no-padding.png` (T39's rule deleted → 3/7, text hugging the corners) and
`r7-negB-modal-padded.png` (rule retargeted → the dialog's search box and rows are
pushed in by 12/8 while the bubble is unchanged). The T36 trio
(`/tmp/piai-t36-r7-positive.png`, `-negA-body.png`, `-negB-chip.png`) documents the
colour halves.

## Negative controls (all measured in `/tmp` copies, never in the workspace)

The controls mutate a copy of the repo, rebuild the fixture from that copy's
`lib/`, and re-measure. Baseline (workspace) `pass: true` for all seven pages.

| Control | Mutation | Raw result | Verdict |
| --- | --- | --- | --- |
| (a) v7 checkbox state | ① drop `:not([type="checkbox"]):not([type="radio"])`; ② delete `.piai-checks > label > input`; ③ restore the span `min-width/overflow/text-overflow` trio | checkbox inputs `97.84px` / `112.43px` (== each label width), option spans `0px` / `0px` | `checkbox16: false`, `optionSpansVisible: false`, `pass: false` |
| (b) count badge | restore `<span class="piai-count">5</span>` in each section head | `countBadges: 6`, titles `通用能力5` … | `noCountBadge: false`, `pass: false` |
| (c) branch rail | restore `.piai-nested { border-left: 1px solid …; padding-left: 12px }` | `borderLeftWidth: "1px"`, `paddingLeft: "12px"` | `nestedNoRail: false`, `pass: false` |

**Why (a) needs all three pieces.** The three rules are defence in depth:

1. the `:not(...)` guards on the width rule (text inputs only),
2. the box pin `.piai-checks > label > input { flex: none; 16px }`,
3. the span keeping only `white-space: nowrap` (no zero-width trio).

Reversing only (1) does **not** reproduce the defect: the pin rule (specificity
`(0,3,2)`) still wins and the box stays 16×16. Only removing the pin as well
lets the stretched checkbox collapse the span to `0px`.

**In-page controls (R6 / R7).** R6's portal-wrapper negative (T17/T26) and R7's
five (T22 geometry, T36a body contrast, T36b chip contrast, T40a compensation
removed, T40b gate forced open) mutate the *loaded page's* CSSOM instead of a repo
copy, so no rebuild is needed and the mutation is visible in the raw numbers
above. Each returns `pass: false` and flips only its own criteria.

## Known limits

- The fixture is static HTML: it pins **computed geometry**, not React wiring.
  DOM semantics remain covered by `tests/a11y.test.js` and `verify.polish.mjs`.
- The host theme block inside `build-fixture.mjs` is a plausible light theme, not
  DSH's real runtime theme; only geometry and the `--dsw-*` resolution are
  asserted, never exact colours.
- `Modal.module.css` is still **not** snapshotted (R5/R6 draw the documented
  picker shape instead), so R7's dialog padding is an inline stand-in. What the
  Modal criteria assert is therefore the *delta* the T39 rule must not add (0),
  not the primitives' own dialog spacing.

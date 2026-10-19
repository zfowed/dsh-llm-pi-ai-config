/**
 * Field presentation data: groups, per-field labels/hints and the protocol
 * compat gates for the `llm-pi-ai` configuration.
 *
 * v10 split this out of `client.fields.js` so the lookup logic and the ~600
 * lines of Chinese copy live in separate files. **This file is data only**: it
 * decides *where* a field is presented and *what it is called*, never whether it
 * exists. The field set always comes from the runtime schema envelope, so an
 * upstream addition shows up on the page without an edit here (AGENTS §3.2).
 *
 * Load position: phase 0. `client.fields.js` reads it out of the registry at
 * eval time, so the owner requests this chunk first; a missing one is a loud
 * chunk-load failure rather than a page that quietly loses every label.
 *
 * Chunk envelope: plain script, no `import`/`export`.
 *
 * @module dsh-llm-pi-ai-config/client.fields.groups
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.fields.groups.js'

  var COMPLETIONS_GATE = {
    supportsStore: 'offer',
    supportsDeveloperRole: 'offer',
    supportsReasoningEffort: 'offer',
    supportsUsageInStreaming: 'offer',
    supportsFinishReason: 'offer',
    maxTokensField: 'offer',
    requiresToolResultName: 'offer',
    requiresAssistantAfterToolResult: 'offer',
    requiresThinkingAsText: 'offer',
    requiresReasoningContentOnAssistantMessages: 'offer',
    thinkingFormat: 'offer',
    chatTemplateKwargs: 'offer',
    chatTemplateArgs: 'offer',
    supportsThinkingTokenBudget: 'offer',
    thinkingTokenBudgetField: 'offer',
    vllmPriority: 'offer',
    supportsStrictMode: 'offer',
    cacheControlFormat: 'offer',
    supportsLongCacheRetention: 'offer',
    openRouterRouting: 'withhold',
    vercelGatewayRouting: 'withhold',
    zaiToolStream: 'withhold',
    supportsOpenAIGrammarTools: 'withhold',
    sendSessionAffinityHeaders: 'withhold',
    supportsMidConvoSystemMessages: 'withhold',
    supportsMidConvoToolAdditions: 'withhold',
    sessionAffinityFormat: 'withhold',
  }

  var RESPONSES_GATE = {
    supportsDeveloperRole: 'offer',
    supportsMaxOutputTokens: 'offer',
    supportsStrictMode: 'offer',
    supportsLongCacheRetention: 'offer',
    sessionAffinityFormat: 'withhold',
    supportsOpenAIGrammarTools: 'withhold',
    supportsAdditionalTools: 'withhold',
    supportsToolSearch: 'withhold',
    supportsExplicitPromptCacheMode: 'withhold',
    supportsMidConvoSystemMessages: 'withhold',
  }

  var ANTHROPIC_GATE = {
    supportsEagerToolInputStreaming: 'offer',
    supportsLongCacheRetention: 'offer',
    supportsCacheControlOnTools: 'offer',
    supportsTemperature: 'offer',
    forceAdaptiveThinking: 'offer',
    allowEmptySignature: 'offer',
    supportsStrictTools: 'offer',
    sendSessionAffinityHeaders: 'withhold',
    sessionAffinityFormat: 'withhold',
    supportsMidConvoSystemMessages: 'withhold',
    supportsMidConvoToolChanges: 'withhold',
    supportsMidConvoEffort: 'withhold',
    allowedFallbackModels: 'withhold',
  }

  var COMPAT_GATES = {
    'mistral-conversations': { supportsMidConvoSystemMessages: 'withhold' },
    'openai-completions': COMPLETIONS_GATE,
    'openai-responses': RESPONSES_GATE,
    'azure-openai-responses': RESPONSES_GATE,
    'openai-codex-responses': RESPONSES_GATE,
    'anthropic-messages': ANTHROPIC_GATE,
    'bedrock-converse-stream': { supportsStrictMode: 'offer' },
  }

  /** Human-facing labels for the wire protocols the adapter accepts. */
  /**
   * Per-path presentation. Keyed by the dotted path *without* the instance
   * prefix, so `models.compat.supportsStore`, `modelOverrides.compat.supportsStore`
   * and `compat.supportsStore` share one entry.
   *
   * `label` and `hint` are optional; anything absent falls back to a humanized
   * path name and the schema's own `meta.description`.
   */
  var FIELDS = {
    // --- provider identity -------------------------------------------------
    // Hint standard (docs/requirements.md R2): say what the switch does, when it
    // takes effect, and what breaks without it. Never restate the key name.
    apiKeyEnv: {
      label: 'API Key 环境变量',
      hint: '密钥存在宿主凭据存储里，这里只是引用名；留空则该路由不带密钥。',
    },
    displayName: { label: '显示名称', hint: '顶部提供商 tab 上显示的名字；留空则显示提供商键名。' },
    api: {
      label: '协议类型',
      hint: '该路由所有模型默认使用的通信协议；不同协议支持的 compat 开关不同。',
      kind: 'enum',
    },
    baseURL: { label: '接口地址（Base URL）', hint: '路由上所有模型共用的接口地址；留空用协议默认地址。' },

    // --- model list / overrides (shared) -----------------------------------
    // `titleRank` is presentation only: it is how a panel learns that the
    // display name outranks every other leaf when it titles an instance card,
    // without naming the field itself (AGENTS §3.2, interaction-design §15.4).
    name: {
      label: '显示名称',
      hint: '界面里该模型的显示名；留空则显示模型 ID。',
      pair: 'identity',
      titleRank: 1,
    },
    contextWindow: {
      label: '上下文窗口',
      hint: '该模型能接受的最大上下文 token 数；超出部分会被截断或直接报错。',
      unit: 'tokens',
      pair: 'size',
    },
    maxTokens: {
      label: '最大输出 Token',
      hint: '单次回复最多生成的 token 数；留空用该路由的默认值。',
      unit: 'tokens',
      pair: 'size',
    },
    input: {
      label: '输入模态',
      hint: '勾选该模型能接受的输入类型；一个都不勾＝不作声明，沿用默认值。',
    },
    reasoningEfforts: {
      label: '推理强度',
      hint:
        '声明该模型可选的思考档位及其分派时发送的取值。false＝非推理模型；' +
        '留空＝继承模型目录的既有能力；至少要声明一个 off 之外的档位。',
    },

    // --- model identity ----------------------------------------------------
    id: { label: '模型 ID', hint: '发送给接口的模型标识；部分服务也叫模型名或部署名。', pair: 'identity' },

    // --- defaults ----------------------------------------------------------
    defaultContextWindow: {
      label: '默认上下文窗口',
      hint: '模型条目没写上下文窗口时用它；未描述模型的容量回退也用它。',
      unit: 'tokens',
      pair: 'size',
    },
    defaultMaxTokens: {
      label: '默认最大输出 Token',
      hint: '模型条目没写最大输出时用它。',
      unit: 'tokens',
      pair: 'size',
    },
    defaultInput: {
      label: '默认输入模态',
      hint: '模型条目没写输入类型时用它。',
    },

    // --- request shaping ---------------------------------------------------
    headers: {
      label: '自定义请求头',
      hint: '附加到该路由每个请求上的 HTTP 头；留空只用内建请求头。',
      rows: true,
    },
    reasoning: {
      label: '推理模式',
      hint: '该路由默认的思考档位（off 即关闭）；留空由协议和模型目录决定。',
      kind: 'enum',
    },
    thinkingBudgets: {
      label: 'Thinking 预算',
      hint: '各思考档位可用的 thinking token 上限；留空用协议默认值。',
      rows: true,
    },
    cacheRetention: {
      label: '缓存保留',
      hint: '提示缓存保留多久：none 不缓存，long 适合多轮复用长提示词。',
      kind: 'enum',
    },
    transport: {
      label: '传输方式',
      hint: '与接口通信的传输层；auto 按能力自选，websocket 适合反复请求同一会话。',
      kind: 'enum',
    },

    // --- timeouts ----------------------------------------------------------
    timeoutMs: {
      label: '请求超时',
      hint: '单次请求（含内部重试）的总时限，超时即中断。',
      unit: 'ms',
      pair: 'timeout',
    },
    websocketConnectTimeoutMs: {
      label: 'WebSocket 连接超时',
      hint: 'WebSocket 传输建立连接的最长等待；其它传输不受影响。',
      unit: 'ms',
      pair: 'timeout',
    },
    streamIdleTimeoutMs: {
      label: '流空闲超时',
      hint: '流式响应两次数据之间的最长间隔，久无数据即断开。',
      unit: 'ms',
    },

    // --- image budgets -----------------------------------------------------
    maxRequestImageBytes: {
      label: '单张图片最大字节',
      hint: '一次请求里所有图片（base64 之后）的字节总量上限，超出会要求卸载图片。',
      unit: 'bytes',
      pair: 'image',
    },
    requestImagePixelBudget: {
      label: '图片像素预算',
      hint: '一次请求里所有图片的像素总量上限，超出会被压缩后再发送。',
      unit: 'px',
    },
    requestImageMaxBytes: {
      label: '图片总字节上限',
      hint: '单张图片在 base64 膨胀之前的编码字节上限。',
      unit: 'bytes',
      pair: 'image',
    },

    // --- retry -------------------------------------------------------------
    retryPolicy: {
      label: '重试策略',
      hint:
        'normal 只重试列出的错误码；always 对所有可重试失败都重试。' +
        'maxRetries 与 retryableCodes 只在 normal 下生效。',
    },

    // --- compat (shared by provider, models[] and modelOverrides) ----------
    // Every key carries a Chinese label + Chinese description; the raw YAML key
    // is rendered beside it as a key chip, so nothing here is guesswork and
    // nothing falls back to a humanized English identifier.
    //
    // Each description names the wire effect taken from pi-ai's installed
    // implementation (`@earendil-works/pi-ai/dist/api/*.js`) or the README's
    // compat interface — not a restatement of the key name.
    'compat.supportsStore': {
      label: '透传 store 参数',
      hint: '请求带上 store 字段让服务端保存对话；多数第三方网关不认，开了会直接报错。',
    },
    'compat.supportsDeveloperRole': {
      label: 'developer 角色消息',
      hint: '系统提示词用 developer 角色发送；只认 system 的服务要关掉。',
    },
    'compat.supportsReasoningEffort': {
      label: 'reasoning_effort 参数',
      hint: '请求可以带 reasoning_effort 指定思考强度；不认的服务要关掉，否则会被拒。',
    },
    'compat.supportsUsageInStreaming': {
      label: '流式用量统计',
      hint: '流式响应里带 usage 用量；关掉后界面拿不到 token 计数。',
    },
    'compat.supportsFinishReason': {
      label: 'finish_reason 返回',
      hint: '以服务端返回的 finish_reason 作为结束依据；服务端不给它会直接报错，要关掉。',
    },
    'compat.maxTokensField': {
      label: 'max_tokens 字段名',
      hint: '输出上限用哪个字段名发送：新接口用 max_completion_tokens，旧网关只认 max_tokens。',
      kind: 'enum',
    },
    'compat.requiresToolResultName': {
      label: '工具结果必须带 name',
      hint: '工具结果消息里回填 name；严格校验工具调用的服务要求开启。',
    },
    'compat.requiresAssistantAfterToolResult': {
      label: '工具结果后需 assistant',
      hint: '工具结果之后补一条 assistant 消息；不补会被服务端拒绝。',
    },
    'compat.requiresThinkingAsText': {
      label: 'thinking 以文本回传',
      hint: '把 thinking 块降级成普通文本再回传；只认文本的服务需要开启。',
    },
    'compat.requiresReasoningContentOnAssistantMessages': {
      label: 'assistant 必带 reasoning_content',
      hint: '回放的 assistant 消息都带空 reasoning_content；DeepSeek 类服务需要开启。',
    },
    'compat.thinkingFormat': {
      label: 'thinking 编码格式',
      hint:
        '思考强度用哪种请求格式发送（openai 用 reasoning_effort、deepseek 用 thinking.type、' +
        'qwen 用 enable_thinking）；选错会被接口判为参数错误。',
      kind: 'enum',
    },
    'compat.chatTemplateKwargs': {
      label: 'chat 模板关键字参数',
      hint:
        '请求体里的 chat_template_kwargs：同一模型声明为推理模型、且 thinkingFormat 为 chat-template 时，' +
        'pi-ai 才把它一起发给服务端，供网关的 Jinja 模板按名读取；别的 thinkingFormat 下这个字段完全惰性。' +
        '每个键的值可以写死（字面量原样进请求），也可以选 $var 让分派按这次请求的思考状态替换（可勾 omitWhenOff），' +
        '两者只能二选一。留空＝删掉这个键，请求里完全不出现；要显式发送 JSON null 得单独选 null；' +
        '整个字典一个键都没有时，请求里连 chat_template_kwargs 都不出现。',
      rows: true,
    },
    'compat.chatTemplateArgs': {
      label: 'chat 模板位置参数',
      hint:
        '请求体里的 chat_template_args：同一模型声明为推理模型、且 thinkingFormat 为 baseten 时，' +
        'pi-ai 才把它发给 baseten 的 chat 模板；别的 thinkingFormat 下这个字段完全惰性。' +
        '取值规则与关键字参数相同：字面量原样进请求，$var 由分派按这次请求的思考状态替换（可勾 omitWhenOff），' +
        '两者只能二选一。留空＝删键、请求里不出现；null＝显式发送该键为 null；整个字典为空时这个参数不发送。',
      rows: true,
    },
    'compat.supportsThinkingTokenBudget': {
      label: 'thinking token 预算',
      hint: '请求带上顶层思考预算字段（vLLM 系）；开启后才限制思考 token 数。',
    },
    'compat.thinkingTokenBudgetField': {
      label: '预算字段名',
      hint: '把预算写进哪个顶层字段：vLLM 用 thinking_token_budget，其余两个对应 Qwen / llama.cpp。',
      kind: 'enum',
    },
    'compat.vllmPriority': {
      label: 'vLLM 调度优先级',
      hint: '请求带 priority 让 vLLM 优先调度；服务端没开优先级调度时无效。',
    },
    'compat.supportsMaxOutputTokens': {
      label: 'max_output_tokens 参数',
      hint: '响应协议允许带 max_output_tokens；网关不支持时关掉以省略该参数。',
    },
    'compat.supportsStrictMode': {
      label: '严格模式结构化输出',
      hint: '工具定义带 strict，让服务端按 JSON Schema 严格取参；不支持会报错。',
    },
    'compat.cacheControlFormat': {
      label: 'cache_control 格式',
      hint: '用 Anthropic 风格 cache_control 标记可缓存内容：系统提示词、最后一个工具、最后一条文本。',
      kind: 'enum',
    },
    'compat.supportsLongCacheRetention': {
      label: '长时间缓存保留',
      hint: '允许把提示缓存保留 24 小时（prompt_cache_retention）；只有部分服务支持。',
    },
    'compat.supportsEagerToolInputStreaming': {
      label: '工具入参提前流式',
      hint: '工具定义带 eager_input_streaming，让入参边生成边下发；仅 Anthropic 协议有效。',
    },
    'compat.supportsCacheControlOnTools': {
      label: '工具定义上的 cache_control',
      hint: '缓存标记也写到工具定义上，工具很多时能省重复计费；仅 Anthropic 协议有效。',
    },
    'compat.supportsTemperature': {
      label: 'temperature 参数',
      hint: '请求带 temperature 采样温度；关掉后只用服务端默认温度。',
    },
    'compat.forceAdaptiveThinking': {
      label: '强制自适应 thinking',
      hint: '强制模型用服务端自适应的思考预算，手写的 thinking 预算不再生效。',
    },
    'compat.allowEmptySignature': {
      label: '允许空签名 thinking',
      hint: '允许回放签名为空的 thinking 块；严格校验签名的服务要关掉。',
    },
    'compat.supportsStrictTools': {
      label: '严格模式工具定义',
      hint: '工具定义带 strict，让服务端严格按 schema 取参；仅 Anthropic 协议有效。',
    },

    // --- retryPolicy branch fields (rendered inside the union control) -----
    'retryPolicy.mode': {
      label: '重试模式',
      hint: 'normal 按次数与错误码重试；always 对所有可重试失败都重试。',
      kind: 'enum',
    },
    'retryPolicy.maxRetries': {
      label: '最大重试次数',
      hint: 'normal 模式下最多重试几次，超过即把错误交给用户。',
    },
    'retryPolicy.retryableCodes': {
      label: '可重试错误码',
      hint: '除内建可重试错误外，额外视为可重试的错误码（normal 模式）。',
    },
    'retryPolicy.backoff.initialDelayMs': {
      label: '退避初始延迟',
      hint: '第一次重试前的等待时间；之后按倍数增长。',
      unit: 'ms',
      pair: 'backoff',
    },
    'retryPolicy.backoff.maxDelayMs': {
      label: '退避上限',
      hint: '重试等待时间的上限，避免间隔无限增长。',
      unit: 'ms',
      pair: 'backoff',
    },
    'retryPolicy.backoff.jitterRatio': {
      label: '退避抖动比例',
      hint: '在退避时间上叠加的随机抖动（0–1），避免并发请求同时重试。',
    },

    // --- reasoningEfforts 档位（dict 的固定键） ----------------------------
    'reasoningEfforts.off': {
      label: 'off 档位',
      hint: '关闭思考时发送的取值；留空＝不声明该档位（等于该模型关不掉思考）。',
    },
    'reasoningEfforts.minimal': {
      label: 'minimal 档位',
      hint: 'minimal 档位分派时发送的接口取值；留空＝不声明该档位。',
    },
    'reasoningEfforts.low': {
      label: 'low 档位',
      hint: 'low 档位分派时发送的接口取值；留空＝不声明该档位。',
    },
    'reasoningEfforts.medium': {
      label: 'medium 档位',
      hint: 'medium 档位分派时发送的接口取值；留空＝不声明该档位。',
    },
    'reasoningEfforts.high': {
      label: 'high 档位',
      hint: 'high 档位分派时发送的接口取值；留空＝不声明该档位。',
    },
    'reasoningEfforts.xhigh': {
      label: 'xhigh 档位',
      hint: 'xhigh 档位分派时发送的接口取值；留空＝不声明该档位。',
    },
    'reasoningEfforts.max': {
      label: 'max 档位',
      hint: 'max 档位分派时发送的接口取值；留空＝不声明该档位。',
    },

    // --- 联合分支的显示名（按 字段键 + 分支取值/结构 查表） ----------------
    'reasoningEfforts.branch.false': { label: '不使用推理强度（false）' },
    'reasoningEfforts.branch.dict': { label: '按档位表设置' },
    'retryPolicy.branch.normal': { label: 'normal（按次数重试）' },
    'retryPolicy.branch.always': { label: 'always（总是重试）' },

    // --- thinking budgets --------------------------------------------------
    'thinkingBudgets.minimal': {
      label: 'minimal 档位预算',
      hint: 'minimal 档位思考时可用的 token 上限；留空用协议默认值。',
      unit: 'tokens',
      pair: 'budget',
    },
    'thinkingBudgets.low': {
      label: 'low 档位预算',
      hint: 'low 档位思考时可用的 token 上限；留空用协议默认值。',
      unit: 'tokens',
      pair: 'budget',
    },
    'thinkingBudgets.medium': {
      label: 'medium 档位预算',
      hint: 'medium 档位思考时可用的 token 上限；留空用协议默认值。',
      unit: 'tokens',
      pair: 'budget',
    },
    'thinkingBudgets.high': {
      label: 'high 档位预算',
      hint: 'high 档位思考时可用的 token 上限；留空用协议默认值。',
      unit: 'tokens',
      pair: 'budget',
    },
    'thinkingBudgets.xhigh': {
      label: 'xhigh 档位预算',
      hint: 'xhigh 档位思考时可用的 token 上限；留空用协议默认值。',
      unit: 'tokens',
      pair: 'budget',
    },
    'thinkingBudgets.max': {
      label: 'max 档位预算',
      hint: 'max 档位思考时可用的 token 上限；留空用协议默认值。',
      unit: 'tokens',
      pair: 'budget',
    },
  }

  /**
   * Group definitions, in render order. `match` receives the dotted path and
   * the leaf; the first match wins, and the final group is an unconditional
   * fallback so no leaf can be dropped.
   */
  var GROUPS = [
    {
      id: 'identity',
      title: '基础信息',
      match: function (path) {
        return (
          path === 'apiKeyEnv' ||
          path === 'displayName' ||
          path === 'api' ||
          path === 'baseURL'
        )
      },
    },
    {
      id: 'models',
      title: '模型列表',
      hint: '未声明则回落到下方的默认值。',
      // Presentation only (AGENTS §3.2): marks this section as the model
      // catalog list, so a panel can style it as such without knowing any field
      // name. It never decides whether a leaf exists — `groupLeaves` copies it
      // onto the returned group and nothing else reads it.
      catalog: true,
      match: function (path) {
        return path.indexOf('models.') === 0
      },
    },
    {
      id: 'overrides',
      title: '逐模型覆盖',
      hint: '按已安装目录中已有的模型 ID 覆盖单个模型的参数。',
      match: function (path) {
        return path.indexOf('modelOverrides.') === 0
      },
    },
    {
      id: 'defaults',
      title: '默认值',
      match: function (path) {
        return (
          path === 'defaultContextWindow' ||
          path === 'defaultMaxTokens' ||
          path === 'defaultInput'
        )
      },
    },
    {
      id: 'request',
      title: '请求构造',
      match: function (path) {
        return (
          path === 'headers' ||
          path === 'reasoning' ||
          path.indexOf('thinkingBudgets') === 0 ||
          path === 'cacheRetention' ||
          path === 'transport'
        )
      },
    },
    {
      id: 'timeouts',
      title: '超时',
      match: function (path) {
        return (
          path === 'timeoutMs' ||
          path === 'websocketConnectTimeoutMs' ||
          path === 'streamIdleTimeoutMs'
        )
      },
    },
    {
      id: 'images',
      title: '图片预算',
      match: function (path) {
        return (
          path === 'maxRequestImageBytes' ||
          path === 'requestImagePixelBudget' ||
          path === 'requestImageMaxBytes'
        )
      },
    },
    {
      id: 'retry',
      title: '重试',
      match: function (path) {
        return path === 'retryPolicy'
      },
    },
    {
      id: 'compat',
      title: '协议兼容（提供商级）',
      hint: '此处的开关应用于该提供商的所有模型。',
      match: function (path) {
        return path.indexOf('compat.') === 0
      },
    },
    {
      id: 'other',
      title: '其他',
      hint: 'schema 中存在但本页尚无专门分组的字段。它们会正常渲染，不会被丢弃。',
      match: function () {
        return true
      },
    },
  ]
  var api = {
    FIELDS: FIELDS,
    GROUPS: GROUPS,
    COMPAT_GATES: COMPAT_GATES,
  }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.fieldsGroups = api

  if (global.__ModuleLoader__ !== undefined) {
    global.__ModuleLoader__.load({
      id: MODULE_ID,
      chunk: CHUNK,
      factory: function () {
        return api
      },
    })
  }
})(globalThis)

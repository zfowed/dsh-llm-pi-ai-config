/**
 * Field presentation data: per-value labels and the option/mode explanations
 * that feed every `piai-info` tooltip.
 *
 * v10 split this out of `client.fields.js` (`docs/requirements.md` R2: the copy
 * has to state effect and consequence, which is why it is long). **Additive
 * only**: a value or leaf without an entry renders its raw token, so a missing
 * row can never hide a field.
 *
 * Load position: phase 0, before `client.fields.js`, which reads it out of the
 * registry at eval time.
 *
 * Chunk envelope: plain script, no `import`/`export`.
 *
 * @module dsh-llm-pi-ai-config/client.fields.hints
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.fields.hints.js'


  /**
   * Chinese names for individual enum VALUES, keyed `<field key>.<value>` in the
   * same key space as {@link FIELDS}.
   *
   * Only values whose raw token does not tell a user what it means get an entry,
   * and every label keeps the raw token in parentheses — the token is what lands
   * in the YAML, so it must stay recognizable. A value with no entry renders its
   * raw token, exactly as it did before.
   */
  var VALUE_LABELS = {
    'input.text': '文本（text）',
    'input.image': '图片（image）',
    'defaultInput.text': '文本（text）',
    'defaultInput.image': '图片（image）',
  }

  /**
   * Chinese explanations for individual VALUES: every enum option, the two
   * multi-select modalities, and the `$var` placeholders of the two
   * chat-template dicts.
   *
   * Keyed `<field key>.<value>` in the same key space as {@link FIELDS} and
   * {@link VALUE_LABELS}, so `compat.thinkingFormat`,
   * `models.compat.thinkingFormat` and `modelOverrides.compat.thinkingFormat`
   * share one entry. A dict leaf that reports a `valueEnum` resolves through
   * the same lookup, so that API already exists; today no leaf reports one.
   *
   * Every sentence says what picking the option sends and when it takes effect
   * (docs/requirements.md R2); none of them restates the field name. The text
   * comes from the installed adapter (`llm-pi-ai/lib/index.js`: `PROTOCOLS`,
   * `MODALITIES`, `THINKING_LEVELS`, `SUPPORTED_THINKING_FORMATS`,
   * `THINKING_TOKEN_BUDGET_FIELDS`, `CACHE_CONTROL_FORMATS`,
   * `CHAT_TEMPLATE_VARS`, `compatProfile`) and pi-ai's installed implementation
   * plus the README's compat interface — never from the identifier alone.
   */
  var VALUE_HINTS = {
    // --- api: the wire protocol of the route ------------------------------
    'api.openai-completions':
      '用 OpenAI 的对话补全格式通信，xAI、Groq、Cerebras、OpenRouter 等大多数服务和兼容网关都按它说话。',
    'api.openai-responses':
      '用 OpenAI 的 Responses 格式通信，与对话补全不通用，只有明确支持它的服务（如 Azure OpenAI）能收。',
    'api.anthropic-messages': '用 Anthropic 的 Messages 格式通信，Claude 系模型与 Anthropic 兼容网关使用。',

    // --- input / defaultInput: the two modalities -------------------------
    'input.text': '声明该模型能收纯文本；文本是所有协议的底线，取消勾选等于声明它连文本都不能收。',
    'input.image': '声明该模型能收图片；没勾选时带图请求会在发出前被拒并点名该模型，而不是等接口报错。',
    'defaultInput.text': '声明没写输入类型的模型默认能收纯文本；文本是所有协议的底线。',
    'defaultInput.image':
      '声明没写输入类型的模型默认能收图片；没勾选时带图请求会在发出前被拒并点名该模型。',

    // --- reasoning: the route's default thinking level --------------------
    'reasoning.off': '关闭思考：请求不带任何思考强度参数，服务端按不推理处理。',
    'reasoning.minimal': '最低一档思考强度，默认思考预算约 1024 token（thinkingBudgets 覆盖后以它为准）。',
    'reasoning.low': '偏低一档思考强度，默认思考预算约 2048 token。',
    'reasoning.medium': '中间一档思考强度，默认思考预算约 8192 token。',
    'reasoning.high': '偏高的一档思考强度，默认思考预算约 16384 token。',
    'reasoning.xhigh':
      '高于 high 的模型专属可选档，默认按 high 的预算处理；模型档位表没声明该档时不会被选中。',
    'reasoning.max': '最高一档，同样是模型专属可选档，默认按 high 的预算处理；模型没声明该档时不生效。',

    // --- reasoningEfforts: the "not a reasoning model" branch -------------
    'reasoningEfforts.false': '声明该模型不做推理：任何档位都不发送思考参数，能力也不从模型目录继承。',

    // --- cacheRetention ---------------------------------------------------
    'cacheRetention.none': '完全不请求提示缓存：不发送缓存保留参数，相同前缀每轮都重新计费。',
    'cacheRetention.short': '短期提示缓存（不配置时的默认行为）：在服务端默认时限内复用重复的提示前缀。',
    'cacheRetention.long':
      '把提示缓存保留 24 小时（prompt_cache_retention: "24h"）：只有 compat 里声明支持长时间缓存的服务收得下。',

    // --- transport --------------------------------------------------------
    'transport.sse': '用 Server-Sent Events 单向流读取响应，兼容性最好，但每次请求都要重新建连。',
    'transport.websocket':
      '用 WebSocket 双向传输；带会话 ID 时连接可按会话复用，静默 5 分钟后过期。',
    'transport.websocket-cached':
      'WebSocket 的带缓存变体；pi-ai 安装代码里未见对它的专门处理，含义未证实，不确定时选 auto。',
    'transport.auto': '交给 pi-ai 按模型与协议能力自选传输；不配置时就是这个行为。',

    // --- compat.maxTokensField -------------------------------------------
    'compat.maxTokensField.max_completion_tokens':
      '输出上限用 max_completion_tokens 发送（pi-ai 的默认字段名），较新的 OpenAI 风格接口用它。',
    'compat.maxTokensField.max_tokens': '输出上限用传统的 max_tokens 发送；只认旧字段名的网关需要选它。',

    // --- compat.thinkingFormat -------------------------------------------
    'compat.thinkingFormat.openai':
      '思考强度放在顶层 reasoning_effort 里发送，OpenAI 官方与多数兼容服务认它（pi-ai 的默认格式）。',
    'compat.thinkingFormat.openrouter': '思考强度放进 reasoning 对象的 effort 里发送，OpenRouter 的路由用它。',
    'compat.thinkingFormat.deepseek':
      '用 thinking.type 表达是否思考，并在服务支持时额外带 reasoning_effort，DeepSeek 系接口用它。',
    'compat.thinkingFormat.together':
      '用 reasoning.enabled 表达是否思考，并在服务支持时额外带 reasoning_effort，Together 系接口用它。',
    'compat.thinkingFormat.baseten':
      '把思考状态交给服务端模板：分派发送这里配置的 chat_template_args，并在服务支持时额外带 reasoning_effort。',
    'compat.thinkingFormat.zai': '只用 thinking.type 表达是否思考、不发强度字段，Z.ai 系接口用它。',
    'compat.thinkingFormat.qwen': '用顶层的 enable_thinking 开关思考，Qwen 系接口用它。',
    'compat.thinkingFormat.chat-template':
      '把思考状态交给服务端 Jinja 模板：分派发送这里配置的 chat_template_kwargs，值可以写死也可以用 $var 跟随思考状态。',
    'compat.thinkingFormat.qwen-chat-template':
      '用 chat_template_kwargs 里的 enable_thinking 与 preserve_thinking 两个键控制 Qwen 模板的思考行为。',
    'compat.thinkingFormat.string-thinking':
      '把思考内容作为顶层的 thinking 纯文本发送，只认文本思考的服务用它。',
    'compat.thinkingFormat.ant-ling':
      '用 reasoning.effort 发送，且只对模型档位表里映射过的档位生效，Ant Ling 系接口用它。',

    // --- compat.thinkingTokenBudgetField ---------------------------------
    'compat.thinkingTokenBudgetField.thinking_token_budget':
      '思考预算写进顶层的 thinking_token_budget 字段，vLLM 系服务用它。',
    'compat.thinkingTokenBudgetField.thinking_budget':
      '思考预算写进顶层的 thinking_budget 字段，Qwen 系服务用它。',
    'compat.thinkingTokenBudgetField.thinking_budget_tokens':
      '思考预算写进顶层的 thinking_budget_tokens 字段，llama.cpp 系服务用它。',

    // --- compat.cacheControlFormat ---------------------------------------
    'compat.cacheControlFormat.anthropic':
      '按 Anthropic 约定用 cache_control 标记可缓存内容：系统提示词、最后一个工具定义、最后一段文本。',

    // --- retryPolicy.mode -------------------------------------------------
    'retryPolicy.mode.normal':
      '只重试 retryableCodes 里列出的错误码，并由 maxRetries 限定次数，其余失败立刻上报。',
    'retryPolicy.mode.always':
      '对所有可重试的失败都重试，不再看错误码；maxRetries 与 retryableCodes 在这个模式下不生效，只保留退避设置。',

    // --- the `$var` placeholders of both chat-template dicts --------------
    'compat.chatTemplateKwargs.thinking.enabled':
      '$var 变量：分派时替换成布尔值，表示这次请求是否开启思考（关闭时为 false），模板可据此决定要不要输出思考段。',
    'compat.chatTemplateKwargs.thinking.effort':
      '$var 变量：分派时替换成当前思考档位在模型档位表里映射的接口取值；档位没有映射时退化成档位名本身。',
    'compat.chatTemplateKwargs.thinking.budget':
      '$var 变量：分派时替换成该思考档位的 token 预算数值，thinkingBudgets 没覆盖时用协议默认值。',
    'compat.chatTemplateArgs.thinking.enabled':
      '$var 变量：分派时替换成布尔值，表示这次请求是否开启思考（关闭时为 false），模板可据此决定要不要输出思考段。',
    'compat.chatTemplateArgs.thinking.effort':
      '$var 变量：分派时替换成当前思考档位在模型档位表里映射的接口取值；档位没有映射时退化成档位名本身。',
    'compat.chatTemplateArgs.thinking.budget':
      '$var 变量：分派时替换成该思考档位的 token 预算数值，thinkingBudgets 没覆盖时用协议默认值。',
  }

  /**
   * The two ways one chat-template value can be written, per field.
   *
   * `compat.chatTemplateKwargs` / `compat.chatTemplateArgs` take either a
   * literal (written into the request body verbatim) or a `$var` object pi-ai
   * replaces at dispatch with a value computed from this request's thinking
   * state. The values themselves are in {@link VALUE_HINTS}; this table only
   * carries the mode copy, so a panel can label the choice without naming the
   * field. The `thinkingFormat` precondition in `varHint` is the hard gate in
   * pi-ai's `openai-completions` request assembly: the two dicts are read only
   * under `chat-template` / `baseten`, and that chain is `else if`.
   */
  var MODE_HINTS = {
    'compat.chatTemplateKwargs': {
      literalLabel: '字面值',
      literalHint:
        '直接把这里的值原样写进请求体（字符串、数字、布尔值、null 都按字面发送），由服务端的 Jinja 模板自己读取；不需要思考状态参与时选它。',
      varLabel: '$var 变量',
      varHint:
        '分派时按这次请求的思考状态替换成 pi 计算出的值：thinking.enabled＝是否开启思考（布尔），' +
        'thinking.effort＝当前档位映射后的接口取值，thinking.budget＝该档位的 token 预算；' +
        '勾上 omitWhenOff 表示关闭思考时这个键整个不发。两者只能二选一，' +
        '且只有同一模型的 thinkingFormat 是 chat-template 时这条才会被 pi-ai 用上。',
    },
    'compat.chatTemplateArgs': {
      literalLabel: '字面值',
      literalHint:
        '直接把这里的值原样写进请求体（字符串、数字、布尔值、null 都按字面发送），由 baseten 的 chat 模板自己读取；不需要思考状态参与时选它。',
      varLabel: '$var 变量',
      varHint:
        '分派时按这次请求的思考状态替换成 pi 计算出的值：thinking.enabled＝是否开启思考（布尔），' +
        'thinking.effort＝当前档位映射后的接口取值，thinking.budget＝该档位的 token 预算；' +
        '勾上 omitWhenOff 表示关闭思考时这个键整个不发。两者只能二选一，' +
        '且只有同一模型的 thinkingFormat 是 baseten 时这条才会被 pi-ai 用上。',
    },
  }
  var api = {
    VALUE_LABELS: VALUE_LABELS,
    VALUE_HINTS: VALUE_HINTS,
    MODE_HINTS: MODE_HINTS,
  }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.fieldsHints = api

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

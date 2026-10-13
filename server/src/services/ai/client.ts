import type { z } from 'zod';
import { aiConfigured, type Config } from '../../config.js';
import { HttpError } from '../../errors.js';
import { log } from '../../logger.js';
import { describeIssues } from '../../schemas.js';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

interface ChatJsonOptions<S extends z.ZodType> {
  system: string;
  user: string;
  schema: S;
}

export class AiError extends HttpError {
  constructor(status: number, message: string, code: string) {
    super(status, message, code);
  }
}

function providerError(status: number): AiError {
  if (status === 401 || status === 403) {
    return new AiError(502, 'The AI provider rejected the API key. Check AI_API_KEY and AI_BASE_URL on the server.', 'ai_auth');
  }
  if (status === 404) {
    return new AiError(502, 'The AI provider did not recognise the model or endpoint. Check AI_MODEL and AI_BASE_URL on the server.', 'ai_not_found');
  }
  if (status === 429) {
    return new AiError(503, 'The AI provider is rate-limiting requests or the account is out of quota. Please try again in a minute.', 'ai_rate_limited');
  }
  return new AiError(502, 'The AI provider returned an error. Please try again.', 'ai_provider_error');
}

async function callProvider(config: Config, model: string, messages: Message[], jsonMode: boolean): Promise<string> {
  const body: Record<string, unknown> = { model, messages };
  if (jsonMode) body.response_format = { type: 'json_object' };
  if (config.ai.temperature !== undefined) body.temperature = config.ai.temperature;

  let response: Response;
  try {
    response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ai.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.ai.timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AiError(504, 'The AI provider took too long to respond. Please try again.', 'ai_timeout');
    }
    throw new AiError(502, 'Could not reach the AI provider. Check AI_BASE_URL and your network.', 'ai_unreachable');
  }

  if (!response.ok) {
    // Some OpenAI-compatible providers do not support response_format; retry once without it.
    if (jsonMode && response.status === 400) {
      const detail = await response.text().catch(() => '');
      if (/response_format|json_object|json mode/i.test(detail)) {
        return callProvider(config, model, messages, false);
      }
    }
    log.warn(`AI provider responded with HTTP ${response.status}`);
    throw providerError(response.status);
  }

  const payload = (await response.json().catch(() => null)) as
    | { choices?: { message?: { content?: unknown } }[] }
    | null;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new AiError(502, 'The AI provider returned an empty response. Please try again.', 'ai_invalid_response');
  }
  return content;
}

const BUSY_CODES = new Set(['ai_rate_limited', 'ai_provider_error', 'ai_timeout']);

/** Pull a JSON object out of a model reply, tolerating code fences and surrounding prose. */
export function parseJsonReply(reply: string): unknown {
  const unfenced = reply.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no JSON object found');
    return JSON.parse(unfenced.slice(start, end + 1));
  }
}

/**
 * Ask the model for JSON and validate it against `schema`. If the reply does not parse or
 * validate, the model gets one chance to correct it before the request fails.
 */
export async function chatJson<S extends z.ZodType>(
  config: Config,
  options: ChatJsonOptions<S>,
): Promise<{ data: z.infer<S>; model: string }> {
  if (!aiConfigured(config)) {
    throw new AiError(503, 'No AI API key is configured on the server.', 'ai_not_configured');
  }

  const messages: Message[] = [
    { role: 'system', content: options.system },
    { role: 'user', content: options.user },
  ];

  // An overloaded, rate-limited or stalled model should not stop the user: move on to the
  // next model in the list, and when the list runs out, pause briefly and try once more.
  const models = [config.ai.model, ...config.ai.fallbackModels.filter((m) => m !== config.ai.model)];
  let current = 0;
  let waited = false;
  const ask = async (): Promise<string> => {
    for (;;) {
      try {
        return await callProvider(config, models[current] ?? config.ai.model, messages, config.ai.jsonMode);
      } catch (err) {
        if (!(err instanceof AiError) || !BUSY_CODES.has(err.code)) throw err;
        if (current < models.length - 1) {
          current++;
          log.warn('AI model unavailable; trying the next configured model');
        } else if (!waited && err.code !== 'ai_timeout') {
          waited = true;
          await new Promise((resolve) => setTimeout(resolve, config.ai.retryDelayMs));
        } else {
          throw err;
        }
      }
    }
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await ask();
    let problem: string;
    try {
      const result = options.schema.safeParse(parseJsonReply(reply));
      if (result.success) return { data: result.data, model: models[current] ?? config.ai.model };
      problem = describeIssues(result.error).join('; ');
    } catch {
      problem = 'the reply was not a single valid JSON object';
    }
    messages.push(
      { role: 'assistant', content: reply },
      {
        role: 'user',
        content: `That reply was rejected: ${problem}. Reply again with ONLY a single valid JSON object matching the required structure. Follow all the original rules.`,
      },
    );
  }

  throw new AiError(502, 'The AI returned a response in an unexpected format. Please try again.', 'ai_invalid_response');
}

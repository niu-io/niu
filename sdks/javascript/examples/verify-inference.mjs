import { NiuAPIError, NiuClient } from '../dist/index.js';

class VerificationError extends Error {}

let stage = 'setup';
try {
  const required = name => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error('Missing configuration');
    return value;
  };
  const model = required('NIU_MODEL_ALIAS');
  const maxTokens = Number(process.env.NIU_MAX_OUTPUT_TOKENS ?? 64);
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) {
    throw new VerificationError('Set NIU_MAX_OUTPUT_TOKENS to a positive integer.');
  }
  const truncated = () => new VerificationError(`The model exhausted its ${maxTokens}-token output limit before returning visible text. If your budget allows, increase NIU_MAX_OUTPUT_TOKENS and rerun.`);
  const client = new NiuClient({
    apiKey: required('NIU_API_KEY'),
    baseURL: required('NIU_BASE_URL'),
  });
  const options = () => ({ signal: AbortSignal.timeout(30000), logPayloads: false });
  stage = 'model discovery';
  const catalog = await client.models.list(options());
  if (!catalog.data.some(item => item.id === model)) {
    throw new Error('Selected model unavailable');
  }
  const request = {
    model,
    messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    max_tokens: maxTokens,
  };
  stage = 'nonstreaming Chat';
  const completion = await client.chat.completions(request, options());
  if (!completion.choices.some(choice => typeof choice.message.content === 'string' && choice.message.content.length > 0)) {
    if (completion.choices.some(choice => choice.finish_reason === 'length')) throw truncated();
    throw new VerificationError('The model returned no visible text.');
  }
  stage = 'streaming Chat';
  let textReceived = false, finished = false, lengthLimited = false, usage = null;
  for await (const chunk of client.chat.stream(request, options())) {
    for (const choice of chunk.choices ?? []) {
      if (choice.finish_reason === 'length') lengthLimited = true;
      if (choice.delta?.content) textReceived = true;
      if (choice.finish_reason !== undefined && choice.finish_reason !== null) finished = true;
    }
    if (chunk.usage) usage = chunk.usage;
  }
  if (!textReceived && lengthLimited) throw truncated();
  if (!textReceived || !finished) throw new Error('Incomplete text response');
  console.log(JSON.stringify({
    model,
    nonstreaming: { completed: true, reportedUsage: completion.usage ?? null },
    streaming: { completed: true, reportedUsage: usage },
    payloadRetentionRequested: false,
  }, null, 2));
} catch (error) {
  const status = error instanceof NiuAPIError ? ` (HTTP ${error.status})` : '';
  if (error instanceof VerificationError) console.error(`Inference verification failed during ${stage}. ${error.message}`);
  else console.error(`Inference verification failed during ${stage}${status}. Check NIU_BASE_URL, NIU_API_KEY, NIU_MODEL_ALIAS and the selected route's supported capabilities.`);
  process.exitCode = 1;
}

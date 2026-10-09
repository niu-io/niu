import { NiuAPIError, NiuClient } from '../dist/index.js';

let stage = 'setup';
try {
  const required = name => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error('Missing configuration');
    return value;
  };
  const model = required('NIU_MODEL_ALIAS');
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
    max_tokens: 64,
  };
  stage = 'nonstreaming Chat';
  const completion = await client.chat.completions(request, options());
  if (!completion.choices.some(choice => typeof choice.message.content === 'string' && choice.message.content.length > 0)) {
    throw new Error('No text response');
  }
  stage = 'streaming Chat';
  let textReceived = false, finished = false, usage = null;
  for await (const chunk of client.chat.stream(request, options())) {
    for (const choice of chunk.choices ?? []) {
      if (choice.delta?.content) textReceived = true;
      if (choice.finish_reason !== undefined && choice.finish_reason !== null) finished = true;
    }
    if (chunk.usage) usage = chunk.usage;
  }
  if (!textReceived || !finished) throw new Error('Incomplete text response');
  console.log(JSON.stringify({
    model,
    nonstreaming: { completed: true, reportedUsage: completion.usage ?? null },
    streaming: { completed: true, reportedUsage: usage },
    payloadRetentionRequested: false,
  }, null, 2));
} catch (error) {
  const status = error instanceof NiuAPIError ? ` (HTTP ${error.status})` : '';
  console.error(`Inference verification failed during ${stage}${status}. Check NIU_BASE_URL, NIU_API_KEY, NIU_MODEL_ALIAS and the selected route's supported capabilities.`);
  process.exitCode = 1;
}

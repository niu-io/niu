# Niu TypeScript SDK

The `@niu-io/sdk` package is a small, fetch-based client for Niu's OpenAI-compatible API.

```ts
import { NiuClient } from '@niu-io/sdk';

const niu = new NiuClient({
  apiKey: process.env.NIU_API_KEY!,
  baseURL: 'https://gateway.example.com/v1',
});

const models = await niu.models.list();
const completion = await niu.chat.completions({
  model: 'fast',
  messages: [{ role: 'user', content: 'Summarize this report.' }],
});
```

The gateway is still an early implementation. Streaming response ergonomics and a stable typed completion schema will be added as the public API contract matures.

Use `chat.completions()` for a JSON response and `chat.stream()` for SSE:

```ts
const controller = new AbortController();
for await (const chunk of client.chat.stream({
  model: 'fast',
  messages: [{ role: 'user', content: 'Hello' }],
}, { signal: controller.signal })) {
  console.log(chunk);
}
```

The iterator requests provider usage events. Breaking the loop cancels the response body; `AbortSignal` also cancels the underlying fetch. Cancellation does not prove that the provider stopped execution or incurred no cost. Missing terminal events, invalid JSON and events exceeding the client's 65,536 UTF-16-unit buffer limit throw errors. The SDK does not retry or reconnect a stream automatically.

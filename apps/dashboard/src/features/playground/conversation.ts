export type ConversationMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};
export type ConversationTurn = {
  prompt: string;
  attachments?: Array<{ name: string; type: string; content: string }>;
  results: Array<{ model: string; phase: string; content: string }>;
};

export function userMessage(turn: Pick<ConversationTurn, 'prompt' | 'attachments'>): ConversationMessage {
  return { role: 'user', content: turn.attachments?.length
    ? [{ type: 'text', text: turn.prompt }, ...turn.attachments.map(file => file.type === 'image'
      ? { type: 'image_url', image_url: { url: file.content } }
      : { type: 'text', text: `File: ${file.name}\n${file.content}` })]
    : turn.prompt };
}

/** Continue only completed exchanges belonging to the selected model branch. */
export function branchMessages(turns: readonly ConversationTurn[], model: string): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  for (const turn of turns) {
    const result = turn.results.find(result => result.model === model);
    if (result?.phase !== 'complete') continue;
    messages.push(userMessage(turn), { role: 'assistant', content: result.content });
  }
  return messages;
}

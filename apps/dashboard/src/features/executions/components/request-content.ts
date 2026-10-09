export type ContentMessage = { role: string; text: string; tools: Array<{ name: string; arguments: string }> };
export const visibleContent = (value: string) => value.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[internal identifier]');
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map(part => {
    const item = object(part);
    return item && typeof item.text === 'string' ? item.text : '[Non-text content; inspect Raw data]';
  }).join('\n');
}
function message(value: unknown, fallback = 'Assistant'): ContentMessage | null {
  const item = object(value);
  if (!item) return null;
  if (item.type === 'function_call' && typeof item.name === 'string' && typeof item.arguments === 'string') {
    return {role: 'Assistant', text: '', tools: [{name: item.name, arguments: item.arguments}]};
  }
  if (item.type === 'function_call_output') {
    const output = text(item.output);
    return output ? {role: 'Tool', text: output, tools: []} : null;
  }
  const tools = Array.isArray(item.tool_calls) ? item.tool_calls.flatMap(call => {
    const fn = object(object(call)?.function);
    return fn && typeof fn.name === 'string' ? [{ name: fn.name, arguments: typeof fn.arguments === 'string' ? fn.arguments : '' }] : [];
  }) : [];
  const content = text(item.content) || (typeof item.refusal === 'string' ? item.refusal : '');
  return content || tools.length ? { role: typeof item.role === 'string' ? item.role : fallback, text: content, tools } : null;
}
export function requestMessages(request: unknown): ContentMessage[] {
  const root = object(request);
  if (!root) return [];
  if (Array.isArray(root.messages)) return root.messages.flatMap(value => message(value) ?? []);
  const messages: ContentMessage[] = [];
  if (typeof root.instructions === 'string') messages.push({role: 'System', text: root.instructions, tools: []});
  if (typeof root.input === 'string') messages.push({role: 'User', text: root.input, tools: []});
  else if (Array.isArray(root.input)) messages.push(...root.input.flatMap(value => message(value, 'User') ?? []));
  return messages;
}
function jsonMessages(root: Record<string, unknown>): ContentMessage[] {
  const failure = errorMessage(root.error);
  let messages: ContentMessage[] = [];
  if (Array.isArray(root.choices)) messages = root.choices.flatMap(choice => message(object(choice)?.message) ?? []);
  else if (Array.isArray(root.output)) messages = root.output.flatMap(item => {
    const value = object(item);
    if (value?.type === 'function_call' && typeof value.name === 'string') return [{role:'Assistant',text:'',tools:[{name:value.name,arguments:typeof value.arguments === 'string' ? value.arguments : ''}]}];
    return message(value) ?? [];
  });
  else if (typeof root.output_text === 'string') messages = [{role: 'Assistant', text: root.output_text, tools: []}];
  return failure ? [...messages, failure] : messages;
}
function errorMessage(value: unknown): ContentMessage | null {
  const error = object(value);
  const detail = typeof value === 'string' ? value : typeof error?.message === 'string' ? error.message : '';
  return detail.trim() ? {role: 'Error', text: detail, tools: []} : null;
}
export function responseMessages(response: string, contentType: string): { messages: ContentMessage[]; partial: boolean } {
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    try { const root = object(JSON.parse(response)); return {messages: root ? jsonMessages(root) : [], partial: false}; }
    catch { return {messages: [], partial: true}; }
  }
  const choices = new Map<number, ContentMessage & { calls: Map<number, {name: string; arguments: string}> }>();
  let partial = false;
  let done = false;
  const responseText = new Map<number, Map<number, string>>();
  const responseTools = new Map<number, {name:string;arguments:string}>();
  let terminalMessages: ContentMessage[] | null = null;
  const failures: ContentMessage[] = [];
  for (const block of response.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n')) {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data) continue;
    if (data === '[DONE]') { done = true; break; }
    try {
      const event = object(JSON.parse(data));
      if (!event) { partial = true; continue; }
      if (event.error) {
        partial = true;
        const failure = errorMessage(event.error);
        if (failure) failures.push(failure);
      }
      if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
        const item = object(event.item);
        if (item?.type === 'function_call') {
          if (typeof event.output_index !== 'number' || !Number.isSafeInteger(event.output_index) || event.output_index < 0 || typeof item.name !== 'string' || typeof item.arguments !== 'string') { partial = true; continue; }
          responseTools.set(event.output_index,{name:item.name,arguments:item.arguments});
        }
        continue;
      }
      if (event.type === 'response.function_call_arguments.delta' || event.type === 'response.function_call_arguments.done') {
        const index = event.output_index;
        const value = event.type === 'response.function_call_arguments.delta' ? event.delta : event.arguments;
        if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || typeof value !== 'string') { partial = true; continue; }
        const tool = responseTools.get(index) ?? {name:'',arguments:''};
        tool.arguments = event.type === 'response.function_call_arguments.done' ? value : tool.arguments + value;
        responseTools.set(index,tool);
        continue;
      }
      if (event.type === 'response.output_text.delta' || event.type === 'response.output_text.done') {
        const index = event.output_index;
        const part = event.content_index;
        const value = event.type === 'response.output_text.delta' ? event.delta : event.text;
        if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || typeof part !== 'number' || !Number.isSafeInteger(part) || part < 0 || typeof value !== 'string') { partial = true; continue; }
        const content = responseText.get(index) ?? new Map<number,string>();
        content.set(part,event.type === 'response.output_text.done' ? value : (content.get(part) ?? '') + value);
        responseText.set(index,content);
        continue;
      }
      if (event.type === 'response.completed' || event.type === 'response.failed' || event.type === 'response.incomplete') {
        const response = object(event.response);
        if (response && (Array.isArray(response.output) || response.error)) terminalMessages = jsonMessages(response);
        done = event.type === 'response.completed';
        if (!done) partial = true;
        break;
      }
      if (!Array.isArray(event.choices)) continue;
      for (const value of event.choices) {
        const choice = object(value); const delta = object(choice?.delta);
        if (!choice || !delta || typeof choice.index !== 'number') continue;
        const item = choices.get(choice.index) ?? {role:'Assistant',text:'',tools:[],calls:new Map()};
        item.text += text(delta.content) || (typeof delta.refusal === 'string' ? delta.refusal : '');
        if (Array.isArray(delta.tool_calls)) for (const raw of delta.tool_calls) {
          const call = object(raw); const fn = object(call?.function);
          if (!call || !fn || typeof call.index !== 'number') { partial = true; continue; }
          const tool = item.calls.get(call.index) ?? {name:'',arguments:''};
          if (typeof fn.name === 'string') tool.name += fn.name;
          if (typeof fn.arguments === 'string') tool.arguments += fn.arguments;
          item.calls.set(call.index, tool);
        }
        choices.set(choice.index, item);
      }
    } catch { partial = true; }
  }
  if (terminalMessages !== null || responseText.size || responseTools.size) {
    const indices = [...new Set([...responseText.keys(),...responseTools.keys()])].sort((a,b)=>a-b);
    return {messages: [...(terminalMessages ?? indices.map(index=>({role:'Assistant',text:[...(responseText.get(index) ?? new Map<number,string>()).entries()].sort(([a],[b])=>a-b).map(([,value])=>value).join('\n'),tools:responseTools.has(index) ? [responseTools.get(index)!] : []}))), ...failures],partial:partial || !done};
  }
  return {messages: [...[...choices.entries()].sort(([a],[b]) => a-b).map(([,item]) => ({role:item.role,text:item.text,tools:[...item.calls.entries()].sort(([a],[b])=>a-b).map(([,tool])=>tool)})), ...failures], partial: partial || !done};
}

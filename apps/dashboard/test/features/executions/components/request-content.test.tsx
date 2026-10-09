import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RequestContent from '../../../../src/features/executions/components/RequestContent';
import { requestMessages, responseMessages } from '../../../../src/features/executions/components/request-content';

describe('retained request content', () => {
  it('shows retained JSON error messages without exposing error metadata or internal identifiers', () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    const response = JSON.stringify({error:{message:`Request rejected ${id}`,metadata:{secret:'private metadata'}}});
    expect(responseMessages(response,'application/json').messages[0].role).toBe('Error');
    render(<RequestContent payload={{request:{},response,content_type:'application/json',complete:true,truncated:false}} />);
    expect(screen.getByText('Request rejected [internal identifier]')).toBeTruthy();
    expect(screen.queryByText('private metadata')).toBeNull();
  });
  it('retains partial streamed output and its error, including failed Responses events', () => {
    const stream = (events:unknown[]) => events.map(event=>`data: ${JSON.stringify(event)}\n\n`).join('');
    const chat = responseMessages(stream([{choices:[{index:0,delta:{content:'Partial answer'}}]},{error:{message:'Stream interrupted'}}]),'text/event-stream');
    expect(chat.messages.map(item=>item.text)).toEqual(['Partial answer','Stream interrupted']);
    expect(chat.partial).toBe(true);
    const failed = responseMessages(stream([{type:'response.failed',response:{output:[],error:{message:'Request rejected'}}}]),'text/event-stream');
    expect(failed.messages).toEqual([{role:'Error',text:'Request rejected',tools:[]}]);
    expect(failed.partial).toBe(true);
    const partial = responseMessages(stream([{type:'response.failed',response:{output:[{role:'assistant',content:'Retained answer'}],error:{message:'Request interrupted'}}}]),'text/event-stream');
    expect(partial.messages.map(item=>item.text)).toEqual(['Retained answer','Request interrupted']);
    expect(responseMessages('{"error":{"code":"unknown"}}','application/json').messages).toEqual([]);
  });
  it('preserves Responses tool history in request order without exposing call identifiers', async () => {
    const user = userEvent.setup();
    const request = {input:[
      {role:'user',content:'Check the weather'},
      {type:'function_call',call_id:'12345678-1234-1234-1234-123456789abc',name:'weather',arguments:'{"city":"Shanghai"}'},
      {type:'function_call_output',call_id:'12345678-1234-1234-1234-123456789abc',output:'Sunny'},
    ]};
    expect(requestMessages(request).map(item=>item.role)).toEqual(['user','Assistant','Tool']);
    render(<RequestContent payload={{request,response:'{}',content_type:'application/json',complete:true,truncated:false}} />);
    expect(screen.getByText('Sunny')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'weather'}));
    expect((screen.getByRole('textbox',{name:'weather arguments'}) as HTMLTextAreaElement).value).toBe('{"city":"Shanghai"}');
    expect(screen.queryByText(/12345678/)).toBeNull();
    expect(requestMessages({input:[{type:'function_call_output',output:[{type:'input_text',text:'Cloudy'}]}]})[0].text).toBe('Cloudy');
    expect(requestMessages({input:[{type:'function_call',name:'weather',arguments:123}]})).toEqual([]);
  });
  it('parses Chat and Responses text without displaying transport identifiers', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const id = '12345678-1234-1234-1234-123456789abc';
    render(<RequestContent payload={{request:{messages:[{role:'user',content:'Help me'}]},response:JSON.stringify({id,choices:[{message:{role:'assistant',content:`Answer ${id}`,tool_calls:[{id,function:{name:'lookup',arguments:'{"query":"value"}'}}]}}]}),content_type:'application/json',complete:true,truncated:false}} />);
    expect(screen.getByText('Help me')).toBeTruthy();
    expect(screen.getByText('Answer [internal identifier]')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button',{name:'lookup'}));
    expect((screen.getByRole('textbox',{name:'lookup arguments'}) as HTMLTextAreaElement).value).toBe('{"query":"value"}');
    await user.click(screen.getByRole('button',{name:'Copy response message 1'}));
    expect(writeText).toHaveBeenCalledWith('Answer [internal identifier]');
    await user.click(screen.getByRole('tab',{name:'Raw data'}));
    expect((screen.getByRole('textbox',{name:'Response payload'}) as HTMLTextAreaElement).value).not.toContain(id);
    expect(requestMessages({instructions:'Be concise',input:'Question'}).map(item=>item.text)).toEqual(['Be concise','Question']);
    expect(responseMessages(JSON.stringify({output:[{role:'assistant',content:[{type:'output_text',text:'Response text'}]}]}),'application/json').messages[0].text).toBe('Response text');
  });
  it('reconstructs indexed streamed choices and tool fragments, preserving partial status', () => {
    const events=[{choices:[{index:1,delta:{content:'Other'}},{index:0,delta:{content:'Hel',tool_calls:[{index:0,function:{name:'lookup',arguments:'{"q":'}}]}}]}, {choices:[{index:0,delta:{content:'lo',tool_calls:[{index:0,function:{arguments:'1}'}}]}}]}];
    const stream=events.map(event=>`data: ${JSON.stringify(event)}\r\n\r\n`).join('');
    const parsed=responseMessages(stream+'data: [DONE]\r\n\r\n','text/event-stream');
    expect(parsed.partial).toBe(false);
    expect(parsed.messages.map(item=>item.text)).toEqual(['Hello','Other']);
    expect(parsed.messages[0].tools).toEqual([{name:'lookup',arguments:'{"q":1}'}]);
    expect(responseMessages(stream,'text/event-stream').partial).toBe(true);
    expect(responseMessages(stream+'data: invalid\n\n','text/event-stream').partial).toBe(true);
  });
  it('reconstructs streamed Responses text and uses completed output without duplicating deltas', () => {
    const encode=(events:unknown[])=>events.map(event=>`data: ${JSON.stringify(event)}\n\n`).join('');
    const deltas=[{type:'response.output_text.delta',output_index:0,content_index:0,delta:'Hel'},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'lo'}];
    expect(responseMessages(encode(deltas),'text/event-stream')).toEqual({messages:[{role:'Assistant',text:'Hello',tools:[]}],partial:true});
    const terminal={type:'response.completed',response:{output:[{role:'assistant',content:[{type:'output_text',text:'Hello'}]},{type:'function_call',name:'lookup',arguments:'{}'}]}};
    const parsed=responseMessages(encode([...deltas,terminal]),'text/event-stream');
    expect(parsed.partial).toBe(false);
    expect(parsed.messages.map(item=>item.text)).toEqual(['Hello','']);
    expect(parsed.messages[1].tools).toEqual([{name:'lookup',arguments:'{}'}]);
    expect(responseMessages(encode([...deltas,{type:'response.incomplete',response:{output:[]}}]),'text/event-stream').partial).toBe(true);
  });
  it('retains interrupted Responses function-call arguments in output order', () => {
    const events=[{type:'response.output_item.added',output_index:1,item:{type:'function_call',name:'lookup',arguments:''}},{type:'response.function_call_arguments.delta',output_index:1,delta:'{"q":'},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'Looking up'},{type:'response.function_call_arguments.delta',output_index:1,delta:'1'}];
    const stream=(values:unknown[])=>values.map(event=>`data: ${JSON.stringify(event)}\n\n`).join('');
    const interrupted=responseMessages(stream(events),'text/event-stream');
    expect(interrupted.partial).toBe(true);
    expect(interrupted.messages.map(message=>message.text)).toEqual(['Looking up','']);
    expect(interrupted.messages[1].tools).toEqual([{name:'lookup',arguments:'{"q":1'}]);
    const finalized=responseMessages(stream([...events,{type:'response.function_call_arguments.done',output_index:1,arguments:'{"q":1}'}]),'text/event-stream');
    expect(finalized.messages[1].tools[0].arguments).toBe('{"q":1}');
    expect(finalized.partial).toBe(true);
  });
  it('does not invent readable output from malformed or unsupported payloads', () => {
    expect(responseMessages('{broken','application/json')).toEqual({messages:[],partial:true});
    expect(responseMessages('{"data":[{"embedding":[1,2]}]}','application/json').messages).toEqual([]);
    expect(requestMessages({unrelated:'value'})).toEqual([]);
    expect(requestMessages({messages:[{role:'user',content:[{type:'text',text:'Describe this'}, {type:'image_url',image_url:{url:'https://example.test/image'}}]}]})[0].text).toContain('Non-text content; inspect Raw data');
  });
});

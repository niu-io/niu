import { describe, expect, it } from 'vitest';
import { branchMessages } from '../../../src/features/playground/conversation';

describe('per-model conversation context', () => {
  it('preserves text and image attachments in the completed branch only', () => {
    const turns = [{ prompt: 'Read these files', attachments: [
      { name: 'notes.txt', type: 'text', content: 'Fixture notes' },
      { name: 'diagram.png', type: 'image', content: 'data:image/png;base64,fixture' },
    ], results: [{ model: 'one', phase: 'complete', content: 'One answer' }, { model: 'two', phase: 'complete', content: 'Two answer' }] }];
    expect(branchMessages(turns, 'one')).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Read these files' }, { type: 'text', text: 'File: notes.txt\nFixture notes' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,fixture' } }] },
      { role: 'assistant', content: 'One answer' },
    ]);
    expect(branchMessages(turns, 'new-model')).toEqual([]);
  });

  it('excludes failed, cancelled and unfinished exchanges without borrowing another model', () => {
    const turns = ['failed', 'cancelled', 'streaming', 'connecting'].map(phase => ({ prompt: 'Unaccepted exchange', results: [
      { model: 'one', phase, content: 'Partial answer' }, { model: 'two', phase: 'complete', content: 'Other answer' },
    ] }));
    expect(branchMessages(turns, 'one')).toEqual([]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { VideoIntent } from '../src/features/video/intent';
import type { VideoSubmissionIntent } from '../../../sdks/javascript/src/admin';

const scope = { organizationId: 'organization', projectId: 'workspace' };
const request = { model: 'video-model', content: [{ type: 'text' as const, text: 'A landscape' }] };
const document: VideoSubmissionIntent = {
  id: 'intent', revision: 1, expires_at_ms: '1800000000000', content_state: 'retained',
  original_key_id: 'key', key_id: 'key', model: 'video-model', funding_mode: 'owner_funded',
  request, submission_state: 'saved', job: null,
};
const job = { id: 'job', object: 'video.job' as const, model: 'video-model', status: 'queued' as const };
function setup(restored = document) {
  const client = {
    saveVideoIntent: vi.fn().mockResolvedValue({ data: document }),
    getVideoIntent: vi.fn().mockResolvedValue({ data: restored }),
    submitVideoIntent: vi.fn().mockResolvedValue(job),
    deleteVideoIntent: vi.fn().mockResolvedValue({ data: { id: 'intent', revision: 2, deleted: true } }),
  };
  return { client, intent: new VideoIntent(client, scope, 'intent') };
}
describe('durable video intent lifecycle', () => {
  it('saves and restores without submitting, and forwards cancellation', async () => {
    const { client, intent } = setup();
    const options = { signal: new AbortController().signal };
    await intent.save('key', request, options);
    await intent.restore(options);
    expect(client.saveVideoIntent).toHaveBeenCalledWith(scope, 'intent', 'key', request, options);
    expect(client.getVideoIntent).toHaveBeenCalledWith(scope, 'intent', options);
    expect(client.submitVideoIntent).not.toHaveBeenCalled();
  });
  it('requires a read after a lost submit response and recovers the original job', async () => {
    const { client, intent } = setup();
    await intent.restore();
    client.submitVideoIntent.mockRejectedValueOnce(new Error('Response lost'));
    await expect(intent.submit()).rejects.toThrow('Response lost');
    await expect(intent.submit()).rejects.toThrow('Restore');
    client.getVideoIntent.mockResolvedValueOnce({ data: { ...document, submission_state: 'dispatched', job } });
    await intent.restore();
    expect(await intent.submit()).toEqual(job);
    expect(client.submitVideoIntent).toHaveBeenCalledTimes(1);
    expect(client.submitVideoIntent).toHaveBeenCalledWith(scope, 'intent', 1, undefined);
  });
  it.each(['not_dispatched', 'dispatched'] as const)('does not grant new dispatch rights to %s without a job', async submission_state => {
    const { client, intent } = setup({ ...document, submission_state });
    await intent.restore();
    await expect(intent.submit()).rejects.toThrow('original submission status');
    expect(client.submitVideoIntent).not.toHaveBeenCalled();
  });
  it.each(['expired', 'deleted'] as const)('blocks submission of %s content', async content_state => {
    const { client, intent } = setup({ ...document, content_state, request: null });
    await intent.restore();
    await expect(intent.submit()).rejects.toThrow('no longer available');
    expect(client.submitVideoIntent).not.toHaveBeenCalled();
  });
  it('erases retained input without cancelling or resubmitting the original job', async () => {
    const { client, intent } = setup({ ...document, job, submission_state: 'dispatched' });
    await intent.restore();
    await intent.erase();
    expect(client.deleteVideoIntent).toHaveBeenCalledWith(scope, 'intent', 1, undefined);
    expect(intent.document).toMatchObject({ revision: 2, request: null, content_state: 'deleted', job });
    expect(client.submitVideoIntent).not.toHaveBeenCalled();
  });
  it('blocks concurrent mutations while a save response is outstanding', async () => {
    const { client, intent } = setup();
    let resolve!: (value: { data: VideoSubmissionIntent }) => void;
    client.saveVideoIntent.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const saving = intent.save('key', request);
    await expect(intent.submit()).rejects.toThrow('already in progress');
    resolve({ data: document });
    await saving;
    expect(client.submitVideoIntent).not.toHaveBeenCalled();
  });
});

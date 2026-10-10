import type { NiuAdminClient, TenantScope, VideoIntentRequest, VideoSubmissionIntent } from '../../../../../sdks/javascript/src/admin';
import type { RequestOptions } from '../../../../../sdks/javascript/src/index';

type IntentClient = Pick<NiuAdminClient, 'saveVideoIntent' | 'getVideoIntent' | 'submitVideoIntent' | 'deleteVideoIntent'>;

/** One immutable submission identity. Route this identity before making a write. */
export class VideoIntent {
  private saved: VideoSubmissionIntent | null = null;
  private pending = false;

  constructor(private client: IntentClient, private scope: TenantScope, readonly id: string) {}

  get document() { return this.saved; }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending) throw new Error('A video intent operation is already in progress.');
    this.pending = true;
    try { return await operation(); } finally { this.pending = false; }
  }

  async save(keyId: string, request: VideoIntentRequest, options?: RequestOptions) {
    return this.exclusive(async () => {
      const result = await this.client.saveVideoIntent(this.scope, this.id, keyId, request, options);
      this.saved = result.data;
      return this.saved;
    });
  }

  async restore(options?: RequestOptions) {
    return this.exclusive(async () => {
      this.saved = null;
      const result = await this.client.getVideoIntent(this.scope, this.id, options);
      this.saved = result.data;
      return this.saved;
    });
  }

  async submit(options?: RequestOptions) {
    return this.exclusive(async () => {
      const document = this.saved;
      if (!document) throw new Error('Restore the saved video request before submitting.');
      if (document.content_state !== 'retained' || !document.request) throw new Error('The saved video input is no longer available.');
      // Recovery returns the original job. It never creates another submission.
      if (document.job) return document.job;
      if (document.submission_state !== 'saved') throw new Error('Restore the original submission status before continuing.');
      try {
        const job = await this.client.submitVideoIntent(this.scope, this.id, document.revision, options);
        this.saved = { ...document, submission_state: 'dispatched', job };
        return job;
      } catch (error) {
        // Any response failure requires a server read before another explicit action.
        this.saved = null;
        throw error;
      }
    });
  }

  async erase(options?: RequestOptions) {
    return this.exclusive(async () => {
      if (!this.saved) throw new Error('Restore the saved video request before deleting.');
      const document = this.saved;
      this.saved = null;
      const result = await this.client.deleteVideoIntent(this.scope, this.id, document.revision, options);
      this.saved = { ...document, revision: result.data.revision, content_state: 'deleted', request: null };
      return result;
    });
  }
}

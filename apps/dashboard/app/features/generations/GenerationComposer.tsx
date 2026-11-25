import type { DragEventHandler, FormEvent, KeyboardEventHandler, ReactElement, ReactNode, Ref } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type GenerationComposerCoverProps = {
  icon: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
};

export function GenerationComposerCover({ icon, title, detail, actions }: GenerationComposerCoverProps) {
  return (
    <div className="composer-cover" role="status">
      <div className="composer-cover-body">
        <span className="composer-cover-icon" aria-hidden="true">{icon}</span>
        <div className="composer-cover-copy">
          <p>{title}</p>
          {detail ? <p className="composer-cover-detail">{detail}</p> : null}
        </div>
      </div>
      {actions ? <div className="composer-cover-actions">{actions}</div> : null}
    </div>
  );
}

export type GenerationComposerProps = {
  formRef?: Ref<HTMLFormElement>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDragOver?: DragEventHandler<HTMLFormElement>;
  onDrop?: DragEventHandler<HTMLFormElement>;
  /** Optional wrapper around the surface element (for example, Radix PopoverAnchor). */
  wrapSurface?: (surface: ReactElement) => ReactNode;
  /** Optional recessed notice strip flush against the top of the composer surface. */
  topBanner?: ReactNode;
  /** Shared prompt textarea configuration — keeps size and typography identical across Chat and Video. */
  prompt: {
    id: string;
    ref?: Ref<HTMLTextAreaElement>;
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
    disabled?: boolean;
    required?: boolean;
    maxLength?: number;
    rows?: number;
  };
  /** Optional attachments or reference chips rendered below the prompt input. */
  attachments?: ReactNode;
  /** Optional compact status, estimate, or error rows rendered above the bottom action bar. */
  status?: ReactNode;
  /** Left side of the bottom action bar (attachments trigger, model selector, mode-specific tools). */
  leadingActions?: ReactNode;
  /** Right side of the bottom action bar before submit (for example Estimate and Settings). */
  trailingActions?: ReactNode;
  /** Primary circular submit or stop button on the far right of the bottom action bar. */
  submitAction?: ReactNode;
  /** Single-surface blocked cover (invalid key, archived session, read-only access, etc.). */
  blockedCover?: ReactNode;
  /** Optional subtle footer note directly inside the composer surface. */
  footerNote?: ReactNode;
};

export default function GenerationComposer({
  formRef,
  onSubmit,
  onDragOver,
  onDrop,
  wrapSurface,
  topBanner,
  prompt,
  attachments,
  status,
  leadingActions,
  trailingActions,
  submitAction,
  blockedCover,
  footerNote,
}: GenerationComposerProps) {
  const blocked = Boolean(blockedCover);
  const surface = (
    <div className={`playground-composer-surface generation-composer-surface${blocked ? ' is-blocked' : ''}`}>
      {!blocked && topBanner}
      <Label htmlFor={prompt.id} className="sr-only">{prompt.label}</Label>
      <Textarea
        ref={prompt.ref}
        id={prompt.id}
        rows={prompt.rows ?? 2}
        maxLength={prompt.maxLength}
        required={prompt.required}
        disabled={prompt.disabled || blocked}
        value={prompt.value}
        onChange={event => prompt.onChange(event.target.value)}
        onKeyDown={prompt.onKeyDown}
        placeholder={prompt.placeholder}
        className="generation-composer-textarea"
      />
      {attachments ? <div inert={blocked} className="generation-composer-attachments">{attachments}</div> : null}
      {status ? <div className="generation-composer-status">{status}</div> : null}
      <div inert={blocked} className="playground-composer-actions generation-composer-bar">
        <div className="generation-composer-leading">{leadingActions}</div>
        <div className="generation-composer-trailing">
          {trailingActions}
          {submitAction}
        </div>
      </div>
      {!blocked && footerNote}
      {blockedCover}
    </div>
  );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="playground-composer generation-composer"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {wrapSurface ? wrapSurface(surface) : surface}
    </form>
  );
}

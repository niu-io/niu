/** Human-readable durations for observed lifecycle and transport measurements. */
function secondsText(seconds: number): string {
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1).replace(/\.0$/, '');
}

export function formatDurationMs(milliseconds: number, locale?: string): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const zh = locale?.startsWith('zh');
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ${zh ? '毫秒' : 'ms'}`;
  const totalSeconds = milliseconds / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)} ${zh ? '秒' : 's'}`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds - hours * 3600 - minutes * 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${zh ? '小时' : 'h'}`);
  if (minutes > 0) parts.push(`${minutes} ${zh ? '分' : 'min'}`);
  if (seconds > 0 || !parts.length) parts.push(`${secondsText(seconds)} ${zh ? '秒' : 's'}`);
  return parts.join(' ');
}

export function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds === 0) return '0 s';
  return formatDurationMs(seconds * 1000);
}

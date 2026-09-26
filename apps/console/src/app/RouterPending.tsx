export default function RouterPending() {
  return <main className="route-loading" role="status" aria-live="polite">
    <span className="route-loading-mark">N</span>
    <span>Opening your Niu workspace…</span>
  </main>;
}

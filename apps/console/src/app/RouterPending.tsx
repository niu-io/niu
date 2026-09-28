import logo from '../../../../branding/assets/niu-mark.png';

export default function RouterPending() {
  return <main className="route-loading" role="status" aria-label="Opening Niu Console" aria-live="polite">
    <span
      className="route-loading-mark"
      aria-hidden="true"
      style={{ maskImage: `url("${logo}")`, WebkitMaskImage: `url("${logo}")` }}
    />
  </main>;
}

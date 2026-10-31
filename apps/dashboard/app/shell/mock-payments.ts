import { useEffect, useState } from 'react';

/** Deployment-owned mode, refreshed after an administrator changes the gateway. */
export function useMockPayments() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/v1/payments/environment', {cache:'no-store'});
        if (!response.ok) return;
        const result = await response.json();
        if (alive && typeof result.data?.mock_payments === 'boolean') setEnabled(result.data.mock_payments);
      } catch { /* Preserve the last known warning during a connection failure. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    window.addEventListener('niu:payment-mode', refresh);
    return () => {alive=false; clearInterval(timer); window.removeEventListener('niu:payment-mode', refresh);};
  }, []);
  return enabled;
}

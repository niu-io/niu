import { useEffect, useState } from "react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { request } from "@/features/vendors/api";

export type DetectorBinding = { detector: string; configuration_fingerprint: string; consent_to_external_processing: true };
type Description = { schema_version: 1; detector: string; configuration_fingerprint: string; recipient: string; region: string; retention: string; policy_activation: boolean; processing_guarantees: "declared_unverified"; content_sent: "request_text_after_local_redaction"; external_charge: "unknown" | "declared_unmetered"; timeout_ms: number; max_text_bytes: number };

export default function ExternalDetectors({ token, endpoint, bindings, disabled, onChange }: {
  token: string; endpoint: string; bindings: DetectorBinding[]; disabled: boolean; onChange: (bindings: DetectorBinding[]) => void;
}) {
  const [descriptions, setDescriptions] = useState<Description[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false); setDescriptions([]); setError(""); setOpen(false); setConsent(false);
    request<{ data: Description[] }>(token, `${endpoint}/detectors`, "GET", undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.data) || result.data.some(item => item.schema_version !== 1 || ![item.detector, item.recipient, item.region, item.retention, item.configuration_fingerprint].every(value => typeof value === "string" && value.length > 0) || !Number.isFinite(item.timeout_ms) || !Number.isFinite(item.max_text_bytes) || item.content_sent !== "request_text_after_local_redaction" || item.processing_guarantees !== "declared_unverified" || item.timeout_ms < 1 || item.timeout_ms > 30_000 || item.max_text_bytes < 1 || item.max_text_bytes > 65_536)) throw new Error("Invalid processing description. Reload before approving a check.");
        setDescriptions(result.data); setLoaded(true);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load external checks."); });
    return () => controller.abort();
  }, [token, endpoint, reload]);
  const selected = descriptions.find(item => item.detector === choice);
  const canRequire = selected?.policy_activation === true && selected.external_charge === "declared_unmetered" && selected.processing_guarantees === "declared_unverified" && /^[a-f0-9]{64}$/.test(selected.configuration_fingerprint);
  function review(detector = "") { setChoice(detector); setConsent(false); setOpen(true); }
  function requireDetector() {
    if (disabled || !canRequire || !selected || !consent) return;
    const next = bindings.filter(binding => binding.detector !== selected.detector);
    if (next.length >= 4) return;
    onChange([...next, { detector: selected.detector, configuration_fingerprint: selected.configuration_fingerprint, consent_to_external_processing: true }]);
    setOpen(false); setConsent(false);
  }
  return <>
    <p className="guardrails-intro">Required checks run before inference. Matches, unavailable services and unsupported content block the request.</p>
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>Reload</Button></AlertDescription></Alert>}
    {!loaded && !error && <p role="status">Loading external checks…</p>}
    {bindings.map(binding => {
      const description = descriptions.find(item => item.detector === binding.detector);
      const current = description?.configuration_fingerprint === binding.configuration_fingerprint && description.policy_activation;
      return <div className="guardrails-pattern-row guardrails-detector-row" key={binding.detector}>
        <div className="guardrails-pattern-label"><div><p>{description?.recipient ?? "Unavailable detector"}</p><p className="guardrails-muted">{!loaded ? "Required check" : current ? "Required · blocks matches" : "Review required · requests remain blocked"}</p></div></div>
        <div className="guardrails-pattern-actions">
          <Button variant="outline" size="sm" disabled={!description} onClick={() => review(binding.detector)}>Review processing</Button>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(bindings.filter(item => item.detector !== binding.detector))}>Remove</Button>
        </div>
      </div>;
    })}
    {loaded && !bindings.length && <p className="guardrails-muted">{descriptions.length ? "No required external checks." : "No external detectors are available. Ask your deployment administrator to configure a detector and authorize this workspace."}</p>}
    {!disabled && <Button className="mt-4" variant="outline" disabled={!loaded || !descriptions.length || bindings.length >= 4} onClick={() => review()}>Add external check</Button>}
    <Dialog open={open} onOpenChange={value => { setOpen(value); setConsent(false); }}>
      <DialogContent className="guardrails-version-dialog"><DialogHeader><DialogTitle>Review external processing</DialogTitle><DialogDescription>Approve the recipient and declared processing conditions before requiring this check.</DialogDescription></DialogHeader>
        <Label>Detector</Label>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label="Choose external detector">{selected?.recipient ?? "Choose a detector"}<ChevronDown className="size-4" aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="guardrails-detector-menu"><DropdownMenuRadioGroup value={choice} onValueChange={value => { setChoice(value); setConsent(false); }}>{descriptions.map(item => <DropdownMenuRadioItem key={item.detector} value={item.detector}>{item.recipient}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
        {selected && <div className="guardrails-version-content">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2"><dt>Region</dt><dd className="break-words">{selected.region}</dd><dt>Retention</dt><dd className="break-words">{selected.retention}</dd><dt>Content sent</dt><dd>Request text after local redaction</dd><dt>Limits</dt><dd>{selected.max_text_bytes.toLocaleString()} bytes · {selected.timeout_ms.toLocaleString()} ms deadline</dd></dl>
          <p className="guardrails-muted">These conditions are declared by your administrator and have not been independently verified. Input checks cover supported text only; they do not inspect generated output.</p>
          {!canRequire && <Alert><AlertDescription>This detector cannot be required. Workspace authorization and an unmetered-service declaration are necessary.</AlertDescription></Alert>}
          {!disabled && canRequire && <div className="flex items-start gap-3"><Checkbox id="detector-processing-consent" checked={consent} onCheckedChange={value => setConsent(value === true)} /><Label htmlFor="detector-processing-consent">I approve sending this workspace’s request text to this recipient under these declared conditions.</Label></div>}
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>{!disabled && <Button disabled={!canRequire || !consent || (bindings.length >= 4 && !bindings.some(binding => binding.detector === choice))} onClick={requireDetector}>Require this detector</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

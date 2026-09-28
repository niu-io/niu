import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, ReceiptText, RefreshCw } from "lucide-react";
import { useConsoleContext } from "@/app/console-context";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { money } from "@/lib/money";
import { request } from "@/features/vendors/api";
type Tariff = {
  model_alias: string;
  revision: string;
  currency: string;
  prompt_rate: string;
  completion_rate: string;
};
type Invoice = {
  id: string;
  from_ms: number;
  to_ms: number;
  currency: string;
  amount_nanos: string;
  status: string;
  payment_reference: string | null;
};
type Billing = {
  balances: {
    currency: string;
    charged_nanos: string;
    unbilled_nanos: string;
    due_nanos: string;
    paid_nanos: string;
  }[];
  unresolved: string;
  unpriced: string;
  tariffs: Tariff[];
  invoices: Invoice[];
};
type Line = {
  model_alias: string;
  revision: string;
  currency: string;
  requests: string;
  prompt_tokens: string;
  completion_tokens: string;
  prompt_rate: string;
  completion_rate: string;
  amount_nanos: string;
};
const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
function rate(value: string) {
  if (!/^\d+(\.\d{1,9})?$/.test(value.trim()))
    throw new Error("Enter a nonnegative rate with up to 9 decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  return (
    BigInt(whole) * 1_000_000_000n +
    BigInt(fraction.padEnd(9, "0"))
  ).toString();
}
export default function BillingRoute() {
  const { token, workspace, session, models } = useConsoleContext();
  if (!token || !workspace)
    return (
      <>
        <PageHeader title="Billing" />
        <section className="panel provider-access-message">
          <ReceiptText />
          <h2>Select a workspace</h2>
          <p>
            Sign in and choose a workspace to review customer charges and
            invoices.
          </p>
        </section>
      </>
    );
  return (
    <BillingView
      key={`${token}:${workspace.id}`}
      token={token}
      organization={workspace.organization_id}
      project={workspace.id}
      administrator={session?.kind === "installation"}
      models={models.map((model) => model.id)}
    />
  );
}
function BillingView({
  token,
  organization,
  project,
  administrator,
  models,
}: {
  token: string;
  organization: string;
  project: string;
  administrator: boolean;
  models: string[];
}) {
  const base = `/admin/v1/organizations/${organization}/projects/${project}/billing`;
  const [data, setData] = useState<Billing | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [model, setModel] = useState(models[0] ?? "");
  const [prompt, setPrompt] = useState("");
  const [completion, setCompletion] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [key, setKey] = useState("");
  const [payment, setPayment] = useState("");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    void request<{ data: Billing }>(
      token,
      base,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result.data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, base, revision]);
  useEffect(() => {
    setLines(null);
    if (!selected || dialog !== "details") return;
    const controller = new AbortController();
    void request<{ data: Line[] }>(
      token,
      `${base}/invoices/${selected.id}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setLines(result.data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [selected, dialog, token, base]);
  function selectTariff(alias: string) {
    setModel(alias);
    const existing = data?.tariffs.find((item) => item.model_alias === alias);
    setPrompt(existing ? money(existing.prompt_rate, "").trim() : "");
    setCompletion(existing ? money(existing.completion_rate, "").trim() : "");
    setCurrency(existing?.currency ?? "USD");
  }
  function open(kind: string, invoice?: Invoice) {
    if (kind === "tariff")
      selectTariff(models.includes(model) ? model : (models[0] ?? ""));
    setDialog(kind);
    setSelected(invoice ?? null);
    setError("");
    setNotice("");
    setPayment("");
    setKey(crypto.randomUUID());
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (dialog === "tariff")
        await request(token, `${base}/tariffs`, "POST", {
          model_alias: model,
          currency,
          prompt_rate: rate(prompt),
          completion_rate: rate(completion),
          expected_revision:
            data?.tariffs.find((item) => item.model_alias === model)
              ?.revision ?? null,
        });
      if (dialog === "invoice")
        await request(token, `${base}/invoices`, "POST", {
          from_ms: Date.parse(`${from}T00:00:00Z`),
          to_ms: Date.parse(`${to}T00:00:00Z`),
          currency,
          idempotency_key: key,
        });
      if (dialog === "payment" && selected)
        await request(
          token,
          `${base}/invoices/${selected.id}/payment`,
          "POST",
          { payment_reference: payment },
        );
      setNotice(
        dialog === "payment"
          ? "External customer payment recorded. No payment was collected."
          : dialog === "invoice"
            ? "Itemized usage invoice issued."
            : "Customer selling rates published.",
      );
      setDialog("");
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Billing update failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Billing"
        action={
          <div className="provider-admin-actions billing-actions">
            {administrator && (
              <>
                <Button
                  variant="outline"
                  disabled={!data}
                  onClick={() => open("tariff")}
                >
                  Set selling rates
                </Button>
                <Button disabled={!data} onClick={() => open("invoice")}>
                  Issue invoice
                </Button>
              </>
            )}
            <Button
              variant="outline"
              aria-label="Refresh billing"
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={16} />
            </Button>
          </div>
        }
      />
      <p className="provider-intro">
        Customer charges, itemized invoices, and recorded payments for this
        workspace.
      </p>
      {notice && (
        <p className="provider-message" role="status">
          {notice}
        </p>
      )}
      {error && !dialog && (
        <div className="provider-message" role="alert">
          <span>{error}</span>
          <Button
            variant="outline"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      )}
      {loading ? (
        <section className="panel provider-access-message" role="status">
          Loading billing…
        </section>
      ) : (
        data && (
          <>
            {data.balances.map((balance) => (
              <div key={balance.currency} className="provider-metrics">
                <article className="provider-metric provider-metric-primary">
                  <span>Invoiced · unpaid</span>
                  <strong>{money(balance.due_nanos, balance.currency)}</strong>
                  <small>Issued invoices awaiting payment</small>
                </article>
                <article className="provider-metric">
                  <span>Unbilled usage</span>
                  <strong>
                    {money(balance.unbilled_nanos, balance.currency)}
                  </strong>
                  <small>Accrued charges not yet invoiced</small>
                </article>
                <article className="provider-metric">
                  <span>Payments recorded</span>
                  <strong>{money(balance.paid_nanos, balance.currency)}</strong>
                  <small>All time · confirmed external payments</small>
                </article>
              </div>
            ))}
            {data.balances.length === 0 && (
              <section className="panel provider-access-message">
                <ReceiptText size={26} />
                <h2>No customer charges yet</h2>
                <p>
                  {data.tariffs.length
                    ? "Verified usage will accrue at the selling rates below."
                    : "Customer selling rates have not been configured. Upstream cost figures are not a customer bill."}
                </p>
              </section>
            )}
            {BigInt(data.unresolved) > 0n && <p className="provider-business-note">
              {BigInt(data.unresolved).toLocaleString()} priced requests await
              billing reconciliation. Affected periods cannot be invoiced until
              usage is resolved.
            </p>}
            {BigInt(data.unpriced) > 0n && (
              <p className="provider-business-note">
                {BigInt(data.unpriced).toLocaleString()} requests had no selling
                rate at admission and are excluded from customer charges.
                Publishing a rate does not bill past usage.
              </p>
            )}
            <section className="panel">
              <div className="provider-panel-heading">
                <h2>Invoices</h2>
                <p className="provider-intro billing-description">
                  Latest 100 · immutable usage statements · UTC periods
                </p>
              </div>
              {data.invoices.length ? (
                <div className="table-wrap">
                  <ShadcnTable className="provider-ledger">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Billing period</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            {day(invoice.from_ms)} – {day(invoice.to_ms - 1)}
                          </TableCell>
                          <TableCell>
                            <code>{invoice.id.slice(0, 8)}</code>
                          </TableCell>
                          <TableCell>
                            {money(invoice.amount_nanos, invoice.currency)}
                          </TableCell>
                          <TableCell>
                            {invoice.status === "paid"
                              ? "Payment recorded"
                              : "Issued · unpaid"}
                          </TableCell>
                          <TableCell>
                            <div className="billing-row-actions">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => open("details", invoice)}
                              >
                                View details
                              </Button>
                              {administrator && invoice.status !== "paid" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => open("payment", invoice)}
                                >
                                  Record payment
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </ShadcnTable>
                </div>
              ) : (
                <div className="provider-chart-empty">
                  <strong>No invoices issued</strong>
                  <p>
                    Invoices group verified customer charges over a closed
                    billing period. Payment is recorded separately.
                  </p>
                </div>
              )}
            </section>
            <section className="panel billing-rates">
              <div className="provider-panel-heading">
                <h2>Customer selling rates</h2>
                <p className="provider-intro billing-description">
                  Per million text tokens · changes apply to future requests
                </p>
              </div>
              {data.tariffs.length ? (
                <div className="table-wrap">
                  <ShadcnTable className="provider-ledger">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Input</TableHead>
                        <TableHead>Output</TableHead>
                        <TableHead>Rate revision</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.tariffs.map((tariff) => (
                        <TableRow key={tariff.model_alias}>
                          <TableCell>{tariff.model_alias}</TableCell>
                          <TableCell>{money(tariff.prompt_rate, tariff.currency)}</TableCell>
                          <TableCell>
                            {money(tariff.completion_rate, tariff.currency)}
                          </TableCell>
                          <TableCell>
                            <code>{tariff.revision.slice(0, 8)}</code>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </ShadcnTable>
                </div>
              ) : (
                <p className="provider-panel-note">
                  No selling rates configured. Your platform administrator sets
                  customer rates independently from provider payout rates.
                </p>
              )}
            </section>
            <p className="provider-business-note">
              Usage invoices cover configured text-token charges only. Taxes,
              credits, subscriptions, payment collection, and bank transfers are
              not calculated or executed by this version.
            </p>
          </>
        )
      )}
      <Dialog open={Boolean(dialog)} onOpenChange={(value) => {
          if (!value && !busy) setDialog("");
        }}>
      <DialogContent className={`niu-modal ${dialog === "details" ? "billing-detail-dialog" : "vendor-dialog"}`} showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{
          {
            tariff: "Set customer selling rates",
            invoice: "Issue a usage invoice",
            payment: "Record a confirmed customer payment",
            details: "Invoice details",
          }[dialog] ?? ""
        }</DialogTitle><DialogDescription>{
          dialog === "details" && selected
            ? `Invoice ${selected.id}`
            : "Workspace billing"
        }</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {dialog === "details" && selected ? (
          <>
            <p>
              {day(selected.from_ms)} – {day(selected.to_ms - 1)} ·{" "}
              {money(selected.amount_nanos, selected.currency)} ·{" "}
              {selected.status === "paid"
                ? "Payment recorded"
                : "Issued · unpaid"}
            </p>
            {selected.payment_reference && (
              <p>Payment reference: {selected.payment_reference}</p>
            )}
            {lines ? (
              <div className="table-wrap">
                <ShadcnTable className="provider-ledger">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model / rate revision</TableHead>
                      <TableHead>Requests</TableHead>
                      <TableHead>Input / output tokens</TableHead>
                      <TableHead>Rates / 1M</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.revision}>
                        <TableCell>
                          {line.model_alias}
                          <small>{line.revision}</small>
                        </TableCell>
                        <TableCell>{line.requests}</TableCell>
                        <TableCell>
                          {line.prompt_tokens} / {line.completion_tokens}
                        </TableCell>
                        <TableCell>
                          {money(line.prompt_rate, line.currency)} /{" "}
                          {money(line.completion_rate, line.currency)}
                        </TableCell>
                        <TableCell>{money(line.amount_nanos, line.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </ShadcnTable>
              </div>
            ) : (
              <p role="status">Loading line items…</p>
            )}
            <p className="provider-panel-note">
              Amounts are rounded up once per request to the nearest currency
              nanounit, then summed. Different rate revisions remain separate
              line items.
            </p>
          </>
        ) : (
          <form
            onSubmit={(event) => void save(event)}
            className="provider-admin-form"
          >
            {dialog === "tariff" && (
              <>
                <label>
                  Model
                  <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="Customer tariff model" variant="outline" className="w-full justify-between font-normal">{model || "Choose a model"}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={model} onValueChange={selectTariff}>
                      {models.map(item => <DropdownMenuRadioItem value={item} key={item}>{item}</DropdownMenuRadioItem>)}
                    </DropdownMenuRadioGroup></DropdownMenuContent>
                  </DropdownMenu>
                </label>
                <label>
                  Input price per million tokens
                  <Input
                    required
                    inputMode="decimal"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                </label>
                <label>
                  Output price per million tokens
                  <Input
                    required
                    inputMode="decimal"
                    value={completion}
                    onChange={(event) => setCompletion(event.target.value)}
                  />
                </label>
                <p>
                  These are selling prices billed to this customer, independent
                  of upstream costs and supplier payouts.
                </p>
              </>
            )}
            {(dialog === "invoice" || dialog === "tariff") && (
              <label>
                Currency
                <Input
                  required
                  pattern="[A-Z]{3}"
                  maxLength={3}
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value.toUpperCase())
                  }
                />
              </label>
            )}
            {dialog === "invoice" && (
              <>
                <label>
                  Start date, inclusive (UTC)
                  <Input
                    type="date"
                    required
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </label>
                <label>
                  End date, exclusive (UTC)
                  <Input
                    type="date"
                    required
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </label>
                <p>
                  Choose a closed period of at most 366 days. Overlapping
                  invoices and unresolved priced requests are rejected. Issuance
                  records a bill; it does not collect money.
                </p>
              </>
            )}
            {dialog === "payment" && (
              <>
                <p>
                  Record a completed external payment for the full invoice
                  amount:{" "}
                  {selected && money(selected.amount_nanos, selected.currency)}.
                  This action does not charge a payment method.
                </p>
                <label>
                  External payment reference
                  <Input
                    required
                    maxLength={200}
                    value={payment}
                    onChange={(event) => setPayment(event.target.value)}
                  />
                </label>
              </>
            )}
            <Button
              type="submit"
              disabled={busy || (dialog === "tariff" && !model)}
            >
              {busy
                ? "Saving…"
                : dialog === "invoice"
                  ? "Issue invoice"
                  : dialog === "payment"
                    ? "Record confirmed payment"
                    : "Publish rates"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

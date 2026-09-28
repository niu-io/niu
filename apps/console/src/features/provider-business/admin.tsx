import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useParams, useSearchParams } from "react-router";
import { ChevronDown, Plus, ShieldCheck, Building2 } from "lucide-react";
import { useConsoleContext } from "@/app/console-context";
import SupplierPropertiesFields from "./SupplierPropertiesFields";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { request } from "@/features/vendors/api";
import { money } from "@/lib/money";

type Business = { id: string; name: string; members: number };
type AdminData = {
  balances: { currency: string; earned_nanos: string; unpaid_nanos: string; paid_nanos: string }[];
  consumption: { model_alias: string; revision: string; currency: string; requests: string; prompt_tokens: string; completion_tokens: string; amount_nanos: string; unpaid_nanos: string }[];
  settlements: { id: string; currency: string; amount_nanos: string; payment_reference: string; created_at: string }[];

  offers: {
    id: string;
    model_alias: string;
    revision: string;
    currency: string;
    prompt_rate: string;
    completion_rate: string;
  }[];
  earnings: {
    id: string;
    model_alias: string;
    amount_nanos: string;
    currency: string;
    status: string;
  }[];
};
export default function ProviderAdministration() {
  const { session, token } = useConsoleContext();
  if (session?.kind !== "installation" && session?.provider_memberships?.length)
    return <Navigate to={`/providers/${session.provider_memberships[0].id}`} replace />;
  if (session?.kind !== "installation")
    return (
      <>
        <PageHeader title="Suppliers" />
        <section className="panel provider-access-message">
          <ShieldCheck />
          <h2>Supplier access required</h2>
          <p>
            Supplier membership and agreed rates are controlled by installation
            administration.
          </p>
        </section>
      </>
    );
  return <Administration key={token} token={token} />;
}
function Administration({ token }: { token: string }) {
  const { section = "overview" } = useParams();
  const [loading, setLoading] = useState(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [search, setSearch] = useSearchParams();
  const selected = search.get('supplier') ?? businesses[0]?.id ?? '';
  const setSelected = (id: string) => setSearch(current => { current.set('supplier', id); current.delete('create'); return current; });

  const [data, setData] = useState<AdminData | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState("");
  useEffect(() => { if (search.get('create') === 'supplier') setDialog('create'); else if (search.get('properties') === 'supplier') setDialog('properties'); }, [search]);
  const [name, setName] = useState("");
  const [operator, setOperator] = useState("");
  const [role, setRole] = useState("viewer");
  const [active, setActive] = useState("true");
  const [alias, setAlias] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [inputRate, setInputRate] = useState("");
  const [outputRate, setOutputRate] = useState("");
  const [reference, setReference] = useState("");
  const [attempts, setAttempts] = useState<string[]>([]);
  const [paymentKey, setPaymentKey] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void request<{ data: Business[] }>(
      token,
      "/admin/v1/providers",
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setBusinesses(result.data);

        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, revision]);
  useEffect(() => {
    setData(null);
    if (!selected) return;
    const controller = new AbortController();
    void request<{ data: AdminData }>(
      token,
      `/admin/v1/providers/${selected}/administration?days=90`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result.data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [token, selected, revision]);
  function open(kind: string) {
    setError("");
    setNotice("");
    setDialog(kind);
    setPaymentKey(crypto.randomUUID());
    setReference("");
    setAttempts([]);
  }

  const selectedBusiness = businesses.find(item => item.id === selected);
  const sectionTitle = {
    overview: "Overview",
    consumption: "Usage",
    members: "Supplier access",
    models: "Models & pricing",
    settlements: "Billing",
  }[section] ?? "Suppliers";
  const sectionAction =
    section === "members" ? (
      <Button variant="outline" disabled={!data} onClick={() => open("membership")}>
        <Plus size={16} />
        Manage membership
      </Button>
    ) : section === "models" ? (
      <Button variant="outline" disabled={!data} onClick={() => open("offer")}>
        <Plus size={16} />
        Set agreed rates
      </Button>
    ) : section === "settlements" ? (
      <Button variant="outline" disabled={!data} onClick={() => open("settlement")}>
        <Plus size={16} />
        Record payment
      </Button>
    ) : null;
  function nanos(value: string) {
    if (!/^\d+(\.\d{1,9})?$/.test(value.trim()))
      throw new Error(
        "Rates require a nonnegative amount with at most 9 decimal places.",
      );
    const [whole, fraction = ""] = value.trim().split(".");
    return (
      BigInt(whole) * 1_000_000_000n +
      BigInt(fraction.padEnd(9, "0"))
    ).toString();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (dialog === "create") {
        const result = await request<{ data: { id: string } }>(
          token,
          "/admin/v1/providers",
          "POST",
          { name },
        );
        setSelected(result.data.id);
        setName("");
      }
      if (dialog === "membership")
        await request(
          token,
          `/admin/v1/providers/${selected}/members/${operator}`,
          "PUT",
          { role, active: active === "true" },
        );
      if (dialog === "offer")
        await request(token, `/admin/v1/providers/${selected}/offers`, "POST", {
          model_alias: alias,
          currency,
          prompt_rate: nanos(inputRate),
          completion_rate: nanos(outputRate),
          expected_revision:
            data?.offers.find((offer) => offer.model_alias === alias)
              ?.revision ?? null,
        });
      if (dialog === "settlement")
        await request(
          token,
          `/admin/v1/providers/${selected}/settlements`,
          "POST",
          {
            idempotency_key: paymentKey,
            payment_reference: reference,
            attempt_ids: attempts,
          },
        );
      setNotice(
        dialog === "settlement"
          ? "External payment recorded. No funds were transferred."
          : "Supplier configuration saved.",
      );
      setDialog("");
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title={sectionTitle}
        action={businesses.length > 0 && <div className="provider-header-actions">
          {sectionAction}
        </div>}
      />

      {notice && (
        <p role="status" className="provider-message">
          {notice}
        </p>
      )}
      {error && !dialog && (
        <p role="alert" className="provider-message">
          {error}
        </p>
      )}
      {loading ? <section className="panel provider-access-message" role="status">Loading suppliers…</section> : error && businesses.length === 0 ? null : businesses.length === 0 ? (
        <section className="panel provider-access-message">
          <Building2 size={28} aria-hidden="true" />
          <h2>No payout agreements yet</h2>
          <p>
            New supplier for paid model supply. Existing API providers remain available in Provider configuration.
          </p>
          <Button onClick={() => open("create")}><Plus size={16} />Add supplier</Button>
        </section>
      ) : (
        <section className="panel provider-admin-panel">
          {section === "members" && <div className="provider-members-summary">
            <Building2 size={20} aria-hidden="true" />
            <strong>{selectedBusiness?.members ?? 0}</strong>
            <span>active members</span>
          </div>}
          {section === "overview" && <div className="provider-admin-block">
            <div className="provider-admin-section-heading"><h2>Supplier payables</h2></div>
            <div className="provider-balance-list">
              {data?.balances?.length ? data.balances.map(balance => <div className="provider-balance-row" key={balance.currency}>
                <div><span>Accrued · {balance.currency}</span><strong>{money(balance.earned_nanos,balance.currency)}</strong></div>
                <div><span>Unpaid</span><strong>{money(balance.unpaid_nanos,balance.currency)}</strong></div>
                <div><span>Paid</span><strong>{money(balance.paid_nanos,balance.currency)}</strong></div>
              </div>) : <p className="provider-inline-empty">No supplier charges recorded yet.</p>}
            </div>
          </div>}
          {(section === "overview" || section === "models") && <>
          <div className="provider-admin-block">
            <div className="provider-admin-section-heading"><h2>Models & pricing</h2></div>
            {data?.offers.length ? (
              <div className="table-wrap">
                <ShadcnTable className="provider-ledger">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model alias</TableHead>
                      <TableHead>Input / 1M tokens</TableHead>
                      <TableHead>Output / 1M tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.offers.map((offer) => (
                      <TableRow key={offer.id}>
                        <TableCell>{offer.model_alias}</TableCell>
                        <TableCell>{money(offer.prompt_rate, offer.currency)}</TableCell>
                        <TableCell>{money(offer.completion_rate, offer.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </ShadcnTable>
              </div>
            ) : (
              <div className="provider-empty-state">
                <strong>No agreed model rates</strong>
                {section === "overview" && <span>Set agreed rates to make models available for supply.</span>}
                {section === "overview" && <Button variant="outline" onClick={() => open("offer")}><Plus size={16} />Set agreed rates</Button>}
              </div>
            )}
          </div>
          </>}
          {section === "consumption" && <>
            <div className="provider-admin-section-heading"><h2>Consumption by model</h2><span>Last 90 days</span></div>
            {data?.consumption?.length ? <div className="table-wrap"><ShadcnTable className="provider-ledger"><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Requests</TableHead><TableHead>Input / output tokens</TableHead><TableHead>Accrued charges</TableHead><TableHead>Unpaid</TableHead></TableRow></TableHeader><TableBody>
              {data.consumption.map(row => <TableRow key={row.revision}><TableCell>{row.model_alias}</TableCell><TableCell>{Number(row.requests).toLocaleString()}</TableCell><TableCell>{Number(row.prompt_tokens).toLocaleString()} / {Number(row.completion_tokens).toLocaleString()}</TableCell><TableCell>{money(row.amount_nanos,row.currency)}</TableCell><TableCell>{money(row.unpaid_nanos,row.currency)}</TableCell></TableRow>)}
            </TableBody></ShadcnTable></div> : <div className="provider-empty-state"><strong>No consumption in the last 90 days</strong></div>}
          </>}
          {section === "settlements" && <>
            <div className="provider-admin-section-heading"><h2>Payment history</h2></div>
            {data?.settlements?.length ? <div className="table-wrap"><ShadcnTable className="provider-ledger"><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Payment reference</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>
              {data.settlements.map(row => <TableRow key={row.id}><TableCell>{new Date(row.created_at).toLocaleDateString()}</TableCell><TableCell>{row.payment_reference}</TableCell><TableCell>{money(row.amount_nanos,row.currency)}</TableCell></TableRow>)}
            </TableBody></ShadcnTable></div> : <div className="provider-empty-state"><strong>No payments recorded</strong></div>}
          </>}
        </section>
      )}
      <Dialog open={Boolean(dialog)} onOpenChange={(value) => {
          if (!value && !busy) { setDialog(""); setSearch(current => { current.delete("create"); current.delete("properties"); return current; }, { replace: true }); }
        }}>
      <DialogContent className="niu-modal vendor-dialog" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{
          {
            create: "New supplier",
            properties: "Supplier properties",
            membership: "Manage supplier membership",
            offer: "Publish agreed payout rates",
            settlement: "Record a confirmed external payment",
          }[dialog] ?? ""
        }</DialogTitle><DialogDescription>Supplier management</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {dialog === "properties" ? <SupplierPropertiesFields supplierName={selectedBusiness?.name ?? ""} /> : (<form
          onSubmit={(event) => void submit(event)}
          className="provider-admin-form"
        >
          {dialog === "create" && (
            <><label>
              Supplier name
              <Input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>API endpoint<Input type="url" placeholder="https://…" disabled /></label>
            <label>API key<Input type="password" autoComplete="new-password" disabled /></label>
            <p role="status">API settings will be available when supplier configuration is supported by the backend. Creating a supplier currently saves its name only.</p></>
          )}
          {dialog === "membership" && (
            <>
              <label>
                Operator ID
                <Input
                  required
                  value={operator}
                  onChange={(event) => setOperator(event.target.value)}
                />
              </label>
              <label>
                Supplier role
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between font-normal">{role === "viewer" ? "Viewer · earnings and offers" : "Manager · also pause and resume offers"}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={role} onValueChange={setRole}>
                    <DropdownMenuRadioItem value="viewer">Viewer · earnings and offers</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="manager">Manager · also pause and resume offers</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup></DropdownMenuContent>
                </DropdownMenu>
              </label>
              <label>
                Access
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between font-normal">{active === "true" ? "Grant access" : "Revoke access"}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={active} onValueChange={setActive}>
                    <DropdownMenuRadioItem value="true">Grant access</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="false">Revoke access</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup></DropdownMenuContent>
                </DropdownMenu>
              </label>
              <p>
                Only grant access to an approved supplier member. Customer
                workspace roles do not grant this access automatically.
              </p>
            </>
          )}
          {dialog === "offer" && (
            <>
              <label>
                Existing upstream model alias
                <Input
                  required
                  maxLength={200}
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                />
              </label>
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
              <label>
                Input payout per million tokens
                <Input
                  required
                  inputMode="decimal"
                  value={inputRate}
                  onChange={(event) => setInputRate(event.target.value)}
                />
              </label>
              <label>
                Output payout per million tokens
                <Input
                  required
                  inputMode="decimal"
                  value={outputRate}
                  onChange={(event) => setOutputRate(event.target.value)}
                />
              </label>
              <p>
                Use the supplier's agreed rates. Saving publishes a new
                immutable revision for future admissions; existing earnings
                retain their original rates.
              </p>
            </>
          )}
          {dialog === "settlement" && (
            <>
              <p>
                This records an external payment that has already completed. It
                does not initiate a transfer. All entries must be unpaid and use
                the same currency.
              </p>
              <label>
                External payment reference
                <Input
                  required
                  maxLength={200}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </label>
              <fieldset className="provider-payment-selection">
                <legend>Select unpaid earnings</legend>
                <div className="provider-payment-entries">
                  {data?.earnings
                    .filter((item) => item.status === "accrued")
                    .map((item) => (
                      <label key={item.id}>
                        <Checkbox
                          checked={attempts.includes(item.id)}
                          onCheckedChange={(checked) =>
                            setAttempts((current) =>
                              checked === true
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id),
                            )
                          }
                        />
                        <span>
                          {item.model_alias}
                          <small>{item.id.slice(0, 8)}</small>
                        </span>
                        <strong>
                          {money(item.amount_nanos, item.currency)}
                        </strong>
                      </label>
                    ))}
                  {!data?.earnings.some(
                    (item) => item.status === "accrued",
                  ) && <p>No unpaid earnings in the recent history.</p>}
                </div>
              </fieldset>
              <p className="provider-payment-total">
                {attempts.length} requests selected
                {[
                  ...new Set(
                    data?.earnings
                      .filter((item) => attempts.includes(item.id))
                      .map((item) => item.currency),
                  ),
                ].map((code) => (
                  <strong key={code}>
                    {money(
                      (
                        data?.earnings
                          .filter(
                            (item) =>
                              attempts.includes(item.id) &&
                              item.currency === code,
                          )
                          .reduce(
                            (sum, item) => sum + BigInt(item.amount_nanos),
                            0n,
                          ) ?? 0n
                      ).toString(),
                      code,
                    )}
                  </strong>
                ))}
              </p>
              <p>
                The recorded amount is the exact sum of the selected earnings.
                Retries in this dialog reuse the same payment key.
              </p>
            </>
          )}
          <Button
            type="submit"
            disabled={
              busy ||
              (dialog === "settlement" &&
                (attempts.length === 0 ||
                  new Set(
                    data?.earnings
                      .filter((item) => attempts.includes(item.id))
                      .map((item) => item.currency),
                  ).size !== 1))
            }
          >
            {busy
              ? "Saving…"
              : dialog === "settlement"
                ? "Record confirmed payment"
                : "Save"}
          </Button>
        </form>)}
      </DialogContent>
    </Dialog>
    </>
  );
}

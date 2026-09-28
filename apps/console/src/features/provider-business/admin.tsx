import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useParams } from "react-router";
import { Plus, ShieldCheck, Building2 } from "lucide-react";
import { useConsoleContext } from "@/app/console-context";
import PageHeader from "@/components/PageHeader";
import ModalFrame from "@/components/ModalFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown, DropdownOption } from "@/components/ui/dropdown";
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
        <PageHeader title="Providers" />
        <section className="panel provider-access-message">
          <ShieldCheck />
          <h2>Provider access required</h2>
          <p>
            Provider membership and agreed rates are controlled by installation
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
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState("");
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
          setSelected((current) =>
            result.data.some((item) => item.id === current)
              ? current
              : (result.data[0]?.id ?? ""),
          );
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
          : "Provider configuration saved.",
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
        title={{ overview: "Overview", consumption: "Consumption & earnings", members: "Provider access", models: "Model offers", settlements: "Settlements" }[section] ?? "Providers"}

        action={
          (section === "overview" && businesses.length > 0) && <Button onClick={() => open("create")}>
            <Plus size={16} />
            Register provider
          </Button>
        }
      />
      <p className="provider-intro">
        {{ overview: "Manage provider agreements, model offers and payouts.",
          models: "Set agreed input and output rates for each model offer.",
          consumption: "Review model consumption and the earnings it generates.",
          settlements: "Reconcile accrued earnings with confirmed external payments.",
          members: "Control who can manage each provider and view its earnings." }[section]}
      </p>

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
      {loading ? <section className="panel provider-access-message" role="status">Loading providers…</section> : error && businesses.length === 0 ? null : businesses.length === 0 ? (
        <section className="panel provider-access-message">
          <Building2 size={28} aria-hidden="true" />
          <h2>No payout agreements yet</h2>
          <p>
            Register a provider for paid model supply. Existing API providers remain available in Provider configuration.
          </p>
          <Button onClick={() => open("create")}><Plus size={16} />Register provider</Button>
        </section>
      ) : (
        <section className="panel provider-admin-panel">
          <Dropdown
            aria-label="Provider"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {businesses.map((item) => (
              <DropdownOption key={item.id} value={item.id}>
                {item.name}
              </DropdownOption>
            ))}
          </Dropdown>
          {section === "members" && <p className="provider-panel-note">
            {businesses.find((item) => item.id === selected)?.members ?? 0}{" "}
            active members
          </p>}
          <div className="provider-admin-actions" hidden={section === "overview" || section === "consumption"}>
            {section === "members" && <Button variant="outline" onClick={() => open("membership")}>
              Manage membership
            </Button>}
            {section === "models" && <Button
              variant="outline"
              disabled={!data}
              onClick={() => open("offer")}
            >
              Publish payout rates
            </Button>}
            {section === "settlements" && <Button
              variant="outline"
              disabled={!data}
              onClick={() => open("settlement")}
            >
              Record external payment
            </Button>}
          </div>
          {section === "overview" && <div className="provider-balance-list">
            {data?.balances?.length ? data.balances.map(balance => <div className="provider-balance-row" key={balance.currency}>
              <div><span>Total earned · {balance.currency}</span><strong>{money(balance.earned_nanos,balance.currency)}</strong></div>
              <div><span>Unpaid</span><strong>{money(balance.unpaid_nanos,balance.currency)}</strong></div>
              <div><span>Paid</span><strong>{money(balance.paid_nanos,balance.currency)}</strong></div>
            </div>) : <p>No earnings recorded yet.</p>}
          </div>}
          {(section === "overview" || section === "models") && <>
          <h2>Agreed model offers</h2>
          {data?.offers.length ? (
            <div className="table-wrap">
              <table className="provider-ledger">
                <thead>
                  <tr>
                    <th>Model alias</th>
                    <th>Input / 1M tokens</th>
                    <th>Output / 1M tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {data.offers.map((offer) => (
                    <tr key={offer.id}>
                      <td>{offer.model_alias}</td>
                      <td>{money(offer.prompt_rate, offer.currency)}</td>
                      <td>{money(offer.completion_rate, offer.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No offers published.</p>
          )}
          </>}
          {section === "consumption" && <>
            <h2>Consumption by model</h2><p>Last 90 days · grouped by agreed rate · amounts remain in their original currency.</p>
            {data?.consumption?.length ? <div className="table-wrap"><table className="provider-ledger"><thead><tr><th>Model</th><th>Requests</th><th>Input / output tokens</th><th>Earnings</th><th>Unpaid</th></tr></thead><tbody>
              {data.consumption.map(row => <tr key={row.revision}><td>{row.model_alias}</td><td>{Number(row.requests).toLocaleString()}</td><td>{Number(row.prompt_tokens).toLocaleString()} / {Number(row.completion_tokens).toLocaleString()}</td><td>{money(row.amount_nanos,row.currency)}</td><td>{money(row.unpaid_nanos,row.currency)}</td></tr>)}
            </tbody></table></div> : <p>No consumption recorded in the last 90 days.</p>}
          </>}
          {section === "settlements" && <>
            <h2>Payment history</h2><p>Confirmed external payments. Recording a payment does not transfer funds.</p>
            {data?.settlements?.length ? <div className="table-wrap"><table className="provider-ledger"><thead><tr><th>Date</th><th>Payment reference</th><th>Amount</th></tr></thead><tbody>
              {data.settlements.map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleDateString()}</td><td>{row.payment_reference}</td><td>{money(row.amount_nanos,row.currency)}</td></tr>)}
            </tbody></table></div> : <p>No payments recorded yet.</p>}
          </>}
        </section>
      )}
      <ModalFrame
        open={Boolean(dialog)}
        onOpenChange={(value) => {
          if (!value && !busy) setDialog("");
        }}
        title={
          {
            create: "Register a provider",
            membership: "Manage provider membership",
            offer: "Publish agreed payout rates",
            settlement: "Record a confirmed external payment",
          }[dialog] ?? ""
        }
        description="Provider management"
        className="vendor-dialog"
      >
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <form
          onSubmit={(event) => void submit(event)}
          className="provider-admin-form"
        >
          {dialog === "create" && (
            <label>
              Provider name
              <Input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
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
                Provider role
                <Dropdown
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                >
                  <DropdownOption value="viewer">
                    Viewer · earnings and offers
                  </DropdownOption>
                  <DropdownOption value="manager">
                    Manager · also pause and resume offers
                  </DropdownOption>
                </Dropdown>
              </label>
              <label>
                Access
                <Dropdown
                  value={active}
                  onChange={(event) => setActive(event.target.value)}
                >
                  <DropdownOption value="true">Grant access</DropdownOption>
                  <DropdownOption value="false">Revoke access</DropdownOption>
                </Dropdown>
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
                Use the provider's agreed rates. Saving publishes a new
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
                        <input
                          type="checkbox"
                          checked={attempts.includes(item.id)}
                          onChange={(event) =>
                            setAttempts((current) =>
                              event.target.checked
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
        </form>
      </ModalFrame>
    </>
  );
}

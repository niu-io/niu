import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useConsoleContext } from "@/app/console-context";
import PageHeader from "@/components/PageHeader";
import ProviderLogo from "@/components/ProviderLogo";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownOption } from "@/components/ui/dropdown";
import { modelIdentity } from "@/lib/providers";
import { money } from "@/lib/money";
import { request, VendorRequestError } from "@/features/vendors/api";

type Offer = {
  id: string;
  model_alias: string;
  active: boolean;
  route_ready: boolean;
  revision: string;
  currency: string;
  prompt_rate: string;
  completion_rate: string;
};
type Dashboard = {
  id: string;
  name: string;
  days: number;
  balances: {
    currency: string;
    earned_nanos: string;
    unpaid_nanos: string;
    paid_nanos: string;
    period_nanos: string;
  }[];
  traffic: {
    requests: string;
    completed: string;
    unresolved: string;
    prompt_tokens: string;
    completion_tokens: string;
  };
  daily: { day: string; currency: string; amount_nanos: string }[];
  offers: Offer[];
  consumption: {
    model_alias: string;
    revision: string;
    currency: string;
    prompt_rate: string;
    completion_rate: string;
    requests: string;
    prompt_tokens: string;
    completion_tokens: string;
    amount_nanos: string;
    unpaid_nanos: string;
  }[];
  settlements: {
    id: string;
    currency: string;
    amount_nanos: string;
    payment_reference: string;
    created_at: string;
  }[];
};
const count = (value: string) => BigInt(value).toLocaleString();
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function ProviderBusinessRoute() {
  const context = useConsoleContext();
  const navigate = useNavigate();
  const { provider } = useParams();
  const membership = context.session?.provider_memberships?.find(
    (item) => item.id === provider,
  );
  if (!context.token || !membership)
    return (
      <>
        <PageHeader title="Providers" />
        <section className="panel provider-access-message">
          <ShieldCheck size={28} />
          <h2>Provider access required</h2>
          <p>
            This area is for approved suppliers earning revenue on Niu. Your
            account needs an active provider membership.
          </p>
        </section>
      </>
    );
  return (
    <>
      {context.session!.provider_memberships!.length > 1 && (
        <div className="provider-business-switch">
          <Dropdown
            aria-label="Switch provider business"
            value={membership.id}
            onChange={(event) => navigate(`/providers/${event.target.value}`)}
          >
            {context.session!.provider_memberships!.map((item) => (
              <DropdownOption key={item.id} value={item.id}>
                {item.name}
              </DropdownOption>
            ))}
          </Dropdown>
        </div>
      )}
      <ProviderBusiness
        key={`${context.token}:${provider}`}
        token={context.token}
        provider={membership.id}
        role={membership.role}
        refreshAccess={context.refreshWorkspace}
      />
    </>
  );
}

function ProviderBusiness({
  token,
  provider,
  role,
  refreshAccess,
}: {
  token: string;
  provider: string;
  role: string;
  refreshAccess: () => Promise<void>;
}) {
  const [days, setDays] = useState("30");
  const { section = "overview" } = useParams();
  const tab = section === "models" ? "offers" : section === "consumption" ? "earnings" : section;
  const [currency, setCurrency] = useState("");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const path = `/admin/v1/providers/${encodeURIComponent(provider)}`;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    void request<{ data: Dashboard }>(
      token,
      `${path}/dashboard?days=${days}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result.data);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Provider data could not be loaded.",
        );
        if (
          reason instanceof VendorRequestError &&
          [401, 403, 404].includes(reason.status)
        )
          void refreshAccess();
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, path, days, revision, refreshAccess]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setRevision((value) => value + 1),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  async function toggleOffer(offer: Offer) {
    if (busy) return;
    setBusy(offer.id);
    setError("");
    setNotice("");
    try {
      await request(token, `${path}/offers/${offer.id}`, "PATCH", {
        active: !offer.active,
      });
      setNotice(
        `${offer.model_alias} ${offer.active ? "paused. New requests will not be admitted." : "resumed."}`,
      );
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Offer could not be updated.",
      );
      if (
        reason instanceof VendorRequestError &&
        [401, 403, 404].includes(reason.status)
      ) {
        setData(null);
        void refreshAccess();
      }
    } finally {
      setBusy("");
    }
  }

  const currencies = [
    ...new Set([
      ...(data?.balances.map((item) => item.currency) ?? []),
      ...(data?.offers.map((item) => item.currency) ?? []),
    ]),
  ].sort();
  const selectedCurrency = currencies.includes(currency)
    ? currency
    : (currencies[0] ?? "");
  const balance = data?.balances.find(
    (item) => item.currency === selectedCurrency,
  );
  const amount = (value?: string) =>
    selectedCurrency ? money(value ?? "0", selectedCurrency) : "—";
  const series =
    data?.daily.filter((item) => item.currency === selectedCurrency) ?? [];
  const max = series.reduce(
    (highest, item) =>
      BigInt(item.amount_nanos) > highest ? BigInt(item.amount_nanos) : highest,
    0n,
  );
  return (
    <>
      <PageHeader
        title={{ overview: "Overview", offers: "Model offers", earnings: "Consumption & earnings", settlements: "Settlements" }[tab] ?? "Providers"}
        eyebrow={data?.name ?? "Provider business"}
        action={
          <div className="provider-toolbar">
            <Dropdown
              aria-label="Earnings period"
              value={days}
              onChange={(event) => setDays(event.target.value)}
            >
              <DropdownOption value="7">Last 7 days</DropdownOption>
              <DropdownOption value="30">Last 30 days</DropdownOption>
              <DropdownOption value="90">Last 90 days</DropdownOption>
            </Dropdown>
            <Button
              variant="outline"
              aria-label="Refresh provider data"
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={16} />
            </Button>
          </div>
        }
      />
      <p className="provider-intro">
        Track consumption of your models and the earnings at your agreed rates.
      </p>
      {error && (
        <div className="provider-message" role="alert">
          <span>{error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      )}
      {notice && (
        <div className="provider-message" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss notice"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      {loading ? (
        <section className="panel provider-access-message" role="status">
          Loading your provider business…
        </section>
      ) : (
        data && (
          <>
            {tab === "overview" && (
              <>
                <div className="provider-section-heading">
                  <h2>Earnings at a glance</h2>
                  {currencies.length > 0 && (
                    <Dropdown
                      aria-label="Earnings currency"
                      value={selectedCurrency}
                      onChange={(event) => setCurrency(event.target.value)}
                    >
                      {currencies.map((item) => (
                        <DropdownOption value={item} key={item}>
                          {item}
                        </DropdownOption>
                      ))}
                    </Dropdown>
                  )}
                </div>
                <div className="provider-metrics">
                  <article className="provider-metric provider-metric-primary">
                    <span>
                      <TrendingUp size={17} />
                      Period earnings
                    </span>
                    <strong>{amount(balance?.period_nanos)}</strong>
                    <small>Accrued in the last {days} days</small>
                  </article>
                  <article className="provider-metric">
                    <span>
                      <Wallet size={17} />
                      Unpaid earnings
                    </span>
                    <strong>{amount(balance?.unpaid_nanos)}</strong>
                    <small>All time · awaiting external settlement</small>
                  </article>
                  <article className="provider-metric">
                    <span>
                      <ArrowDownLeft size={17} />
                      Payments recorded
                    </span>
                    <strong>{amount(balance?.paid_nanos)}</strong>
                    <small>All time · confirmed payment records</small>
                  </article>
                </div>
                <div className="provider-overview-grid">
                  <section className="panel provider-revenue">
                    <div className="provider-section-heading">
                      <div>
                        <h2>Earnings over time</h2>
                        <p>
                          Daily accrual · UTC ·{" "}
                          {selectedCurrency || "No currency yet"}
                        </p>
                      </div>
                      <CircleDollarSign size={20} />
                    </div>
                    {series.length ? (
                      <div
                        className="provider-chart"
                        role="img"
                        aria-label={`Daily earnings in ${selectedCurrency}. Exact values are listed below.`}
                      >
                        {series.map((item) => (
                          <div className="provider-chart-column" key={item.day}>
                            <span
                              title={`${item.day}: ${money(item.amount_nanos, item.currency)}`}
                              style={{
                                height: `${max > 0n ? Number((BigInt(item.amount_nanos) * 100n) / max) : 0}%`,
                              }}
                            />
                            <small>{item.day.slice(5)}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="provider-chart-empty">
                        <TrendingUp size={26} />
                        <strong>No earnings recorded in this period</strong>
                        <p>
                          Completed requests with verified usage accrue at your
                          agreed offer rates.
                        </p>
                      </div>
                    )}
                    {series.length > 0 && (
                      <details className="provider-daily-values">
                        <summary>View daily amounts</summary>
                        <dl>
                          {series.map((item) => (
                            <div key={item.day}>
                              <dt>{item.day}</dt>
                              <dd>{money(item.amount_nanos, item.currency)}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </section>
                  <section className="panel provider-traffic">
                    <h2>Supply performance</h2>
                    <p>Last {days} days · all currencies</p>
                    <dl>
                      <div>
                        <dt>Requests admitted</dt>
                        <dd>{count(data.traffic.requests)}</dd>
                      </div>
                      <div>
                        <dt>Completed requests</dt>
                        <dd>{count(data.traffic.completed)}</dd>
                      </div>
                      <div>
                        <dt>Input tokens reported</dt>
                        <dd>{count(data.traffic.prompt_tokens)}</dd>
                      </div>
                      <div>
                        <dt>Output tokens reported</dt>
                        <dd>{count(data.traffic.completion_tokens)}</dd>
                      </div>
                      <div>
                        <dt>
                          <Clock3 size={14} />
                          Awaiting earnings reconciliation
                        </dt>
                        <dd>{count(data.traffic.unresolved)}</dd>
                      </div>
                    </dl>
                    <p className="provider-footnote">
                      Unresolved usage is not counted as zero earnings.
                    </p>
                  </section>
                </div>
                <div className="provider-business-note">
                  <ShieldCheck size={18} />
                  <p>
                    Earnings use verified model consumption and your agreed rates. Payment records reflect completed external settlements; no funds are transferred here.
                  </p>
                </div>
              </>
            )}
            {tab === "offers" && (
              <section className="panel">
                <div className="provider-section-heading provider-panel-heading">
                  <div>
                    <h2>Your model offers</h2>
                    <p>
                      Agreed payout rates per million tokens. Rate revisions
                      apply to new requests.
                    </p>
                  </div>
                  <span>{data.offers.length} offers</span>
                </div>
                {data.offers.length === 0 ? (
                  <Empty
                    title="No model offers yet"
                    detail="An installation administrator can assign your upstream models and publish agreed payout rates."
                  />
                ) : (
                  <div className="provider-offers">
                    {data.offers.map((offer) => (
                      <article className="provider-offer" key={offer.id}>
                        <ProviderLogo
                          provider={modelIdentity({ id: offer.model_alias })}
                        />
                        <div className="provider-offer-name">
                          <strong>{offer.model_alias}</strong>
                          <span>
                            {!offer.active
                              ? "Paused"
                              : offer.route_ready
                                ? "Accepting requests"
                                : "Upstream unavailable"}
                          </span>
                        </div>
                        <div className="provider-offer-rates">
                          <span>
                            Input{" "}
                            <strong>
                              {money(offer.prompt_rate, offer.currency)}
                            </strong>
                          </span>
                          <span>
                            Output{" "}
                            <strong>
                              {money(offer.completion_rate, offer.currency)}
                            </strong>
                          </span>
                        </div>
                        {role === "manager" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={Boolean(busy)}
                            onClick={() => void toggleOffer(offer)}
                          >
                            {busy === offer.id
                              ? "Saving…"
                              : offer.active
                                ? "Pause"
                                : "Resume"}
                          </Button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
                <p className="provider-panel-note">
                  Price changes require a new agreed rate revision from provider
                  management. Pausing prevents new admissions; requests already
                  dispatched can still complete and earn revenue.
                </p>
              </section>
            )}
            {tab === "earnings" && (
              <section className="panel">
                <div className="provider-panel-heading">
                  <h2>Consumption & earnings by model</h2>
                  <p>
                    Last {days} days · grouped by agreed rate · currencies
                    remain separate
                  </p>
                </div>
                {data.consumption.length ? (
                  <div className="table-wrap">
                    <table className="provider-ledger">
                      <thead>
                        <tr>
                          <th>Model</th>
                          <th>Requests</th>
                          <th>Input / output tokens</th>
                          <th>Input / output rate per 1M</th>
                          <th>Earnings</th>
                          <th>Unpaid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.consumption.map((entry) => (
                          <tr key={entry.revision}>
                            <td>
                              <strong>{entry.model_alias}</strong>
                            </td>
                            <td>{count(entry.requests)}</td>
                            <td>
                              {count(entry.prompt_tokens)} /{" "}
                              {count(entry.completion_tokens)}
                            </td>
                            <td>
                              {money(entry.prompt_rate, entry.currency)} /{" "}
                              {money(entry.completion_rate, entry.currency)}
                            </td>
                            <td>{money(entry.amount_nanos, entry.currency)}</td>
                            <td>{money(entry.unpaid_nanos, entry.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="No model consumption yet"
                    detail="Verified model consumption and earnings will appear here."
                  />
                )}
              </section>
            )}
            {tab === "settlements" && (
              <section className="panel">
                <div className="provider-section-heading provider-panel-heading">
                  <div>
                    <h2>Settlement history</h2>
                    <p>
                      Latest 100 confirmed external payment records · all time
                    </p>
                  </div>
                </div>
                {data.settlements.length ? (
                  <div className="table-wrap">
                    <table className="provider-ledger">
                      <thead>
                        <tr>
                          <th>Date recorded</th>
                          <th>Payment reference</th>
                          <th>Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.settlements.map((entry) => (
                          <tr key={entry.id}>
                            <td>{date(entry.created_at)}</td>
                            <td>{entry.payment_reference}</td>
                            <td>{money(entry.amount_nanos, entry.currency)}</td>
                            <td>
                              <span className="provider-ledger-state">
                                <Check size={13} />
                                Payment recorded
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="No settlements recorded"
                    detail="Your accrued earnings remain unpaid until provider management records a confirmed external payment."
                  />
                )}
                <p className="provider-panel-note">
                  No automated payout schedule or bank transfer is configured
                  here. Contact your billing contact for settlement
                  arrangements.
                </p>
              </section>
            )}
          </>
        )
      )}
    </>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="provider-chart-empty">
      <ArrowUpRight size={24} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

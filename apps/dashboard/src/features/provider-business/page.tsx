import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { IconArrowDownLeft as ArrowDownLeft } from "@tabler/icons-react";
import { IconBuildings as Building2 } from "@tabler/icons-react";
import { IconCheck as Check } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconCoin as CircleDollarSign } from "@tabler/icons-react";
import { IconClock as Clock3 } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { IconTrendingUp as TrendingUp } from "@tabler/icons-react";
import { IconWallet as Wallet } from "@tabler/icons-react";
import { IconX as X } from "@tabler/icons-react";
import { useDashboardContext } from "@/app/dashboard-context";
import PageHeader from "@/components/PageHeader";
import ProviderLogo from "@/components/ProviderLogo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { modelIdentity } from "@/lib/providers";
import { money } from "@/lib/money";
import { request, VendorRequestError } from "@/features/vendors/api";

type Offer = import("../../../../../sdks/javascript/src/admin").SupplierOffer;
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
    cached_prompt_rate?: string | null;
    cached_prompt_tokens?: string | null;
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
  const context = useDashboardContext();
  const navigate = useNavigate();
  const { supplier } = useParams();
  const membership = context.session?.provider_memberships?.find(
    (item) => item.id === supplier,
  );
  if (!context.token || !membership)
    return (
      <>
        <PageHeader title="Suppliers" />
        <section className="panel provider-access-message">
          <ShieldCheck size={28} />
          <h2>Supplier access required</h2>
          <p>
            This area is for approved suppliers earning revenue on Niu. Your
            account needs an active supplier membership.
          </p>
        </section>
      </>
    );
  const memberships = context.session!.provider_memberships!;
  return (
    <ProviderBusiness
        key={`${context.token}:${supplier}`}
        token={context.token}
        provider={membership.id}
        role={membership.role}
        memberships={memberships}
        navigate={navigate}
        refreshAccess={context.refreshWorkspace}
      />
  );
}

function ProviderBusiness({
  token,
  provider,
  role,
  memberships,
  navigate,
  refreshAccess,
}: {
  token: string;
  provider: string;
  role: string;
  memberships: { id: string; name: string; role: "manager" | "viewer" }[];
  navigate: (to: string) => void;
  refreshAccess: () => Promise<void>;
}) {
  const [days, setDays] = useState("30");
  const { section = "overview" } = useParams();
  const tab = section === "models" ? "offers" : section === "consumption" ? "earnings" : section;
  const showPeriod = tab === "overview" || tab === "earnings";
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
            : "Supplier data could not be loaded.",
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
      ...(data?.offers.flatMap((item) => item.currency ? [item.currency] : []) ?? []),
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
        title={{ overview: "Overview", offers: "Model offers", earnings: "Consumption & earnings", settlements: "Settlements" }[tab] ?? "Suppliers"}
        eyebrow={memberships.length === 1 ? data?.name : undefined}
        action={
          <div className="provider-header-actions">
            {memberships.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-label="Switch supplier" variant="outline" className="provider-context-picker">
                    <Building2 size={16} />
                    <span>{memberships.find((item) => item.id === provider)?.name ?? "Choose supplier"}</span>
                    <ChevronDown size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuRadioGroup value={provider} onValueChange={(value) => navigate(`/suppliers/${value}`)}>
                    {memberships.map((item) => <DropdownMenuRadioItem key={item.id} value={item.id}>{item.name}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {showPeriod && <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="Date range" variant="outline" className="provider-period-picker">Last {days} days<ChevronDown size={16} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={days} onValueChange={setDays}>
                <DropdownMenuRadioItem value="7">Last 7 days</DropdownMenuRadioItem><DropdownMenuRadioItem value="30">Last 30 days</DropdownMenuRadioItem><DropdownMenuRadioItem value="90">Last 90 days</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu>}
            <Button
              variant="outline"
              aria-label="Refresh supplier data"
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={16} />
            </Button>
          </div>
        }
      />
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
          Loading your supplier business…
        </section>
      ) : (
        data && (
          <>
            {tab === "overview" && (
              <>
                <div className="provider-section-heading">
                  <h2>Earnings at a glance</h2>
                  {currencies.length > 0 && (
                    <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="Earnings currency" variant="outline" className="justify-between font-normal">{selectedCurrency}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={selectedCurrency} onValueChange={setCurrency}>
                        {currencies.map(item => <DropdownMenuRadioItem value={item} key={item}>{item}</DropdownMenuRadioItem>)}
                      </DropdownMenuRadioGroup></DropdownMenuContent>
                    </DropdownMenu>
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
                    detail="A platform administrator can assign your upstream models and publish agreed payout rates."
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
                        {offer.rate_kind === "media" ? <div className="provider-offer-rates"><span>Media rates vary by specification.</span></div> : <div className="provider-offer-rates">
                          <span>
                            Input{" "}
                            <strong>
                              {money(offer.prompt_rate, offer.currency)}
                            </strong>
                          </span>
                          <span>
                            Cache read{" "}
                            <strong>{money(offer.cached_prompt_rate ?? offer.prompt_rate, offer.currency)}</strong>
                            {offer.cached_prompt_rate == null && <small> (Input rate)</small>}
                          </span>
                          <span>
                            Output{" "}
                            <strong>
                              {money(offer.completion_rate, offer.currency)}
                            </strong>
                          </span>
                        </div>}
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
                  <h2>Model usage</h2>
                  <span>Last {days} days</span>
                </div>
                {data.consumption.length ? (
                  <div className="table-wrap">
                    <ShadcnTable className="provider-ledger">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Model</TableHead>
                          <TableHead>Requests</TableHead>
                          <TableHead>Input / output tokens</TableHead>
                          <TableHead>Input / output rate per 1M</TableHead>
                          <TableHead>Earnings</TableHead>
                          <TableHead>Unpaid</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.consumption.map((entry) => (
                          <TableRow key={entry.revision}>
                            <TableCell>
                              <strong>{entry.model_alias}</strong>
                            </TableCell>
                            <TableCell>{count(entry.requests)}</TableCell>
                            <TableCell>
                              {count(entry.prompt_tokens)} /{" "}
                              {count(entry.completion_tokens)}
                              <div className="text-sm text-muted-foreground">Cached: {entry.cached_prompt_tokens == null ? 'Unknown' : count(entry.cached_prompt_tokens)}</div>
                            </TableCell>
                            <TableCell>
                              {money(entry.prompt_rate, entry.currency)} /{" "}
                              {money(entry.completion_rate, entry.currency)}
                              <div className="text-sm text-muted-foreground">Cache read: {money(entry.cached_prompt_rate ?? entry.prompt_rate, entry.currency)}{entry.cached_prompt_rate == null ? ' (Input rate)' : ''}</div>
                            </TableCell>
                            <TableCell>{money(entry.amount_nanos, entry.currency)}</TableCell>
                            <TableCell>{money(entry.unpaid_nanos, entry.currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </ShadcnTable>
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
                    <h2>Payment history</h2>
                    <p>Latest 100 · all time</p>
                  </div>
                </div>
                {data.settlements.length ? (
                  <div className="table-wrap">
                    <ShadcnTable className="provider-ledger">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date recorded</TableHead>
                          <TableHead>Payment reference</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.settlements.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{date(entry.created_at)}</TableCell>
                            <TableCell>{entry.payment_reference}</TableCell>
                            <TableCell>{money(entry.amount_nanos, entry.currency)}</TableCell>
                            <TableCell>
                              <span className="provider-ledger-state">
                                <Check size={13} />
                                Payment recorded
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </ShadcnTable>
                  </div>
                ) : (
                  <Empty
                    title="No settlements recorded"
                    detail="Your accrued earnings remain unpaid until supplier management records a confirmed external payment."
                  />
                )}
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
    <div className="provider-empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

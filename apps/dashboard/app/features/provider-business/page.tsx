import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import MediaConsumption, { type MediaConsumptionRecord } from './MediaConsumption';
import MediaRateHistory from './MediaRateHistory';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useProviderParams } from '@/shell/provider-route';
import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEffect, useRef, useState } from "react";
import { IconArrowDownLeft as ArrowDownLeft } from "@tabler/icons-react";
import { IconCheck as Check } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconCoin as CircleDollarSign } from "@tabler/icons-react";
import { IconClock as Clock3 } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { IconTrendingUp as TrendingUp } from "@tabler/icons-react";
import { IconWallet as Wallet } from "@tabler/icons-react";
import { IconX as X } from "@tabler/icons-react";
import { useDashboardContext } from "@/shell/dashboard-context";
import PageHeader from "@/components/PageHeader";
import { WorkspaceShellSkeleton } from "@/components/PageSkeletons";
import ProviderLogo from "@/components/ProviderLogo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { modelIdentity } from "@/lib/providers";
import { money } from "@/lib/money";
import { invalidateQueries } from "@/lib/query-cache";
import { cachedGet, peekCachedGet, request, ProviderRequestError } from "@/features/providers/api";

type Offer = import("@niu-io/sdk/admin").ProviderOffer;
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
  offers_has_more?: boolean;
  media_consumption?: MediaConsumptionRecord[];
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
const count = (value: string) => BigInt(value).toLocaleString(readUILocale());
const date = (value: string) =>
  new Date(value).toLocaleDateString(readUILocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function ProviderBusinessRoute() {
  const { t: uiT } = useUILocale();
  const context = useDashboardContext();
  const { provider, supplier } = useProviderParams();
  const activeProvider = provider ?? supplier;
  const membership = context.session?.provider_memberships?.find(
    (item) => item.id === activeProvider,
  );
  if (!context.session || !membership)
    return (
      <>
        <PageHeader title={uiT("Providers")} />
        <section className="panel provider-access-message">
          <ShieldCheck size={28} />
          <h2>{uiT("Provider access required")}</h2>
          <p>
            {uiT("This area is for approved providers earning revenue on Niu. Your account needs an active provider membership.")}</p>
        </section>
      </>
    );
  const memberships = context.session!.provider_memberships!;
  return (
    <ProviderBusiness
        key={`${context.token}:${activeProvider}`}
        token={context.token}
        provider={membership.id}
        role={membership.role}
        memberships={memberships}
        refreshAccess={context.refreshWorkspace}
      />
  );
}

function ProviderBusiness({
  token,
  provider,
  role,
  memberships,
  refreshAccess,
}: {
  token: string;
  provider: string;
  role: string;
  memberships: { id: string; name: string; role: "manager" | "viewer" }[];
  refreshAccess: () => Promise<void>;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [days, setDays] = useState("30");
  const { section = "overview" } = useProviderParams();
  const tab = section === "models" ? "offers" : section === "usage" ? "earnings" : section === "settlements" ? "settlements" : "overview";
  const showPeriod = tab === "overview" || tab === "earnings";
  const {currency} = usePlatformCurrency();
  const path = `/api/v1/providers/${encodeURIComponent(provider)}`;
  const dashboardPath = `${path}/dashboard?days=${days}`;
  const initialDashboard = token ? peekCachedGet<{ data: Dashboard }>(token, dashboardPath)?.data ?? null : null;
  const [data, setData] = useState<Dashboard | null>(initialDashboard);
  const [loading, setLoading] = useState(() => Boolean(token && !initialDashboard));
  const [revision, setRevision] = useState(0);
  const lastRevision = useRef(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingOffers,setLoadingOffers]=useState(false);
  const [offerError,setOfferError]=useState('');
  const offerRequest=useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const force = lastRevision.current !== revision;
    lastRevision.current = revision;
    offerRequest.current?.abort();
    setLoadingOffers(false);
    setOfferError('');
    const cached = token ? peekCachedGet<{ data: Dashboard }>(token, dashboardPath)?.data ?? null : null;
    if (cached) {
      if (!force) setData(cached);
      setLoading(false);
    } else {
      setData(null);
      setLoading(true);
    }
    setError("");
    void cachedGet<{ data: Dashboard }>(
      token,
      dashboardPath,
      { signal: controller.signal, force },
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
          reason instanceof ProviderRequestError &&
          [401, 403, 404].includes(reason.status)
        ) {
          setData(null);
          invalidateQueries(path, { remove: true });
          void refreshAccess();
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => { controller.abort(); offerRequest.current?.abort(); };
  }, [token, dashboardPath, revision, refreshAccess]);
  useEffect(() => {
    if(tab === 'offers')return;
    const timer = window.setInterval(
      () => setRevision((value) => value + 1),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, [tab]);

  async function moreOffers() {
    if(!data?.offers_has_more || loadingOffers) return;
    const after=data.offers.at(-1)?.model_alias;
    if(!after)return;
    const controller=new AbortController();offerRequest.current=controller;
    setLoadingOffers(true);setOfferError('');
    try {
      const page=await request<{data:Offer[];next_after:string|null}>(token,`${path}/offers?limit=100&after=${encodeURIComponent(after)}`,'GET',undefined,controller.signal);
      if(controller.signal.aborted)return;
      if(page.next_after === after || (page.next_after && !page.data.length))throw new Error('The offer list changed. Refresh offers before continuing.');
      setData(current=>current ? {...current,offers:[...current.offers,...page.data.filter(offer=>!current.offers.some(prior=>prior.id===offer.id))],offers_has_more:page.next_after!==null}:current);
    } catch(error) {
      if(!controller.signal.aborted)setOfferError(error instanceof Error ? error.message : 'Could not load more offers. Try again.');
    } finally {if(!controller.signal.aborted)setLoadingOffers(false);}
  }

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
        reason instanceof ProviderRequestError &&
        [401, 403, 404].includes(reason.status)
      ) {
        setData(null);
        void refreshAccess();
      }
    } finally {
      setBusy("");
    }
  }

  const selectedCurrency = currency;
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
        title={{ overview: "Overview", offers: "Model offers", earnings: "Consumption & earnings", settlements: "Settlements" }[tab] ?? uiT("Providers")}
        eyebrow={memberships.length === 1 ? data?.name : undefined}
        action={
          <div className="provider-header-actions">
            {showPeriod && <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label={uiT("Date range")} variant="outline" className="provider-period-picker">{uiT("Last")}{" "}{days}{" "}{uiT("days")}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={days} onValueChange={setDays}>
                <DropdownMenuRadioItem value="7">{uiT("Last 7 days")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="30">{uiT("Last 30 days")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="90">{uiT("Last 90 days")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu>}
            <Button
              variant="outline"
              aria-label={uiT("Refresh provider data")}
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
            {uiT("Retry")}</Button>
        </div>
      )}
      {notice && (
        <div className="provider-message" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={uiT("Dismiss notice")}
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      {loading ? (
        <WorkspaceShellSkeleton label={uiT("Loading your provider business…")} />
      ) : (
        data && (
          <>
            {tab === "overview" && (
              <>
                <div className="provider-section-heading">
                  <h2>{uiT("Earnings at a glance")}</h2>
                  <span className="text-sm text-muted-foreground">{currency}</span>
                </div>
                <div className="provider-metrics">
                  <article className="provider-metric provider-metric-primary">
                    <span>
                      <TrendingUp size={17} />
                      {uiT("Period earnings")}</span>
                    <strong>{amount(balance?.period_nanos)}</strong>
                    <small>{uiT("Accrued in the last")}{" "}{days}{" "}{uiT("days")}</small>
                  </article>
                  <article className="provider-metric">
                    <span>
                      <Wallet size={17} />
                      {uiT("Unpaid earnings")}</span>
                    <strong>{amount(balance?.unpaid_nanos)}</strong>
                    <small>{uiT("All time · awaiting external settlement")}</small>
                  </article>
                  <article className="provider-metric">
                    <span>
                      <ArrowDownLeft size={17} />
                      {uiT("Payments recorded")}</span>
                    <strong>{amount(balance?.paid_nanos)}</strong>
                    <small>{uiT("All time · confirmed payment records")}</small>
                  </article>
                </div>
                <div className="provider-overview-grid">
                  <section className="panel provider-revenue">
                    <div className="provider-section-heading">
                      <div>
                        <h2>{uiT("Earnings over time")}</h2>
                        <p>
                          {uiT("Daily accrual · UTC ·")}{" "}
                          {selectedCurrency || uiT("No currency yet")}
                        </p>
                      </div>
                      <CircleDollarSign size={20} />
                    </div>
                    {series.length ? (
                      <div
                        className="provider-chart"
                        role="img"
                        aria-label={uiF("Daily earnings in {0}. Exact values are listed below.", [selectedCurrency])}
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
                        <strong>{uiT("No earnings recorded in this period")}</strong>
                        <p>
                          {uiT("Completed requests with verified usage accrue at your agreed offer rates.")}</p>
                      </div>
                    )}
                    {series.length > 0 && (
                      <details className="provider-daily-values">
                        <summary>{uiT("View daily amounts")}</summary>
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
                    <h2>{uiT("Supply performance")}</h2>
                    <p>{uiT("Last")}{" "}{days}{" "}{uiT("days · all currencies")}</p>
                    <dl>
                      <div>
                        <dt>{uiT("Requests admitted")}</dt>
                        <dd>{count(data.traffic.requests)}</dd>
                      </div>
                      <div>
                        <dt>{uiT("Completed requests")}</dt>
                        <dd>{count(data.traffic.completed)}</dd>
                      </div>
                      <div>
                        <dt>{uiT("Input tokens reported")}</dt>
                        <dd>{count(data.traffic.prompt_tokens)}</dd>
                      </div>
                      <div>
                        <dt>{uiT("Output tokens reported")}</dt>
                        <dd>{count(data.traffic.completion_tokens)}</dd>
                      </div>
                      <div>
                        <dt>
                          <Clock3 size={14} />
                          {uiT("Awaiting earnings reconciliation")}</dt>
                        <dd>{count(data.traffic.unresolved)}</dd>
                      </div>
                    </dl>
                    <p className="provider-footnote">
                      {uiT("Unresolved usage is not counted as zero earnings.")}</p>
                  </section>
                </div>
                <div className="provider-business-note">
                  <ShieldCheck size={18} />
                  <p>
                    {uiT("Earnings use verified model consumption and your agreed rates. Payment records reflect completed external settlements; no funds are transferred here.")}</p>
                </div>
              </>
            )}
            {tab === "offers" && (
              <section className="panel">
                <div className="provider-section-heading provider-panel-heading">
                  <div>
                    <h2>{uiT("Your model offers")}</h2>
                    <p>
                      {uiT("Agreed payout rates. Text rates are per million tokens; media rates depend on the specification. Rate revisions apply to new requests.")}</p>
                  </div>
                  <span className="shrink-0">{data.offers.length} {data.offers.length === 1 ? uiT("offer") : uiT("offers")}{data.offers_has_more ? " " + uiT("loaded · more available") : ''}</span>
                </div>
                {data.offers.length === 0 ? (
                  <Empty
                    title={uiT("No model offers yet")}
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
                              ? uiT("Paused")
                              : offer.route_ready
                                ? uiT("Accepting requests")
                                : uiT("Upstream unavailable")}
                          </span>
                        </div>
                        {offer.rate_kind === "media" ? <div className="provider-offer-rates"><span>{uiT("See agreed media rates below.")}</span></div> : <div className="provider-offer-rates">
                          <span>
                            {uiT("Input")}{" "}
                            <strong>
                              {money(offer.prompt_rate, offer.currency)}
                            </strong>
                          </span>
                          <span>
                            {uiT("Cache read")}{" "}
                            <strong>{money(offer.cached_prompt_rate ?? offer.prompt_rate, offer.currency)}</strong>
                            {offer.cached_prompt_rate == null && <small>{" "}{uiT("(Input rate)")}</small>}
                          </span>
                          <span>
                            {uiT("Output")}{" "}
                            <strong>
                              {money(offer.completion_rate, offer.currency)}
                            </strong>
                          </span>
                          <span>
                            {uiT("Reasoning output")}{" "}
                            <strong>{money(offer.reasoning_completion_rate ?? offer.completion_rate, offer.currency)}</strong>
                            {offer.reasoning_completion_rate == null && <small>{" "}{uiT("(Output rate)")}</small>}
                          </span>
                          <span>
                            {uiT("Cache write")}{" "}
                            <strong>{money(offer.cache_write_prompt_rate ?? offer.prompt_rate, offer.currency)}</strong>
                            {offer.cache_write_prompt_rate == null && <small>{" "}{uiT("(Input rate)")}</small>}
                          </span>
                          {(offer.context_tiers ?? []).map(tier => (
                            <div className="provider-offer-rates" key={tier.minimum_input_tokens}>
                              <span>{uiT("Context tier: at least")}{" "}{tier.minimum_input_tokens}{" "}{uiT("input tokens")}</span>
                              <span>{uiT("Input")}{" "}<strong>{money(tier.prompt_rate, offer.currency)}</strong></span>
                              <span>{uiT("Cache read")}{" "}<strong>{money(tier.cached_prompt_rate ?? tier.prompt_rate, offer.currency)}</strong>{tier.cached_prompt_rate == null && <small>{" "}{uiT("(Tier input rate)")}</small>}</span>
                              <span>{uiT("Output")}{" "}<strong>{money(tier.completion_rate, offer.currency)}</strong></span>
                              <span>{uiT("Reasoning output")}{" "}<strong>{money(tier.reasoning_completion_rate ?? tier.completion_rate, offer.currency)}</strong>{tier.reasoning_completion_rate == null && <small>{" "}{uiT("(Tier output rate)")}</small>}</span>
                              <span>{uiT("Cache write")}{" "}<strong>{money(tier.cache_write_prompt_rate ?? tier.prompt_rate, offer.currency)}</strong>{tier.cache_write_prompt_rate == null && <small>{" "}{uiT("(Tier input rate)")}</small>}</span>
                            </div>
                          ))}
                        </div>}
                        {role === "manager" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={Boolean(busy)}
                            onClick={() => void toggleOffer(offer)}
                          >
                            {busy === offer.id
                              ? uiT("Saving…")
                              : offer.active
                                ? uiT("Pause")
                                : uiT("Resume")}
                          </Button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
                {offerError && <p role="alert">{offerError}</p>}
                {data.offers_has_more && <Button variant="outline" disabled={loadingOffers} onClick={()=>void moreOffers()}>{loadingOffers ? uiT("Loading offers…") : offerError ? uiT("Retry loading offers") : uiT("Load more offers")}</Button>}
                {data.offers.some(offer=>offer.rate_kind === 'media') && <section className="mt-6" aria-label={uiT("Agreed media rates")}><h3 className="mb-3 px-4 font-semibold sm:px-6">{uiT("Agreed media rates")}</h3><MediaRateHistory token={token} supplier={provider} canConfigure={false} providerView /></section>}
                <p className="provider-panel-note">
                  {uiT("Price changes require a new agreed rate revision from Provider management. Pausing prevents new admissions; requests already dispatched can still complete and earn revenue.")}</p>
              </section>
            )}
            {tab === "earnings" && (
              <section className="panel">
                <div className="provider-panel-heading">
                  <h2>{uiT("Model usage")}</h2>
                  <span>{uiT("Last")}{" "}{days}{" "}{uiT("days")}</span>
                </div>
                {data.consumption.length ? (
                  <div className="table-wrap">
                    <ShadcnTable className="provider-ledger">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{uiT("Model")}</TableHead>
                          <TableHead>{uiT("Requests")}</TableHead>
                          <TableHead>{uiT("Input / output tokens")}</TableHead>
                          <TableHead>{uiT("Input / output rate per 1M")}</TableHead>
                          <TableHead>{uiT("Earnings")}</TableHead>
                          <TableHead>{uiT("Unpaid")}</TableHead>
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
                              <div className="text-sm text-muted-foreground">{uiT("Cached:")}{" "}{entry.cached_prompt_tokens == null ? uiT("Unknown") : count(entry.cached_prompt_tokens)}</div>
                            </TableCell>
                            <TableCell>
                              {money(entry.prompt_rate, entry.currency)} /{" "}
                              {money(entry.completion_rate, entry.currency)}
                              <div className="text-sm text-muted-foreground">{uiT("Cache read:")}{" "}{money(entry.cached_prompt_rate ?? entry.prompt_rate, entry.currency)}{entry.cached_prompt_rate == null ? uiT("(Input rate)") : ''}</div>
                            </TableCell>
                            <TableCell>{money(entry.amount_nanos, entry.currency)}</TableCell>
                            <TableCell>{money(entry.unpaid_nanos, entry.currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </ShadcnTable>
                  </div>
                ) : Array.isArray(data.media_consumption) && data.media_consumption.length === 0 ? (
                  <Empty
                    title={uiT("No model consumption yet")}
                    detail="Verified model consumption and earnings will appear here."
                  />
                ) : null}
                <MediaConsumption records={data.media_consumption} />
              </section>
            )}
            {tab === "settlements" && (
              <section className="panel">
                <div className="provider-section-heading provider-panel-heading">
                  <div>
                    <h2>{uiT("Payment history")}</h2>
                    <p>{uiT("Latest 100 · all time")}</p>
                  </div>
                </div>
                {data.settlements.length ? (
                  <div className="table-wrap">
                    <ShadcnTable className="provider-ledger">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{uiT("Date recorded")}</TableHead>
                          <TableHead>{uiT("Payment reference")}</TableHead>
                          <TableHead>{uiT("Amount")}</TableHead>
                          <TableHead>{uiT("Status")}</TableHead>
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
                                {uiT("Payment recorded")}</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </ShadcnTable>
                  </div>
                ) : (
                  <Empty
                    title={uiT("No settlements recorded")}
                    detail="Your accrued earnings remain unpaid until Provider management records a confirmed external payment."
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

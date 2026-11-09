import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import ProviderModels from './ProviderModels';
import MediaConsumption, { type MediaConsumptionRecord } from './MediaConsumption';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useProviderParams, providerPathSegment } from '@/shell/provider-route';
import { IconSearch } from '@tabler/icons-react';
import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconDots as Dots } from "@tabler/icons-react";
import { IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { IconUsers } from "@tabler/icons-react";
import { IconBuildings as Building2 } from "@tabler/icons-react";
import { useDashboardContext } from "@/shell/dashboard-context";
import ProviderEditor, { type ProviderConnectionCreate } from "@/features/providers/components/ProviderEditor";
import PageHeader from "@/components/PageHeader";
import { ListRowsSkeleton, TableSkeleton, WorkspaceShellSkeleton } from "@/components/PageSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cachedGet, peekCachedGet, request, writeMayHaveCommitted, ProviderRequestError } from "@/features/providers/api";
import { money } from "@/lib/money";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MediaRateHistory from "./MediaRateHistory";
import MediaRatePublisher from "./MediaRatePublisher";
import type { ProviderOffer } from "@niu-io/sdk/admin";
import type { Operator } from "@/features/operators/api";

import { type ProviderSetup } from '@/features/providers/provider-setup';

type Business = ProviderSetup & { id: string; slug?: string; name: string; members: number };
type ProviderMember = { operator_id: string; name: string; role: string; active: boolean; revoked: boolean };
type AdminData = {
  media_consumption?: MediaConsumptionRecord[];
  balances: { currency: string; earned_nanos: string; unpaid_nanos: string; paid_nanos: string }[];
  consumption: { model_alias: string; revision: string; currency: string; requests: string; prompt_tokens: string; completion_tokens: string; amount_nanos: string; unpaid_nanos: string }[];
  settlements: { id: string; currency: string; amount_nanos: string; payment_reference: string; created_at: string }[];

  offers: ProviderOffer[];
  offers_has_more?: boolean;
};
type SettlementPreview = {
  currency: string;
  from_ms: number | null;
  cutoff_ms: number;
  entry_count: number;
  amount_nanos: string;
  remaining_unpaid_nanos: string;
  remaining_entry_count: number;
};
type SettlementResult = {
  id?: string;
  amount_nanos?: string;
  entry_count?: number;
  remaining_unpaid_nanos?: string;
};

function defaultSettlementCutoff() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function settlementCutoffMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Number(match[1]), month - 1, day, 23, 59, 59, 999);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    return null;
  return date.getTime();
}

export default function ProviderAdministration() {
  const { t: uiT } = useUILocale();
  const { session, token } = useDashboardContext();
  if (!(session?.kind === "installation" || session?.permissions.platform_admin) && session?.provider_memberships?.length)
    return <Navigate to={`/providers/${providerPathSegment(session.provider_memberships[0])}`} replace />;
  if (!(session?.kind === "installation" || session?.permissions.platform_admin))
    return (
      <>
        <PageHeader title={uiT("Providers")} />
        <section className="panel provider-access-message">
          <ShieldCheck />
          <h2>{uiT("Provider access required")}</h2>
          <p>
            {uiT("Provider membership and agreed rates are controlled by installation administration.")}</p>
        </section>
      </>
    );
  return <Administration key={token} token={token} />;
}
function Administration({ token }: { token: string }) {
  const { t: uiT, format: uiF } = useUILocale();
  const { session } = useDashboardContext();
  const internal = session?.operating_mode === 'internal';
  const { section = "overview", providerId, supplierId } = useProviderParams();
  const routeProviderId = providerId ?? supplierId;
  const initialBusinesses = token ? peekCachedGet<{ data: Business[] }>(token, "/api/v1/providers")?.data ?? null : null;
  const [loading, setLoading] = useState(() => Boolean(token && !initialBusinesses));
  const [businesses, setBusinesses] = useState<Business[]>(() => initialBusinesses ?? []);
  const [search, setSearch] = useSearchParams();
  const selected = routeProviderId ?? search.get('provider') ?? search.get('supplier') ?? '';
  const setSelected = (id: string) => setSearch(current => { current.set('supplier', id); current.delete('create'); return current; });

  const initialAdminData = selected && token
    ? peekCachedGet<{ data: AdminData }>(token, `/api/v1/providers/${selected}/administration?days=90`)?.data ?? null
    : null;
  const initialMembers = selected && token
    ? peekCachedGet<{ data: ProviderMember[] }>(token, `/api/v1/providers/${selected}/members`)?.data ?? null
    : null;
  const [data, setData] = useState<AdminData | null>(initialAdminData);
  const [loadingMoreOffers, setLoadingMoreOffers] = useState(false);
  const [moreOffersError, setMoreOffersError] = useState('');
  const moreOffersRequest = useRef<AbortController | null>(null);
  const [members, setMembers] = useState<ProviderMember[]>(() => initialMembers ?? []);
  const [membersLoading, setMembersLoading] = useState(false);
  const [offerQuery, setOfferQuery] = useState("");
  const offerSearch = useRef<HTMLInputElement>(null);
  const pricingTab = !internal && ['text', 'media'].includes(search.get('view') ?? '') ? search.get('view')! : 'models';
  const setPricingTab = (value: string) => setSearch(current => { if (value === 'models') current.delete('view'); else current.set('view', value); return current; });
  useEffect(() => { setOfferQuery(""); }, [selected, section]);
  const [mediaRateModel, setMediaRateModel] = useState<string | null>(null);
  const [mediaRateVersion, setMediaRateVersion] = useState(0);
  const textOffers = (data?.offers ?? []).filter(offer => offer.rate_kind !== "media");
  const mediaOffers = (data?.offers ?? []).filter(offer => offer.rate_kind === "media");
  const visibleOffers = textOffers.filter(offer => section !== "models" || offer.model_alias.toLowerCase().includes(offerQuery.trim().toLowerCase()));
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState("");
  const operationScope = useRef(0);
  const [offerLoad, setOfferLoad] = useState<{ token: string; supplier: string; scope: number; offers: ProviderOffer[]; ready: boolean; loading: boolean; conflict: boolean } | null>(null);
  const offerRequest = useRef<AbortController | null>(null);
  const offerReadSequence = useRef(0);
  useEffect(() => () => { offerRequest.current?.abort(); offerReadSequence.current += 1; }, [selected, token]);
  const previousProvider = useRef("");
  const lastProvidersRevision = useRef(0);
  const lastAdminRevision = useRef(0);
  const lastMembersRevision = useRef(0);
  useLayoutEffect(() => {
    operationScope.current += 1;
    if (previousProvider.current) {
      setDialog("");
      setBusy(false);
      setError("");
      setNotice("");
      setMediaRateModel(null);
    }
    previousProvider.current = selected;
    const cachedAdmin = selected && token
      ? peekCachedGet<{ data: AdminData }>(token, `/api/v1/providers/${selected}/administration?days=90`)?.data ?? null
      : null;
    const cachedMembers = selected && token
      ? peekCachedGet<{ data: ProviderMember[] }>(token, `/api/v1/providers/${selected}/members`)?.data ?? null
      : null;
    setData(cachedAdmin);
    setMembers(cachedMembers ?? []);
    return () => { operationScope.current += 1; };
  }, [selected, token]);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const offerActionButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => { if (search.get('create') === 'supplier' || search.get('create') === 'provider') setDialog('create'); }, [search]);
  const [operator, setOperator] = useState("");
  const [accounts, setAccounts] = useState<Operator[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  useEffect(() => {
    if (dialog !== "membership") return;
    const controller = new AbortController();
    const cached = token ? peekCachedGet<{ data: Operator[] }>(token, "/api/v1/operators")?.data ?? null : null;
    if (cached) {
      setAccounts(cached.filter(account => !account.revoked));
      setAccountsLoading(false);
    } else {
      setAccounts([]);
      setAccountsLoading(true);
    }
    void cachedGet<{ data: Operator[] }>(token, "/api/v1/operators", { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setAccounts(result.data.filter(account => !account.revoked)); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setAccountsLoading(false); });
    return () => controller.abort();
  }, [dialog, token]);
  useEffect(() => {
    if (section !== "members" || !selected) return;
    const controller = new AbortController();
    const force = lastMembersRevision.current !== revision;
    lastMembersRevision.current = revision;
    const membersPath = `/api/v1/providers/${selected}/members`;
    const cached = token ? peekCachedGet<{ data: ProviderMember[] }>(token, membersPath)?.data ?? null : null;
    if (cached) {
      if (!force) setMembers(cached);
      setMembersLoading(false);
    } else {
      setMembers([]);
      setMembersLoading(true);
    }
    void cachedGet<{ data: ProviderMember[] }>(token, membersPath, { signal: controller.signal, force })
      .then(result => { if (!controller.signal.aborted) setMembers(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setMembersLoading(false); });
    return () => controller.abort();
  }, [section, selected, token, revision]);
  const [role, setRole] = useState("viewer");
  const [active, setActive] = useState("true");
  const [alias, setAlias] = useState("");
  const {currency} = usePlatformCurrency();
  const [inputRate, setInputRate] = useState("");
  const [cachedInputRate, setCachedInputRate] = useState("");
  const [outputRate, setOutputRate] = useState("");
  const [reference, setReference] = useState("");
  const [settlementCurrency, setSettlementCurrency] = useState("");
  const [settlementCutoff, setSettlementCutoff] = useState(defaultSettlementCutoff);
  const [settlementPreview, setSettlementPreview] = useState<SettlementPreview | null>(null);
  const [settlementPreviewLoading, setSettlementPreviewLoading] = useState(false);
  const [settlementPreviewError, setSettlementPreviewError] = useState("");
  const [settlementPreviewReload, setSettlementPreviewReload] = useState(0);
  const settlementPreviewRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    settlementPreviewRequest.current?.abort();
    setSettlementPreview(null);
    setSettlementPreviewError("");
    if (dialog !== "settlement" || !selected || !settlementCurrency || !settlementCutoff) {
      setSettlementPreviewLoading(false);
      return;
    }
    const cutoffMs = settlementCutoffMs(settlementCutoff);
    if (cutoffMs === null) {
      setSettlementPreviewLoading(false);
      setSettlementPreviewError("Choose a valid cutoff date.");
      return;
    }
    const controller = new AbortController();
    settlementPreviewRequest.current = controller;
    setSettlementPreviewLoading(true);
    void request<{ data: SettlementPreview }>(
      token,
      `/api/v1/providers/${selected}/settlements/preview?currency=${encodeURIComponent(settlementCurrency)}&cutoff_ms=${cutoffMs}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then(result => {
        if (controller.signal.aborted) return;
        const preview = result?.data;
        if (
          !preview ||
          preview.currency !== settlementCurrency ||
          preview.cutoff_ms !== cutoffMs ||
          preview.from_ms !== null ||
          !Number.isSafeInteger(preview.entry_count) ||
          preview.entry_count < 0 ||
          !Number.isSafeInteger(preview.remaining_entry_count) ||
          preview.remaining_entry_count < 0 ||
          typeof preview.amount_nanos !== "string" ||
          !/^[0-9]{1,19}$/.test(preview.amount_nanos) ||
          BigInt(preview.amount_nanos) > 9_223_372_036_854_775_807n ||
          typeof preview.remaining_unpaid_nanos !== "string" ||
          !/^[0-9]{1,40}$/.test(preview.remaining_unpaid_nanos)
        )
          throw new Error("Settlement preview could not be read. Please retry.");
        setSettlementPreview(preview);
      })
      .catch(reason => {
        if (!controller.signal.aborted)
          setSettlementPreviewError(reason instanceof Error ? reason.message : "Settlement preview could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettlementPreviewLoading(false);
      });
    return () => controller.abort();
  }, [dialog, selected, token, settlementCurrency, settlementCutoff, settlementPreviewReload]);

  const [paymentKey, setPaymentKey] = useState("");
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [notice, setNotice] = useState("");
  const [offerId, setOfferId] = useState("");
  const [offerSnapshot, setOfferSnapshot] = useState<ProviderOffer | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const force = lastProvidersRevision.current !== revision;
    lastProvidersRevision.current = revision;
    const cached = token ? peekCachedGet<{ data: Business[] }>(token, "/api/v1/providers")?.data ?? null : null;
    if (cached) {
      if (!force) setBusinesses(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void cachedGet<{ data: Business[] }>(
      token,
      "/api/v1/providers",
      { signal: controller.signal, force },
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
    if (!selected) return;
    moreOffersRequest.current?.abort();
    setLoadingMoreOffers(false); setMoreOffersError('');
    const controller = new AbortController();
    const force = lastAdminRevision.current !== revision;
    lastAdminRevision.current = revision;
    const adminPath = `/api/v1/providers/${selected}/administration?days=90`;
    const cached = token ? peekCachedGet<{ data: AdminData }>(token, adminPath)?.data ?? null : null;
    if (cached && !force) {
      setData(cached);
    }
    void cachedGet<{ data: AdminData }>(
      token,
      adminPath,
      { signal: controller.signal, force },
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result.data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [token, selected, revision]);
  async function loadMoreOffers() {
    const after = data?.offers.at(-1)?.model_alias;
    if (!data?.offers_has_more || !after || loadingMoreOffers) return;
    const controller = new AbortController(); moreOffersRequest.current = controller;
    const scope = operationScope.current;
    setLoadingMoreOffers(true); setMoreOffersError('');
    try {
      const page = await request<{data: ProviderOffer[]; next_after: string | null}>(token, `/api/v1/providers/${selected}/offers?limit=100&after=${encodeURIComponent(after)}`, 'GET', undefined, controller.signal);
      if (controller.signal.aborted || scope !== operationScope.current) return;
      if (page.next_after === after || (page.next_after && !page.data.some(item => !data.offers.some(old => old.id === item.id)))) throw new Error('The offer list changed. Refresh before continuing.');
      setData(current => current ? {...current, offers: [...current.offers, ...page.data.filter(item => !current.offers.some(old => old.id === item.id))], offers_has_more: page.next_after !== null} : current);
    } catch (reason) { if (!controller.signal.aborted && scope === operationScope.current) setMoreOffersError(reason instanceof Error ? reason.message : 'Could not load more offers. Try again.'); }
    finally { if (!controller.signal.aborted && scope === operationScope.current) setLoadingMoreOffers(false); }
  }
  async function loadOfferDetails(targetId: string, targetAlias = "", replaceDraft = true, draftAlias = "") {
    offerRequest.current?.abort();
    const controller = new AbortController(); offerRequest.current = controller;
    const sequence = ++offerReadSequence.current, scope = operationScope.current;
    setOfferLoad(previous => ({ token, supplier: selected, scope, offers: previous?.offers ?? [], ready: false, loading: true, conflict: previous?.conflict ?? false }));
    setError("");
    try {
      const result = await request<{ data: AdminData }>(token, `/api/v1/providers/${selected}/administration?days=90`, "GET", undefined, controller.signal);
      if (controller.signal.aborted || sequence !== offerReadSequence.current || scope !== operationScope.current) return;
      // Refresh through the authorized collection before editing an offer beyond the summary cap.
      const seen = new Set<string>();
      while (result.data.offers_has_more && ((targetId || targetAlias) ? !result.data.offers.some(item => targetId ? item.id === targetId : item.model_alias === targetAlias) : true)) {
        const after = result.data.offers.at(-1)?.model_alias;
        if (!after || seen.has(after)) throw new Error('The offer list changed. Reload before saving.');
        seen.add(after);
        const page = await request<{data: ProviderOffer[]; next_after: string | null}>(token, `/api/v1/providers/${selected}/offers?limit=100&after=${encodeURIComponent(after)}`, 'GET', undefined, controller.signal);
        if (controller.signal.aborted || sequence !== offerReadSequence.current || scope !== operationScope.current) return;
        if (page.next_after === after || (page.next_after && !page.data.length)) throw new Error('The offer list changed. Reload before saving.');
        result.data.offers.push(...page.data.filter(item => !result.data.offers.some(old => old.id === item.id)));
        result.data.offers_has_more = page.next_after !== null;
      }
      const offer = result.data.offers.find(item => targetId ? item.id === targetId : item.model_alias === (targetAlias || draftAlias));
      if ((targetId || targetAlias) && (!offer || offer.rate_kind === "media")) throw new Error("The current text rates could not be found. Reload before saving.");
      if (offer?.currency && currency && offer.currency !== currency) throw new Error(uiF("These saved rates use {0}. Publish new {1} terms without copying amounts across currencies.", [offer.currency, currency]));
      const decimal = (value: string) => {
        const amount = BigInt(value), fraction = (amount % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
        return `${amount / 1_000_000_000n}${fraction ? `.${fraction}` : ""}`;
      };
      setData(result.data);
      if (replaceDraft) {
        setAlias(offer?.model_alias ?? draftAlias);
        if (draftAlias && offer) setOfferId(offer.id);
        setInputRate(offer?.prompt_rate != null ? decimal(offer.prompt_rate) : "");
        setCachedInputRate(offer?.cached_prompt_rate != null ? decimal(offer.cached_prompt_rate) : "");
        setOutputRate(offer?.completion_rate != null ? decimal(offer.completion_rate) : "");
      }
      setOfferLoad({ token, supplier: selected, scope, offers: result.data.offers, ready: true, loading: false, conflict: false });
    } catch (reason) {
      if (controller.signal.aborted || sequence !== offerReadSequence.current || scope !== operationScope.current) return;
      setError(reason instanceof Error ? reason.message : "Could not reload agreed rates.");
      setOfferLoad(previous => previous ? { ...previous, ready: false, loading: false } : previous);
    }
  }
  function open(kind: string, selectedOfferId = "", draftAlias = "") {
    dialogOpener.current = offerActionButtons.current.get(selectedOfferId)
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setError("");
    setNotice("");
    setDialog(kind);
    if (kind === "membership") { setOperator(""); setRole("viewer"); setActive("true"); }
    setOfferId(selectedOfferId);
    if (kind === "offer") {
      setOfferLoad(null);
      if (!selectedOfferId) { setAlias(""); setInputRate(""); setCachedInputRate(""); setOutputRate(""); }
      void loadOfferDetails(selectedOfferId, "", true, draftAlias);
    }

    setOfferSnapshot(data?.offers.find(item => item.id === selectedOfferId) ?? null);
    setPaymentSubmitted(false);
    setPaymentKey(crypto.randomUUID());
    setReference("");
    setSettlementPreview(null);
    setSettlementPreviewError("");
    setSettlementCutoff(defaultSettlementCutoff());
    const payable = (data?.balances ?? []).filter(
      balance =>
        /^[A-Z]{3}$/.test(balance.currency) &&
        /^[0-9]+$/.test(balance.unpaid_nanos) &&
        BigInt(balance.unpaid_nanos) > 0n,
    );
    const preferred = payable.find(balance => balance.currency === currency) ?? payable[0];
    setSettlementCurrency(preferred?.currency ?? "");
  }

  const selectedBusiness = businesses.find(item => item.id === selected);
  const sectionTitle = {
    overview: "Overview",
    usage: "Usage",
    members: "Members",
    models: "Models",
    settlements: "Settlements",
  }[section] ?? uiT("Providers");
  const sectionAction =
    section === "members" ? (
      <Button variant="outline" className="header-icon-action" aria-label={uiT("Manage portal access")} title={uiT("Manage portal access")} disabled={!data} onClick={() => open("membership")}>
        <Plus size={16} />
        <span>{uiT("Manage portal access")}</span>
      </Button>
    ) : section === "models" && pricingTab === "text" ? (
      <Button variant="outline" className="header-icon-action" aria-label={uiT("Set agreed rates")} title={uiT("Set agreed rates")} disabled={!data} onClick={() => open("offer")}>
        <Plus size={16} />
        <span>{uiT("Set agreed rates")}</span>
      </Button>
    ) : section === "settlements" ? (
      <Button variant="outline" className="header-icon-action" aria-label={uiT("Record payment")} title={uiT("Record payment")} disabled={!data} onClick={() => open("settlement")}>
        <Plus size={16} />
        <span>{uiT("Record payment")}</span>
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
    if (busy || (dialog === "offer" && (!offerLoad?.ready || offerLoad.loading || offerLoad.conflict || offerLoad.token !== token || offerLoad.supplier !== selected || offerLoad.scope !== operationScope.current))) return;
    const scope = operationScope.current;
    setBusy(true);
    setError("");
    let settlementNotice = "";
    try {
      if (dialog === "membership" && !accounts.some(account => account.id === operator))
        throw new Error("Choose an account to manage Provider access.");
      if (dialog === "membership")
        await request(
          token,
          `/api/v1/providers/${selected}/members/${operator}`,
          "PUT",
          { role, active: active === "true" },
        );
      if (dialog === "offer") {
        const currentOffer = offerLoad?.offers.find((offer) => offer.model_alias === alias);
        await request(token, `/api/v1/providers/${selected}/offers`, "POST", {
          model_alias: alias,
          currency,
          prompt_rate: nanos(inputRate),
          cached_prompt_rate: cachedInputRate.trim() === "" ? null : nanos(cachedInputRate),
          completion_rate: nanos(outputRate),
          ...(currentOffer ? {
            reasoning_completion_rate: currentOffer.reasoning_completion_rate,
            cache_write_prompt_rate: currentOffer.cache_write_prompt_rate,
            context_tiers: currentOffer.context_tiers,
          } : {}),
          expected_revision: currentOffer?.revision ?? null,
        });
      }
      if (dialog === "offer-enable" || dialog === "offer-pause") {
        if (!offerSnapshot || offerSnapshot.id !== offerId) throw new Error("This offer is no longer available. Refresh and try again.");
        if (dialog === "offer-enable") await request(token, `/api/v1/providers/${selected}/offers/${offerId}/authorization`, "PUT", {rate_revision: offerSnapshot.revision});
        else await request(token, `/api/v1/providers/${selected}/offers/${offerId}`, "PATCH", {active:false});
      }
      if (dialog === "settlement") {
        const cutoffMs = settlementCutoffMs(settlementCutoff);
        if (
          !settlementPreview ||
          !settlementCurrency ||
          cutoffMs === null ||
          settlementPreview.currency !== settlementCurrency ||
          settlementPreview.cutoff_ms !== cutoffMs ||
          settlementPreview.entry_count === 0
        )
          throw new Error("Choose a currency and cutoff with unpaid earnings.");
        if (!reference.trim() || /[\u0000-\u001f\u007f]/.test(reference) || new TextEncoder().encode(reference).length > 200)
          throw new Error("Enter a payment reference of at most 200 bytes without control characters.");
        settlementPreviewRequest.current?.abort();
        setSettlementPreviewLoading(false);
        setPaymentSubmitted(true);
        const result = await request<{ data: SettlementResult }>(
          token,
          `/api/v1/providers/${selected}/settlements`,
          "POST",
          {
            idempotency_key: paymentKey,
            payment_reference: reference,
            currency: settlementCurrency,
            cutoff_ms: cutoffMs,
          },
        );
        const recorded = result?.data;
        if (
          recorded &&
          typeof recorded.amount_nanos === "string" &&
          /^[0-9]+$/.test(recorded.amount_nanos) &&
          typeof recorded.entry_count === "number" &&
          Number.isSafeInteger(recorded.entry_count) &&
          recorded.entry_count > 0 &&
          typeof recorded.remaining_unpaid_nanos === "string" &&
          /^[0-9]+$/.test(recorded.remaining_unpaid_nanos)
        ) {
          settlementNotice = uiF(
            "Recorded {0} across {1} unpaid earnings. {2} remains unpaid in {3}. No funds were transferred.",
            [
              money(recorded.amount_nanos, settlementCurrency),
              recorded.entry_count.toLocaleString(readUILocale()),
              money(recorded.remaining_unpaid_nanos, settlementCurrency),
              settlementCurrency,
            ],
          );
        }
      }
      if (scope !== operationScope.current) return;
      setNotice(dialog === "settlement" ? settlementNotice || uiT("External payment recorded. No funds were transferred.")
        : dialog === "offer-enable" ? uiT("Offer enabled. Provider access and customer selling prices remain separate.")
        : dialog === "offer-pause" ? uiT("Offer paused.") : uiT("Provider configuration saved."));
      setDialog("");
      setRevision((value) => value + 1);
    } catch (reason) {
      if (scope !== operationScope.current) return;
      if (dialog === "offer" && reason instanceof ProviderRequestError && reason.status === 409) setOfferLoad(previous => previous ? { ...previous, conflict: true } : previous);
      setError(
        dialog === "offer" && reason instanceof ProviderRequestError && reason.status === 409 ? "These agreed rates changed. Reload the saved rates before saving again." : reason instanceof Error ? reason.message : "Change could not be saved.",
      );
    } finally {
      if (scope === operationScope.current) setBusy(false);
    }
  }
  async function createProvider(input: ProviderConnectionCreate) {
    if (busy) return;
    setBusy(true);
    setError("");
    let committed = false;
    try {
      const created = await request<{ data: { id: string } }>(token, "/api/v1/vendors", "POST", input);
      if (!created?.data?.id || typeof created.data.id !== 'string') throw new Error('Invalid creation response.');
      committed = true;
      // Close immediately after commit: a discovery failure must never invite
      // a second creation of the already persisted business/configuration.
      setDialog("");
      setSearch(current => { current.delete("create"); return current; }, { replace: true });
      setNotice(input.supplier_id ? "API key added. Configure its models to continue setup." : "Provider created. Add models and agreed rates to continue setup.");
      const ownership = await request<{ data: { id: string } }>(token, `/api/v1/vendors/${encodeURIComponent(created.data.id)}/provider`, "GET");
      setSelected(ownership.data.id);
    } catch (reason) {
      setError(committed ? "API key saved, but Provider details could not be opened. Refresh the Provider list." : reason instanceof Error ? reason.message : "Provider could not be created.");
      if (!committed && writeMayHaveCommitted(reason)) {
        setDialog("");
        setSearch(current => { current.delete("create"); return current; }, { replace: true });
        setError("Provider creation could not be confirmed. Refresh the Provider list before creating another key; the previous request may have saved it.");
      } else if (!committed) throw reason;
    } finally {
      if (committed) setRevision(value => value + 1);
      setBusy(false);
    }
  }
  const sectionDescription = {
    overview: internal ? 'Connect an API key and discover models for internal use.' : 'Connect API access and model routes, then manage commercial rates and payments.',
    models: internal ? 'Manage model connections and availability.' : 'Model connections, availability and commercial offers.',
    consumption: 'Provider usage and accrued purchase charges over the last 90 days.',
    settlements: 'Outstanding balances and confirmed payments to this provider.',
    members: 'Grant provider representatives access to their own offers, usage, earnings, and payments.',
  }[section];
  const payableBalances = (data?.balances ?? []).filter(
    balance =>
      /^[A-Z]{3}$/.test(balance.currency) &&
      /^[0-9]+$/.test(balance.unpaid_nanos) &&
      BigInt(balance.unpaid_nanos) > 0n,
  );
  const settlementBalance = payableBalances.find(balance => balance.currency === settlementCurrency);
  const settlementCutoffValue = settlementCutoffMs(settlementCutoff);
  const settlementReady =
    dialog === "settlement" &&
    !settlementPreviewLoading &&
    !settlementPreviewError &&
    settlementPreview !== null &&
    settlementPreview.currency === settlementCurrency &&
    settlementPreview.cutoff_ms === settlementCutoffValue &&
    settlementPreview.entry_count > 0;
  return (
    <>
      <div className="supplier-section-heading"><p>{sectionDescription && uiT(sectionDescription)}</p></div>
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
          {uiT(error)} <Button variant="ghost" size="sm" onClick={() => { setError(""); setRevision(value => value + 1); }}>{uiT("Retry")}</Button>
        </p>
      )}
      {loading || (selected && !data && !error) ? <WorkspaceShellSkeleton label={uiT("Loading providers…")} /> : error && !data ? null : businesses.length === 0 ? (
        <section className="panel provider-access-message">
          <Building2 size={28} aria-hidden="true" />
          <h2>{uiT("No providers yet")}</h2>
          <p>
            {uiT("Add a provider to manage its models, pricing, and payments.")}</p>
          <Button onClick={() => open("create")}><Plus size={16} />{uiT("Add provider")}</Button>
        </section>
      ) : (
        <section className="provider-admin-panel supplier-admin-surface" data-section={section}>
          {section === "overview" && selectedBusiness && <div className="provider-admin-block">
            <div className="provider-admin-section-heading"><h2>{uiT("API connection")}</h2></div>
            <p className="px-6 pb-4 text-sm text-muted-foreground">{internal ? uiT("Niu attempts to discover models when you connect. A saved API key does not verify access to the Provider.") : uiT("Start here to connect models. Saved configuration does not verify the upstream credential or guarantee that a customer can send a request.")}</p>
            <ShadcnTable className="table-fixed [&_td]:whitespace-normal [&_td]:break-words [&_th]:whitespace-normal"><TableHeader><TableRow><TableHead>{uiT("Setup step")}</TableHead><TableHead>{uiT("Status")}</TableHead><TableHead>{uiT("Action")}</TableHead></TableRow></TableHeader><TableBody>
              <TableRow><TableCell>{uiT("1. Connect upstream API key")}</TableCell><TableCell>{selectedBusiness.enabled_api_keys == null ? uiT("Not checked") : uiF("{0} enabled · {1} saved", [selectedBusiness.enabled_api_keys, selectedBusiness.api_keys ?? 0])}</TableCell><TableCell><Button asChild variant="link" className="h-auto whitespace-normal p-0 text-left"><Link to={`/admin/providers/${providerPathSegment(businesses.find(item => item.id === selected) ?? {id:selected})}/keys`}>{!selectedBusiness.api_keys ? uiT("Connect API key") : uiT("Manage API keys")}</Link></Button></TableCell></TableRow>
              <TableRow><TableCell>{internal ? uiT("2. Review discovered models") : uiT("2. Add model routes")}</TableCell><TableCell>{selectedBusiness.enabled_model_routes == null ? uiT("Not checked") : uiF("{0} enabled · {1} saved", [selectedBusiness.enabled_model_routes, selectedBusiness.models ?? 0])}</TableCell><TableCell><Button asChild variant="link" className="h-auto whitespace-normal p-0 text-left"><Link to={`/admin/providers/${providerPathSegment(businesses.find(item => item.id === selected) ?? {id:selected})}/models`}>{internal ? uiT("View models") : uiT("Configure models")}</Link></Button></TableCell></TableRow>
              {!internal && <TableRow><TableCell>{uiT("3. Set customer selling prices")}</TableCell><TableCell>{uiT("Platform-wide prices")}</TableCell><TableCell><Button asChild variant="link" className="h-auto whitespace-normal p-0 text-left"><Link to="/admin/pricing">{uiT("Pricing")}</Link></Button></TableCell></TableRow>}
            </TableBody></ShadcnTable>
            {!internal && <p className="px-6 pt-4 text-sm text-muted-foreground">{uiT("Provider portal access is optional. It lets Provider representatives view their own business records; it does not connect an API key.")}</p>}
          </div>}
          {section === "members" && members.length > 0 && <div className="provider-members-summary">
            <IconUsers size={20} aria-hidden="true" />
            <strong>{members.filter(member => member.active && !member.revoked).length}</strong>
            <span>{uiT("accounts with portal access")}</span>
          </div>}
          {section === "members" && (membersLoading ? <div className="px-6 pb-6"><TableSkeleton columns={4} rows={3} label={uiT("Loading members…")} /></div> : members.length ? <ShadcnTable className="provider-ledger">
            <TableHeader><TableRow><TableHead>{uiT("Account")}</TableHead><TableHead>{uiT("Role")}</TableHead><TableHead>{uiT("Access")}</TableHead><TableHead><span className="sr-only">{uiT("Actions")}</span></TableHead></TableRow></TableHeader>
            <TableBody>{members.map(member => <TableRow key={member.operator_id}>
              <TableCell>{member.name || uiT("Unnamed account")}</TableCell><TableCell>{member.role === "manager" ? uiT("Manager") : uiT("Viewer")}</TableCell><TableCell>{member.revoked ? uiT("Account revoked") : member.active ? uiT("Active") : uiT("Revoked")}</TableCell>
              <TableCell><Button variant="ghost" size="sm" disabled={member.revoked} aria-label={uiF("Edit access for {0}", [member.name || uiT("unnamed account")])} onClick={() => { open("membership"); setOperator(member.operator_id); setRole(member.role); setActive(String(member.active)); }}>{uiT("Edit access")}</Button></TableCell>
            </TableRow>)}</TableBody>
          </ShadcnTable> : !error && <Empty className="supplier-ledger-empty"><EmptyHeader><EmptyMedia variant="icon"><IconUsers size={18} aria-hidden="true" /></EmptyMedia><EmptyTitle>{uiT("No provider portal access granted")}</EmptyTitle><EmptyDescription>{uiT("API keys and model routes work without portal access.")}</EmptyDescription></EmptyHeader></Empty>)}
          {!internal && section === "overview" && <div className="provider-admin-block">
            <div className="provider-admin-section-heading"><h2>{uiT("Model offers")}</h2><Button asChild variant="ghost"><Link to={`/admin/providers/${encodeURIComponent(providerPathSegment(businesses.find(item => item.id === selected) ?? {id:selected}))}/models`}>{uiT("Models")}</Link></Button></div>
            <div className="provider-balance-list"><div className="provider-balance-row">
              <div><span>{data?.offers_has_more ? uiT("Loaded text offers") : uiT("Text offers")}</span><strong>{textOffers.length}</strong></div>
              <div><span>{data?.offers_has_more ? uiT("Loaded media offers") : uiT("Media offers")}</span><strong>{mediaOffers.length}</strong></div>
              <div><span>{data?.offers_has_more ? uiT("Loaded active offers") : uiT("Active offers")}</span><strong>{(data?.offers ?? []).filter(offer => offer.active && offer.route_ready).length}</strong></div>
            </div></div>
          </div>}
          {(section === "overview" || section === "models") && <>
          {section === "models" && <div className="provider-admin-block">
            <Tabs value={pricingTab} onValueChange={setPricingTab}>
            {!internal && <TabsList variant="line" className="mb-4" aria-label={uiT("Provider model section")}><TabsTrigger value="models">{uiT("Models")}</TabsTrigger><TabsTrigger value="text">{uiT("Text rates")}</TabsTrigger><TabsTrigger value="media">{uiT("Media rates")}</TabsTrigger></TabsList>}
            <TabsContent value="models"><ProviderModels token={token} providerId={selected} providerSlug={providerPathSegment(selectedBusiness ?? {id:selected})} canManage={session?.kind === "installation" || !!session?.permissions?.platform_admin} offers={internal ? [] : data?.offers ?? []} offersComplete={!!data && !data.offers_has_more} commercialEnabled={!internal} onEnableOffer={id => open("offer-enable", id)} onOffer={(modelAlias, media) => { if (media) { setPricingTab("media"); setMediaRateModel(modelAlias); } else open("offer", data?.offers.find(offer => offer.model_alias === modelAlias)?.id ?? "", modelAlias); }} onSaved={() => setRevision(value => value + 1)} /></TabsContent>
            <TabsContent value="text">
            {section === "models" && Boolean(textOffers.length) && <div className="flex flex-wrap items-center gap-2 pb-4"><div className="relative w-full min-w-0 sm:max-w-sm"><IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input ref={offerSearch} type="search" className="pl-9" aria-label={uiT("Filter provider models")} placeholder={uiT("Filter by model name…")} value={offerQuery} onChange={event => setOfferQuery(event.target.value)} /></div></div>}
            {textOffers.length ? (
              visibleOffers.length === 0 ? <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><IconSearch size={18} aria-hidden="true" /></EmptyMedia><EmptyTitle>{uiT("No matching models")}</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => { setOfferQuery(""); offerSearch.current?.focus(); }}>{uiT("Clear search")}</Button></EmptyContent></Empty> :
              <div className="table-wrap">
                <ShadcnTable className="provider-ledger supplier-text-offers">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{uiT("Model alias")}</TableHead>
                      <TableHead>{uiT("Input / 1M tokens")}</TableHead>
                      <TableHead>{uiT("Cache read / 1M tokens")}</TableHead>
                      <TableHead>{uiT("Output / 1M tokens")}</TableHead>

                      <TableHead>{uiT("Offer status")}</TableHead>
                      {section === "models" && <TableHead className="supplier-offer-actions"><span className="sr-only">{uiT("Actions")}</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleOffers.map((offer) => (
                      <TableRow key={offer.id}>
                        <TableCell>{offer.model_alias}<dl className="mt-3 grid gap-2 text-sm sm:hidden">
                          <div><dt className="text-xs text-muted-foreground">{uiT("Input / 1M tokens")}</dt><dd>{money(offer.prompt_rate, offer.currency)}</dd></div>
                          <div><dt className="text-xs text-muted-foreground">{uiT("Cache read / 1M tokens")}</dt><dd>{offer.cached_prompt_rate != null ? money(offer.cached_prompt_rate, offer.currency) : uiT("Input rate")}</dd></div>
                          <div><dt className="text-xs text-muted-foreground">{uiT("Output / 1M tokens")}</dt><dd>{money(offer.completion_rate, offer.currency)}</dd></div>

                          <div><dt className="text-xs text-muted-foreground">{uiT("Offer status")}</dt><dd>{offer.active ? offer.route_ready ? uiT("Active") : uiT("Route unavailable") : uiT("Paused")}</dd></div>
                        </dl></TableCell>
                        <TableCell>{money(offer.prompt_rate, offer.currency)}</TableCell>
                        <TableCell>{offer.cached_prompt_rate != null ? money(offer.cached_prompt_rate, offer.currency) : uiT("Input rate")}</TableCell>
                        <TableCell>{money(offer.completion_rate, offer.currency)}</TableCell>

                        <TableCell>{offer.active ? offer.route_ready ? uiT("Active") : uiT("Route unavailable") : uiT("Paused")}</TableCell>
                        {section === "models" && <TableCell className="supplier-offer-actions"><DropdownMenu>
                          <DropdownMenuTrigger asChild><Button ref={element => { if (element) offerActionButtons.current.set(offer.id, element); else offerActionButtons.current.delete(offer.id); }} variant="ghost" size="icon" aria-label={uiF("Actions for {0}", [offer.model_alias])}><Dots size={18} /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => open("offer", offer.id)}>{uiT("Edit rates")}</DropdownMenuItem>
                          {offer.active ? <DropdownMenuItem onSelect={() => open("offer-pause", offer.id)}>{uiT("Pause offer")}</DropdownMenuItem> : <DropdownMenuItem onSelect={() => open("offer-enable", offer.id)}>{uiT("Enable offer")}</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </ShadcnTable>
              </div>
            ) : (
              <div className="provider-empty-state">
                <strong>{uiT("No agreed model rates")}</strong>
              </div>
            )}
            </TabsContent>
            {section === "models" && <TabsContent value="media">
              <div><MediaRateHistory key={selected} token={token} supplier={selected} showConfiguredModels refreshSignal={mediaRateVersion} /></div>
            </TabsContent>}
            </Tabs>
            {!internal && data?.offers_has_more && <div className="py-4 space-y-2"><p className="text-sm text-muted-foreground">{data.offers.length}{" "}{uiT("offers loaded. Counts and filters cover loaded offers only.")}</p>{moreOffersError && <div role="alert"><p>{moreOffersError}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>{uiT("Refresh offers")}</Button></div>}<Button variant="outline" disabled={loadingMoreOffers} onClick={() => void loadMoreOffers()}>{loadingMoreOffers ? uiT("Loading offers…") : moreOffersError ? uiT("Retry loading offers") : uiT("Load more offers")}</Button></div>}
          </div>}
          </>}
          {!internal && (section === "overview" || section === "settlements") && <div className="provider-admin-block">
            <div className="provider-admin-section-heading"><h2>{uiT("Provider payables")}</h2></div>
            <div className="provider-balance-list">
              {data?.balances?.length ? data.balances.map(balance => <div className="provider-balance-row" key={balance.currency}>
                <div><span>{uiT("Accrued ·")}{" "}{balance.currency}</span><strong>{money(balance.earned_nanos,balance.currency)}</strong></div>
                <div><span>{uiT("Unpaid")}</span><strong>{money(balance.unpaid_nanos,balance.currency)}</strong></div>
                <div><span>{uiT("Paid")}</span><strong>{money(balance.paid_nanos,balance.currency)}</strong></div>
              </div>) : <Empty className="provider-inline-empty min-h-32 rounded-xl border border-dashed border-border/60 bg-muted/20 py-6"><EmptyHeader><EmptyMedia variant="icon"><Building2 size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No provider charges recorded yet.")}</EmptyDescription></EmptyHeader></Empty>}
            </div>
          </div>}
          {section === "usage" && <>
            <div className="provider-admin-section-heading"><h2>{uiT("Consumption by model")}</h2><span>{uiT("Last 90 days")}</span></div>
            {data?.consumption?.length ? <div className="table-wrap"><ShadcnTable className="provider-ledger"><TableHeader><TableRow><TableHead>{uiT("Model")}</TableHead><TableHead>{uiT("Requests")}</TableHead><TableHead>{uiT("Input / output tokens")}</TableHead><TableHead>{uiT("Accrued charges")}</TableHead><TableHead>{uiT("Unpaid")}</TableHead></TableRow></TableHeader><TableBody>
              {data.consumption.map(row => <TableRow key={row.revision}><TableCell>{row.model_alias}</TableCell><TableCell>{Number(row.requests).toLocaleString(readUILocale())}</TableCell><TableCell>{(BigInt(row.prompt_tokens) + BigInt(row.completion_tokens)).toLocaleString(readUILocale())} ({BigInt(row.prompt_tokens).toLocaleString(readUILocale())} / {BigInt(row.completion_tokens).toLocaleString(readUILocale())})</TableCell><TableCell>{money(row.amount_nanos,row.currency)}</TableCell><TableCell>{money(row.unpaid_nanos,row.currency)}</TableCell></TableRow>)}
            </TableBody></ShadcnTable></div> : Array.isArray(data?.media_consumption) && data.media_consumption.length === 0 ? <Empty className="supplier-ledger-empty"><EmptyHeader><EmptyMedia variant="icon"><Building2 size={18} aria-hidden="true" /></EmptyMedia><EmptyTitle>{uiT("No consumption in the last 90 days")}</EmptyTitle></EmptyHeader></Empty> : null}
            <MediaConsumption records={data?.media_consumption} administrator />
          </>}
          {section === "settlements" && <>
            <div className="provider-admin-section-heading"><h2>{uiT("Payment history")}</h2></div>
            {data?.settlements?.length ? <div className="table-wrap"><ShadcnTable className="provider-ledger"><TableHeader><TableRow><TableHead>{uiT("Date")}</TableHead><TableHead>{uiT("Payment reference")}</TableHead><TableHead>{uiT("Amount")}</TableHead></TableRow></TableHeader><TableBody>
              {data.settlements.map(row => <TableRow key={row.id}><TableCell>{new Date(row.created_at).toLocaleDateString(readUILocale())}</TableCell><TableCell>{row.payment_reference}</TableCell><TableCell>{money(row.amount_nanos,row.currency)}</TableCell></TableRow>)}
            </TableBody></ShadcnTable></div> : <Empty className="supplier-ledger-empty"><EmptyHeader><EmptyMedia variant="icon"><Building2 size={18} aria-hidden="true" /></EmptyMedia><EmptyTitle>{uiT("No payments recorded")}</EmptyTitle></EmptyHeader></Empty>}
          </>}
        </section>
      )}
      {mediaRateModel !== null && <MediaRatePublisher key={`${selected}:${mediaRateModel}`} token={token} supplier={selected} initialModel={mediaRateModel} onClose={() => setMediaRateModel(null)} onSaved={() => { setMediaRateModel(null); setRevision(value => value + 1); setMediaRateVersion(value => value + 1); setNotice(uiT("Media rate saved.")); }} />}
      <Dialog open={Boolean(dialog)} onOpenChange={(value) => {
          if (!value && !busy) { offerRequest.current?.abort(); offerReadSequence.current += 1; setDialog(""); setSearch(current => { current.delete("create"); return current; }, { replace: true }); }
        }}>
      <DialogContent className="niu-modal vendor-dialog" showCloseButton={false} onCloseAutoFocus={event => {
        const opener = dialogOpener.current;
        if (!opener?.isConnected || opener === document.body) return;
        event.preventDefault();
        opener.focus();
      }}>
        <DialogHeader className="niu-modal-heading flex-row items-start justify-between text-left">
          <div><DialogTitle>{uiT(
          {
            create: "New provider",
            membership: "Manage provider portal access",
            offer: offerId ? "Edit agreed rates" : "Set agreed rates",
            settlement: "Record a confirmed external payment",
            "offer-enable": "Enable offer",
            "offer-pause": "Pause offer",
          }[dialog] ?? "")
        }</DialogTitle><DialogDescription className={dialog === "membership" ? "sr-only" : undefined}>{dialog === "membership" ? uiT("Manage account access to this provider portal.") : dialog === "offer" ? uiT("Provider payments for model usage.") : uiT("Provider management")}</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label={uiT("Close dialog")}><X size={18} /></DialogClose>
        </DialogHeader>
        {error && (
          <p role="alert" className="error-text">
            {uiT(error)}
          </p>
        )}
        {dialog === "offer" && <>
          {offerLoad?.loading && <ListRowsSkeleton rows={2} label={uiT("Loading current agreed rates…")} />}
          {(offerLoad?.conflict || !offerLoad?.ready) && !offerLoad?.loading && <div className="space-y-2"><Button type="button" variant="outline" disabled={busy} onClick={() => void loadOfferDetails(offerId, offerLoad?.conflict ? alias : "", Boolean(offerId) || Boolean(offerLoad?.conflict))}>{uiT("Reload saved rates")}</Button><p className="text-sm text-muted-foreground">{offerId || offerLoad?.conflict ? uiT("Reloading replaces your unsaved changes.") : uiT("Reloading preserves your unsaved values.")}</p></div>}
        </>}
        {dialog === "create" ? <ProviderEditor token={token} connection={null} disabled={busy} onCreate={createProvider} onSave={async () => {}} /> : (<form
          onSubmit={(event) => void submit(event)}
          className="provider-admin-form"
        >
          {dialog === "membership" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="supplier-member-account">{uiT("Account")}</Label>
                <DropdownMenu><DropdownMenuTrigger asChild><Button id="supplier-member-account" variant="outline" className="w-full justify-between font-normal" disabled={accountsLoading || !accounts.length}>{accountsLoading ? uiT("Loading accounts…") : accounts.find(account => account.id === operator)?.name || uiT("Choose account")}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={operator} onValueChange={setOperator}>
                    {accounts.map(account => <DropdownMenuRadioItem key={account.id} value={account.id}>{account.name || uiT("Unnamed account")}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup></DropdownMenuContent>
                </DropdownMenu>
                {!accountsLoading && !accounts.length && !error && <p>{uiT("No active accounts available.")}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-member-role">{uiT("Provider role")}</Label>
                <DropdownMenu><DropdownMenuTrigger asChild><Button id="supplier-member-role" aria-describedby="supplier-member-role-help" variant="outline" className="w-full justify-between font-normal">{role === "viewer" ? uiT("Viewer") : uiT("Manager")}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={role} onValueChange={setRole}>
                    <DropdownMenuRadioItem value="viewer">{uiT("Viewer")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="manager">{uiT("Manager")}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup></DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p id="supplier-member-role-help" className="text-sm text-muted-foreground">{role === "manager" ? uiT("Can view offers, usage, earnings, and payments, and pause or resume existing offers.") : uiT("Can view offers, usage, earnings, and payments.")}{" "}{uiT("Agreed rates, API credentials, and payment recording remain under platform administration.")}</p>
              <div className="grid gap-2">
                <Label htmlFor="supplier-member-access">{uiT("Access")}</Label>
                <DropdownMenu><DropdownMenuTrigger asChild><Button id="supplier-member-access" variant="outline" className="w-full justify-between font-normal">{active === "true" ? uiT("Grant access") : uiT("Revoke access")}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={active} onValueChange={setActive}>
                    <DropdownMenuRadioItem value="true">{uiT("Grant access")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="false">{uiT("Revoke access")}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup></DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p>
                {uiT("Only grant access to an approved provider member. Customer workspace roles do not grant this access automatically.")}</p>
            </>
          )}
          {dialog === "offer" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="supplier-offer-alias">{uiT("Existing upstream model alias")}</Label>
                <Input
                  id="supplier-offer-alias"
                  disabled={busy || offerLoad?.loading}
                  required
                  maxLength={200}
                  value={alias}
                  readOnly={Boolean(offerId)}
                  onChange={(event) => setAlias(event.target.value)}
                />
              </div>
              <p className="text-sm text-muted-foreground">{uiT("Prices in")}{" "}{currency || uiT("the platform currency (configure in Admin)")}.</p>
              <div className="grid gap-2">
                <Label htmlFor="supplier-input-rate">{uiT("Input payout per million tokens")}</Label>
                <Input
                  id="supplier-input-rate"
                  disabled={busy || offerLoad?.loading}
                  required
                  inputMode="decimal"
                  value={inputRate}
                  onChange={(event) => setInputRate(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-cached-input-rate">{uiT("Cache read payout per million tokens")}</Label>
                <Input
                  id="supplier-cached-input-rate"
                  disabled={busy || offerLoad?.loading}
                  inputMode="decimal"
                  aria-describedby="supplier-cached-input-help"
                  value={cachedInputRate}
                  onChange={(event) => setCachedInputRate(event.target.value)}
                />
                <p id="supplier-cached-input-help" className="text-sm text-muted-foreground">{uiT("Leave blank to use the input rate for cached tokens. Zero is a valid rate.")}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-output-rate">{uiT("Output payout per million tokens")}</Label>
                <Input
                  id="supplier-output-rate"
                  disabled={busy || offerLoad?.loading}
                  required
                  inputMode="decimal"
                  value={outputRate}
                  onChange={(event) => setOutputRate(event.target.value)}
                />
              </div>
              <p>
                {uiT("New rates apply to future requests. Existing earnings keep their original rates.")}</p>
            </>
          )}
          {dialog === "settlement" && (
            <>
              <p>
                {uiT("This records an external payment that has already completed. It does not initiate a transfer. Niu includes every unpaid earning in the selected currency through the cutoff.")}</p>
              {payableBalances.length === 0 ? (
                <Empty className="provider-inline-empty min-h-28 rounded-xl border border-dashed border-border/60 bg-muted/20 py-5"><EmptyHeader><EmptyMedia variant="icon"><Building2 size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No unpaid earnings are available to settle.")}</EmptyDescription></EmptyHeader></Empty>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="settlement-currency">{uiT("Currency")}</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          id="settlement-currency"
                          variant="outline"
                          className="w-full justify-between font-normal"
                          disabled={busy || paymentSubmitted}
                        >
                          <span>{settlementCurrency || uiT("Choose currency")}</span>
                          <span className="flex items-center gap-2 text-muted-foreground">
                            {settlementBalance && money(settlementBalance.unpaid_nanos, settlementCurrency)}
                            <ChevronDown size={16} />
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                        <DropdownMenuRadioGroup value={settlementCurrency} onValueChange={setSettlementCurrency}>
                          {payableBalances.map(balance => (
                            <DropdownMenuRadioItem key={balance.currency} value={balance.currency}>
                              {balance.currency} · {money(balance.unpaid_nanos, balance.currency)}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="settlement-cutoff">{uiT("Earnings through")}</Label>
                    <Input
                      id="settlement-cutoff"
                      type="date"
                      required
                      disabled={busy || paymentSubmitted}
                      value={settlementCutoff}
                      onChange={event => setSettlementCutoff(event.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      {uiT("Includes unpaid earnings created on or before this date, through the end of the day in your local time. Later earnings remain unpaid.")}
                    </p>
                  </div>
                  <div className="provider-payment-selection" aria-live="polite" aria-busy={settlementPreviewLoading}>
                    {settlementPreviewLoading && <ListRowsSkeleton rows={1} label={uiT("Calculating unpaid earnings…")} />}
                    {settlementPreviewError && (
                      <div className="space-y-2">
                        <p role="alert">{uiT(settlementPreviewError)}</p>
                        <Button type="button" variant="outline" disabled={busy || paymentSubmitted} onClick={() => setSettlementPreviewReload(value => value + 1)}>
                          {uiT("Retry preview")}
                        </Button>
                      </div>
                    )}
                    {settlementPreview && !settlementPreviewLoading && !settlementPreviewError && (
                      <>
                        <p className="provider-payment-total">
                          <span>{uiF("Unpaid earnings included: {0}", [settlementPreview.entry_count.toLocaleString(readUILocale())])}</span>
                          <strong>{money(settlementPreview.amount_nanos, settlementPreview.currency)}</strong>
                        </p>
                        {settlementPreview.entry_count === 0 ? (
                          <p>{uiT("No unpaid earnings match this cutoff.")}</p>
                        ) : settlementPreview.remaining_entry_count === 0 ? (
                          <p>{uiF("No unpaid earnings remain in {0}.", [settlementPreview.currency])}</p>
                        ) : (
                          <p>{uiF("{0} remains unpaid in {1} across {2} earnings.", [
                            money(settlementPreview.remaining_unpaid_nanos, settlementPreview.currency),
                            settlementPreview.currency,
                            settlementPreview.remaining_entry_count.toLocaleString(readUILocale()),
                          ])}</p>
                        )}
                      </>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="settlement-reference">{uiT("External payment reference")}</Label>
                    <Input
                      id="settlement-reference"
                      required
                      maxLength={200}
                      disabled={busy || paymentSubmitted}
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                    />
                  </div>
                  <p>
                    {uiT("The recorded amount is the exact sum of the unpaid earnings included. After submission, the reference, currency and cutoff are locked so retries record the same payment.")}</p>
                </>
              )}
            </>
          )}
          {(dialog === "offer-enable" || dialog === "offer-pause") && offerSnapshot && <>
            <p>{offerSnapshot.model_alias}</p>
            <p>{dialog === "offer-enable" ? uiT("Enable this offer at its current agreed rates. A working Provider connection, customer selling price and workspace authorization are still required; upstream access is not verified.") : uiT("Pause this offer to stop new requests using it. Existing requests and billing records remain available.")}</p>
            {offerSnapshot.rate_kind !== "media" && <p>{uiT("Input / 1M tokens")}: {money(offerSnapshot.prompt_rate, offerSnapshot.currency)} · {uiT("Output / 1M tokens")}: {money(offerSnapshot.completion_rate, offerSnapshot.currency)}</p>}
            {dialog === "offer-enable" && (offerSnapshot.rate_kind === "media" || offerSnapshot.cached_prompt_rate != null || offerSnapshot.cache_write_prompt_rate != null || offerSnapshot.reasoning_completion_rate != null || !!offerSnapshot.context_tiers?.length) && <p>{uiT("Additional rates or tiers may apply. Review all saved rates before enabling.")}</p>}
          </>}
          <Button
            type="submit"
            variant={dialog === "offer-pause" ? "destructive" : "default"}
            disabled={
              busy ||
              (dialog === "offer" && (!offerLoad?.ready || offerLoad.loading || offerLoad.conflict || offerLoad.token !== token || offerLoad.supplier !== selected || offerLoad.scope !== operationScope.current)) ||
              (dialog === "membership" && (accountsLoading || !operator)) ||
              (dialog === "settlement" && !settlementReady)
            }
          >
            {busy
              ? uiT("Saving…")
              : dialog === "settlement"
                ? uiT("Record confirmed payment")
                : dialog === "offer-enable" ? uiT("Enable offer")
                  : dialog === "offer-pause" ? uiT("Pause offer") : uiT("Save")}
          </Button>
        </form>)}
      </DialogContent>
    </Dialog>
    </>
  );
}

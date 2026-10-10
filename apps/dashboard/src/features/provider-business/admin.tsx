import { IconFilter } from '@tabler/icons-react';
import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconDots as Dots } from "@tabler/icons-react";
import { IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { IconUsers } from "@tabler/icons-react";
import { IconBuildings as Building2 } from "@tabler/icons-react";
import { useDashboardContext } from "@/app/dashboard-context";
import SupplierPropertiesFields from "./SupplierPropertiesFields";
import SupplierEditor, { type VendorCreate } from "@/features/vendors/components/SupplierEditor";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { request } from "@/features/vendors/api";
import { money } from "@/lib/money";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MediaRateHistory from "./MediaRateHistory";
import MediaOfferPublisher from "./MediaOfferPublisher";
import type { SupplierOffer } from "../../../../../sdks/javascript/src/admin";
import type { Operator } from "@/features/operators/api";

type Business = { id: string; name: string; members: number; qualification_status: "qualified" | "unqualified" };
type SupplierMember = { operator_id: string; name: string; role: string; active: boolean; revoked: boolean };
type AdminData = {
  balances: { currency: string; earned_nanos: string; unpaid_nanos: string; paid_nanos: string }[];
  consumption: { model_alias: string; revision: string; currency: string; requests: string; prompt_tokens: string; completion_tokens: string; amount_nanos: string; unpaid_nanos: string }[];
  settlements: { id: string; currency: string; amount_nanos: string; payment_reference: string; created_at: string }[];

  offers: SupplierOffer[];
  earnings: {
    id: string;
    model_alias: string;
    amount_nanos: string;
    currency: string;
    status: string;
    created_at: string;
  }[];
};

function defaultReviewExpiry() {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function reviewExpiryMilliseconds(value: string) {
  const expiry = Date.parse(value);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error("Choose a valid review expiry in the future.");
  }
  return expiry;
}

const sha256Pattern = "[0-9a-f]{64}";

export default function ProviderAdministration() {
  const { session, token } = useDashboardContext();
  if (!(session?.kind === "installation" || session?.permissions.platform_admin) && session?.provider_memberships?.length)
    return <Navigate to={`/suppliers/${session.provider_memberships[0].id}`} replace />;
  if (!(session?.kind === "installation" || session?.permissions.platform_admin))
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
  const { section = "overview", supplierId } = useParams();
  const [loading, setLoading] = useState(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [search, setSearch] = useSearchParams();
  const selected = supplierId ?? search.get('supplier') ?? '';
  const setSelected = (id: string) => setSearch(current => { current.set('supplier', id); current.delete('create'); return current; });

  const [data, setData] = useState<AdminData | null>(null);
  const [members, setMembers] = useState<SupplierMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [offerQuery, setOfferQuery] = useState("");
  const offerSearch = useRef<HTMLInputElement>(null);
  const [pricingTab, setPricingTab] = useState("text");
  useEffect(() => { setOfferQuery(""); }, [selected, section]);
  const [mediaPublishing, setMediaPublishing] = useState(false);
  const [mediaOfferModel, setMediaOfferModel] = useState("");
  const textOffers = (data?.offers ?? []).filter(offer => offer.rate_kind !== "media");
  const mediaOffers = (data?.offers ?? []).filter(offer => offer.rate_kind === "media");
  const visibleOffers = textOffers.filter(offer => section !== "models" || offer.model_alias.toLowerCase().includes(offerQuery.trim().toLowerCase()));
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState("");
  const operationScope = useRef(0);
  const previousSupplier = useRef("");
  useLayoutEffect(() => {
    operationScope.current += 1;
    if (previousSupplier.current) {
      setDialog("");
      setBusy(false);
      setError("");
      setNotice("");
      setMediaPublishing(false);
    }
    previousSupplier.current = selected;
    setData(null);
    setMembers([]);
    return () => { operationScope.current += 1; };
  }, [selected]);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const offerActionButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => { if (search.get('create') === 'supplier') setDialog('create'); else if (search.get('properties') === 'supplier') setDialog('properties'); }, [search]);
  const [operator, setOperator] = useState("");
  const [accounts, setAccounts] = useState<Operator[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  useEffect(() => {
    if (dialog !== "membership") return;
    const controller = new AbortController();
    setAccounts([]);
    setAccountsLoading(true);
    void request<{ data: Operator[] }>(token, "/admin/v1/operators", "GET", undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setAccounts(result.data.filter(account => !account.revoked)); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setAccountsLoading(false); });
    return () => controller.abort();
  }, [dialog, token]);
  useEffect(() => {
    if (section !== "members" || !selected) return;
    const controller = new AbortController();
    setMembers([]);
    setMembersLoading(true);
    void request<{ data: SupplierMember[] }>(token, `/admin/v1/providers/${selected}/members`, "GET", undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setMembers(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setMembersLoading(false); });
    return () => controller.abort();
  }, [section, selected, token, revision]);
  const [role, setRole] = useState("viewer");
  const [active, setActive] = useState("true");
  const [alias, setAlias] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [inputRate, setInputRate] = useState("");
  const [cachedInputRate, setCachedInputRate] = useState("");
  const [outputRate, setOutputRate] = useState("");
  const [reference, setReference] = useState("");
  const [attempts, setAttempts] = useState<string[]>([]);
  const [paymentEarnings, setPaymentEarnings] = useState<AdminData["earnings"]>([]);
  const [earningCursor, setEarningCursor] = useState<string | null>(null);
  const [earningLoading, setEarningLoading] = useState(false);
  const [earningError, setEarningError] = useState("");
  const [earningReload, setEarningReload] = useState(0);
  const earningRequest = useRef<AbortController | null>(null);
  const loadPaymentEarnings = async (before: string | null) => {
    earningRequest.current?.abort();
    const controller = new AbortController();
    earningRequest.current = controller;
    setEarningLoading(true);
    setEarningError("");
    try {
      const page = await request<{ data: AdminData["earnings"]; next_cursor: string | null }>(token,
        `/admin/v1/providers/${selected}/earnings?limit=50${before ? `&before=${encodeURIComponent(before)}` : ""}`,
        "GET", undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(page.data) || !(page.next_cursor === null || typeof page.next_cursor === "string") ||
        (before !== null && page.next_cursor === before) || page.data.some(item =>
          typeof item.id !== "string" || typeof item.model_alias !== "string" ||
          typeof item.currency !== "string" || typeof item.amount_nanos !== "string" || !/^[0-9]+$/.test(item.amount_nanos) ||
          !["accrued", "paid"].includes(item.status) || !Number.isFinite(Date.parse(item.created_at))))
        throw new Error("Earning history could not be read. Please retry.");
      setPaymentEarnings(current => before ? [...current, ...page.data.filter(item => !current.some(saved => saved.id === item.id))] : page.data);
      setEarningCursor(page.next_cursor);
    } catch (reason) {
      if (!controller.signal.aborted) setEarningError(reason instanceof Error ? reason.message : "Earning history could not be loaded.");
    } finally {
      if (!controller.signal.aborted) setEarningLoading(false);
    }
  };
  useEffect(() => {
    setPaymentEarnings([]);
    setEarningCursor(null);
    setEarningError("");
    if (dialog === "settlement") void loadPaymentEarnings(null);
    return () => earningRequest.current?.abort();
  }, [dialog, selected, token, earningReload]);

  const [paymentKey, setPaymentKey] = useState("");
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [notice, setNotice] = useState("");
  const [offerId, setOfferId] = useState("");
  const [validUntil, setValidUntil] = useState(defaultReviewExpiry);
  const [supplyRightsHash, setSupplyRightsHash] = useState("");
  const [supplyCapabilityHash, setSupplyCapabilityHash] = useState("");
  const [supplierDataHandlingHash, setSupplierDataHandlingHash] = useState("");
  const [modelIdentityHash, setModelIdentityHash] = useState("");
  const [protocolMatrixHash, setProtocolMatrixHash] = useState("");
  const [protocolMatrixVersion, setProtocolMatrixVersion] = useState("");
  const [offerDataHandlingHash, setOfferDataHandlingHash] = useState("");
  const [availabilityHash, setAvailabilityHash] = useState("");
  const [agreedRatesHash, setAgreedRatesHash] = useState("");
  const [revocationReasonHash, setRevocationReasonHash] = useState("");
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
  function open(kind: string, selectedOfferId = "") {
    dialogOpener.current = offerActionButtons.current.get(selectedOfferId)
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setError("");
    setNotice("");
    setDialog(kind);
    if (kind === "membership") { setOperator(""); setRole("viewer"); setActive("true"); }
    setOfferId(selectedOfferId);
    if (kind === "offer") {
      const offer = textOffers.find(item => item.id === selectedOfferId);
      const decimal = (value: string) => {
        const amount = BigInt(value);
        const fraction = (amount % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
        return (amount / 1_000_000_000n).toString() + (fraction ? "." + fraction : "");
      };
      setAlias(offer?.model_alias ?? "");
      setCurrency(offer?.currency ?? "USD");
      setInputRate(offer ? decimal(offer.prompt_rate) : "");
      setCachedInputRate(offer?.cached_prompt_rate != null ? decimal(offer.cached_prompt_rate) : "");
      setOutputRate(offer ? decimal(offer.completion_rate) : "");
    }
    setValidUntil(defaultReviewExpiry());
    setSupplyRightsHash("");
    setSupplyCapabilityHash("");
    setSupplierDataHandlingHash("");
    setModelIdentityHash("");
    setProtocolMatrixHash("");
    setProtocolMatrixVersion("");
    setOfferDataHandlingHash("");
    setAvailabilityHash("");
    setAgreedRatesHash("");
    setRevocationReasonHash("");
    setPaymentSubmitted(false);
    setPaymentKey(crypto.randomUUID());
    setReference("");
    setAttempts([]);
  }

  const selectedBusiness = businesses.find(item => item.id === selected);
  const supplierQualified = selectedBusiness?.qualification_status === "qualified";
  const sectionTitle = {
    overview: "Overview",
    consumption: "Usage",
    members: "Portal access",
    models: "Models & pricing",
    settlements: "Settlements",
  }[section] ?? "Suppliers";
  const sectionAction =
    section === "members" ? (
      <Button variant="outline" className="header-icon-action" aria-label="Manage portal access" title="Manage portal access" disabled={!data} onClick={() => open("membership")}>
        <Plus size={16} />
        <span>Manage portal access</span>
      </Button>
    ) : section === "models" && pricingTab === "text" ? (
      <Button variant="outline" className="header-icon-action" aria-label="Set agreed rates" title="Set agreed rates" disabled={!data} onClick={() => open("offer")}>
        <Plus size={16} />
        <span>Set agreed rates</span>
      </Button>
    ) : section === "models" && pricingTab === "media" ? (
      <Button variant="outline" className="header-icon-action" aria-label="Set up media offer" title="Set up media offer" disabled={!data} onClick={() => { setMediaOfferModel(""); setMediaPublishing(true); }}><Plus size={16} /><span>Set up media offer</span></Button>
    ) : section === "settlements" ? (
      <Button variant="outline" className="header-icon-action" aria-label="Record payment" title="Record payment" disabled={!data} onClick={() => open("settlement")}>
        <Plus size={16} />
        <span>Record payment</span>
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
    const scope = operationScope.current;
    setBusy(true);
    setError("");
    try {
      const validUntilMs = dialog.includes("qualification")
        ? reviewExpiryMilliseconds(validUntil)
        : undefined;
      if (dialog === "membership" && !accounts.some(account => account.id === operator))
        throw new Error("Choose an account to manage Supplier access.");
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
          cached_prompt_rate: cachedInputRate.trim() === "" ? null : nanos(cachedInputRate),
          completion_rate: nanos(outputRate),
          expected_revision:
            data?.offers.find((offer) => offer.model_alias === alias)
              ?.revision ?? null,
        });
      if (dialog === "supplier-qualification")
        await request(token, `/admin/v1/providers/${selected}/qualification`, "PUT", {
          supply_rights_sha256: supplyRightsHash,
          supply_capability_sha256: supplyCapabilityHash,
          data_handling_sha256: supplierDataHandlingHash,
          valid_until_ms: validUntilMs,
        });
      if (dialog === "offer-qualification") {
        const offer = data?.offers.find((item) => item.id === offerId);
        if (!offer) throw new Error("This offer is no longer available. Refresh and try again.");
        await request(token, `/admin/v1/providers/${selected}/offers/${offerId}/qualification`, "PUT", {
          rate_revision: offer.revision,
          model_identity_sha256: modelIdentityHash,
          protocol_matrix_sha256: protocolMatrixHash,
          protocol_matrix_version: protocolMatrixVersion,
          data_handling_sha256: offerDataHandlingHash,
          availability_sha256: availabilityHash,
          agreed_rates_sha256: agreedRatesHash,
          valid_until_ms: validUntilMs,
        });
      }
      if (dialog === "supplier-revocation")
        await request(token, `/admin/v1/providers/${selected}/qualification/revoke`, "POST", {
          reason_sha256: revocationReasonHash,
        });
      if (dialog === "offer-revocation")
        await request(token, `/admin/v1/providers/${selected}/offers/${offerId}/qualification/revoke`, "POST", {
          reason_sha256: revocationReasonHash,
        });
      if (dialog === "settlement") {
        const selectedEarnings = paymentEarnings.filter(item => attempts.includes(item.id));
        if (!attempts.length || attempts.length > 1000 || new Set(attempts).size !== attempts.length ||
          selectedEarnings.length !== attempts.length || selectedEarnings.some(item => item.status !== "accrued") ||
          new Set(selectedEarnings.map(item => item.currency)).size !== 1)
          throw new Error("Select up to 1,000 unpaid earnings in one currency.");
        if (!reference.trim() || /[\u0000-\u001f\u007f]/.test(reference) || new TextEncoder().encode(reference).length > 200)
          throw new Error("Enter a payment reference of at most 200 bytes without control characters.");
        setPaymentSubmitted(true);
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
      }
      if (scope !== operationScope.current) return;
      setNotice(dialog === "settlement"
        ? "External payment recorded. No funds were transferred."
        : dialog === "supplier-qualification" || dialog === "offer-qualification"
          ? "Qualification review recorded. No discount or model-equivalence claim is implied."
          : dialog === "supplier-revocation" || dialog === "offer-revocation"
            ? "Qualification review revoked; affected offers are paused."
            : "Supplier configuration saved.");
      setDialog("");
      setRevision((value) => value + 1);
    } catch (reason) {
      if (scope !== operationScope.current) return;
      setError(
        reason instanceof Error ? reason.message : "Change could not be saved.",
      );
    } finally {
      if (scope === operationScope.current) setBusy(false);
    }
  }
  async function createSupplier(input: VendorCreate) {
    if (busy) return;
    setBusy(true);
    setError("");
    let committed = false;
    try {
      const created = await request<{ data: { id: string } }>(token, "/admin/v1/vendors", "POST", input);
      committed = true;
      // Close immediately after commit: a discovery failure must never invite
      // a second creation of the already persisted business/configuration.
      setDialog("");
      setSearch(current => { current.delete("create"); return current; }, { replace: true });
      setNotice(input.supplier_id ? "API key added. Configure its models to continue setup." : "Supplier created. Add models and agreed rates to continue setup.");
      const ownership = await request<{ data: { id: string } }>(token, `/admin/v1/vendors/${encodeURIComponent(created.data.id)}/supplier`, "GET");
      setSelected(ownership.data.id);
    } catch (reason) {
      setError(committed ? "API key saved, but Supplier details could not be opened. Refresh the Supplier list." : reason instanceof Error ? reason.message : "Supplier could not be created.");
      if (!committed) throw reason;
    } finally {
      if (committed) setRevision(value => value + 1);
      setBusy(false);
    }
  }
  const sectionDescription = {
    overview: 'Supply readiness, qualification, and outstanding payments.',
    models: 'Agreed purchase rates and qualification for the models this supplier offers.',
    consumption: 'Supplier usage and accrued purchase charges over the last 90 days.',
    settlements: 'Outstanding balances and confirmed payments to this supplier.',
    members: 'Grant supplier representatives access to their own offers, usage, earnings, and payments.',
  }[section];
  return (
    <>
      <div className="supplier-section-heading"><h2>{sectionTitle}</h2><p>{sectionDescription}</p></div>
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
          {error} <Button variant="ghost" size="sm" onClick={() => { setError(""); setRevision(value => value + 1); }}>Retry</Button>
        </p>
      )}
      {loading || (selected && !data && !error) ? <section className="panel provider-access-message" role="status">Loading suppliers…</section> : error && !data ? null : businesses.length === 0 ? (
        <section className="panel provider-access-message">
          <Building2 size={28} aria-hidden="true" />
          <h2>No suppliers yet</h2>
          <p>
            Add a supplier to manage its models, pricing, and payments.
          </p>
          <Button onClick={() => open("create")}><Plus size={16} />Add supplier</Button>
        </section>
      ) : (
        <section className="provider-admin-panel supplier-admin-surface" data-section={section}>
          {section === "members" && members.length > 0 && <div className="provider-members-summary">
            <IconUsers size={20} aria-hidden="true" />
            <strong>{members.length}</strong>
            <span>accounts with portal access</span>
          </div>}
          {section === "members" && (membersLoading ? <p role="status" className="px-6 pb-6">Loading members…</p> : members.length ? <ShadcnTable className="provider-ledger">
            <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Role</TableHead><TableHead>Access</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{members.map(member => <TableRow key={member.operator_id}>
              <TableCell>{member.name || "Unnamed account"}</TableCell><TableCell>{member.role === "manager" ? "Manager" : "Viewer"}</TableCell><TableCell>{member.revoked ? "Account revoked" : member.active ? "Active" : "Revoked"}</TableCell>
              <TableCell><Button variant="ghost" size="sm" disabled={member.revoked} aria-label={`Edit access for ${member.name || "unnamed account"}`} onClick={() => { open("membership"); setOperator(member.operator_id); setRole(member.role); setActive(String(member.active)); }}>Edit access</Button></TableCell>
            </TableRow>)}</TableBody>
          </ShadcnTable> : !error && <Empty className="supplier-ledger-empty"><EmptyHeader><EmptyTitle>No supplier portal access granted</EmptyTitle><EmptyDescription>API keys and model routes work without portal access.</EmptyDescription></EmptyHeader></Empty>)}
          {section === "overview" && <div className="provider-admin-block">
            <div className="provider-admin-section-heading"><h2>Model offers</h2><Button asChild variant="ghost"><Link to={`/admin/suppliers/${encodeURIComponent(selected)}/models`}>Models & pricing</Link></Button></div>
            <div className="provider-balance-list"><div className="provider-balance-row">
              <div><span>Text offers</span><strong>{textOffers.length}</strong></div>
              <div><span>Media offers</span><strong>{mediaOffers.length}</strong></div>
              <div><span>Active offers</span><strong>{(data?.offers ?? []).filter(offer => offer.active && offer.route_ready).length}</strong></div>
            </div></div>
          </div>}
          {(section === "overview" || section === "models") && <>
          <div className={section === "models" ? "supplier-qualification-strip" : "provider-admin-block"}>
            <div className="provider-admin-section-heading">
              <h2>{section === "models" ? "Supply readiness" : "Supplier qualification"}</h2>
              <Badge variant={supplierQualified ? "default" : "secondary"}>
                {supplierQualified ? "Qualified" : "Qualification required"}
              </Badge>
            </div>
            <div className="provider-qualification-content">
              <p>{section === "models" ? "Supplier qualification and an offer review are required before activation." : "Review supply rights, capabilities, and data handling before enabling offers. Model offers and their agreed rates are reviewed separately."}</p>
              <div className="provider-qualification-actions">
                <Button variant="outline" onClick={() => open("supplier-qualification")}>Review Supplier</Button>
                {supplierQualified && <Button variant="outline" onClick={() => open("supplier-revocation")}>Revoke review</Button>}
              </div>
            </div>
          </div>
          {section === "models" && <div className="provider-admin-block">
            <Tabs value={pricingTab} onValueChange={setPricingTab}>
            {section === "models" && <TabsList variant="line" className="mx-6 mb-4" aria-label="Supplier pricing category"><TabsTrigger value="text">Text rates</TabsTrigger><TabsTrigger value="media">Media rates</TabsTrigger></TabsList>}
            <TabsContent value="text">
            {section === "models" && Boolean(textOffers.length) && <div className="px-6 pb-4"><div className="flex min-w-0 w-full max-w-sm items-center gap-2"><IconFilter size={17} className="shrink-0"/><Input ref={offerSearch} aria-label="Filter supplier models" placeholder="Filter by model name…" value={offerQuery} onChange={event => setOfferQuery(event.target.value)} /></div></div>}
            {textOffers.length ? (
              visibleOffers.length === 0 ? <Empty className="min-h-60"><EmptyHeader><EmptyTitle>No matching models</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => { setOfferQuery(""); offerSearch.current?.focus(); }}>Clear search</Button></EmptyContent></Empty> :
              <div className="table-wrap">
                <ShadcnTable className="provider-ledger supplier-text-offers">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model alias</TableHead>
                      <TableHead>Input / 1M tokens</TableHead>
                      <TableHead>Cache read / 1M tokens</TableHead>
                      <TableHead>Output / 1M tokens</TableHead>
                      <TableHead>Qualification</TableHead>
                      <TableHead>Offer status</TableHead>
                      {section === "models" && <TableHead className="supplier-offer-actions"><span className="sr-only">Actions</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleOffers.map((offer) => (
                      <TableRow key={offer.id}>
                        <TableCell>{offer.model_alias}<dl className="mt-3 grid gap-2 text-sm sm:hidden">
                          <div><dt className="text-xs text-muted-foreground">Input / 1M tokens</dt><dd>{money(offer.prompt_rate, offer.currency)}</dd></div>
                          <div><dt className="text-xs text-muted-foreground">Cache read / 1M tokens</dt><dd>{offer.cached_prompt_rate != null ? money(offer.cached_prompt_rate, offer.currency) : "Input rate"}</dd></div>
                          <div><dt className="text-xs text-muted-foreground">Output / 1M tokens</dt><dd>{money(offer.completion_rate, offer.currency)}</dd></div>
                          <div><dt className="text-xs text-muted-foreground">Qualification</dt><dd>{offer.qualified ? "Qualified" : "Review required"}</dd></div>
                          <div><dt className="text-xs text-muted-foreground">Offer status</dt><dd>{offer.active ? offer.route_ready ? "Active" : "Route unavailable" : "Paused"}</dd></div>
                        </dl></TableCell>
                        <TableCell>{money(offer.prompt_rate, offer.currency)}</TableCell>
                        <TableCell>{offer.cached_prompt_rate != null ? money(offer.cached_prompt_rate, offer.currency) : "Input rate"}</TableCell>
                        <TableCell>{money(offer.completion_rate, offer.currency)}</TableCell>
                        <TableCell><Badge variant={offer.qualified ? "default" : "secondary"}>{offer.qualified ? "Qualified" : "Review required"}</Badge></TableCell>
                        <TableCell>{offer.active ? offer.route_ready ? "Active" : "Route unavailable" : "Paused"}</TableCell>
                        {section === "models" && <TableCell className="supplier-offer-actions"><DropdownMenu>
                          <DropdownMenuTrigger asChild><Button ref={element => { if (element) offerActionButtons.current.set(offer.id, element); else offerActionButtons.current.delete(offer.id); }} variant="ghost" size="icon" aria-label={`Actions for ${offer.model_alias}`}><Dots size={18} /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => open("offer", offer.id)}>Edit rates</DropdownMenuItem>
                          {!offer.qualified
                            ? <DropdownMenuItem disabled={!supplierQualified} onSelect={() => open("offer-qualification", offer.id)}>Review offer</DropdownMenuItem>
                            : <DropdownMenuItem onSelect={() => open("offer-revocation", offer.id)}>Revoke review</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </ShadcnTable>
              </div>
            ) : (
              <div className="provider-empty-state">
                <strong>No agreed model rates</strong>
              </div>
            )}
            </TabsContent>
            {section === "models" && <TabsContent value="media">
              {mediaOffers.length > 0 && <div className="table-wrap mb-6"><ShadcnTable className="provider-ledger"><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Qualification</TableHead><TableHead>Offer status</TableHead><TableHead className="supplier-offer-actions"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{mediaOffers.map(offer => <TableRow key={offer.id}><TableCell>{offer.model_alias}</TableCell><TableCell><Badge variant={offer.qualified ? "default" : "secondary"}>{offer.qualified ? "Qualified" : "Review required"}</Badge></TableCell><TableCell>{offer.active ? offer.route_ready ? "Active" : "Route unavailable" : "Paused"}</TableCell><TableCell className="supplier-offer-actions"><DropdownMenu><DropdownMenuTrigger asChild><Button ref={element => { if (element) offerActionButtons.current.set(offer.id, element); else offerActionButtons.current.delete(offer.id); }} variant="ghost" size="icon" aria-label={`Actions for ${offer.model_alias}`}><Dots size={18} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setMediaOfferModel(offer.model_alias); setMediaPublishing(true); }}>Update configuration</DropdownMenuItem>{!offer.qualified ? <DropdownMenuItem disabled={!supplierQualified} onSelect={() => open("offer-qualification", offer.id)}>Review offer</DropdownMenuItem> : <DropdownMenuItem onSelect={() => open("offer-revocation", offer.id)}>Revoke review</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></ShadcnTable></div>}
              <div className="px-6"><MediaRateHistory key={selected} token={token} supplier={selected} /></div>
            </TabsContent>}
            </Tabs>
          </div>}
          </>}
          {(section === "overview" || section === "settlements") && <div className="provider-admin-block">
            <div className="provider-admin-section-heading"><h2>Supplier payables</h2></div>
            <div className="provider-balance-list">
              {data?.balances?.length ? data.balances.map(balance => <div className="provider-balance-row" key={balance.currency}>
                <div><span>Accrued · {balance.currency}</span><strong>{money(balance.earned_nanos,balance.currency)}</strong></div>
                <div><span>Unpaid</span><strong>{money(balance.unpaid_nanos,balance.currency)}</strong></div>
                <div><span>Paid</span><strong>{money(balance.paid_nanos,balance.currency)}</strong></div>
              </div>) : <p className="provider-inline-empty">No supplier charges recorded yet.</p>}
            </div>
          </div>}
          {section === "consumption" && <>
            <div className="provider-admin-section-heading"><h2>Consumption by model</h2><span>Last 90 days</span></div>
            {data?.consumption?.length ? <div className="table-wrap"><ShadcnTable className="provider-ledger"><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Requests</TableHead><TableHead>Input / output tokens</TableHead><TableHead>Accrued charges</TableHead><TableHead>Unpaid</TableHead></TableRow></TableHeader><TableBody>
              {data.consumption.map(row => <TableRow key={row.revision}><TableCell>{row.model_alias}</TableCell><TableCell>{Number(row.requests).toLocaleString()}</TableCell><TableCell>{Number(row.prompt_tokens).toLocaleString()} / {Number(row.completion_tokens).toLocaleString()}</TableCell><TableCell>{money(row.amount_nanos,row.currency)}</TableCell><TableCell>{money(row.unpaid_nanos,row.currency)}</TableCell></TableRow>)}
            </TableBody></ShadcnTable></div> : <Empty className="supplier-ledger-empty"><EmptyHeader><EmptyTitle>No consumption in the last 90 days</EmptyTitle></EmptyHeader></Empty>}
          </>}
          {section === "settlements" && <>
            <div className="provider-admin-section-heading"><h2>Payment history</h2></div>
            {data?.settlements?.length ? <div className="table-wrap"><ShadcnTable className="provider-ledger"><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Payment reference</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>
              {data.settlements.map(row => <TableRow key={row.id}><TableCell>{new Date(row.created_at).toLocaleDateString()}</TableCell><TableCell>{row.payment_reference}</TableCell><TableCell>{money(row.amount_nanos,row.currency)}</TableCell></TableRow>)}
            </TableBody></ShadcnTable></div> : <Empty className="supplier-ledger-empty"><EmptyHeader><EmptyTitle>No payments recorded</EmptyTitle></EmptyHeader></Empty>}
          </>}
        </section>
      )}
      {mediaPublishing && <MediaOfferPublisher key={selected} token={token} supplier={selected} initialModel={mediaOfferModel} onClose={() => setMediaPublishing(false)} onSaved={() => { setMediaPublishing(false); setRevision(value => value + 1); setNotice("Media offer saved. Review is required before activation."); }} />}
      <Dialog open={Boolean(dialog)} onOpenChange={(value) => {
          if (!value && !busy) { setDialog(""); setSearch(current => { current.delete("create"); current.delete("properties"); return current; }, { replace: true }); }
        }}>
      <DialogContent className="niu-modal vendor-dialog" showCloseButton={false} onCloseAutoFocus={event => {
        const opener = dialogOpener.current;
        if (!opener?.isConnected || opener === document.body) return;
        event.preventDefault();
        opener.focus();
      }}>
        <DialogHeader className="niu-modal-heading flex-row items-start justify-between text-left">
          <div><DialogTitle>{
          {
            create: "New supplier",
            properties: "Supplier properties",
            membership: "Manage supplier portal access",
            offer: offerId ? "Edit agreed rates" : "Set agreed rates",
            settlement: "Record a confirmed external payment",
            "supplier-qualification": "Review Supplier qualification",
            "offer-qualification": "Review offer qualification",
            "supplier-revocation": "Revoke Supplier qualification",
            "offer-revocation": "Revoke offer qualification",
          }[dialog] ?? ""
        }</DialogTitle><DialogDescription className={dialog === "membership" ? "sr-only" : undefined}>{dialog === "membership" ? "Manage account access to this supplier portal." : dialog === "offer" ? "Supplier payments for model usage." : dialog.includes("qualification") || dialog.includes("revocation") ? "Installation-only evidence review" : "Supplier management"}</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {dialog === "create" ? <SupplierEditor token={token} vendor={null} disabled={busy} onCreate={createSupplier} onSave={async () => {}} /> : dialog === "properties" ? <SupplierPropertiesFields supplierId={selected} supplierName={selectedBusiness?.name ?? ""} token={token} /> : (<form
          onSubmit={(event) => void submit(event)}
          className="provider-admin-form"
        >
          {dialog === "membership" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="supplier-member-account">Account</Label>
                <DropdownMenu><DropdownMenuTrigger asChild><Button id="supplier-member-account" variant="outline" className="w-full justify-between font-normal" disabled={accountsLoading || !accounts.length}>{accountsLoading ? "Loading accounts…" : accounts.find(account => account.id === operator)?.name || "Choose account"}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={operator} onValueChange={setOperator}>
                    {accounts.map(account => <DropdownMenuRadioItem key={account.id} value={account.id}>{account.name || "Unnamed account"}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup></DropdownMenuContent>
                </DropdownMenu>
                {!accountsLoading && !accounts.length && !error && <p>No active accounts available.</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-member-role">Supplier role</Label>
                <DropdownMenu><DropdownMenuTrigger asChild><Button id="supplier-member-role" aria-describedby="supplier-member-role-help" variant="outline" className="w-full justify-between font-normal">{role === "viewer" ? "Viewer" : "Manager"}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={role} onValueChange={setRole}>
                    <DropdownMenuRadioItem value="viewer">Viewer</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="manager">Manager</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup></DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p id="supplier-member-role-help" className="text-sm text-muted-foreground">{role === "manager" ? "Can view offers, usage, earnings, and payments, and pause or resume existing offers." : "Can view offers, usage, earnings, and payments."} Agreed rates, API credentials, and payment recording remain under platform administration.</p>
              <div className="grid gap-2">
                <Label htmlFor="supplier-member-access">Access</Label>
                <DropdownMenu><DropdownMenuTrigger asChild><Button id="supplier-member-access" variant="outline" className="w-full justify-between font-normal">{active === "true" ? "Grant access" : "Revoke access"}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={active} onValueChange={setActive}>
                    <DropdownMenuRadioItem value="true">Grant access</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="false">Revoke access</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup></DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p>
                Only grant access to an approved supplier member. Customer
                workspace roles do not grant this access automatically.
              </p>
            </>
          )}
          {dialog === "offer" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="supplier-offer-alias">Existing upstream model alias</Label>
                <Input
                  id="supplier-offer-alias"
                  required
                  maxLength={200}
                  value={alias}
                  readOnly={Boolean(offerId)}
                  onChange={(event) => setAlias(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-offer-currency">Currency</Label>
                <Input
                  id="supplier-offer-currency"
                  required
                  pattern="[A-Z]{3}"
                  maxLength={3}
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value.toUpperCase())
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-input-rate">Input payout per million tokens</Label>
                <Input
                  id="supplier-input-rate"
                  required
                  inputMode="decimal"
                  value={inputRate}
                  onChange={(event) => setInputRate(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-cached-input-rate">Cache read payout per million tokens</Label>
                <Input
                  id="supplier-cached-input-rate"
                  inputMode="decimal"
                  aria-describedby="supplier-cached-input-help"
                  value={cachedInputRate}
                  onChange={(event) => setCachedInputRate(event.target.value)}
                />
                <p id="supplier-cached-input-help" className="text-sm text-muted-foreground">Leave blank to use the input rate for cached tokens. Zero is a valid rate.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-output-rate">Output payout per million tokens</Label>
                <Input
                  id="supplier-output-rate"
                  required
                  inputMode="decimal"
                  value={outputRate}
                  onChange={(event) => setOutputRate(event.target.value)}
                />
              </div>
              <p>
                New rates apply to future requests. Existing earnings keep
                their original rates.
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
                  disabled={busy || paymentSubmitted}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </label>
              <fieldset className="provider-payment-selection">
                <legend>Select unpaid earnings</legend>
                <div className="provider-payment-entries">
                  {paymentEarnings
                    .filter((item) => item.status === "accrued")
                    .map((item) => (
                      <label key={item.id}>
                        <Checkbox
                          disabled={busy || paymentSubmitted}
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
                          <small>{new Date(item.created_at).toLocaleString()}</small>
                        </span>
                        <strong>
                          {money(item.amount_nanos, item.currency)}
                        </strong>
                      </label>
                    ))}
                  {!paymentEarnings.some(
                    (item) => item.status === "accrued",
                  ) && !earningLoading && !earningError && <p>No unpaid earnings in the loaded history.</p>}
                </div>
                {earningLoading && <p role="status">Loading earnings…</p>}
                {earningError && <p role="alert">{earningError}</p>}
                {earningError ? <Button type="button" variant="outline" disabled={busy || paymentSubmitted || earningLoading} onClick={() => earningCursor ? void loadPaymentEarnings(earningCursor) : setEarningReload(value => value + 1)}>Retry earnings</Button> : earningCursor && <Button type="button" variant="outline" disabled={busy || paymentSubmitted || earningLoading} onClick={() => void loadPaymentEarnings(earningCursor)}>Older earnings</Button>}
              </fieldset>
              <p className="provider-payment-total">
                {attempts.length} requests selected
                {[
                  ...new Set(
                    paymentEarnings
                      .filter((item) => attempts.includes(item.id))
                      .map((item) => item.currency),
                  ),
                ].map((code) => (
                  <strong key={code}>
                    {money(
                      (
                        paymentEarnings
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
                After submission, the reference and selection are locked so retries record the same payment.
              </p>
            </>
          )}
          {dialog === "supplier-qualification" && <>
            <p>Enter fingerprints for the evidence reviewed in the confidential procurement system. Lowercase SHA-256 values are required; do not paste or upload the source documents here.</p>
            <Label htmlFor="supplier-rights-hash">Supply-rights evidence SHA-256</Label>
            <Input id="supplier-rights-hash" required pattern={sha256Pattern} maxLength={64} minLength={64} autoComplete="off" placeholder="64 lowercase hexadecimal characters" value={supplyRightsHash} onChange={event => setSupplyRightsHash(event.target.value)} />
            <Label htmlFor="supplier-capability-hash">Supply-capability evidence SHA-256</Label>
            <Input id="supplier-capability-hash" required pattern={sha256Pattern} maxLength={64} minLength={64} autoComplete="off" placeholder="64 lowercase hexadecimal characters" value={supplyCapabilityHash} onChange={event => setSupplyCapabilityHash(event.target.value)} />
            <Label htmlFor="supplier-data-handling-hash">Data-handling evidence SHA-256</Label>
            <Input id="supplier-data-handling-hash" required pattern={sha256Pattern} maxLength={64} minLength={64} autoComplete="off" placeholder="64 lowercase hexadecimal characters" value={supplierDataHandlingHash} onChange={event => setSupplierDataHandlingHash(event.target.value)} />
            <Label htmlFor="supplier-qualification-expiry">Review valid until</Label>
            <Input id="supplier-qualification-expiry" type="datetime-local" required value={validUntil} onChange={event => setValidUntil(event.target.value)} />
            <p>Qualification status records an administrator’s review. It does not independently verify resale rights or establish a discounted customer price.</p>
          </>}
          {dialog === "offer-qualification" && <>
            <p>Review the model and the currently agreed-rate revision. A rate change clears this review and pauses the offer until it is reviewed again.</p>
            <Label htmlFor="offer-model-identity-hash">Model-identity evidence SHA-256</Label>
            <Input id="offer-model-identity-hash" required pattern={sha256Pattern} maxLength={64} minLength={64} autoComplete="off" placeholder="64 lowercase hexadecimal characters" value={modelIdentityHash} onChange={event => setModelIdentityHash(event.target.value)} />
            <Label htmlFor="offer-protocol-matrix-hash">Protocol test-matrix SHA-256</Label>
            <Input id="offer-protocol-matrix-hash" required pattern={sha256Pattern} maxLength={64} minLength={64} autoComplete="off" placeholder="64 lowercase hexadecimal characters" value={protocolMatrixHash} onChange={event => setProtocolMatrixHash(event.target.value)} />
            <Label htmlFor="offer-protocol-matrix-version">Protocol matrix version</Label>
            <Input id="offer-protocol-matrix-version" required maxLength={100} value={protocolMatrixVersion} onChange={event => setProtocolMatrixVersion(event.target.value)} />
            <Label htmlFor="offer-data-handling-hash">Offer data-handling evidence SHA-256</Label>
            <Input id="offer-data-handling-hash" required pattern={sha256Pattern} maxLength={64} minLength={64} autoComplete="off" placeholder="64 lowercase hexadecimal characters" value={offerDataHandlingHash} onChange={event => setOfferDataHandlingHash(event.target.value)} />
            <Label htmlFor="offer-availability-hash">Availability evidence SHA-256</Label>
            <Input id="offer-availability-hash" required pattern={sha256Pattern} maxLength={64} minLength={64} autoComplete="off" placeholder="64 lowercase hexadecimal characters" value={availabilityHash} onChange={event => setAvailabilityHash(event.target.value)} />
            <Label htmlFor="offer-agreed-rates-hash">Agreed-rate evidence SHA-256</Label>
            <Input id="offer-agreed-rates-hash" required pattern={sha256Pattern} maxLength={64} minLength={64} autoComplete="off" placeholder="64 lowercase hexadecimal characters" value={agreedRatesHash} onChange={event => setAgreedRatesHash(event.target.value)} />
            <Label htmlFor="offer-qualification-expiry">Review valid until</Label>
            <Input id="offer-qualification-expiry" type="datetime-local" required value={validUntil} onChange={event => setValidUntil(event.target.value)} />
            <p>The current rate revision is attached automatically. Its internal reference is not displayed. A qualified status is not a claim of model equivalence or discount.</p>
          </>}
          {(dialog === "supplier-revocation" || dialog === "offer-revocation") && <>
            <p>{dialog === "supplier-revocation" ? "Revoking this Supplier review pauses all of its offers." : "Revoking this offer review pauses this offer."} Store the detailed reason in the confidential procurement system; Niu records only its SHA-256 fingerprint.</p>
            <Label htmlFor="qualification-revocation-reason">Revocation reason SHA-256</Label>
            <Input id="qualification-revocation-reason" required pattern={sha256Pattern} maxLength={64} minLength={64} autoComplete="off" placeholder="64 lowercase hexadecimal characters" value={revocationReasonHash} onChange={event => setRevocationReasonHash(event.target.value)} />
          </>}
          <Button
            type="submit"
            variant={dialog.includes("revocation") ? "destructive" : "default"}
            disabled={
              busy ||
              (dialog === "membership" && (accountsLoading || !operator)) ||
              (dialog === "settlement" &&
                (attempts.length === 0 ||
                  new Set(
                    paymentEarnings
                      .filter((item) => attempts.includes(item.id))
                      .map((item) => item.currency),
                  ).size !== 1))
            }
          >
            {busy
              ? "Saving…"
              : dialog === "settlement"
                ? "Record confirmed payment"
                : dialog === "supplier-qualification" || dialog === "offer-qualification"
                  ? "Record review"
                  : dialog.includes("revocation")
                    ? "Revoke and pause offers"
                    : "Save"}
          </Button>
        </form>)}
      </DialogContent>
    </Dialog>
    </>
  );
}

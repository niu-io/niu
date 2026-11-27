import { visibleContent } from './request-content';

export type UnitChargeBreakdown = {
  model_alias?: string;
  api_key_id?: string | null;
  key_name?: string | null;
  definition_revision: string;
  name?: string;
  unit_name?: string;
  display_precision: number;
  atoms_per_unit: string;
  charged_atoms: string;
  restored_atoms: string;
  net_atoms: string;
  charged_requests: number;
};

export type ChargeBreakdown = {
  model_alias?: string;
  api_key_id?: string | null;
  key_name?: string | null;
  currency: string | null;
  amount_nanos: string | null;
  request_count: number;
  charged_requests: number;
  owner_funded_requests?: number;
  unresolved_requests: number;
  unpriced_requests: number;
  not_charged_requests: number;
};

export function unitLabel(item: { name?: string; unit_name?: string }): string {
  return item.name || item.unit_name || 'Credits';
}

export function chargeGroups(rows: ChargeBreakdown[], unitRows: UnitChargeBreakdown[], byKey: boolean) {
  const groups = new Map<
    string,
    {
      identity: string;
      name: string;
      keyId: string | null;
      model: string;
      amounts: Map<string, bigint>;
      unitAmounts: Map<string, { unitName: string; displayPrecision: number; atoms: bigint }>;
      requests: number;
      charged: number;
      unresolved: number;
      unpriced: number;
      ownerFunded: number;
      notCharged: number;
    }
  >();
  for (const row of rows) {
    const identity = byKey ? (row.api_key_id ?? '') : (row.model_alias ?? '');
    const group = groups.get(identity) ?? {
      identity,
      name: visibleContent(
        byKey
          ? (row.key_name ?? (row.api_key_id ? 'Key name unavailable' : 'No API key recorded'))
          : (row.model_alias ?? 'Model unavailable'),
      ),
      keyId: row.api_key_id ?? null,
      model: row.model_alias ?? '',
      amounts: new Map<string, bigint>(),
      unitAmounts: new Map(),
      requests: 0,
      charged: 0,
      unresolved: 0,
      unpriced: 0,
      ownerFunded: 0,
      notCharged: 0,
    };
    if (row.currency !== null && row.amount_nanos !== null) {
      group.amounts.set(row.currency, (group.amounts.get(row.currency) ?? 0n) + BigInt(row.amount_nanos));
    }
    group.requests += row.request_count;
    group.charged += row.charged_requests;
    group.ownerFunded += row.owner_funded_requests ?? 0;
    group.unresolved += row.unresolved_requests;
    group.unpriced += row.unpriced_requests;
    group.notCharged += row.not_charged_requests;
    groups.set(identity, group);
  }
  for (const unitRow of unitRows) {
    const identity = byKey ? (unitRow.api_key_id ?? '') : (unitRow.model_alias ?? '');
    const group = groups.get(identity) ?? {
      identity,
      name: visibleContent(
        byKey
          ? (unitRow.key_name ?? (unitRow.api_key_id ? 'Key name unavailable' : 'No API key recorded'))
          : (unitRow.model_alias ?? 'Model unavailable'),
      ),
      keyId: unitRow.api_key_id ?? null,
      model: unitRow.model_alias ?? '',
      amounts: new Map<string, bigint>(),
      unitAmounts: new Map(),
      requests: 0,
      charged: 0,
      unresolved: 0,
      unpriced: 0,
      ownerFunded: 0,
      notCharged: 0,
    };
    group.charged += unitRow.charged_requests;
    const uName = unitLabel(unitRow);
    const key = `${unitRow.definition_revision}:${uName}`;
    const existing = group.unitAmounts.get(key);
    group.unitAmounts.set(key, {
      unitName: uName,
      displayPrecision: unitRow.display_precision,
      atoms: (existing?.atoms ?? 0n) + BigInt(unitRow.net_atoms),
    });
    groups.set(identity, group);
  }
  const currencies = [...new Set(rows.flatMap((row) => (row.currency === null ? [] : [row.currency])))];
  const unitKeys = [...new Set(unitRows.map((row) => `${row.definition_revision}:${unitLabel(row)}`))];
  return [...groups.values()].sort((a, b) => {
    if (unitKeys.length === 1 && currencies.length === 0) {
      const av = a.unitAmounts.get(unitKeys[0])?.atoms;
      const bv = b.unitAmounts.get(unitKeys[0])?.atoms;
      if (av === undefined && bv !== undefined) return 1;
      if (bv === undefined && av !== undefined) return -1;
      if (av !== undefined && bv !== undefined && av !== bv) return av > bv ? -1 : 1;
    }
    // Rank only comparable amounts; never add or compare different currencies.
    if (currencies.length === 1) {
      const av = a.amounts.get(currencies[0]);
      const bv = b.amounts.get(currencies[0]);
      if (av === undefined && bv !== undefined) return 1;
      if (bv === undefined && av !== undefined) return -1;
      if (av !== undefined && bv !== undefined && av !== bv) return av > bv ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

import { db } from '../db';
import { getPauseConfig } from './configs';
import {
  assessCpa,
  measureAttributionLag,
  suggestAttributionDays,
  type AttributionOptions,
  type CpaAssessment,
  type MetricRow,
} from '../ads/attribution';

export interface AdAccount {
  id: string;
  platform: 'facebook' | 'google' | 'tiktok';
  externalId: string;
  name: string;
  currency: string;
  status: string;
  lastSyncedAt: string | null;
}

export async function listAccounts(ownerId: string): Promise<AdAccount[]> {
  const { rows } = await db.query(
    `SELECT id, platform, external_id, name, currency, status, last_synced_at
     FROM ad_account WHERE owner_id = $1 ORDER BY created_at`,
    [ownerId],
  );
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    externalId: r.external_id,
    name: r.name,
    currency: r.currency,
    status: r.status,
    lastSyncedAt: r.last_synced_at ? new Date(r.last_synced_at).toISOString() : null,
  }));
}

export interface Kpis {
  spendMicros: number;
  conversions: number;
  clicks: number;
  impressions: number;
  cpaMicros: number;
  /** Số lần bot thực sự tác động lên tài khoản */
  mutationsApplied: number;
  /** Số lần bot bị guard chặn lại */
  mutationsBlocked: number;
}

export async function getKpis(accountId: string, days: number): Promise<Kpis> {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(spend_micros),0)::bigint spend,
            COALESCE(SUM(conversions),0)::bigint conv,
            COALESCE(SUM(clicks),0)::bigint clicks,
            COALESCE(SUM(impressions),0)::bigint impr
     FROM ad_metric_daily
     WHERE ad_account_id = $1 AND campaign_id IS NOT NULL
       AND date > CURRENT_DATE - $2::int`,
    [accountId, days],
  );
  const m = rows[0] ?? {};
  const spend = Number(m.spend ?? 0);
  const conv = Number(m.conv ?? 0);

  const { rows: mut } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'applied')::int applied,
       COUNT(*) FILTER (WHERE status = 'blocked')::int blocked
     FROM ad_mutation WHERE ad_account_id = $1`,
    [accountId],
  );

  return {
    spendMicros: spend,
    conversions: conv,
    clicks: Number(m.clicks ?? 0),
    impressions: Number(m.impr ?? 0),
    cpaMicros: conv > 0 ? Math.round(spend / conv) : 0,
    mutationsApplied: mut[0]?.applied ?? 0,
    mutationsBlocked: mut[0]?.blocked ?? 0,
  };
}

export interface CampaignRow {
  id: string;
  externalId: string;
  name: string;
  objective: string;
  status: string;
  isWhitelisted: boolean;
  spendMicros: number;
  conversions: number;
  clicks: number;
  targetCpaMicros: number;
  assessment: CpaAssessment;
}

const DEFAULT_TARGETS: Record<string, number> = {
  messages: 120_000_000_000,
  leads: 80_000_000_000,
};

/**
 * Lấy campaign kèm đánh giá CPA. Quan trọng: chạy assessCpa() trên dữ liệu
 * theo NGÀY, không phải trên tổng — vì phải tách phần đã qua cửa sổ
 * attribution ra khỏi phần chưa chín.
 */
export async function listCampaigns(
  accountId: string,
  days: number,
  today: string,
): Promise<CampaignRow[]> {
  // Ngưỡng nằm trong cấu hình auto_pause (migration 003), không còn bảng riêng.
  const pauseConfig = await getPauseConfig(accountId);
  const targetByObjective = new Map(
    (pauseConfig?.params.targets ?? []).map((t) => [t.objective as string, t]),
  );
  const protectedIds = new Set(pauseConfig?.params.protectedCampaignIds ?? []);

  const { rows: camps } = await db.query(
    `SELECT id, external_id, name, objective, status
     FROM ad_campaign WHERE ad_account_id = $1 ORDER BY name`,
    [accountId],
  );
  if (!camps.length) return [];

  const { rows: metrics } = await db.query(
    `SELECT campaign_id, to_char(date,'YYYY-MM-DD') date_str,
            spend_micros, conversions, clicks
     FROM ad_metric_daily
     WHERE ad_account_id = $1 AND campaign_id IS NOT NULL
       AND date > CURRENT_DATE - $2::int
     ORDER BY date`,
    [accountId, days],
  );

  const byCampaign = new Map<string, MetricRow[]>();
  for (const m of metrics) {
    const list = byCampaign.get(m.campaign_id) ?? [];
    list.push({
      date: m.date_str,
      spendMicros: Number(m.spend_micros),
      conversions: Number(m.conversions),
      clicks: Number(m.clicks),
    });
    byCampaign.set(m.campaign_id, list);
  }

  return camps.map((c) => {
    const rows = byCampaign.get(c.id) ?? [];
    const t = targetByObjective.get(c.objective);
    const target = t?.targetCpaMicros ?? DEFAULT_TARGETS[c.objective] ?? 0;
    const opts: AttributionOptions = {
      attributionDays: t?.attributionDays ?? 7,
      minConversions: t?.minConversions ?? 10,
      minClicks: t?.minClicks ?? 100,
      today,
    };
    return {
      id: c.id,
      externalId: c.external_id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      isWhitelisted: protectedIds.has(c.id),
      spendMicros: rows.reduce((s, r) => s + r.spendMicros, 0),
      conversions: rows.reduce((s, r) => s + r.conversions, 0),
      clicks: rows.reduce((s, r) => s + r.clicks, 0),
      targetCpaMicros: target,
      assessment: assessCpa(rows, target, opts),
    };
  });
}

export interface TrendPoint {
  date: string;
  spend: number;
  conversions: number;
  cpa: number;
}

export async function getTrend(accountId: string, days: number): Promise<TrendPoint[]> {
  const { rows } = await db.query(
    `SELECT to_char(date,'YYYY-MM-DD') date_str,
            SUM(spend_micros)::bigint spend, SUM(conversions)::bigint conv
     FROM ad_metric_daily
     WHERE ad_account_id = $1 AND campaign_id IS NOT NULL
       AND date > CURRENT_DATE - $2::int
     GROUP BY date ORDER BY date`,
    [accountId, days],
  );
  return rows.map((r) => {
    const spend = Number(r.spend) / 1_000_000;
    const conv = Number(r.conv);
    return {
      date: r.date_str,
      spend: Math.round(spend),
      conversions: conv,
      cpa: conv > 0 ? Math.round(spend / conv) : 0,
    };
  });
}

export interface MutationRow {
  id: string;
  createdAt: string;
  targetName: string;
  targetExternalId: string;
  operation: string;
  mode: string;
  status: string;
  beforeValue: string;
  afterValue: string;
  reason: string;
  blockedBy: string | null;
  cpaRawMicros: number | null;
  cpaSettledMicros: number | null;
  targetCpaMicros: number | null;
}

export async function listMutations(accountId: string, limit = 100): Promise<MutationRow[]> {
  const { rows } = await db.query(
    `SELECT id, created_at, target_name, target_external_id, operation, mode, status,
            before_value, after_value, reason, blocked_by,
            cpa_raw_micros, cpa_settled_micros, target_cpa_micros
     FROM ad_mutation WHERE ad_account_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [accountId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    targetName: r.target_name,
    targetExternalId: r.target_external_id,
    operation: r.operation,
    mode: r.mode,
    status: r.status,
    beforeValue: r.before_value,
    afterValue: r.after_value,
    reason: r.reason,
    blockedBy: r.blocked_by,
    cpaRawMicros: r.cpa_raw_micros === null ? null : Number(r.cpa_raw_micros),
    cpaSettledMicros: r.cpa_settled_micros === null ? null : Number(r.cpa_settled_micros),
    targetCpaMicros: r.target_cpa_micros === null ? null : Number(r.target_cpa_micros),
  }));
}

export interface LagCurve {
  points: { dayOffset: number; reportedRatio: number; samples: number }[];
  suggestedDays: number | null;
}

/** Đo cửa sổ attribution thật của tài khoản từ revision history. */
export async function getAttributionCurve(accountId: string): Promise<LagCurve> {
  const { rows } = await db.query(
    `SELECT campaign_id, to_char(date,'YYYY-MM-DD') date_str, fetched_at, conversions
     FROM ad_metric_revision
     WHERE ad_account_id = $1 AND campaign_id IS NOT NULL
     ORDER BY campaign_id, date, fetched_at`,
    [accountId],
  );
  const points = measureAttributionLag(
    rows.map((r) => ({
      // seriesId bắt buộc: nhiều campaign cùng ngày, không tách ra thì tỉ lệ sai
      seriesId: r.campaign_id,
      date: r.date_str,
      fetchedAt: new Date(r.fetched_at).toISOString(),
      conversions: Number(r.conversions),
    })),
  );
  return { points, suggestedDays: suggestAttributionDays(points, 0.95) };
}

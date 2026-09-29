// Tăng giảm ngân sách theo khung giờ trong ngày.
//
// Phần trăm luôn tính từ NGÂN SÁCH GỐC (base_daily_budget_micros), không bao
// giờ tính từ giá trị hiện tại — nếu không, 150% rồi lại 150% thành 225% và
// vài ngày sau ngân sách nổ.

import { db } from '../db';
import { readToken } from '../ads/token';
import { setCampaignDailyBudget, readCampaignBudget, FacebookWriteError } from '../ads/facebook-write';
import { safeParams, slotHours } from '../configs/schema';

export interface BudgetRunResult {
  evaluated: number;
  changed: number;
  failed: number;
  unchanged: number;
  skipped: number;
  notes: string[];
}

/** Giờ hiện tại theo múi giờ VN — khung giờ do người dùng đặt là giờ VN. */
function hourVn(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false,
    }).format(new Date()),
  );
}

function dateVn(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export async function runBudgetSchedule(
  adAccountId: string,
  rawParams: unknown,
  mode: 'dry_run' | 'live',
): Promise<BudgetRunResult> {
  const out: BudgetRunResult = {
    evaluated: 0, changed: 0, failed: 0, unchanged: 0, skipped: 0, notes: [],
  };

  const params = safeParams('budget_schedule', rawParams);
  if (params.slots.length === 0) {
    out.notes.push('Chưa đặt khung giờ nào');
    return out;
  }

  const hour = hourVn();
  const today = dateVn();

  // Khung giờ khớp giờ hiện tại. Không khớp khung nào = về 100% ngân sách gốc,
  // chứ không phải giữ nguyên giá trị của khung trước — nếu giữ nguyên thì hết
  // giờ vàng ngân sách vẫn cao suốt đêm.
  // Đối chiếu bằng tập giờ chứ không so mốc đầu/cuối — khung 22h→6h có
  // endHour nhỏ hơn startHour nên phép so sánh trực tiếp không bao giờ khớp.
  const slot = params.slots.find((s) => slotHours(s).includes(hour));
  const percent = slot?.percent ?? 100;

  // Tiền tệ của tài khoản quyết định hệ số quy đổi khi ghi lên Facebook.
  // Thiếu nó thì tài khoản USD bị đặt sai 100 lần.
  const { rows: acct } = await db.query(
    'SELECT currency FROM ad_account WHERE id = $1', [adAccountId],
  );
  const currency = (acct[0]?.currency as string | undefined) ?? 'VND';

  const { rows: camps } = await db.query(
    `SELECT id, external_id, name, daily_budget_micros, base_daily_budget_micros
     FROM ad_campaign
     WHERE ad_account_id = $1 AND upper(status) = 'ACTIVE'
       AND daily_budget_micros IS NOT NULL`,
    [adAccountId],
  );
  out.evaluated = camps.length;
  if (camps.length === 0) {
    out.notes.push('Không có chiến dịch nào đặt ngân sách theo ngày (CBO)');
    return out;
  }

  const token = mode === 'live' ? await readToken(adAccountId) : null;
  if (mode === 'live' && !token) {
    out.notes.push('Không đọc được token');
    return out;
  }

  for (const c of camps) {
    const current = Number(c.daily_budget_micros);

    // Chốt ngân sách gốc ở lần đầu đụng tới. Từ đó về sau không bao giờ ghi đè.
    let base = c.base_daily_budget_micros === null ? null : Number(c.base_daily_budget_micros);
    if (base === null) {
      base = current;
      await db.query(
        `UPDATE ad_campaign SET base_daily_budget_micros = $2 WHERE id = $1`,
        [c.id, base],
      );
    }

    const target = Math.round((base * percent) / 100);
    if (target === current) { out.unchanged++; continue; }

    // Một lần đổi mỗi chiến dịch mỗi giờ. Cron chạy 5 phút/lần, không chặn thì
    // mỗi giờ ghi 12 dòng giống nhau.
    const key = `${c.external_id}:budget:${today}T${String(hour).padStart(2, '0')}`;
    const reason = slot
      ? `Khung ${slot.startHour}h-${slot.endHour}h đặt ${percent}% ngân sách gốc `
        + `(${fmt(base, currency)} → ${fmt(target, currency)})`
      : `Ngoài mọi khung giờ — trả về 100% ngân sách gốc (${fmt(base, currency)})`;

    const { rows: mut } = await db.query(
      `INSERT INTO ad_mutation
         (ad_account_id, campaign_id, target_external_id, target_name, operation,
          mode, status, before_value, after_value, reason, idempotency_key)
       VALUES ($1,$2,$3,$4,'budget_change',$5::ad_mutation_mode_t,'proposed',
               $6,$7,$8,$9)
       ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [adAccountId, c.id, c.external_id, c.name, mode, fmt(current, currency), fmt(target, currency), reason, key],
    );
    const mutationId = mut[0]?.id as string | undefined;
    if (!mutationId) { out.skipped++; continue; }

    if (mode === 'dry_run') { out.changed++; continue; }

    try {
      await setCampaignDailyBudget(token!, c.external_id, target, currency);

      // Đọc lại để xác nhận — Facebook làm tròn ngân sách theo đơn vị tiền tệ
      // nên giá trị trả về có thể lệch vài đồng so với target.
      const after = await readCampaignBudget(token!, c.external_id, currency);
      await db.query(
        `UPDATE ad_mutation SET status='applied', applied_at=NOW(), after_value=$2 WHERE id=$1`,
        [mutationId, after === null ? fmt(target, currency) : fmt(after, currency)],
      );
      await db.query(
        `UPDATE ad_campaign SET daily_budget_micros = $2, updated_at = NOW() WHERE id = $1`,
        [c.id, after ?? target],
      );
      out.changed++;
    } catch (e) {
      const msg = e instanceof FacebookWriteError
        ? `${e.message}${e.isPermission ? ' (thiếu quyền hoặc token hỏng)' : ''}`
        : e instanceof Error ? e.message : String(e);
      await db.query(
        `UPDATE ad_mutation SET status='failed', error_message=$2 WHERE id=$1`,
        [mutationId, msg],
      );
      out.failed++;
    }
  }

  return out;
}

/** Hiển thị cho nhật ký. Chỉ VND mới đọc được bằng đồng nguyên. */
function fmt(micros: number, currency = 'VND'): string {
  if (currency.toUpperCase() === 'VND') {
    return `${Math.round(micros / 1_000_000).toLocaleString('vi-VN')}đ/ngày`;
  }
  return `${(micros / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} `
    + `${currency}/ngày`;
}

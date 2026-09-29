// Tự động tạo chiến dịch khi Page đăng bài khớp từ khoá.
//
// Đây là tự động hoá RỦI RO NHẤT trong sản phẩm. Ba loại kia sửa thứ đã tồn
// tại và người dùng đã tự tay duyệt; loại này sinh ra chiến dịch mới. Nên nó
// có nhiều tầng chặn hơn hẳn:
//
//   1. Chỉ xét bài đăng SAU khi cấu hình được tạo — bật lên không đào lại quá khứ.
//   2. Chỉ xét bài trong maxPostAgeHours giờ gần nhất.
//   3. Bài đã kích hoạt rồi thì không làm lại (bảng triggered_post).
//   4. Trần maxPerRun chiến dịch mỗi lượt.
//   5. Chiến dịch tạo ra LUÔN PAUSED — không có tham số nào bật được.
//
// Tầng 1 và 2 chồng lên nhau có chủ đích. Tầng 2 một mình không đủ: người dùng
// đặt maxPostAgeHours = 168 rồi bật cấu hình là quét luôn bài của cả tuần trước.

import { db } from '../db';
import { readToken } from '../ads/token';
import { readPageToken, fetchRecentPosts } from '../ads/pages';
import { createBoostCampaign, cleanupPartial, AdCreateError } from '../ads/facebook-create';
import { safeParams } from '../configs/schema';
import { getTemplate } from '../queries/templates';

export interface PostTriggerResult {
  scanned: number;
  matched: number;
  created: number;
  failed: number;
  skipped: number;
  notes: string[];
}

/**
 * Khớp từ khoá, không phân biệt hoa thường và bỏ dấu tiếng Việt.
 *
 * Bỏ dấu vì người dùng gõ từ khoá "khuyen mai" phải bắt được bài viết "khuyến
 * mãi". Đây là cách người Việt thực sự gõ, không phải trường hợp hiếm.
 */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // dấu thanh và dấu mũ tách ra bởi NFD
    .replace(/đ/g, 'd');               // đ không tách được bằng NFD, phải thay tay
}

export function matchesKeywords(message: string, keywords: string[], mode: 'any' | 'all'): boolean {
  if (keywords.length === 0) return false;   // Không từ khoá = không khớp gì, KHÔNG phải khớp tất cả.
  const text = normalize(message);
  const hits = keywords.filter((k) => text.includes(normalize(k)));
  return mode === 'all' ? hits.length === keywords.length : hits.length > 0;
}

/** Tên chiến dịch từ bài viết. {post_excerpt} thay bằng 60 ký tự đầu. */
function campaignName(message: string, createdTime: string): string {
  const excerpt = message.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Bài không có chữ';
  const day = createdTime.slice(0, 10);
  return `[Tự động] ${excerpt} — ${day}`.slice(0, 100);   // Facebook giới hạn 100 ký tự.
}

export async function runPostTrigger(
  configId: string,
  adAccountId: string,
  ownerId: string,
  rawParams: unknown,
  configCreatedAt: Date,
): Promise<PostTriggerResult> {
  const out: PostTriggerResult = {
    scanned: 0, matched: 0, created: 0, failed: 0, skipped: 0, notes: [],
  };

  const p = safeParams('post_trigger', rawParams);
  if (!p.pageId) { out.notes.push('Chưa chọn Page nguồn'); return out; }
  if (p.keywords.length === 0) { out.notes.push('Chưa đặt từ khoá'); return out; }

  const pageToken = await readPageToken(ownerId, p.pageId);
  if (!pageToken) {
    out.notes.push('Không có token của Page — kết nối lại Facebook và cấp quyền pages_show_list');
    return out;
  }

  let posts;
  try {
    posts = await fetchRecentPosts(pageToken, p.pageId);
  } catch (e) {
    out.notes.push(`Không đọc được bài viết: ${e instanceof Error ? e.message : String(e)}`);
    return out;
  }
  out.scanned = posts.length;

  // Mốc thời gian là cái muộn hơn giữa "cấu hình được tạo" và "N giờ trước".
  const ageFloor = Date.now() - p.maxPostAgeHours * 3_600_000;
  const floor = Math.max(ageFloor, configCreatedAt.getTime());

  const candidates = posts.filter((post) =>
    new Date(post.createdTime).getTime() >= floor
    && matchesKeywords(post.message, p.keywords, p.matchMode));
  out.matched = candidates.length;

  if (candidates.length === 0) return out;

  // Bài cũ nhất trước — nếu đụng trần maxPerRun thì bài cũ đã bị bỏ lỡ nhiều
  // thời gian hơn, xử lý trước là đúng.
  candidates.sort((a, b) => a.createdTime.localeCompare(b.createdTime));

  const token = p.mode === 'live' ? await readToken(adAccountId) : null;
  if (p.mode === 'live' && !token) {
    out.notes.push('Không đọc được token tài khoản quảng cáo');
    return out;
  }

  const { rows: acct } = await db.query(
    'SELECT external_id, currency FROM ad_account WHERE id = $1', [adAccountId],
  );
  const externalAccountId = acct[0]?.external_id as string | undefined;
  if (!externalAccountId) { out.notes.push('Không tìm thấy tài khoản quảng cáo'); return out; }
  const currency = (acct[0]?.currency as string | undefined) ?? 'VND';

  // Mẫu quảng cáo đè lên tham số khai sẵn. Mẫu bị xoá thì quay về tham số cũ
  // chứ không làm cấu hình chết — ghi chú lại để người dùng biết vì sao số
  // nhắm đối tượng khác với lúc họ đặt.
  let targeting = {
    dailyBudgetMicros: p.dailyBudgetMicros,
    countries: p.countries,
    ageMin: p.ageMin,
    ageMax: p.ageMax,
  };
  if (p.templateId) {
    const tpl = await getTemplate(ownerId, p.templateId);
    if (tpl) {
      targeting = {
        dailyBudgetMicros: tpl.dailyBudgetMicros,
        countries: tpl.countries,
        ageMin: tpl.ageMin,
        ageMax: tpl.ageMax,
      };
    } else {
      out.notes.push('Mẫu quảng cáo đã bị xoá — dùng tham số khai trong cấu hình');
    }
  }

  for (const post of candidates) {
    if (out.created + out.failed >= p.maxPerRun) {
      out.notes.push(`Dừng ở trần ${p.maxPerRun} chiến dịch/lượt, còn ${candidates.length - out.created - out.failed - out.skipped} bài chờ lượt sau`);
      break;
    }

    // Đặt chỗ TRƯỚC khi gọi API. Nếu tiến trình chết giữa chừng, dòng này còn
    // lại và lượt sau không tạo trùng — thà bỏ sót còn hơn tạo hai chiến dịch
    // cho cùng một bài.
    const { rows: claim } = await db.query(
      `INSERT INTO triggered_post (config_id, post_id) VALUES ($1,$2)
       ON CONFLICT (config_id, post_id) DO NOTHING RETURNING id`,
      [configId, post.id],
    );
    if (claim.length === 0) { out.skipped++; continue; }

    const name = campaignName(post.message, post.createdTime);
    const reason = `Bài đăng ${post.createdTime.slice(0, 16).replace('T', ' ')} khớp từ khoá `
      + `${p.matchMode === 'all' ? 'tất cả' : 'bất kỳ'} [${p.keywords.join(', ')}]`
      + `${post.permalink ? ` · ${post.permalink}` : ''}`;

    const { rows: mut } = await db.query(
      `INSERT INTO ad_mutation
         (ad_account_id, target_external_id, target_name, operation, mode, status,
          before_value, after_value, reason, idempotency_key)
       VALUES ($1,$2,$3,'campaign_create',$4::ad_mutation_mode_t,'proposed',
               'chưa có chiến dịch', $5, $6, $7)
       ON CONFLICT (ad_account_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [adAccountId, post.id, name, p.mode,
       `PAUSED · ${Math.round(targeting.dailyBudgetMicros / 1_000_000).toLocaleString('vi-VN')}đ/ngày`,
       reason, `posttrigger:${configId}:${post.id}`],
    );
    const mutationId = mut[0]?.id as string | undefined;
    if (!mutationId) { out.skipped++; continue; }

    if (p.mode === 'dry_run') { out.created++; continue; }

    // Giãn nhịp giữa các lần tạo. Facebook có hệ thống chống lạm dụng riêng,
    // tách khỏi rate limit thông thường: tạo nhiều chiến dịch liên tiếp trong
    // vài giây sẽ bị khoá quyền tạo quảng cáo tạm thời với thông báo "nghi ngờ
    // truy cập trái phép". Đã gặp thật trong lúc kiểm thử.
    if (out.created > 0) await new Promise((r) => setTimeout(r, 5_000));

    try {
      const made = await createBoostCampaign(token!, {
        adAccountId: externalAccountId,
        pageId: p.pageId,
        postId: post.id,
        campaignName: name,
        currency,
        dailyBudgetMicros: targeting.dailyBudgetMicros,
        countries: targeting.countries,
        ageMin: targeting.ageMin,
        ageMax: targeting.ageMax,
      });

      await db.query(
        `UPDATE triggered_post SET campaign_external_id = $2 WHERE config_id = $1 AND post_id = $3`,
        [configId, made.campaignId, post.id],
      );
      await db.query(
        `UPDATE ad_mutation SET status='applied', applied_at=NOW(), after_value=$2 WHERE id=$1`,
        [mutationId, `PAUSED · chiến dịch ${made.campaignId} · quảng cáo ${made.adId}`],
      );
      out.created++;
    } catch (e) {
      const step = e instanceof AdCreateError ? e.step : null;
      const msg = e instanceof Error ? e.message : String(e);

      // Chuỗi hỏng giữa chừng để lại rác trong tài khoản. Xoá đi — đây là thứ
      // mình vừa tạo vài giây trước, không phải của người dùng. Gồm cả creative:
      // xoá chiến dịch KHÔNG kéo theo creative.
      if (e instanceof AdCreateError) await cleanupPartial(token!, e.created);

      await db.query(
        `UPDATE ad_mutation SET status='failed', error_message=$2 WHERE id=$1`,
        [mutationId, step ? `Hỏng ở bước ${step}: ${msg}` : msg],
      );
      // CỐ Ý không xoá dòng triggered_post để thử lại. Lỗi ở đây gần như luôn
      // là lỗi cấu hình — targeting sai, ngân sách dưới mức tối thiểu, bài
      // không quảng cáo được — và thử lại mỗi 5 phút chỉ tạo ra một hàng dài
      // lỗi giống hệt nhau. Bài dừng ở đây, lỗi hiện trong Nhật ký, người dùng
      // sửa cấu hình rồi bài sau sẽ chạy đúng.
      out.failed++;
    }
  }

  return out;
}

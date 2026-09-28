// Attribution-aware CPA — quyết định tắt ads mà không tắt oan.
// Pure function utilities — no DB, no platform API. Compute từ data đã pull.
//
// VẤN ĐỀ: Facebook/Google sửa số HỒI TỐ. Conversion của hôm nay có thể về sau
// vài giờ đến vài ngày (khách nhắn tin hôm nay, chốt đơn ngày mai; view-through
// conversion còn lâu hơn). Nên CPA của mấy ngày gần nhất LUÔN nhìn tệ hơn thực tế.
//
// Tắt ads theo CPA thô = tắt nhầm campaign tốt. Đây là lỗi phổ biến nhất của
// mọi tool auto-pause, kể cả tool thương mại: họ chỉ đặt sàn theo CHI TIÊU
// ("chi đủ 120% CPA mục tiêu mới đánh giá"), mà sàn chi tiêu không chặn được
// lỗi này — một ad có thể đốt hết 120% CPA trong 90 phút.
//
// CÁCH LÀM: chỉ kết luận trên phần dữ liệu ĐÃ CHÍN (ngày <= hôm nay - cửa sổ
// attribution). Chênh lệch giữa CPA thô và CPA đã chín chính là số campaign
// lẽ ra bị tắt oan.

/** Một dòng ad_metric_daily (revision mới nhất của ngày đó). */
export interface MetricRow {
  /** ISO date YYYY-MM-DD */
  date: string;
  spendMicros: number;
  conversions: number;
  clicks: number;
}

export interface AttributionOptions {
  /** Số ngày cuối coi là CHƯA chín. Mặc định 7 — nên thay bằng số đo được
   *  từ measureAttributionLag() của chính tài khoản đó. */
  attributionDays: number;
  /** Sàn conversion tối thiểu trên phần đã chín mới dám kết luận. */
  minConversions: number;
  /** Sàn click tối thiểu — chặn kết luận từ mẫu quá nhỏ. */
  minClicks: number;
  /** Hôm nay, ISO date. Truyền vào để test được. */
  today: string;
}

export const DEFAULT_ATTRIBUTION: AttributionOptions = {
  attributionDays: 7,
  minConversions: 10,
  minClicks: 100,
  today: '',
};

export type CpaVerdict =
  | 'ok'        // trong ngưỡng, cả thô lẫn chín
  | 'saved'     // THÔ vượt ngưỡng nhưng CHÍN thì không — tool thường sẽ tắt oan
  | 'holding'   // chưa đủ dữ liệu chín để kết luận — không đụng vào
  | 'over';     // chín vẫn vượt ngưỡng — tắt được

export interface CpaAssessment {
  /** CPA toàn kỳ, micros/conversion. Con số mà tool ngây thơ dùng. */
  cpaRawMicros: number;
  /** CPA chỉ trên ngày đã qua cửa sổ attribution. 0 nếu chưa đủ dữ liệu. */
  cpaSettledMicros: number;
  settledConversions: number;
  settledClicks: number;
  /** Đủ dữ liệu chín để dám kết luận chưa. */
  hasSettledData: boolean;
  overRaw: boolean;
  overSettled: boolean;
  verdict: CpaVerdict;
  /** Câu giải thích tiếng Việt — ghi thẳng vào ad_mutation.reason. */
  reason: string;
  /** Guard nào chặn, nếu có — ad_mutation.blocked_by. */
  blockedBy: string | null;
}

/** Ngày cuối cùng được coi là đã chín (inclusive). */
export function settledCutoff(today: string, attributionDays: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - attributionDays);
  return d.toISOString().slice(0, 10);
}

function fmtMicros(micros: number): string {
  return `${Math.round(micros / 1_000_000).toLocaleString('vi-VN')}đ`;
}

/**
 * Đánh giá 1 campaign so với ngưỡng CPA mục tiêu.
 *
 * @param rows        metric theo ngày (revision mới nhất mỗi ngày)
 * @param targetCpaMicros  ngưỡng CPA mục tiêu, micros. 0 = không có ngưỡng.
 */
export function assessCpa(
  rows: MetricRow[],
  targetCpaMicros: number,
  opts: AttributionOptions,
): CpaAssessment {
  const cutoff = settledCutoff(opts.today, opts.attributionDays);

  let spendAll = 0;
  let convAll = 0;
  let spendSettled = 0;
  let convSettled = 0;
  let clicksSettled = 0;

  for (const r of rows) {
    spendAll += r.spendMicros;
    convAll += r.conversions;
    if (r.date <= cutoff) {
      spendSettled += r.spendMicros;
      convSettled += r.conversions;
      clicksSettled += r.clicks;
    }
  }

  const cpaRawMicros = convAll > 0 ? spendAll / convAll : 0;
  const cpaSettledMicros = convSettled > 0 ? spendSettled / convSettled : 0;

  const hasSettledData =
    convSettled >= opts.minConversions && clicksSettled >= opts.minClicks;

  const overRaw = targetCpaMicros > 0 && cpaRawMicros > targetCpaMicros;
  const overSettled =
    targetCpaMicros > 0 && hasSettledData && cpaSettledMicros > targetCpaMicros;

  let verdict: CpaVerdict;
  let reason: string;
  let blockedBy: string | null = null;

  if (!targetCpaMicros) {
    verdict = 'ok';
    reason = 'Chưa đặt ngưỡng CPA cho loại chiến dịch này — không đánh giá.';
    blockedBy = 'no_target';
  } else if (!hasSettledData) {
    verdict = 'holding';
    reason =
      `Chưa đủ dữ liệu đã chín để kết luận: ${convSettled} chuyển đổi / ` +
      `${clicksSettled} click trên phần dữ liệu tới ${cutoff} ` +
      `(cần tối thiểu ${opts.minConversions} chuyển đổi và ${opts.minClicks} click). ` +
      `CPA thô hiện ${fmtMicros(cpaRawMicros)} nhưng số này còn thiếu chuyển đổi chưa về.`;
    blockedBy = 'attribution_window';
  } else if (overSettled) {
    verdict = 'over';
    reason =
      `CPA đã chín ${fmtMicros(cpaSettledMicros)} vượt ngưỡng ` +
      `${fmtMicros(targetCpaMicros)} (tính trên dữ liệu tới ${cutoff}, ` +
      `${convSettled} chuyển đổi). Kết luận này không bị ảnh hưởng bởi ` +
      `chuyển đổi chưa về.`;
  } else if (overRaw) {
    verdict = 'saved';
    reason =
      `GIỮ LẠI: CPA thô ${fmtMicros(cpaRawMicros)} vượt ngưỡng ` +
      `${fmtMicros(targetCpaMicros)}, nhưng CPA đã chín chỉ ` +
      `${fmtMicros(cpaSettledMicros)} — vẫn dưới ngưỡng. Chênh lệch là do ` +
      `chuyển đổi của ${opts.attributionDays} ngày gần nhất chưa về đủ. ` +
      `Tool tắt theo CPA thô sẽ tắt oan chiến dịch này.`;
    blockedBy = 'attribution_window';
  } else {
    verdict = 'ok';
    reason =
      `CPA đã chín ${fmtMicros(cpaSettledMicros)} trong ngưỡng ` +
      `${fmtMicros(targetCpaMicros)}.`;
  }

  return {
    cpaRawMicros,
    cpaSettledMicros,
    settledConversions: convSettled,
    settledClicks: clicksSettled,
    hasSettledData,
    overRaw,
    overSettled,
    verdict,
    reason,
    blockedBy,
  };
}

// ─── Đo cửa sổ attribution thật của tài khoản ────────────────────────────────
//
// attributionDays = 7 chỉ là phỏng đoán. Có revision history (migration 063)
// thì đo được con số thật: so sánh số conversion báo lúc mới kéo với số
// cuối cùng của cùng ngày đó.

/** Một lần kéo số của một ngày. */
export interface MetricRevision {
  /**
   * Định danh chuỗi số liệu — thường là campaign id. BẮT BUỘC khi gộp revision
   * của nhiều campaign, nếu không mọi campaign cùng ngày bị coi là một chuỗi.
   */
  seriesId?: string;
  /** Ngày của dữ liệu, YYYY-MM-DD */
  date: string;
  /** Lúc kéo, ISO timestamp */
  fetchedAt: string;
  conversions: number;
}

export interface LagPoint {
  /** Số ngày kể từ ngày dữ liệu tới lúc kéo (0 = kéo trong ngày). */
  dayOffset: number;
  /** Tỉ lệ conversion đã về so với con số cuối cùng. 0..1 */
  reportedRatio: number;
  /** Số mẫu (cặp ngày-lần kéo) tạo nên điểm này. */
  samples: number;
}

/**
 * Đo đường cong "conversion về dần" từ revision history.
 *
 * Trả về: với dữ liệu kéo sau N ngày, trung bình đã thấy bao nhiêu % conversion
 * cuối cùng. Dùng để chọn attributionDays thay vì đoán — lấy N nhỏ nhất mà
 * reportedRatio >= ngưỡng bạn chấp nhận (vd 0.95).
 */
export function measureAttributionLag(revisions: MetricRevision[]): LagPoint[] {
  // Gom theo (chuỗi số liệu, ngày). PHẢI có seriesId trong khoá: gom theo ngày
  // không thôi sẽ trộn revision của các campaign khác nhau, rồi chia conversion
  // của campaign này cho giá trị cuối của campaign kia → tỉ lệ vượt 100%.
  const byKey = new Map<string, MetricRevision[]>();
  for (const r of revisions) {
    const key = `${r.seriesId ?? ''} ${r.date}`;
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }

  // offset -> tổng tỉ lệ + số mẫu
  const acc = new Map<number, { sum: number; n: number }>();

  for (const [key, list] of byKey) {
    const dateStr = key.slice(key.indexOf(' ') + 1);
    if (list.length < 2) continue; // 1 revision thì không đo được gì

    const sorted = [...list].sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    const final = last.conversions;
    if (final <= 0) continue; // không có conversion thì tỉ lệ vô nghĩa

    const dataDay = new Date(`${dateStr}T00:00:00Z`).getTime();

    // Mỗi offset chỉ lấy revision MUỘN NHẤT trong ngày đó — đó là trạng thái
    // cuối ngày, khớp với cách cron chạy hằng ngày sẽ nhìn thấy.
    const perOffset = new Map<number, number>();
    for (const rev of sorted) {
      const fetchDay = new Date(rev.fetchedAt).getTime();
      const offset = Math.floor((fetchDay - dataDay) / 86_400_000);
      if (offset < 0) continue;
      perOffset.set(offset, rev.conversions);
    }

    for (const [offset, conv] of perOffset) {
      const cur = acc.get(offset) ?? { sum: 0, n: 0 };
      cur.sum += conv / final;
      cur.n += 1;
      acc.set(offset, cur);
    }
  }

  return [...acc.entries()]
    .map(([dayOffset, { sum, n }]) => ({
      dayOffset,
      reportedRatio: sum / n,
      samples: n,
    }))
    .sort((a, b) => a.dayOffset - b.dayOffset);
}

/**
 * Chọn attributionDays từ đường cong đo được.
 *
 * @param threshold  tỉ lệ conversion coi là "đủ chín", mặc định 0.95
 * @param minSamples bỏ qua điểm ít mẫu quá
 * @returns số ngày, hoặc null nếu dữ liệu chưa đủ để kết luận
 */
export function suggestAttributionDays(
  curve: LagPoint[],
  threshold = 0.95,
  minSamples = 5,
): number | null {
  const usable = curve.filter((p) => p.samples >= minSamples);
  if (!usable.length) return null;
  const hit = usable.find((p) => p.reportedRatio >= threshold);
  return hit ? hit.dayOffset : null;
}

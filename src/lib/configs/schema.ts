// Hợp đồng cho automation_config.params.
//
// params là JSONB nên database không canh giúp — mọi đường ghi PHẢI đi qua
// parseParams() trước khi lưu, và mọi đường đọc dùng safeParams() để một bản
// ghi hỏng không làm sập cả trang.

import { z } from 'zod';

export const KINDS = ['metric_sync', 'auto_pause', 'budget_schedule', 'post_trigger'] as const;
export type AutomationKind = (typeof KINDS)[number];

export const KIND_LABEL: Record<AutomationKind, string> = {
  metric_sync: 'Kéo chỉ số',
  auto_pause: 'Tắt ads tự động',
  budget_schedule: 'Ngân sách theo giờ',
  post_trigger: 'Tự động chạy ads',
};

export const KIND_DESC: Record<AutomationKind, string> = {
  metric_sync: 'Đồng bộ số liệu từ nền tảng về Ads OS',
  auto_pause: 'Tắt chiến dịch khi CPA đã chín vượt ngưỡng',
  budget_schedule: 'Tăng giảm ngân sách theo khung giờ trong ngày',
  post_trigger: 'Tạo chiến dịch khi fanpage đăng bài khớp từ khoá',
};

export const PLATFORMS = ['facebook', 'tiktok', 'google'] as const;
export type Platform = (typeof PLATFORMS)[number];

const OBJECTIVE = z.enum(['messages', 'leads', 'sales', 'traffic', 'awareness', 'video_views']);

/** Một ngưỡng CPA cho một loại chiến dịch. */
export const CpaTargetSchema = z.object({
  objective: OBJECTIVE,
  /** Ngưỡng CPA, micros (giá trị × 1.000.000). */
  targetCpaMicros: z.number().int().positive(),
  /**
   * Cửa sổ attribution. Chỉ dữ liệu cũ hơn ngần này ngày mới được dùng để
   * kết luận — xem src/lib/ads/attribution.ts.
   */
  attributionDays: z.number().int().min(0).max(30).default(7),
  minConversions: z.number().int().min(0).default(10),
  minClicks: z.number().int().min(0).default(100),
});

export const AutoPauseParams = z.object({
  platform: z.enum(PLATFORMS).default('facebook'),
  /**
   * 'dry_run' chỉ ghi đề xuất vào ad_mutation, không gọi API nền tảng.
   * Mặc định dry_run: bật cấu hình lên không đồng nghĩa với cho phép tiêu tiền.
   */
  mode: z.enum(['dry_run', 'live']).default('dry_run'),
  targets: z.array(CpaTargetSchema).default([]),
  /**
   * Chiến dịch được BẢO VỆ — không bao giờ bị tắt, chỉ gửi cảnh báo.
   *
   * Cố ý ngược với "whitelist Page ID" của Done.vn, nơi ads KHÔNG nằm trong
   * danh sách thì bị tắt. Danh sách ở đây chỉ thêm an toàn; bỏ sót một mục
   * không bao giờ dẫn tới việc tắt nhầm.
   */
  protectedCampaignIds: z.array(z.string().uuid()).default([]),
  /** Trần số chiến dịch được tắt trong một lượt chạy. */
  maxPausesPerRun: z.number().int().min(1).max(50).default(3),
});

export const MetricSyncParams = z.object({
  platform: z.enum(PLATFORMS).default('facebook'),
  lookbackDays: z.number().int().min(1).max(90).default(30),
  /** Cấp dữ liệu cần kéo. Càng sâu càng tốn quota API. */
  level: z.enum(['campaign', 'adset', 'ad']).default('campaign'),
  /**
   * Chỉ số tuỳ chọn, ngoài nhóm bắt buộc. Vào cột extra_metrics.
   * Xem danh mục ở src/lib/ads/metric-catalog.ts.
   */
  extraFields: z.array(z.string()).default([]),
});

export const BudgetScheduleParams = z.object({
  platform: z.enum(PLATFORMS).default('facebook'),
  mode: z.enum(['dry_run', 'live']).default('dry_run'),
  slots: z.array(z.object({
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    /** Phần trăm so với NGÂN SÁCH GỐC, không phải giá trị hiện tại. */
    percent: z.number().int().min(10).max(500),
  }))
    .default([])
    // Khung giờ chồng nhau thì kết quả phụ thuộc thứ tự mảng — người dùng đặt
    // 19-22h 150% và 20-23h 80% sẽ không đoán được cái nào thắng.
    .refine((slots) => {
      const sorted = [...slots].sort((a, b) => a.startHour - b.startHour);
      return sorted.every((s, i) =>
        s.endHour > s.startHour && (i === 0 || s.startHour >= sorted[i - 1]!.endHour));
    }, 'Khung giờ không được chồng lên nhau, và giờ kết thúc phải sau giờ bắt đầu'),
});

export const PostTriggerParams = z.object({
  keywords: z.array(z.string().min(1)).default([]),
  matchMode: z.enum(['any', 'all']).default('any'),
  /** Campaign tạo ra luôn ở trạng thái PAUSED để người chạy duyệt trước. */
  createPaused: z.literal(true).default(true),
});

const BY_KIND = {
  metric_sync: MetricSyncParams,
  auto_pause: AutoPauseParams,
  budget_schedule: BudgetScheduleParams,
  post_trigger: PostTriggerParams,
} as const;

export type AutoPauseConfig = z.infer<typeof AutoPauseParams>;
export type MetricSyncConfig = z.infer<typeof MetricSyncParams>;

/** Validate trước khi ghi. Ném lỗi nếu params không hợp lệ. */
export function parseParams(kind: AutomationKind, raw: unknown) {
  return BY_KIND[kind].parse(raw ?? {});
}

/** Đọc phòng thủ: params hỏng thì trả mặc định thay vì làm sập trang. */
export function safeParams<K extends AutomationKind>(
  kind: K,
  raw: unknown,
): z.infer<(typeof BY_KIND)[K]> {
  const result = BY_KIND[kind].safeParse(raw ?? {});
  if (result.success) return result.data as z.infer<(typeof BY_KIND)[K]>;
  console.error(`[config] params hỏng ở cấu hình loại ${kind}:`, result.error.issues);
  return BY_KIND[kind].parse({}) as z.infer<(typeof BY_KIND)[K]>;
}

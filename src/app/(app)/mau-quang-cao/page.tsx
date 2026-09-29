import { requireUser } from '@/lib/session';
import { listTemplates } from '@/lib/queries/templates';
import { TemplateBrowser } from './template-browser';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const user = await requireUser();
  const templates = await listTemplates(user.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mẫu quảng cáo</h1>
          <p>Nhắm đối tượng và ngân sách dùng chung cho đăng tay lẫn tự động chạy ads</p>
        </div>
      </div>

      <div className="note" style={{ maxWidth: 'none', marginBottom: 14 }}>
        Mẫu <b>không chứa nội dung quảng cáo</b> — nội dung luôn là một bài viết có
        sẵn trên Page. Mẫu chỉ giữ phần nhắm đối tượng và ngân sách, nên sửa mẫu là
        mọi chỗ dùng nó đổi theo.
      </div>

      <TemplateBrowser templates={templates} />
    </>
  );
}

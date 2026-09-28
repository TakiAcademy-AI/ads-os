import { requireUser } from '@/lib/session';
import { Sidebar } from '@/components/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="shell">
      <Sidebar userName={user.name} />
      <main className="main">{children}</main>
    </div>
  );
}

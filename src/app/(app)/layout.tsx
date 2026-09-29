import { requireUser } from '@/lib/session';
import { listActiveAccounts, getCurrentAccountId } from '@/lib/account';
import { Sidebar } from '@/components/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [accounts, currentId] = await Promise.all([
    listActiveAccounts(user.id),
    getCurrentAccountId(user.id),
  ]);
  return (
    <div className="shell">
      <Sidebar userName={user.name} accounts={accounts} currentAccountId={currentId} />
      <main className="main">{children}</main>
    </div>
  );
}

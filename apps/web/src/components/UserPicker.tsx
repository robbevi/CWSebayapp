import { useAppUsers } from '../hooks/useAppUsers';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useUserStore } from '../state/useUserStore';

export function UserPicker() {
  const { currentUser, setUser } = useUserStore();
  const { data: users } = useAppUsers();
  const showing = !currentUser && !!users?.length;
  useBodyScrollLock(showing);

  if (!showing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-card bg-surface p-6">
        <h2 className="mb-1 text-base font-semibold text-textPri">Please Select User</h2>
        <p className="mb-4 text-xs text-textMuted">Pick your name so completed parts get credited to you.</p>
        <div className="space-y-2">
          {users.map((u) => (
            <button
              key={u.name}
              type="button"
              onClick={() => setUser(u.name)}
              className="w-full rounded-btn border border-border bg-surface px-4 py-2.5 text-left text-sm font-medium text-textPri hover:bg-surfaceMuted"
            >
              {u.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

import { Check } from 'lucide-react';
import { useAppUsers } from '../hooks/useAppUsers';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useUserStore } from '../state/useUserStore';

export function UserPicker() {
  const { currentUser, switching, setUser, cancelSwitch } = useUserStore();
  const { data: users } = useAppUsers();
  const showing = (!currentUser || switching) && !!users?.length;
  useBodyScrollLock(showing);

  if (!showing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-card bg-surface p-6">
        <h2 className="mb-1 text-base font-semibold text-textPri">
          {switching ? 'Change User' : 'Please Select User'}
        </h2>
        <p className="mb-4 text-xs text-textMuted">
          {switching
            ? 'Work from here on is credited to whoever you pick.'
            : 'Pick your name so completed parts get credited to you.'}
        </p>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {users.map((u) => {
            const isCurrent = u.name === currentUser;
            return (
              <button
                key={u.name}
                type="button"
                onClick={() => setUser(u.name)}
                className={`flex w-full items-center justify-between gap-2 rounded-btn border px-4 py-2.5 text-left text-sm font-medium ${
                  isCurrent
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-textPri hover:bg-surfaceMuted'
                }`}
              >
                {u.name}
                {isCurrent && <Check size={15} className="shrink-0" />}
              </button>
            );
          })}
        </div>
        {/* Only on a change: there is no backing out of the first sign-in, because the app
            needs a name before anything can be credited. */}
        {switching && (
          <button
            type="button"
            onClick={cancelSwitch}
            className="mt-4 w-full rounded-btn border border-border px-4 py-2.5 text-sm font-medium text-textMuted hover:bg-surfaceMuted"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

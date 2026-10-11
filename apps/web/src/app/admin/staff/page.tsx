'use client';

import { useEffect, useState } from 'react';
import { CircleUserRound, KeyRound, ShieldCheck, ToggleLeft, UserPlus } from 'lucide-react';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type Role = 'CUSTOMER' | 'WAITER' | 'CHEF' | 'CASHIER' | 'MANAGER' | 'ADMIN';

type StaffMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

type AuditEntry = {
  id: string;
  action: string;
  details: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    role: Role;
  } | null;
};

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'WAITER' as Role,
};

const roleOptions: Role[] = ['WAITER', 'CHEF', 'CASHIER', 'MANAGER', 'ADMIN'];

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<'ALL' | Role>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadStaff = async () => {
    try {
      setLoading(true);
      setError(null);
      const [staffData, auditData] = await Promise.all([
        apiFetch<StaffMember[]>('/staff'),
        apiFetch<AuditEntry[]>('/staff/audit-log'),
      ]);
      setStaff(staffData);
      setAuditLog(auditData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load staff and audit data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const filteredStaff = filterRole === 'ALL' ? staff : staff.filter((member) => member.role === filterRole);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError('Staff name is required.');
      return;
    }

    if (!form.email.trim() && !form.phone.trim()) {
      setError('Provide either an email or a phone number.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setNotice(null);

      const payload = editingId
        ? {
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          role: form.role,
        }
        : {
          name: form.name.trim(),
          // createStaffSchema accepts string | undefined | '' — never null (B-05)
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          role: form.role,
        };

      if (editingId) {
        await apiFetch(`/staff/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        const result = await apiFetch<{ staff: StaffMember; tempPassword: string }>('/staff', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice(`Staff account created. Share this temporary password securely: ${result.tempPassword}`);
      }

      setForm(emptyForm);
      setEditingId(null);
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Staff update failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (member: StaffMember) => {
    try {
      setError(null);
      await apiFetch(`/staff/${member.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !member.isActive }),
      });
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update staff status.');
    }
  };

  const handleResetPassword = async (member: StaffMember) => {
    try {
      setError(null);
      setNotice(null);
      const result = await apiFetch<{ message: string; tempPassword: string }>(`/staff/${member.id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      setNotice(`${result.message}. Share this temporary password securely: ${result.tempPassword}`);
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    }
  };

  const startEdit = (member: StaffMember) => {
    setEditingId(member.id);
    setForm({
      name: member.name,
      email: member.email ?? '',
      phone: member.phone ?? '',
      role: member.role,
    });
  };

  if (loading) {
    return (
      <AppShell title="Staff" variant="staff">
        <div className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="h-8 w-32 animate-pulse rounded-xl bg-[var(--line)]" />
          <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <div className="h-72 animate-pulse rounded-2xl bg-[var(--line)]" />
            <div className="h-72 animate-pulse rounded-2xl bg-[var(--line)]" />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Staff" variant="staff">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--brand)]">Staff</p>
            <h2 className="mt-2 text-3xl font-display font-bold text-[var(--ink)]">Manage access and activity</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm font-semibold text-[var(--ink-muted)]">
            <CircleUserRound size={16} />
            {staff.length} members
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-[var(--st-late)]/30 bg-[var(--st-late)]/5 p-4 text-sm text-[var(--st-late)]">
            {error}
          </div>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-2xl border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-4 text-sm text-[var(--brand)]">{notice}</p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
          <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-[var(--ink)]">
              <UserPlus size={18} className="text-[var(--brand)]" />
              <h3 className="text-lg font-bold">{editingId ? 'Edit staff member' : 'Add staff member'}</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Full name"
                className="min-h-[44px] w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="Email"
                  className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]"
                />
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="Phone"
                  className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]"
                />
              </div>
              <select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
                className="min-h-[44px] w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-ink)] disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingId ? 'Update staff' : 'Create staff'}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyForm);
                    }}
                    className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-sm font-semibold text-[var(--ink)]"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[var(--ink)]">
                <ShieldCheck size={18} className="text-[var(--brand)]" />
                <h3 className="text-lg font-bold">Staff access</h3>
              </div>

              <select
                value={filterRole}
                onChange={(event) => setFilterRole(event.target.value as 'ALL' | Role)}
                className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]"
              >
                <option value="ALL">All roles</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              {filteredStaff.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-muted)]">
                  No staff members match this role filter.
                </div>
              ) : (
                filteredStaff.map((member) => (
                  <div key={member.id} className="rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-[var(--ink)]">{member.name}</p>
                          <span className="rounded-full bg-[var(--bg)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                            {member.role}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--ink-muted)]">
                          {member.email ?? member.phone ?? 'No contact details'}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(member)}
                          className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
                        >
                          <ToggleLeft size={14} />
                          {member.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(member)}
                          className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetPassword(member)}
                          className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-[var(--brand-ink)]"
                        >
                          <KeyRound size={14} />
                          Reset password
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-[var(--ink)]">
            <ShieldCheck size={18} className="text-[var(--brand)]" />
            <h3 className="text-lg font-bold">Audit log</h3>
          </div>

          <div className="space-y-3">
            {auditLog.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg)] p-5 text-sm text-[var(--ink-muted)]">
                No audit activity captured yet.
              </div>
            ) : (
              auditLog.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[var(--ink)]">{entry.action}</p>
                    <span className="text-xs text-[var(--ink-muted)]">
                      {new Date(entry.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">{entry.details}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                    {entry.user ? `${entry.user.name} · ${entry.user.role}` : 'System action'}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

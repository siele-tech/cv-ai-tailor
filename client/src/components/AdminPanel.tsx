import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import { useToast } from '../state';
import type { AdminUser, Invite } from '../types';
import { Button, Card, ConfirmDialog, Icon, LoadingBlock, Notice, formatDate } from './ui';

const inviteLink = (code: string) => `${window.location.origin}/?invite=${encodeURIComponent(code)}`;

async function shareInvite(code: string): Promise<'shared' | 'copied'> {
  const text = `Join me on CV Tailor AI to tailor your CV to any job. Open ${inviteLink(code)} and your invite code ${code} is filled in for you.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'CV Tailor AI invite', text });
      return 'shared';
    } catch {
      // cancelled: fall through to copying
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

/** Owner tools: invite codes for friends, and the list of people using the app. */
export function AdminPanel() {
  const toast = useToast();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [dailyLimit, setDailyLimit] = useState(0);
  const [error, setError] = useState('');
  const [uses, setUses] = useState(1);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    Promise.all([api.invites(), api.users()])
      .then(([i, u]) => {
        setInvites(i.invites);
        setUsers(u.users);
        setDailyLimit(u.dailyLimit);
      })
      .catch((err) => setError(errorMessage(err)));
  };
  useEffect(load, []);

  async function create() {
    setCreating(true);
    try {
      const { invite } = await api.createInvite(uses, note.trim());
      setInvites((list) => [invite, ...(list ?? [])]);
      setNote('');
      const how = await shareInvite(invite.code).catch(() => null);
      toast('success', how === 'copied' ? `Invite ${invite.code} created and copied. Paste it to your friend.` : `Invite ${invite.code} created.`);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(invite: Invite) {
    try {
      await api.revokeInvite(invite.id);
      setInvites((list) => list?.map((i) => (i.id === invite.id ? { ...i, revoked: true } : i)) ?? null);
      toast('success', `Code ${invite.code} switched off.`);
    } catch (err) {
      toast('error', errorMessage(err));
    }
  }

  async function toggle(user: AdminUser) {
    try {
      await api.setUserDisabled(user.id, !user.disabled);
      setUsers((list) => list?.map((u) => (u.id === user.id ? { ...u, disabled: !u.disabled } : u)) ?? null);
      toast('success', user.disabled ? `${user.name} can use the app again.` : `${user.name} has been switched off.`);
    } catch (err) {
      toast('error', errorMessage(err));
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteUser(toDelete.id);
      setUsers((list) => list?.filter((u) => u.id !== toDelete.id) ?? null);
      toast('success', `${toDelete.name}'s account and CVs were deleted.`);
      setToDelete(null);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!invites || !users) return <LoadingBlock />;
  const active = invites.filter((i) => !i.revoked && i.uses < i.maxUses);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white">
            <Icon name="plus" />
          </span>
          <h2 className="font-bold text-slate-900">Invite a friend</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Each friend gets their own private account: their own master CV, CVs and history. Their AI use counts against your AI key, up to {dailyLimit || 'unlimited'} requests each per day.
        </p>
        <div className="mt-3 grid grid-cols-[auto_1fr] items-end gap-2">
          <label className="text-xs font-medium text-slate-600">
            Uses
            <select value={uses} onChange={(e) => setUses(Number(e.target.value))} className="mt-1 block h-12 rounded-xl border border-slate-300 bg-white px-3 text-slate-900">
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Who is it for? (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. Brian" className="mt-1 block h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900" />
          </label>
        </div>
        <Button variant="primary" icon="sparkles" className="mt-3 w-full" onClick={create} loading={creating}>
          Create and share invite
        </Button>

        {invites.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100">
            {invites.slice(0, 12).map((invite) => {
              const usable = !invite.revoked && invite.uses < invite.maxUses;
              return (
                <li key={invite.id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className={`font-mono text-sm font-bold ${usable ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{invite.code}</p>
                    <p className="text-xs text-slate-500">
                      {[invite.note, `${invite.uses}/${invite.maxUses} used`, invite.revoked ? 'switched off' : ''].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {usable && (
                    <>
                      <Button size="sm" onClick={() => shareInvite(invite.code).then((how) => how === 'copied' && toast('success', 'Invite copied.')).catch(() => undefined)}>
                        Share
                      </Button>
                      <Button size="sm" variant="danger" aria-label={`Switch off ${invite.code}`} icon="trash" onClick={() => revoke(invite)} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {active.length === 0 && invites.length > 0 && <p className="mt-2 text-xs text-slate-500">No unused codes left.</p>}
      </Card>

      <Card>
        <h2 className="font-bold text-slate-900">People using the app</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {users.map((user) => (
            <li key={user.id} className="py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {user.name || 'Unnamed'}
                    {user.role === 'admin' && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800">Owner</span>}
                    {user.disabled && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">Switched off</span>}
                  </p>
                  {user.email && <p className="truncate text-xs text-slate-500">{user.email}</p>}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {user.savedCvs} saved CVs · {user.aiToday} AI requests today
                    {user.lastLoginAt ? ` · last seen ${formatDate(user.lastLoginAt)}` : ''}
                  </p>
                </div>
                {user.role !== 'admin' && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" onClick={() => toggle(user)}>
                      {user.disabled ? 'Switch on' : 'Switch off'}
                    </Button>
                    <Button size="sm" variant="danger" icon="trash" aria-label={`Delete ${user.name}`} onClick={() => setToDelete(user)} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog open={toDelete !== null} title={`Delete ${toDelete?.name ?? 'this person'}?`} confirmLabel="Delete" danger busy={deleting} onCancel={() => setToDelete(null)} onConfirm={confirmDelete}>
        Their account, master CV and every saved CV will be permanently deleted. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}

'use client';

// Security page (spec 6.9): change password + active sessions with per-session
// revoke and "Sign out everywhere else".
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { MonitorSmartphone } from 'lucide-react';
import { ChangePasswordInputSchema, type ChangePasswordInput } from '@/shared/dto/users.dto';
import {
  Badge,
  Button,
  ErrorState,
  Input,
  Skeleton,
  Spinner,
  toast,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage, authApi } from '../auth-api';
import { useAuth } from '../auth-provider';
import { useSessions } from '../hooks';
import { sessionsQueryKey } from '../query-keys';
import { AccountPending } from './account-pending';
import { FormAlert } from './form-alert';

export function SecurityPanel() {
  const { status } = useAuth();

  if (status !== 'authenticated') return <AccountPending />;

  return (
    <section aria-labelledby="security-heading" className="space-y-10">
      <ChangePasswordCard />
      <SessionsCard />
    </section>
  );
}

function ChangePasswordCard() {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(ChangePasswordInputSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await authApi.changePassword(values);
      form.reset();
      toast({ title: 'Password updated', description: 'Use your new password next time you sign in.', variant: 'success' });
    } catch (error) {
      setServerError(apiErrorMessage(error, 'Could not change the password. Please try again.'));
    }
  });

  return (
    <div className="max-w-xl rounded-tile border border-line bg-white p-6">
      <h2 className="text-base font-bold text-ink">Change password</h2>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          error={form.formState.errors.currentPassword?.message}
          {...form.register('currentPassword')}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 10 characters with at least one letter and one digit."
          error={form.formState.errors.newPassword?.message}
          {...form.register('newPassword')}
        />
        {serverError ? <FormAlert>{serverError}</FormAlert> : null}
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Spinner size="sm" /> : null}
            Update password
          </Button>
        </div>
      </form>
    </div>
  );
}

function SessionsCard() {
  const { data: sessions, isLoading, isError, error, refetch } = useSessions();
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
  };

  const revokeOne = useMutation({
    mutationFn: async (sessionId: string) => {
      await authApi.revokeSession(sessionId);
    },
    onSuccess: async () => {
      await invalidate();
      toast({ title: 'Session revoked', variant: 'success' });
    },
    onError: (mutationError) => {
      toast({
        title: 'Could not revoke the session',
        description: apiErrorMessage(mutationError, 'Please try again.'),
        variant: 'error',
      });
    },
  });

  const revokeOthers = useMutation({
    mutationFn: async () => {
      await authApi.revokeOtherSessions();
    },
    onSuccess: async () => {
      await invalidate();
      toast({ title: 'Signed out everywhere else', variant: 'success' });
    },
    onError: (mutationError) => {
      toast({
        title: 'Could not sign out other sessions',
        description: apiErrorMessage(mutationError, 'Please try again.'),
        variant: 'error',
      });
    },
  });

  const others = sessions?.filter((s) => !s.current) ?? [];

  return (
    <div className="rounded-tile border border-line bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">Active sessions</h2>
        {others.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending}
          >
            {revokeOthers.isPending ? <Spinner size="sm" /> : null}
            Sign out everywhere else
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <div className="mt-4">
          <ErrorState
            title="Could not load sessions"
            message={apiErrorMessage(error, 'Please try again.')}
            onRetry={() => {
              void refetch();
            }}
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {(sessions ?? []).map((session) => (
            <li key={session.id} className="flex flex-wrap items-start gap-3 py-4 first:pt-0 last:pb-0">
              <span className="mt-0.5 text-muted" aria-hidden="true">
                <MonitorSmartphone className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-ink">
                    {session.current ? 'This device' : 'Signed-in session'}
                  </p>
                  {session.current ? <Badge variant="brand">Current</Badge> : null}
                </div>
                <p className="mt-0.5 break-all text-xs text-muted">{session.userAgent ?? 'Unknown device'}</p>
                <p className="mt-0.5 text-xs text-muted">
                  IP: {session.ip ?? 'unknown'} · Signed in {formatDateTime(session.createdAt)}
                </p>
              </div>
              {!session.current ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => revokeOne.mutate(session.id)}
                  disabled={revokeOne.isPending}
                >
                  {revokeOne.isPending && revokeOne.variables === session.id ? (
                    <Spinner size="sm" />
                  ) : null}
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

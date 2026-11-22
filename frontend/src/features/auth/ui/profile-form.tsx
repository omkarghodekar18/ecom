'use client';

// Profile page (spec 6.9): firstName / lastName / phone form → PATCH /users/me.
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { UpdateProfileInputSchema, type UpdateProfileInput } from '@/shared/dto/users.dto';
import { Button, Input, Skeleton, Spinner, toast } from '@/components/ui';
import { apiErrorMessage, authApi } from '../auth-api';
import { useAuth } from '../auth-provider';
import { useMe } from '../hooks';
import { meQueryKey } from '../query-keys';
import { AccountPending } from './account-pending';
import { FormAlert } from './form-alert';

export function ProfileForm() {
  const { status } = useAuth();
  const { data: user, isLoading } = useMe();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(UpdateProfileInputSchema),
    defaultValues: { firstName: '', lastName: '', phone: '' },
  });

  const userId = user?.id;
  // Seed the form once the signed-in user arrives (MeDto carries no phone —
  // the field starts empty and fills from the first successful PATCH).
  useEffect(() => {
    if (!userId || !user) return;
    form.reset({ firstName: user.firstName, lastName: user.lastName, phone: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per user
  }, [userId]);

  if (status !== 'authenticated') return <AccountPending />;
  if (isLoading || !user) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const { data } = await authApi.updateProfile(values);
      queryClient.setQueryData(meQueryKey, data);
      form.reset({ firstName: data.firstName, lastName: data.lastName, phone: data.phone ?? '' });
      toast({ title: 'Profile updated', variant: 'success' });
    } catch (error) {
      setServerError(apiErrorMessage(error, 'Could not update your profile. Please try again.'));
    }
  });

  return (
    <section aria-labelledby="profile-heading" className="max-w-xl">
      <h1 id="profile-heading" className="text-2xl font-bold text-ink">
        Profile
      </h1>
      <p className="mt-1 text-sm text-muted">
        Update your contact details. Changes apply to future orders.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            autoComplete="given-name"
            required
            error={form.formState.errors.firstName?.message}
            {...form.register('firstName')}
          />
          <Input
            label="Last name"
            autoComplete="family-name"
            required
            error={form.formState.errors.lastName?.message}
            {...form.register('lastName')}
          />
        </div>
        <Input
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint="Optional — for delivery updates"
          error={form.formState.errors.phone?.message}
          {...form.register('phone')}
        />
        <p className="text-xs text-muted">Email address: {user.email} (cannot be changed)</p>

        {serverError ? <FormAlert>{serverError}</FormAlert> : null}

        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Spinner size="sm" /> : null}
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}

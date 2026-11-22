'use client';

// Addresses page (spec 6.9): list, add/edit (modal), delete (confirm modal)
// and default shipping/billing toggles (PATCH). Form uses AddressInputSchema.
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import type { AddressDto, AddressInput } from '@/shared/dto/address.dto';
import { AddressInputSchema } from '@/shared/dto/address.dto';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  Spinner,
  toast,
} from '@/components/ui';
import { apiErrorMessage, authApi } from '../auth-api';
import { useAddresses } from '../hooks';
import { useAuth } from '../auth-provider';
import { addressesQueryKey } from '../query-keys';
import { AccountPending } from './account-pending';
import { FormAlert } from './form-alert';

type AddressFormValues = z.input<typeof AddressInputSchema>;

/** Maps an AddressDto back onto the full AddressInput payload. */
function toAddressInput(dto: AddressDto, overrides?: Partial<AddressInput>): AddressInput {
  return {
    label: dto.label ?? undefined,
    contactName: dto.contactName,
    phone: dto.phone,
    line1: dto.line1,
    line2: dto.line2 ?? '',
    city: dto.city,
    state: dto.state,
    postalCode: dto.postalCode,
    country: dto.country,
    gstin: dto.gstin ?? undefined,
    isDefaultShipping: dto.isDefaultShipping,
    isDefaultBilling: dto.isDefaultBilling,
    ...overrides,
  };
}

export function AddressesManager() {
  const { status } = useAuth();
  const { data: addresses, isLoading, isError, error, refetch } = useAddresses();
  const [editing, setEditing] = useState<AddressDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AddressDto | null>(null);

  if (status !== 'authenticated') return <AccountPending />;

  return (
    <section aria-labelledby="addresses-heading" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="addresses-heading" className="text-2xl font-bold text-ink">
          Addresses
        </h1>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add address
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          title="Could not load addresses"
          message={apiErrorMessage(error, 'Please try again.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : !addresses || addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-10 w-10" strokeWidth={1.5} />}
          title="No addresses yet"
          description="Add a shipping or billing address to speed up checkout."
        >
          <Button variant="outline" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add address
          </Button>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-col rounded-tile border border-line bg-white p-4"
            >
              <div className="flex flex-wrap gap-1.5">
                {address.isDefaultShipping ? <Badge variant="brand">Default shipping</Badge> : null}
                {address.isDefaultBilling ? <Badge variant="brand">Default billing</Badge> : null}
                {address.label ? <Badge variant="count">{address.label}</Badge> : null}
              </div>
              <div className="mt-2 text-sm">
                <p className="font-bold text-ink">{address.contactName}</p>
                <p className="text-ink">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}
                </p>
                <p className="text-ink">
                  {address.city}, {address.state} {address.postalCode}
                </p>
                <p className="text-muted">Phone: {address.phone}</p>
                {address.gstin ? <p className="text-muted">GSTIN: {address.gstin}</p> : null}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <Button variant="outline" size="sm" onClick={() => setEditing(address)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </Button>
                {!address.isDefaultShipping ? (
                  <SetDefaultButton address={address} kind="shipping" />
                ) : null}
                {!address.isDefaultBilling ? (
                  <SetDefaultButton address={address} kind="billing" />
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-stock-red hover:bg-stock-red/10"
                  onClick={() => setDeleting(address)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <AddressFormModal
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {deleting ? (
        <DeleteAddressModal
          address={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => setDeleting(null)}
        />
      ) : null}
    </section>
  );
}

function SetDefaultButton({ address, kind }: { address: AddressDto; kind: 'shipping' | 'billing' }) {
  const queryClient = useQueryClient();
  const setDefault = useMutation({
    mutationFn: async () => {
      const overrides =
        kind === 'shipping' ? { isDefaultShipping: true } : { isDefaultBilling: true };
      return (await authApi.updateAddress(address.id, toAddressInput(address, overrides))).data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: addressesQueryKey });
      toast({
        title: kind === 'shipping' ? 'Default shipping address updated' : 'Default billing address updated',
        variant: 'success',
      });
    },
    onError: (mutationError) => {
      toast({
        title: 'Could not update defaults',
        description: apiErrorMessage(mutationError, 'Please try again.'),
        variant: 'error',
      });
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setDefault.mutate()}
      disabled={setDefault.isPending}
    >
      {setDefault.isPending ? <Spinner size="sm" /> : null}
      {kind === 'shipping' ? 'Set default shipping' : 'Set default billing'}
    </Button>
  );
}

function AddressFormModal({ address, onClose }: { address: AddressDto | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<AddressFormValues, unknown, AddressInput>({
    resolver: zodResolver(AddressInputSchema),
    defaultValues: {
      label: address?.label ?? '',
      contactName: address?.contactName ?? '',
      phone: address?.phone ?? '',
      line1: address?.line1 ?? '',
      line2: address?.line2 ?? '',
      city: address?.city ?? '',
      state: address?.state ?? '',
      postalCode: address?.postalCode ?? '',
      country: 'IN',
      gstin: address?.gstin ?? '',
      isDefaultShipping: address?.isDefaultShipping ?? false,
      isDefaultBilling: address?.isDefaultBilling ?? false,
    },
  });

  const save = useMutation({
    mutationFn: async (input: AddressInput) => {
      if (address) return (await authApi.updateAddress(address.id, input)).data;
      return (await authApi.createAddress(input)).data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: addressesQueryKey });
      toast({ title: address ? 'Address updated' : 'Address added', variant: 'success' });
      onClose();
    },
    onError: (mutationError) => {
      setServerError(apiErrorMessage(mutationError, 'Could not save the address. Please try again.'));
    },
  });

  const onSubmit = form.handleSubmit((values) => save.mutate(values));

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={address ? 'Edit address' : 'Add address'}
      description="Used for shipping and billing at checkout."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Label"
          placeholder="e.g. Workshop, Head office"
          hint="Optional"
          error={form.formState.errors.label?.message}
          {...form.register('label')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Contact name"
            autoComplete="name"
            required
            error={form.formState.errors.contactName?.message}
            {...form.register('contactName')}
          />
          <Input
            label="Phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            error={form.formState.errors.phone?.message}
            {...form.register('phone')}
          />
        </div>
        <Input
          label="Address line 1"
          autoComplete="address-line1"
          required
          error={form.formState.errors.line1?.message}
          {...form.register('line1')}
        />
        <Input
          label="Address line 2"
          autoComplete="address-line2"
          hint="Optional"
          error={form.formState.errors.line2?.message}
          {...form.register('line2')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="City"
            autoComplete="address-level2"
            required
            error={form.formState.errors.city?.message}
            {...form.register('city')}
          />
          <Input
            label="State"
            autoComplete="address-level1"
            required
            error={form.formState.errors.state?.message}
            {...form.register('state')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Postal code"
            inputMode="numeric"
            autoComplete="postal-code"
            required
            hint="6 digits (India)"
            error={form.formState.errors.postalCode?.message}
            {...form.register('postalCode')}
          />
          <Input
            label="GSTIN"
            autoComplete="off"
            hint="Optional"
            error={form.formState.errors.gstin?.message}
            {...form.register('gstin')}
          />
        </div>

        <Controller
          control={form.control}
          name="isDefaultShipping"
          render={({ field }) => (
            <Checkbox
              label="Set as default shipping address"
              checked={field.value ?? false}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <Controller
          control={form.control}
          name="isDefaultBilling"
          render={({ field }) => (
            <Checkbox
              label="Set as default billing address"
              checked={field.value ?? false}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />

        <p className="text-xs text-muted">Country: India (IN) — more countries coming soon.</p>

        {serverError ? <FormAlert>{serverError}</FormAlert> : null}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Spinner size="sm" /> : null}
            {address ? 'Save address' : 'Add address'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteAddressModal({
  address,
  onClose,
  onDeleted,
}: {
  address: AddressDto;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: async () => {
      await authApi.deleteAddress(address.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: addressesQueryKey });
      toast({ title: 'Address deleted', variant: 'success' });
      onDeleted();
    },
    onError: (mutationError) => {
      setServerError(apiErrorMessage(mutationError, 'Could not delete the address. Please try again.'));
    },
  });

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Delete address?"
      description="This cannot be undone."
    >
      <div className="space-y-4">
        <p className="text-sm text-ink">
          {address.contactName}, {address.line1}, {address.city}, {address.state}{' '}
          {address.postalCode}
        </p>
        {serverError ? <FormAlert>{serverError}</FormAlert> : null}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-stock-red hover:bg-stock-red/90"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {remove.isPending ? <Spinner size="sm" /> : null}
            Delete address
          </Button>
        </div>
      </div>
    </Modal>
  );
}

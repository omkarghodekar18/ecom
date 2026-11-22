// TanStack Query keys for the auth feature and account area. Single source of
// truth so providers, mutations and pages stay in sync.
export const meQueryKey = ['auth', 'me'] as const;
export const addressesQueryKey = ['account', 'addresses'] as const;
export const sessionsQueryKey = ['account', 'sessions'] as const;
export const companyQueryKey = ['account', 'company'] as const;

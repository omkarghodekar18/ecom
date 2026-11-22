'use client';

// Register page (spec 6.8): B2B | B2C toggle, fields per RegisterInputSchema,
// then a mandatory "Verify your email" OTP step that activates the account
// and signs the user in.
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { routes } from '@/config/routes';
import { emailSchema, otpCodeSchema, passwordSchema } from '@/shared/dto/auth.dto';
import { Button, Input, RadioGroup, Spinner } from '@/components/ui';
import { apiErrorMessage, authApi, otpCooldownSeconds } from '../auth-api';
import { useAuth } from '../auth-provider';
import { safeRedirect } from '../safe-redirect';
import type { LoginViewProps } from './login-form';
import { FormAlert, FormNotice } from './form-alert';
import { OtpCodeInput } from './otp-code-input';
import { useCountdown } from './use-countdown';

/** Same rule as the private gstinSchema in shared/dto/auth.dto.ts. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/**
 * Local form schema: a flat object so react-hook-form field types stay simple;
 * on submit it is mapped onto the RegisterInput discriminated union.
 */
const registerFormSchema = z
  .object({
    type: z.enum(['B2B', 'B2C']),
    firstName: z.string().trim().min(1, 'First name is required').max(80),
    lastName: z.string().trim().min(1, 'Last name is required').max(80),
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .regex(/^[+0-9][0-9\-()\s]{5,24}$/, 'Invalid phone number')
      .optional()
      .or(z.literal('')),
    password: passwordSchema,
    companyName: z.string().trim().optional(),
    gstin: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== 'B2B') return;
    if (!data.companyName || data.companyName.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['companyName'],
        message: 'Company name is required (at least 2 characters)',
      });
    }
    if (data.gstin && !GSTIN_PATTERN.test(data.gstin.toUpperCase())) {
      ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'Invalid GSTIN format' });
    }
  });

type RegisterFormValues = z.infer<typeof registerFormSchema>;

const REGISTER_FALLBACK = 'Registration failed. Please try again.';

export function RegisterForm({ locale, redirect }: LoginViewProps) {
  return <RegisterInner locale={locale} redirect={redirect} />;
}

function RegisterInner({ locale, redirect }: LoginViewProps) {
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const countdown = useCountdown();
  const { login } = useAuth();
  const router = useRouter();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      type: 'B2B',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      companyName: '',
      gstin: '',
    },
  });
  const accountType = useWatch({ control: form.control, name: 'type' }) ?? 'B2B';

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const payload =
      values.type === 'B2B'
        ? {
            type: 'B2B' as const,
            email: values.email,
            password: values.password,
            firstName: values.firstName,
            lastName: values.lastName,
            phone: values.phone ? values.phone : undefined,
            companyName: values.companyName ?? '',
            gstin: values.gstin ? values.gstin.toUpperCase() : undefined,
          }
        : {
            type: 'B2C' as const,
            email: values.email,
            password: values.password,
            firstName: values.firstName,
            lastName: values.lastName,
            phone: values.phone ? values.phone : undefined,
          };
    try {
      // 202 with a generic message — the UI never reveals whether the
      // email is already registered at this point.
      await authApi.register(payload);
      setEmail(values.email);
      setCode('');
      setStep('verify');
      countdown.start(60);
    } catch (error) {
      setServerError(apiErrorMessage(error, REGISTER_FALLBACK));
    }
  });

  const verifyCode = async () => {
    const parsed = otpCodeSchema.safeParse(code);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? 'Enter the 6-digit code from your email.');
      return;
    }
    setServerError(null);
    setVerifying(true);
    try {
      const { data } = await authApi.verifyEmail({ email, code: parsed.data });
      login(data.user, data.accessToken);
      router.replace(safeRedirect(redirect));
    } catch (error) {
      setServerError(apiErrorMessage(error, 'Could not verify the code. Please try again.'));
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const resendCode = async () => {
    setServerError(null);
    setNotice(null);
    setResending(true);
    try {
      // For unverified accounts this route sends the REGISTER verification OTP.
      await authApi.requestLoginOtp({ email });
      countdown.start(60);
      setNotice('A new code has been sent to your inbox.');
    } catch (error) {
      setServerError(apiErrorMessage(error, 'Could not resend the code. Please try again.'));
      const cooldown = otpCooldownSeconds(error);
      if (cooldown) countdown.start(cooldown);
    } finally {
      setResending(false);
    }
  };

  if (step === 'verify') {
    const codeComplete = /^\d{6}$/.test(code);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-ink">Verify your email</h1>
        <p className="text-sm text-muted">
          We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>. Enter it
          below to activate your account. The code expires after 10 minutes.
        </p>
        <OtpCodeInput
          label="Email verification code"
          value={code}
          onChange={(value) => {
            setCode(value);
            if (serverError) setServerError(null);
          }}
          disabled={verifying}
          autoFocus
        />
        {serverError ? <FormAlert>{serverError}</FormAlert> : null}
        {notice ? <FormNotice>{notice}</FormNotice> : null}
        <Button type="button" onClick={verifyCode} fullWidth disabled={!codeComplete || verifying}>
          {verifying ? <Spinner size="sm" /> : null}
          Verify email and continue
        </Button>
        <div className="flex items-center justify-between text-sm">
          {countdown.remaining > 0 ? (
            <span className="text-muted">Resend available in {countdown.remaining}s</span>
          ) : (
            <button
              type="button"
              onClick={resendCode}
              disabled={resending}
              className="text-brand underline underline-offset-2 disabled:text-muted disabled:no-underline"
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setStep('form');
              setCode('');
              setServerError(null);
              setNotice(null);
            }}
            className="text-brand underline underline-offset-2"
          >
            Change details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Create account</h1>
      <p className="mt-1 text-sm text-muted">
        Email verification via a 6-digit code is required before the account is activated.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <RadioGroup
          label="Account type"
          name="account-type"
          orientation="horizontal"
          value={accountType}
          onValueChange={(value) => {
            if (value === 'B2B' || value === 'B2C') form.setValue('type', value);
          }}
          options={[
            { value: 'B2B', label: 'Business (B2B)', description: 'Company account with GSTIN' },
            { value: 'B2C', label: 'Personal (B2C)', description: 'Individual customer' },
          ]}
        />

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
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />

        <Input
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint="Optional — for delivery updates"
          error={form.formState.errors.phone?.message}
          {...form.register('phone')}
        />

        {accountType === 'B2B' ? (
          <>
            <Input
              label="Company name"
              autoComplete="organization"
              required
              error={form.formState.errors.companyName?.message}
              {...form.register('companyName')}
            />
            <Input
              label="GSTIN"
              hint="Optional — 15-character GST identification number"
              autoComplete="off"
              error={form.formState.errors.gstin?.message}
              {...form.register('gstin')}
            />
          </>
        ) : null}

        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 10 characters with at least one letter and one digit."
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />

        {serverError ? <FormAlert>{serverError}</FormAlert> : null}

        <Button type="submit" fullWidth disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Spinner size="sm" /> : null}
          Create account
        </Button>

        <p className="text-sm">
          Already have an account?{' '}
          <Link href={routes(locale).login(redirect)} className="text-brand underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}

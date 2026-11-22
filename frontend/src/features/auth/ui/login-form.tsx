'use client';

// Login page (spec 6.8): "Password" | "Email OTP" tabs with orange underline.
// Password tab handles EMAIL_UNVERIFIED with a resend-verification action;
// OTP tab is a two-step request/verify flow with a 60 s resend countdown.
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ApiError,
} from '@/lib/api-client';
import { routes } from '@/config/routes';
import {
  LoginPasswordInputSchema,
  OtpRequestInputSchema,
  otpCodeSchema,
  type LoginPasswordInput,
  type OtpRequestInput,
} from '@/shared/dto/auth.dto';
import { Button, Input, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { apiErrorMessage, authApi, otpCooldownSeconds } from '../auth-api';
import { useAuth } from '../auth-provider';
import { safeRedirect } from '../safe-redirect';
import { FormAlert, FormNotice } from './form-alert';
import { OtpCodeInput } from './otp-code-input';
import { useCountdown } from './use-countdown';

export interface LoginViewProps {
  /** Locale base, e.g. "/in/en". */
  locale: string;
  /** Raw `?redirect=` value (validated through safeRedirect before use). */
  redirect?: string;
}

const GENERIC_LOGIN_FALLBACK = 'Sign in failed. Please try again.';

export function LoginForm({ locale, redirect }: LoginViewProps) {
  const showCheckoutBanner = typeof redirect === 'string' && redirect.includes('/checkout');

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Sign in to your ToolHub India account.</p>
      {showCheckoutBanner ? (
        <div className="mt-4">
          <FormNotice>Please sign in to continue to checkout.</FormNotice>
        </div>
      ) : null}
      <Tabs defaultValue="password" className="mt-6">
        <TabsList aria-label="Sign-in method">
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="otp">Email OTP</TabsTrigger>
        </TabsList>
        <TabsContent value="password" className="pt-6">
          <PasswordLoginForm locale={locale} redirect={redirect} />
        </TabsContent>
        <TabsContent value="otp" className="pt-6">
          <OtpLoginForm locale={locale} redirect={redirect} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PasswordLoginForm({ locale, redirect }: LoginViewProps) {
  const { login } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const form = useForm<LoginPasswordInput>({
    resolver: zodResolver(LoginPasswordInputSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    setUnverifiedEmail(null);
    setResendState('idle');
    try {
      const { data } = await authApi.loginWithPassword(values);
      login(data.user, data.accessToken);
      router.replace(safeRedirect(redirect));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_UNVERIFIED') {
        setUnverifiedEmail(values.email);
      }
      setServerError(apiErrorMessage(error, GENERIC_LOGIN_FALLBACK));
    }
  });

  const resendVerification = async () => {
    if (!unverifiedEmail) return;
    setResendState('sending');
    try {
      // For unverified accounts this route sends the REGISTER verification OTP.
      await authApi.requestLoginOtp({ email: unverifiedEmail });
      setResendState('sent');
    } catch (error) {
      setResendState('idle');
      setServerError(apiErrorMessage(error, 'Could not resend the code. Please try again.'));
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={form.formState.errors.password?.message}
        {...form.register('password')}
      />

      {serverError ? <FormAlert>{serverError}</FormAlert> : null}

      {unverifiedEmail ? (
        <div className="rounded-btn border border-line bg-tile p-3 text-sm text-ink">
          <p className="font-medium">Your email address is not verified yet.</p>
          {resendState === 'sent' ? (
            <p className="mt-1 text-muted">
              Code sent. Check your inbox, then switch to the Email OTP tab to verify and sign in.
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={resendVerification}
              disabled={resendState === 'sending'}
            >
              {resendState === 'sending' ? <Spinner size="sm" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
              Resend verification code
            </Button>
          )}
        </div>
      ) : null}

      <Button type="submit" fullWidth disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? <Spinner size="sm" /> : null}
        Sign in
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Link href={routes(locale).forgotPassword} className="text-brand underline underline-offset-2">
          Forgot password?
        </Link>
        <Link
          href={routes(locale).register(redirect)}
          className="text-brand underline underline-offset-2"
        >
          Create account
        </Link>
      </div>
    </form>
  );
}

function OtpLoginForm({ locale, redirect }: LoginViewProps) {
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const countdown = useCountdown();

  const emailForm = useForm<OtpRequestInput>({
    resolver: zodResolver(OtpRequestInputSchema),
    defaultValues: { email: '' },
  });

  const requestCode = emailForm.handleSubmit(async (values) => {
    setServerError(null);
    setNotice(null);
    try {
      await authApi.requestLoginOtp(values);
      setEmail(values.email);
      setCode('');
      setStep('code');
      countdown.start(60);
    } catch (error) {
      setServerError(apiErrorMessage(error, 'Could not send the code. Please try again.'));
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
      const { data } = await authApi.verifyLoginOtp({ email, code: parsed.data });
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

  if (step === 'email') {
    return (
      <form onSubmit={requestCode} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          We will send a 6-digit sign-in code to your email address.
        </p>
        <Input
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          error={emailForm.formState.errors.email?.message}
          {...emailForm.register('email')}
        />
        {serverError ? <FormAlert>{serverError}</FormAlert> : null}
        <Button type="submit" fullWidth disabled={emailForm.formState.isSubmitting}>
          {emailForm.formState.isSubmitting ? <Spinner size="sm" /> : null}
          Send code
        </Button>
        <p className="text-sm">
          No account yet?{' '}
          <Link
            href={routes(locale).register(redirect)}
            className="text-brand underline underline-offset-2"
          >
            Create account
          </Link>
        </p>
      </form>
    );
  }

  const codeComplete = /^\d{6}$/.test(code);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Enter the 6-digit code we sent to <span className="font-medium text-ink">{email}</span>. The
        code expires after 10 minutes.
      </p>
      <OtpCodeInput
        label="Sign-in code"
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
        Verify and sign in
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setStep('email');
            setCode('');
            setServerError(null);
            setNotice(null);
          }}
          className="text-brand underline underline-offset-2"
        >
          Use a different email
        </button>
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
      </div>
    </div>
  );
}

'use client';

// Forgot-password page (spec 6.8/10): email → 6-digit OTP + new password →
// success panel. Responses are generic (202) and never reveal whether the
// email exists.
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { routes } from '@/config/routes';
import {
  ForgotPasswordInputSchema,
  otpCodeSchema,
  passwordSchema,
  type ForgotPasswordInput,
} from '@/shared/dto/auth.dto';
import { Button, Input, Spinner } from '@/components/ui';
import { apiErrorMessage, authApi, otpCooldownSeconds } from '../auth-api';
import type { LoginViewProps } from './login-form';
import { FormAlert, FormNotice } from './form-alert';
import { OtpCodeInput } from './otp-code-input';
import { useCountdown } from './use-countdown';

const RESET_FALLBACK = 'Could not reset the password. Please try again.';

export function ForgotPasswordForm({ locale }: LoginViewProps) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const countdown = useCountdown();

  const emailForm = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordInputSchema),
    defaultValues: { email: '' },
  });

  const requestCode = emailForm.handleSubmit(async (values) => {
    setServerError(null);
    setNotice(null);
    try {
      await authApi.forgotPassword(values);
      setEmail(values.email);
      setCode('');
      setNewPassword('');
      setStep('reset');
      countdown.start(60);
    } catch (error) {
      setServerError(apiErrorMessage(error, 'Could not send the code. Please try again.'));
    }
  });

  const submitReset = async () => {
    const parsedCode = otpCodeSchema.safeParse(code);
    const parsedPassword = passwordSchema.safeParse(newPassword);
    if (!parsedCode.success) {
      setServerError(parsedCode.error.issues[0]?.message ?? 'Enter the 6-digit code from your email.');
      return;
    }
    if (!parsedPassword.success) {
      setServerError(
        parsedPassword.error.issues[0]?.message ??
          'Password must be at least 10 characters with one letter and one digit.',
      );
      return;
    }
    setServerError(null);
    setSubmitting(true);
    try {
      await authApi.resetPassword({ email, code: parsedCode.data, newPassword: parsedPassword.data });
      setStep('done');
    } catch (error) {
      setServerError(apiErrorMessage(error, RESET_FALLBACK));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    setServerError(null);
    setNotice(null);
    setResending(true);
    try {
      await authApi.forgotPassword({ email });
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

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-ink">Password reset</h1>
        <FormNotice>
          Your password has been reset. You can now sign in with your new password.
        </FormNotice>
        <Button onClick={() => router.replace(routes(locale).login())} fullWidth>
          Back to sign in
        </Button>
      </div>
    );
  }

  if (step === 'reset') {
    const codeComplete = /^\d{6}$/.test(code);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-ink">Reset your password</h1>
        <p className="text-sm text-muted">
          Enter the 6-digit code we sent to <span className="font-medium text-ink">{email}</span>{' '}
          and choose a new password.
        </p>
        <OtpCodeInput
          label="Password reset code"
          value={code}
          onChange={(value) => {
            setCode(value);
            if (serverError) setServerError(null);
          }}
          disabled={submitting}
          autoFocus
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            if (serverError) setServerError(null);
          }}
          hint="At least 10 characters with at least one letter and one digit."
        />
        {serverError ? <FormAlert>{serverError}</FormAlert> : null}
        {notice ? <FormNotice>{notice}</FormNotice> : null}
        <Button
          type="button"
          onClick={submitReset}
          fullWidth
          disabled={!codeComplete || newPassword.length === 0 || submitting}
        >
          {submitting ? <Spinner size="sm" /> : null}
          Reset password
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
              setStep('email');
              setCode('');
              setNewPassword('');
              setServerError(null);
              setNotice(null);
            }}
            className="text-brand underline underline-offset-2"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Forgot password</h1>
      <p className="mt-1 text-sm text-muted">
        Enter your email address and we will send you a 6-digit code to reset your password.
      </p>
      <form onSubmit={requestCode} noValidate className="mt-6 flex flex-col gap-4">
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
          Send reset code
        </Button>
        <p className="text-sm">
          Remembered it?{' '}
          <Link href={routes(locale).login()} className="text-brand underline underline-offset-2">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}

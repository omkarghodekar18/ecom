// Mail template tests: complete subject lines, payload presence, purpose-
// specific subjects, and the TOOLHUB chrome in every rendered email.
import { describe, expect, it } from 'vitest';
import {
  otpTemplate,
  passwordResetTemplate,
  welcomeTemplate,
} from '../../src/services/mail/index.js';

describe('otpTemplate', () => {
  it('contains the code and TTL in both parts for every purpose', () => {
    for (const purpose of ['REGISTER', 'LOGIN', 'RESET_PASSWORD'] as const) {
      const mail = otpTemplate(purpose, '418253', 10);
      expect(mail.subject.length).toBeGreaterThan(10);
      expect(mail.html).toContain('418253');
      expect(mail.text).toContain('418253');
      expect(mail.text).toContain('10 minutes');
    }
  });

  it('uses a different subject line per purpose', () => {
    const subjects = new Set(
      (['REGISTER', 'LOGIN', 'RESET_PASSWORD'] as const).map((p) => otpTemplate(p, '000000', 10).subject),
    );
    expect(subjects.size).toBe(3);
  });

  it('uses purpose-specific wording', () => {
    expect(otpTemplate('REGISTER', '111111', 10).subject).toContain('Verify');
    expect(otpTemplate('LOGIN', '222222', 10).subject).toContain('sign-in');
    expect(otpTemplate('RESET_PASSWORD', '333333', 10).subject).toContain('Reset');
  });

  it('renders the code big and spaced in the HTML body', () => {
    const mail = otpTemplate('LOGIN', '739104', 10);
    expect(mail.html).toMatch(/letter-spacing:\s*10px/);
    expect(mail.html).toContain('739104');
  });
});

describe('welcomeTemplate', () => {
  it('greets the recipient by name in subject, html and text', () => {
    const mail = welcomeTemplate('Rajesh');
    expect(mail.subject).toContain('Welcome');
    expect(mail.html).toContain('Rajesh');
    expect(mail.text).toContain('Rajesh');
  });

  it('confirms the account is active', () => {
    expect(welcomeTemplate('Rajesh').subject).toContain('active');
  });
});

describe('passwordResetTemplate', () => {
  it('addresses the recipient and mentions the password change', () => {
    const mail = passwordResetTemplate('Rajesh');
    expect(mail.subject).toContain('password was changed');
    expect(mail.html).toContain('Rajesh');
    expect(mail.text).toContain('Rajesh');
    expect(mail.text).toContain('password');
  });

  it('warns what to do if the change was not yours', () => {
    const mail = passwordResetTemplate('Rajesh');
    expect(mail.html).toContain('If you did not make this change');
    expect(mail.text).toContain('If you did not make this change');
  });
});

describe('shared chrome (all templates)', () => {
  const mails = [
    otpTemplate('REGISTER', '418253', 10),
    welcomeTemplate('Rajesh'),
    passwordResetTemplate('Rajesh'),
  ];

  it.each(mails.map((m, i) => [`template #${i}`, m]))(
    'renders the TOOLHUB header band and footer in %s',
    (_label, mail) => {
      expect(mail.html).toContain('TOOLHUB');
      expect(mail.html).toMatch(/background:#EA580C|color:#EA580C/); // orange brand accent
      expect(mail.html).toContain('support@toolhub.example'); // contact placeholder footer
      expect(mail.html).toContain('<!DOCTYPE html>');
      expect(mail.text).toContain('TOOLHUB');
      expect(mail.text.length).toBeGreaterThan(50); // real text body, not empty
    },
  );

  it('escapes HTML in interpolated values', () => {
    const mail = welcomeTemplate('Raj<i>esh');
    expect(mail.html).toContain('&lt;i&gt;');
    expect(mail.html).not.toContain('<i>');
  });
});

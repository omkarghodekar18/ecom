// Mail service: renders a typed template and hands it to the configured
// provider (MAIL_PROVIDER: 'file' outbox for dev, 'smtp' otherwise).
// Callers use the overloaded sendMail(to, template, context) — each template
// name accepts exactly its own context type.
import { getEnv } from '../../config/env.js';
import type { OtpPurpose } from '../../shared/enums.js';
import { FileMailProvider } from './file-mail.provider.js';
import type { MailContent, MailProvider } from './mail.types.js';
import { SmtpMailProvider } from './smtp-mail.provider.js';
import type { OrderConfirmationContext } from './templates/order-confirmation.template.js';
import { otpTemplate } from './templates/otp.template.js';
import { orderConfirmationTemplate } from './templates/order-confirmation.template.js';
import { passwordResetTemplate } from './templates/password-reset.template.js';
import { welcomeTemplate } from './templates/welcome.template.js';

/** Context per template — the map is the source of truth for the overloads. */
export interface MailTemplateContextMap {
  otp: { purpose: OtpPurpose; code: string; ttlMinutes: number };
  welcome: { name: string };
  'password-reset': { name: string };
  'order-confirmation': OrderConfirmationContext;
}

export type MailTemplateName = keyof MailTemplateContextMap;
export type MailTemplateContext = MailTemplateContextMap[MailTemplateName];

/** Registry: template name → renderer. Types are enforced by the map above. */
const renderers: { [K in MailTemplateName]: (ctx: MailTemplateContextMap[K]) => MailContent } = {
  otp: ({ purpose, code, ttlMinutes }) => otpTemplate(purpose, code, ttlMinutes),
  welcome: ({ name }) => welcomeTemplate(name),
  'password-reset': ({ name }) => passwordResetTemplate(name),
  'order-confirmation': (order) => orderConfirmationTemplate(order),
};

/**
 * Correlated render: `renderMail('otp', { purpose, code, ttlMinutes })` is
 * fully typed; the generic keeps name and context in sync without casts.
 */
function renderMail<K extends MailTemplateName>(template: K, context: MailTemplateContextMap[K]): MailContent {
  return renderers[template](context);
}

let provider: MailProvider | undefined;

/** Picks the provider once per process from MAIL_PROVIDER. */
function getProvider(): MailProvider {
  if (!provider) {
    const env = getEnv();
    provider = env.MAIL_PROVIDER === 'smtp' ? new SmtpMailProvider(env.SMTP_URL) : new FileMailProvider();
  }
  return provider;
}

/** Overrides the provider (used by tests / future admin tooling). */
export function setMailProvider(replacement: MailProvider | undefined): void {
  provider = replacement;
}

/**
 * Renders and sends an OTP email (registration verify, OTP login, reset).
 * Never rejects: the chosen provider absorbs transport errors (see providers).
 */
export function sendMail(to: string, template: 'otp', context: MailTemplateContextMap['otp']): Promise<void>;
/** Renders and sends the account-activated welcome email. Never rejects. */
export function sendMail(to: string, template: 'welcome', context: MailTemplateContextMap['welcome']): Promise<void>;
/** Renders and sends the password-changed notification. Never rejects. */
export function sendMail(
  to: string,
  template: 'password-reset',
  context: MailTemplateContextMap['password-reset'],
): Promise<void>;
/** Renders and sends the order confirmation (background job). Never rejects. */
export function sendMail(
  to: string,
  template: 'order-confirmation',
  context: MailTemplateContextMap['order-confirmation'],
): Promise<void>;
export async function sendMail(
  to: string,
  template: MailTemplateName,
  context: MailTemplateContext,
): Promise<void> {
  const content = renderMail(template, context);
  await getProvider().send({ to, ...content });
}

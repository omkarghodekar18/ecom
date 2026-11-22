export { sendMail, setMailProvider } from './mail.service.js';
export type {
  MailTemplateContext,
  MailTemplateContextMap,
  MailTemplateName,
} from './mail.service.js';
export { FileMailProvider } from './file-mail.provider.js';
export { SmtpMailProvider } from './smtp-mail.provider.js';
export type { MailContent, MailMessage, MailProvider } from './mail.types.js';
export { otpTemplate } from './templates/otp.template.js';
export { welcomeTemplate } from './templates/welcome.template.js';
export { passwordResetTemplate } from './templates/password-reset.template.js';
export { escapeHtml, renderLayout, renderTextFooter } from './templates/layout.js';

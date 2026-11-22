// Tiny typed template engine (no dependency): shared escape helper plus the
// TOOLHUB email chrome every template renders into. Inline CSS only — email
// clients strip <style> blocks and <link>ed stylesheets unpredictably.

/** Brand palette (kept in one place; must match the storefront design tokens). */
const BRAND = {
  orange: '#EA580C',
  orangeSoft: '#FFF3EA',
  ink: '#1F2937',
  muted: '#6B7280',
  border: '#E5E7EB',
  pageBg: '#F4F5F7',
} as const;

/** Escapes a value for safe interpolation into HTML (attributes and text). */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface LayoutInput {
  /** One-line summary the inbox shows next to the subject; hidden in the body. */
  preheader: string;
  /** Template-specific body HTML (built from escaped values only). */
  bodyHtml: string;
}

/**
 * Wraps a template body in the TOOLHUB chrome: white header band with the
 * wordmark, orange rule, content card and a footer with contact placeholders.
 */
export function renderLayout({ preheader, bodyHtml }: LayoutInput): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ToolHub</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.pageBg};font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.pageBg};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:20px 32px;background:#ffffff;border-bottom:4px solid ${BRAND.orange};">
                <span style="display:inline-block;width:12px;height:12px;background:${BRAND.orange};margin-right:8px;"></span><span style="font-size:22px;font-weight:bold;letter-spacing:1px;color:${BRAND.ink};">TOOLHUB</span>
                <span style="display:block;margin-top:2px;font-size:11px;color:${BRAND.muted};">Industrial tools &amp; workshop equipment</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px 32px;font-size:15px;line-height:24px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 28px 32px;">
                <hr style="border:none;border-top:1px solid ${BRAND.border};margin:0 0 16px 0;" />
                <p style="margin:0 0 8px 0;font-size:12px;line-height:18px;color:${BRAND.muted};">
                  Questions? Contact ToolHub India:
                  <a href="mailto:support@toolhub.example" style="color:${BRAND.orange};text-decoration:underline;">support@toolhub.example</a>
                  &nbsp;|&nbsp; +91 22 4000 0000
                </p>
                <p style="margin:0;font-size:11px;line-height:16px;color:${BRAND.muted};">
                  ToolHub India Pvt. Ltd., 4th Floor, Orbit Industrial Estate, Andheri East, Mumbai 400093, India.<br />
                  You are receiving this message because of activity on your ToolHub account.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Renders the plain-text twin of the chrome: separator bars instead of the
 * header band, contact block as plain lines. Kept in the same file so the
 * HTML and text footers cannot drift apart.
 */
export function renderTextFooter(): string {
  return [
    '--------------------------------------------------',
    'TOOLHUB — Industrial tools & workshop equipment',
    'Questions? Contact ToolHub India:',
    '  Email: support@toolhub.example',
    '  Phone: +91 22 4000 0000',
    'ToolHub India Pvt. Ltd., 4th Floor, Orbit Industrial Estate, Andheri East, Mumbai 400093, India.',
    'You are receiving this message because of activity on your ToolHub account.',
  ].join('\n');
}

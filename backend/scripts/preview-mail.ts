// Renders every mail template to var/outbox/preview-*.html|.txt so the exact
// emails can be inspected in a browser (spec Section 10 preview script).
// Run from backend/: npm run mail:preview
import '../src/load-env.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { otpTemplate, passwordResetTemplate, welcomeTemplate } from '../src/services/mail/index.js';

interface Preview {
  name: string;
  mail: { subject: string; html: string; text: string };
}

const previews: Preview[] = [
  { name: 'otp-register', mail: otpTemplate('REGISTER', '418253', 10) },
  { name: 'otp-login', mail: otpTemplate('LOGIN', '739104', 10) },
  { name: 'otp-reset-password', mail: otpTemplate('RESET_PASSWORD', '205867', 10) },
  { name: 'welcome', mail: welcomeTemplate('Rajesh') },
  { name: 'password-reset', mail: passwordResetTemplate('Rajesh') },
];

async function main(): Promise<void> {
  const outDir = resolve(process.cwd(), 'var/outbox');
  await mkdir(outDir, { recursive: true });
  for (const { name, mail } of previews) {
    const base = `${outDir}/preview-${name}`;
    await writeFile(`${base}.html`, mail.html, 'utf8');
    await writeFile(`${base}.txt`, `Subject: ${mail.subject}\n\n${mail.text}\n`, 'utf8');
    console.log(`${base}.html`);
    console.log(`${base}.txt`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

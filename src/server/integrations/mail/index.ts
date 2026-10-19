import { env } from '@config/env';
import { ConsoleMailProvider } from './console.provider';
import type { MailProvider } from './mail-provider';
import { SmtpMailProvider } from './smtp.provider';

export type { MailAttachment, MailMessage, MailProvider } from './mail-provider';
export { ConsoleMailProvider, maskEmail } from './console.provider';
export { SmtpMailProvider } from './smtp.provider';

let provider: MailProvider | null = null;
let forced = false;

/** The mail service chosen by `MAIL_PROVIDER`. */
export function getMailProvider(): MailProvider {
  if (provider && (forced || provider.name === env.mail.provider)) return provider;
  provider =
    env.mail.provider === 'smtp'
      ? new SmtpMailProvider({ ...env.mail.smtp, host: env.mail.smtp.host!, from: env.mail.from })
      : new ConsoleMailProvider();
  return provider;
}

/** Test hook: use this provider from now on. */
export function setMailProvider(next: MailProvider | null): void {
  provider = next;
  forced = next !== null;
}

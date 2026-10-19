import type { MailMessage, MailProvider } from './mail-provider';

/** `jerald.p@itbs.com.ph` becomes `j***@itbs.com.ph`: enough to recognise in a log, not enough to be someone's address. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 1) return '***';
  return `${address[0]}***${address.slice(at)}`;
}

export class ConsoleMailProvider implements MailProvider {
  readonly name = 'console' as const;
  /** Everything "sent" so far. In memory only, for tests; never written anywhere. */
  readonly sent: MailMessage[] = [];

  constructor(private readonly log: (line: string) => void = (line) => console.log(line)) {}

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    this.log(`[mail] (console, not sent) to ${maskEmail(message.to)}: ${message.subject}`);
  }
}

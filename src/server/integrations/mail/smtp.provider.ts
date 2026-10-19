import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, MailProvider } from './mail-provider';

export type SmtpOptions = { host: string; port: number; secure: boolean; user?: string; password?: string; from: string };

export class SmtpMailProvider implements MailProvider {
  readonly name = 'smtp' as const;
  private readonly transporter: Transporter;

  constructor(
    private readonly options: SmtpOptions,
    transporter?: Transporter,
  ) {
    this.transporter =
      transporter ??
      nodemailer.createTransport({
        host: options.host,
        port: options.port,
        secure: options.secure,
        auth: options.user ? { user: options.user, pass: options.password ?? '' } : undefined,
        // A hung mail server must not hold a request or a worker for long.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.options.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid })),
    });
  }
}

/**
 * Mail adapter (NTF-01). The app only ever says "send this message to this person"; which service carries it is one setting.
 *
 *   console   the default: sends nothing, keeps the message in memory (for tests and the dev log) and logs ONE line that says
 *             a message was sent to a masked address with a subject. It never logs the body or the attachments: they hold a ticket's
 *             QR code, which is as good as the ticket.
 *   smtp      a real SMTP server (nodemailer).
 */
export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  /** Set to show the image inside the message body (`<img src="cid:...">`) as well as attached. */
  cid?: string;
};

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
};

export interface MailProvider {
  readonly name: 'console' | 'smtp';
  /** Rejects if the message could not be handed to the service. */
  send(message: MailMessage): Promise<void>;
}

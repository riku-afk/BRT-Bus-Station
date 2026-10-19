import { describe, expect, it, vi } from 'vitest';
import { ConsoleMailProvider, maskEmail } from './console.provider';
import { SmtpMailProvider } from './smtp.provider';

const message = {
  to: 'jerald.punzalan@itbs.com.ph',
  subject: 'Your BRT ticket BRT-ABC234',
  text: 'secret body with the QR link',
  html: '<p>secret body</p>',
  attachments: [{ filename: 'ticket.png', content: Buffer.from('QR-BYTES'), contentType: 'image/png', cid: 'ticket-qr' }],
};

describe('maskEmail', () => {
  it('keeps the first letter and the domain, and nothing else of the name', () => {
    expect(maskEmail('jerald.punzalan@itbs.com.ph')).toBe('j***@itbs.com.ph');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail('not an address')).toBe('***');
    expect(maskEmail('')).toBe('***');
  });
});

describe('the console mail provider (the default)', () => {
  it('sends nothing: it keeps the message in memory and logs one masked line', async () => {
    const log = vi.fn();
    const provider = new ConsoleMailProvider(log);
    await provider.send(message);
    expect(provider.sent).toEqual([message]);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]![0]).toBe('[mail] (console, not sent) to j***@itbs.com.ph: Your BRT ticket BRT-ABC234');
  });

  it('never logs the body, the QR or the full address: they are as good as the ticket', async () => {
    const log = vi.fn();
    await new ConsoleMailProvider(log).send(message);
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain('QR-BYTES');
    expect(logged).not.toContain('jerald.punzalan');
  });
});

describe('the SMTP mail provider', () => {
  const options = { host: 'smtp.example.test', port: 587, secure: false, user: 'u', password: 'p', from: 'BRT <no-reply@brt.test>' };

  it('hands the message to the mail server with the configured sender, the text, the HTML and the QR attached inline', async () => {
    const sendMail = vi.fn<(message: unknown) => Promise<object>>(async () => ({}));
    await new SmtpMailProvider(options, { sendMail } as never).send(message);
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0]![0]).toEqual({
      from: 'BRT <no-reply@brt.test>',
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: [{ filename: 'ticket.png', content: message.attachments[0]!.content, contentType: 'image/png', cid: 'ticket-qr' }],
    });
  });

  it('passes a failure on, so the caller can tell the message did not go', async () => {
    const sendMail = vi.fn(async () => Promise.reject(new Error('connect ECONNREFUSED')));
    await expect(new SmtpMailProvider(options, { sendMail } as never).send(message)).rejects.toThrow('ECONNREFUSED');
  });
});

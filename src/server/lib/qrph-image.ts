import { existsSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';

/**
 * The QR Ph code for a payment, as a PNG, with the QR Ph logo in the middle.
 *
 * The payload is the EMV string PisoPay generated: it already carries the amount and the merchant, so it is encoded as is
 * and never altered. The logo covers the centre, so the code uses the highest error correction (H, about 30% of the code
 * can be lost) and the logo stays well under that (about 5% of the area, behind a white quiet square).
 *
 * The logo is the official QR Ph mark at `public/logo/qr-ph_logo.png`. If the file is missing the code is still produced,
 * just without a logo.
 */
const SIZE = 640;
/** The logo's side as a share of the QR side. 22% across is about 5% of the area: far inside what level H can lose. */
const LOGO_SHARE = 0.22;

function logoPath(): string | null {
  const path = join(process.cwd(), 'public', 'logo', 'qr-ph_logo.png');
  return existsSync(path) ? path : null;
}

export async function qrPhPng(payload: string): Promise<Buffer> {
  const base = await QRCode.toBuffer(payload, { type: 'png', errorCorrectionLevel: 'H', margin: 3, width: SIZE, color: { dark: '#000000', light: '#ffffff' } });
  const path = logoPath();
  if (!path) return base;

  const box = Math.round(SIZE * LOGO_SHARE);
  const padding = Math.round(box * 0.06);
  const inner = box - padding * 2;
  const logo = await sharp(path, { density: 300 }).resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  // A white square behind the logo keeps its edges clean against the dark modules.
  const badge = await sharp({ create: { width: box, height: box, channels: 4, background: '#ffffff' } })
    .composite([{ input: logo, left: padding, top: padding }])
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{ input: badge, left: Math.round((SIZE - box) / 2), top: Math.round((SIZE - box) / 2) }])
    .png()
    .toBuffer();
}

import QRCode from 'qrcode';

/**
 * A QR code as a PNG. Error correction M survives a scuffed screen; a quiet zone of 2 modules and 512 px keep it easy to
 * read from a phone held a little away. The token is the only thing encoded.
 */
export function qrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 512, color: { dark: '#000000', light: '#ffffff' } });
}

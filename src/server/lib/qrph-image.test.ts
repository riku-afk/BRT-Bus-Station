import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { qrPhPng } from './qrph-image';

// The sample EMV QR Ph string from PisoPay's documented response (₱20.00).
const PAYLOAD =
  '00020101021228530011ph.ppmi.p2m0111SRCPPHM2XXX0312MRCHNT-4GYET0503000520460105303608540520.005802PH5911RMS PISOPAY6013ParanaqueCity62610010ph.starpay0311RMS PISOPAY0509OR#P27AVD0708411135910803***88290012ph.ppmi.qrph0109OR#P27AVD6304E2E7';

const decode = (png: Buffer) => {
  const image = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
};

describe('qrPhPng', () => {
  it('is a PNG that scans back to exactly the payload PisoPay gave, logo and all', async () => {
    const png = await qrPhPng(PAYLOAD);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(decode(png)).toBe(PAYLOAD);
  });

  it('has the logo in the middle: the centre is not the QR\'s own modules', async () => {
    const withLogo = PNG.sync.read(await qrPhPng(PAYLOAD));
    // The official mark has a yellow disc in the middle, a colour no QR module (black or white) ever has.
    const cx = Math.floor(withLogo.width / 2);
    const cy = Math.floor(withLogo.height / 2);
    const yellow: number[] = [];
    for (let dy = -30; dy <= 30; dy += 3) {
      for (let dx = -30; dx <= 30; dx += 3) {
        const i = ((cy + dy) * withLogo.width + (cx + dx)) * 4;
        const [r, g, b] = [withLogo.data[i]!, withLogo.data[i + 1]!, withLogo.data[i + 2]!];
        if (r > 200 && g > 160 && b < 90) yellow.push(r);
      }
    }
    expect(yellow.length).toBeGreaterThan(10);
  });

  it('keeps scanning at phone-screenshot sizes (downscaled to 240 px)', async () => {
    const full = PNG.sync.read(await qrPhPng(PAYLOAD));
    const target = 240;
    const small = new PNG({ width: target, height: target });
    for (let y = 0; y < target; y++) {
      for (let x = 0; x < target; x++) {
        const src = (Math.floor((y * full.height) / target) * full.width + Math.floor((x * full.width) / target)) * 4;
        const dst = (y * target + x) * 4;
        for (let c = 0; c < 4; c++) small.data[dst + c] = full.data[src + c]!;
      }
    }
    expect(decode(PNG.sync.write(small))).toBe(PAYLOAD);
  });

  it('different payloads give different pictures, each scanning to its own payload', async () => {
    const other = PAYLOAD.replace('520.00', '540.00').replace('E2E7', '0000');
    expect(decode(await qrPhPng(other))).toBe(other);
  });
});

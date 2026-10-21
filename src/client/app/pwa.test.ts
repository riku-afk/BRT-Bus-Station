import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pub = (p: string) => join(process.cwd(), 'public', p);

describe('PWA manifest and service worker', () => {
  const manifest = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8')) as {
    name: string; start_url: string; display: string; icons: { src: string; sizes: string; purpose: string }[];
  };

  it('is installable: name, start URL, standalone display and 192 / 512 / maskable icons that exist', () => {
    expect(manifest.name).toBe('Cavite Smart Transport Terminal');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) expect(() => readFileSync(pub(icon.src.replace(/^\//, '')))).not.toThrow();
  });

  it('the service worker never handles /api (tickets, QR codes and payments must never be cached)', () => {
    const sw = readFileSync(pub('sw.js'), 'utf8');
    expect(sw).toMatch(/startsWith\('\/api\/'\)/);
    expect(sw).toMatch(/return; \/\/ always the network/);
  });
});

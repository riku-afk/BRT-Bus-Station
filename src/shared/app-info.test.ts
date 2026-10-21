import { describe, expect, it } from 'vitest';
import { APP_INFO, requiresPocBanner, versionLabel } from './app-info';

describe('app-info', () => {
  it('builds the version label from the package version', () => {
    expect(versionLabel('1.2.3')).toBe('Cavite Smart Transport Terminal v1.2.3');
    expect(versionLabel()).toBe(`Cavite Smart Transport Terminal v${APP_INFO.version}`);
  });

  it('shows the PoC banner everywhere except production', () => {
    expect(requiresPocBanner('local')).toBe(true);
    expect(requiresPocBanner('demo')).toBe(true);
    expect(requiresPocBanner('prod')).toBe(false);
  });
});

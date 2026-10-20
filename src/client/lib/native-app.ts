/**
 * The BRT Konduktor Android app is a thin shell around this web app (mobile/konduktor). It adds this to the browser's user agent,
 * which is how the web app knows it is running inside it: passenger sign-up is hidden there, and only a konduktor may stay signed in.
 */
export const KONDUKTOR_APP_MARKER = 'BRTKonduktorApp';

export function isKonduktorApp(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return userAgent.includes(KONDUKTOR_APP_MARKER);
}

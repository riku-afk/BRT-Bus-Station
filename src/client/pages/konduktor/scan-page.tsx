import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Keyboard } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/features/auth/use-auth';
import { ScanResultScreen } from '@/features/scans/scan-result-screen';
import { useScan } from '@/features/scans/use-scans';
import { useMyBus } from '@/features/tracking/use-my-bus';
import type { ScanResponse } from '@shared/scans/models';

const READER_ID = 'qr-reader';
/** The same code seen again within this time is the camera re-reading one QR, not a second scan. */
const DEDUPE_MS = 3000;

type CameraState = 'starting' | 'running' | 'denied' | 'unavailable';

function cameraProblem(error: unknown): CameraState {
  const text = String(error instanceof Error ? `${error.name} ${error.message}` : error);
  return /NotAllowed|Permission|denied/i.test(text) ? 'denied' : 'unavailable';
}

/**
 * Scan a passenger's QR (SCN-01). The camera runs on the back lens; the moment a code is read the scanner pauses, the
 * ticket is checked, and a full-screen result stays up until the konduktor taps "Scan next". If the camera cannot be
 * used, the reference code can be typed instead (SCN-08).
 */
export function ScanPage() {
  const scan = useScan();
  const { data: mine } = useMyBus();
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [camera, setCamera] = useState<CameraState>('starting');
  const [problem, setProblem] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const busy = useRef(false);
  const last = useRef<{ text: string; at: number } | null>(null);

  const check = useCallback(
    (input: { token: string } | { referenceCode: string }) => {
      if (busy.current) return;
      busy.current = true;
      setProblem(null);
      scan.mutate(input, {
        onSuccess: (res) => {
          setResult(res);
          if (typeof navigator.vibrate === 'function') navigator.vibrate(res.result === 'valid' ? 120 : [200, 100, 200]);
        },
        onError: (e) => {
          setProblem(errorMessage(e));
          busy.current = false;
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let started: import('html5-qrcode').Html5Qrcode | null = null;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(READER_ID, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.8), height: Math.floor(Math.min(w, h) * 0.8) }) },
          (text) => {
            const now = Date.now();
            if (busy.current || (last.current && last.current.text === text && now - last.current.at < DEDUPE_MS)) return;
            last.current = { text, at: now };
            check({ token: text });
          },
          () => {},
        );
        started = scanner;
        if (cancelled) await scanner.stop().catch(() => {});
        else setCamera('running');
      } catch (e) {
        if (!cancelled) setCamera(cameraProblem(e));
      }
    })();
    return () => {
      cancelled = true;
      const s = started ?? scannerRef.current;
      scannerRef.current = null;
      if (s) void s.stop().then(() => s.clear()).catch(() => {});
    };
  }, [check]);

  // The camera keeps running behind the result screen but codes are ignored while `busy` is set.
  const next = () => {
    setResult(null);
    last.current = { text: last.current?.text ?? '', at: Date.now() };
    busy.current = false;
    setCode('');
  };

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim()) check({ referenceCode: code.trim() });
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="size-5" aria-hidden /> Scan a ticket
          </CardTitle>
          <CardDescription>Point the camera at the passenger&apos;s QR code. It is read automatically.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {mine && (
            <div
              className={mine.operation === 'available' ? 'rounded-md border bg-success/5 p-2.5 text-sm' : 'rounded-md border border-warning/60 p-2.5 text-sm'}
              data-testid="scan-shelter"
            >
              {mine.operation === 'available' && mine.station ? (
                <>
                  Your bus is waiting at <strong>{mine.station.name}</strong>. Only tickets bought at {mine.station.name} are accepted.
                </>
              ) : (
                <>Your bus is not waiting at a shelter right now. Tickets can only be checked while it waits at the shelter where they were bought.</>
              )}
            </div>
          )}
          <div id={READER_ID} className="min-h-64 w-full overflow-hidden rounded-md bg-black/90" data-testid="qr-reader" />
          {camera === 'starting' && <p className="text-sm text-muted-foreground">Starting the camera…</p>}
          {camera === 'denied' && (
            <Alert className="border-destructive/50">
              <AlertDescription>
                The camera is blocked. Allow camera access for this site in your browser settings and reload, or type the ticket&apos;s reference code below.
              </AlertDescription>
            </Alert>
          )}
          {camera === 'unavailable' && (
            <Alert className="border-warning/60">
              <AlertDescription>
                The camera could not be started. It needs a phone or computer with a camera, and a secure (https) connection. You can still type the
                ticket&apos;s reference code below.
              </AlertDescription>
            </Alert>
          )}
          {problem && <p className="text-sm text-destructive" role="alert">{problem}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-5" aria-hidden /> Camera not working?
          </CardTitle>
          <CardDescription>Ask the passenger for the reference code on their ticket, like BRT-ABC234.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitCode} className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BRT-ABC234"
              aria-label="Reference code"
              autoCapitalize="characters"
              autoComplete="off"
              className="font-mono uppercase"
              maxLength={20}
            />
            <Button type="submit" disabled={!code.trim() || scan.isPending}>
              Check
            </Button>
          </form>
        </CardContent>
      </Card>

      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/konduktor/history">My scan history</Link>
      </Button>

      {result && <ScanResultScreen result={result} onNext={next} />}
    </div>
  );
}

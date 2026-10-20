import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CheckCircle2, Keyboard, ScanLine, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/features/auth/use-auth';
import { PageTitle } from '@/components/layout/page-title';
import { describeScan, RESULT_LABEL, RESULT_STYLE, RESULT_TILE } from '@/features/scans/scan-labels';
import { PassengerCount } from '@/features/scans/passenger-count';
import { ScanResultScreen } from '@/features/scans/scan-result-screen';
import { useMyScans, useScan } from '@/features/scans/use-scans';
import { useMyBus } from '@/features/tracking/use-my-bus';
import { cn } from '@/lib/utils';
import { formatManilaTime } from '@shared/datetime/ph-time';
import type { ScanResponse } from '@shared/scans/models';

const READER_ID = 'qr-reader';
/** The same code seen again within this time is the camera re-reading one QR, not a second scan. */
const DEDUPE_MS = 3000;
const AMBER = '#f59e0b';
const INK = '#1c1203';

/** html5-qrcode states in which stop() is allowed: scanning (2) or paused (3). */
const CAN_STOP = [2, 3];

/**
 * Stop the camera and release the video element. html5-qrcode THROWS (it does not reject) when stop() is called on a scanner that
 * is not running, which happens when the page is left while the camera is still starting, or twice in a row, so it is only
 * called when the scanner says it can be stopped, and nothing here can raise.
 */
async function releaseScanner(scanner: import('html5-qrcode').Html5Qrcode | null): Promise<void> {
  if (!scanner) return;
  try {
    if (CAN_STOP.includes(scanner.getState())) await scanner.stop();
  } catch {
    // already stopped or never started: nothing to release
  }
  try {
    scanner.clear();
  } catch {
    // the element is already gone
  }
}

type CameraState = 'starting' | 'running' | 'denied' | 'unavailable';

function cameraProblem(error: unknown): CameraState {
  const text = String(error instanceof Error ? `${error.name} ${error.message}` : error);
  return /NotAllowed|Permission|denied/i.test(text) ? 'denied' : 'unavailable';
}

/** The last few scans, on a wide screen beside the camera. */
function RecentScans() {
  const { data } = useMyScans(1, 14);
  const recent = data?.items.slice(0, 3) ?? [];
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border bg-card p-5" aria-label="Recent scans">
      <h2 className="text-[17px] font-extrabold">Recent scans</h2>
      {recent.length === 0 && <p className="text-sm text-muted-foreground">Nothing scanned yet.</p>}
      {recent.map((s) => (
        <div key={s.id} className="flex items-center gap-3 rounded-[14px] border p-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: RESULT_TILE[s.result], color: s.result === 'already_used' ? INK : '#fff' }} aria-hidden>
            <ScanLine className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{s.originName && s.destinationName ? `${s.originName} → ${s.destinationName}` : describeScan(s)}</p>
            <p className="text-xs text-muted-foreground">
              {formatManilaTime(s.scannedAt)}
              {s.referenceCode ? ` · ${s.referenceCode}` : ''}
            </p>
          </div>
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', RESULT_STYLE[s.result])}>{RESULT_LABEL[s.result]}</span>
        </div>
      ))}
      <Link to="/konduktor/history" className="text-[13px] font-bold text-[#4f46e5] hover:underline dark:text-[#a5b4fc]">
        My scan history →
      </Link>
    </section>
  );
}

/**
 * Scan a passenger's QR (SCN-01). The camera runs on the back lens; the moment a code is read the scanner pauses, the
 * ticket is checked, and the result stays up until the konduktor taps "Scan next ticket". If the camera cannot be
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
        if (cancelled) await releaseScanner(scanner);
        else setCamera('running');
      } catch (e) {
        if (!cancelled) setCamera(cameraProblem(e));
      }
    })();
    return () => {
      cancelled = true;
      const s = started ?? scannerRef.current;
      scannerRef.current = null;
      void releaseScanner(s);
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

  const waiting = mine?.operation === 'available' && mine.station;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 pb-6 pt-4 sm:px-6 md:gap-5 md:px-8 md:pb-10 md:pt-7">
      <div className="hidden md:block">
        <PageTitle icon={Camera} color={AMBER} ink={INK} title="Scan a ticket" description="Point the camera at the passenger's QR code. It is read automatically.">
          <Link to="/konduktor/history" className="flex h-12 items-center gap-2 rounded-xl bg-[#4f46e5] px-5 text-sm font-extrabold text-white hover:brightness-110">
            Scan history
          </Link>
        </PageTitle>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_460px] flex-col gap-4">
          {mine && (
            <div
              className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13px] leading-snug"
              style={waiting ? { background: 'color-mix(in srgb, #16a34a 13%, var(--surface))', border: '1px solid color-mix(in srgb, #16a34a 30%, var(--surface))' } : { background: 'color-mix(in srgb, #f59e0b 13%, var(--surface))', border: '1px solid color-mix(in srgb, #f59e0b 35%, var(--surface))' }}
              data-testid="scan-shelter"
            >
              <span className={cn('grid size-[30px] shrink-0 place-items-center rounded-full text-white', waiting ? 'bg-[#16a34a]' : 'bg-[#f59e0b] text-[#1c1203]')}>
                {waiting ? <CheckCircle2 className="size-[15px]" strokeWidth={2.4} aria-hidden /> : <TriangleAlert className="size-[15px]" aria-hidden />}
              </span>
              <span>
                {waiting && mine.station ? (
                  <>
                    Your bus is waiting at <strong>{mine.station.name}</strong>. Only tickets bought at {mine.station.name} are accepted.
                  </>
                ) : (
                  <>Your bus is not waiting at a shelter right now. Tickets can only be checked while it waits at the shelter where they were bought.</>
                )}
              </span>
            </div>
          )}

          <PassengerCount compact />

          <div className="relative aspect-square w-full overflow-hidden rounded-[22px] bg-[#0b1220] md:aspect-[4/3]">
            <div id={READER_ID} className="absolute inset-0 [&_video]:size-full [&_video]:object-cover" data-testid="qr-reader" />
            <span className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold text-white">
              <Camera className="size-3" aria-hidden /> Back camera
            </span>
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 aspect-square w-[66%] -translate-x-1/2 -translate-y-1/2 md:w-[48%]" aria-hidden>
              <span className="absolute -left-[3px] -top-[3px] size-10 rounded-tl-[18px] border-l-[6px] border-t-[6px] border-[#f59e0b]" />
              <span className="absolute -right-[3px] -top-[3px] size-10 rounded-tr-[18px] border-r-[6px] border-t-[6px] border-[#f59e0b]" />
              <span className="absolute -bottom-[3px] -left-[3px] size-10 rounded-bl-[18px] border-b-[6px] border-l-[6px] border-[#f59e0b]" />
              <span className="absolute -bottom-[3px] -right-[3px] size-10 rounded-br-[18px] border-b-[6px] border-r-[6px] border-[#f59e0b]" />
              <span className="absolute inset-x-[10%] top-1/2 h-[3px] rounded-sm bg-[#f59e0b] opacity-85" />
            </div>
            <span className="pointer-events-none absolute inset-x-0 bottom-3.5 z-10 text-center text-[13px] font-semibold text-slate-300">
              {camera === 'starting' ? 'Starting the camera…' : 'Hold the QR code inside the frame'}
            </span>
          </div>
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
          {problem && (
            <p className="text-sm font-semibold text-destructive" role="alert">
              {problem}
            </p>
          )}

          <form onSubmit={submitCode} className="flex flex-col gap-2 rounded-[20px] border bg-card p-4 sm:p-5">
            <label htmlFor="kcode" className="flex items-center gap-2 text-[13px] font-extrabold">
              <Keyboard className="size-4 text-muted-foreground" aria-hidden /> Camera not working? Type the code
            </label>
            <p className="text-xs text-muted-foreground">Ask the passenger for the reference code on their ticket, like BRT-ABC234.</p>
            <div className="flex gap-2">
              <Input
                id="kcode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="BRT-ABC234"
                aria-label="Reference code"
                autoCapitalize="characters"
                autoComplete="off"
                className="h-[52px] flex-1 rounded-[14px] font-mono uppercase focus-visible:ring-[#f59e0b]"
                maxLength={20}
              />
              <button type="submit" disabled={!code.trim() || scan.isPending} className="h-[52px] rounded-[14px] px-[18px] text-[15px] font-extrabold disabled:opacity-50" style={{ background: AMBER, color: INK }}>
                Check ticket
              </button>
            </div>
          </form>
        </div>

        <div className="hidden min-w-0 flex-[2_1_300px] flex-col gap-4 md:flex">
          <RecentScans />
        </div>
      </div>

      {result && <ScanResultScreen result={result} onNext={next} />}
    </div>
  );
}

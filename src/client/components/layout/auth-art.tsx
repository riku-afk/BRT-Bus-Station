/** The decorative illustrations of the sign-in and register pages (design-handoff/auth). They are only pictures, so they are hidden from assistive tech. */

export function BrtIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#facc15" />
      <rect x="136" y="88" width="240" height="268" rx="52" fill="#0f172a" />
      <rect x="200" y="106" width="112" height="16" rx="8" fill="#facc15" />
      <rect x="166" y="138" width="180" height="104" rx="22" fill="#38bdf8" />
      <circle cx="194" cy="296" r="20" fill="#facc15" />
      <circle cx="318" cy="296" r="20" fill="#facc15" />
      <rect x="160" y="340" width="44" height="40" rx="12" fill="#0f172a" />
      <rect x="308" y="340" width="44" height="40" rx="12" fill="#0f172a" />
      <path d="M84 432 H428" stroke="#0f172a" strokeWidth="16" strokeLinecap="round" />
      <circle cx="256" cy="432" r="22" fill="#16a34a" stroke="#0f172a" strokeWidth="10" />
    </svg>
  );
}

const fill = { position: 'absolute', inset: 0, width: '100%', height: '100%' } as const;

function Dots() {
  const xs = [80, 120, 160, 200];
  const ys = [300, 340, 380];
  return (
    <g fill="#ffffff" opacity="0.07">
      {ys.flatMap((y) => xs.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />))}
    </g>
  );
}

function Bus({ transform, w = 92, h = 52, body = '#ea580c', glass = '#bae6fd' }: { transform: string; w?: number; h?: number; body?: string; glass?: string }) {
  const k = w / 92;
  return (
    <g transform={transform}>
      <rect width={w} height={h} rx={14 * k} fill={body} />
      <rect x={10 * k} y={9 * k} width={32 * k} height={20 * k} rx={5 * k} fill={glass} />
      <rect x={50 * k} y={9 * k} width={32 * k} height={20 * k} rx={5 * k} fill={glass} />
      <circle cx={22 * k} cy={h + 2 * k} r={9 * k} fill="#0f172a" />
      <circle cx={70 * k} cy={h + 2 * k} r={9 * k} fill="#0f172a" />
    </g>
  );
}

function Stations({ points, r, stroke }: { points: [number, number, string][]; r: number; stroke: number }) {
  return (
    <g stroke="#0f172a" strokeWidth={stroke}>
      {points.map(([cx, cy, f]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={f} />
      ))}
    </g>
  );
}

/** The big panel on the left of a wide screen. It fills any height (`slice`). */
export function PanelArt({ variant }: { variant: 'signin' | 'register' }) {
  const signin = variant === 'signin';
  return (
    <svg aria-hidden="true" viewBox="0 0 720 900" preserveAspectRatio="xMidYMid slice" style={fill}>
      <circle cx="660" cy="90" r="210" fill={signin ? '#2563eb' : '#be185d'} />
      <circle cx="40" cy="880" r="230" fill={signin ? '#be185d' : '#0369a1'} />
      <circle cx="730" cy="760" r="150" fill={signin ? '#0f766e' : '#c2410c'} />
      <circle cx="560" cy="300" r="46" fill="none" stroke="#facc15" strokeWidth="10" />
      <Dots />
      <path d="M-40 700 C 120 700 150 560 300 560 S 470 690 560 570 S 640 420 780 420" fill="none" stroke="#38bdf8" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 18" />
      <path d="M-40 640 C 110 640 170 470 320 470 S 500 600 600 470 S 680 330 780 320" fill="none" stroke="#facc15" strokeWidth="20" strokeLinecap="round" />
      <Stations
        r={17}
        stroke={7}
        points={[
          [96, 616, '#ffffff'],
          [320, 470, '#16a34a'],
          [472, 546, '#ffffff'],
          [660, 378, '#ffffff'],
        ]}
      />
      {signin ? (
        <>
          <Bus transform="translate(176 488) rotate(-22)" />
          <Bus transform="translate(542 474) rotate(-38)" w={80} h={46} body="#7c3aed" glass="#ddd6fe" />
        </>
      ) : (
        <>
          <g transform="translate(372 474) rotate(26)">
            <rect width="120" height="64" rx="12" fill="#ffffff" />
            <rect x="84" width="36" height="64" fill="#f59e0b" />
            <rect x="8" y="12" width="56" height="8" rx="4" fill="#0f172a" />
            <rect x="8" y="28" width="40" height="6" rx="3" fill="#94a3b8" />
            <rect x="8" y="42" width="48" height="6" rx="3" fill="#94a3b8" />
          </g>
          <Bus transform="translate(150 500) rotate(-22)" />
        </>
      )}
    </svg>
  );
}

/** The band behind the headline on a phone. */
export function BandArt({ variant }: { variant: 'signin' | 'register' }) {
  if (variant === 'signin') {
    return (
      <svg aria-hidden="true" viewBox="0 0 390 330" preserveAspectRatio="xMidYMax slice" style={fill}>
        <circle cx="370" cy="40" r="120" fill="#2563eb" />
        <circle cx="-10" cy="330" r="110" fill="#be185d" />
        <circle cx="300" cy="150" r="26" fill="none" stroke="#facc15" strokeWidth="7" />
        <path d="M-20 300 C 70 300 90 230 170 230 S 270 290 320 240 S 360 190 410 186" fill="none" stroke="#facc15" strokeWidth="14" strokeLinecap="round" />
        <Stations
          r={12}
          stroke={5}
          points={[
            [60, 290, '#ffffff'],
            [178, 230, '#16a34a'],
            [300, 252, '#ffffff'],
          ]}
        />
        <Bus transform="translate(92 236) rotate(-20)" w={64} h={36} />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 390 250" preserveAspectRatio="xMidYMax slice" style={fill}>
      <circle cx="370" cy="30" r="110" fill="#be185d" />
      <circle cx="-20" cy="250" r="100" fill="#0369a1" />
      <path d="M-20 228 C 70 228 100 176 180 176 S 280 222 330 186 S 370 150 410 148" fill="none" stroke="#facc15" strokeWidth="12" strokeLinecap="round" />
      <Stations
        r={11}
        stroke={5}
        points={[
          [70, 222, '#ffffff'],
          [186, 176, '#16a34a'],
          [330, 186, '#ffffff'],
        ]}
      />
      <g transform="translate(236 168) rotate(18)">
        <rect width="78" height="42" rx="9" fill="#ffffff" />
        <rect x="54" width="24" height="42" fill="#f59e0b" />
        <rect x="6" y="9" width="36" height="6" rx="3" fill="#0f172a" />
        <rect x="6" y="21" width="28" height="5" rx="2.5" fill="#94a3b8" />
      </g>
    </svg>
  );
}

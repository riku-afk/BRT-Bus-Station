// A stand-in for PisoPay for the browser test: session, token, transaction (QR), and the inquire endpoint.
// POST /fake/pay?ref=<referenceNo> marks a payment as paid.
const refs = new Map(); // referenceNo -> { amount, status }
let n = 0;

const crc16 = (s) => {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};
const emv = (amount) => {
  const a = Number(amount).toFixed(2);
  const body = `00020101021228530011ph.ppmi.p2m0111SRCPPHM2XXX0312MRCHNT-4GYET050300052046010530360854${String(a.length).padStart(2, '0')}${a}5802PH5911RMS PISOPAY6013ParanaqueCity62610010ph.starpay0311RMS PISOPAY0509OR#P27AVD0708411135910803***88290012ph.ppmi.qrph0109OR#P27AVD6304`;
  return body + crc16(body);
};
const ok = (data, message = 'Success') => Response.json({ status: 0, message, data });
const tokens = new Map();

Bun.serve({
  port: 3300,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    console.log(req.method, path, req.headers.get('authorization') ? '(auth)' : '(NO AUTH)');
    if (path === '/api/v1/session') return ok({ session_id: 'sess-fake' }, 'Success Saving Session');
    if (path === '/api/v1/token') {
      const b = await req.json();
      tokens.set(b.merchant_trace_no, b);
      return ok({ url: 'https://payme.pisopay.test/x', pin: 'ABC123', merchant_trace_no: b.merchant_trace_no, transaction_id: String(++n) }, 'Success Token Initiate');
    }
    if (path === '/api/v1/transaction') {
      const b = await req.json();
      const t = tokens.get(b.merchant_trace_no);
      if (b.payment_channel_code === (process.env.FAKE_DOWN ?? 'none')) return Response.json({ status: 1, message: 'Channel not available' });
      const referenceNo = `PPFAKE${String(++n).padStart(6, '0')}`;
      refs.set(referenceNo, { amount: t.amount, status: 1, trace: b.merchant_trace_no });
      return ok({ amount: t.amount, amountWithoutFees: t.amount, fees: '0.00', referenceNo, channelCode: b.payment_channel_code, qr: emv(t.amount) }, 'Success Generating Reference Number');
    }
    if (path.startsWith('/api/v1/transaction/reference/')) {
      const ref = decodeURIComponent(path.split('/').pop());
      const r = refs.get(ref);
      if (!r) return Response.json({ status: 1, message: 'Not found' });
      return ok({ status: r.status, reference_no: ref, merchant_trace_no: r.trace, amount: r.amount, fees: '0.00', payment_channel_code: 'QR1' });
    }
    if (path === '/fake/pay') {
      const r = refs.get(url.searchParams.get('ref') ?? '');
      if (!r) return new Response('unknown', { status: 404 });
      r.status = 0;
      return new Response('paid ' + url.searchParams.get('ref'));
    }
    if (path === '/fake/list') return Response.json([...refs.entries()]);
    return new Response('not found', { status: 404 });
  },
});
console.log('fake PisoPay on :3300');

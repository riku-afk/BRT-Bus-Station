/**
 * Ticket status machine (TKT-02). The one place that says which moves are allowed; the repository asserts it and
 * every move is also a conditional `UPDATE … WHERE status = '<expected>'`, so two writers can never both win.
 */
export const TICKET_STATUSES = ['pending_payment', 'paid', 'used', 'expired', 'cancelled'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  pending_payment: ['paid', 'expired', 'cancelled'],
  paid: ['used', 'expired'],
  used: [],
  expired: [],
  cancelled: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

/** Throws on a move the machine does not allow: a programming error, never user input. */
export function assertTransition(from: TicketStatus, to: TicketStatus): void {
  if (!canTransition(from, to)) throw new Error(`Illegal ticket transition ${from} -> ${to}`);
}

/** The most passengers one purchase can cover (a large family or a small group). The database allows a little more headroom. */
export const MAX_TICKET_QUANTITY = 10;

export const isTerminalStatus = (status: TicketStatus) => TICKET_TRANSITIONS[status].length === 0;

export const TICKET_STATUS_LABEL: Readonly<Record<TicketStatus, string>> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  used: 'Used',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/** Most tickets one passenger may have waiting for payment at once. */
export const MAX_PENDING_TICKETS_PER_PASSENGER = 5;

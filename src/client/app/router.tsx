/**
 * Central route table. One SPA, role-based routes: wrap role pages in `RequireRole`.
 * Add new routes above the catch-all.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { GuestOnly, RequireRole } from '@/features/auth/guards';
import { LoginPage } from '@/pages/auth/login-page';
import { RegisterPage } from '@/pages/auth/register-page';
import { AdminBusesPage } from '@/pages/admin/admin-buses-page';
import { AdminFaresPage } from '@/pages/admin/admin-fares-page';
import { AdminPaymentsPage } from '@/pages/admin/admin-payments-page';
import { AdminLivePage } from '@/pages/admin/admin-live-page';
import { AdminKonduktorsPage } from '@/pages/admin/admin-konduktors-page';
import { ScanPage } from '@/pages/konduktor/scan-page';
import { ScanHistoryPage } from '@/pages/konduktor/scan-history-page';
import { AdminScansPage } from '@/pages/admin/admin-scans-page';
import { KonduktorHomePage } from '@/pages/konduktor/konduktor-home-page';
import { AdminHomePage } from '@/pages/admin/admin-home-page';
import { AdminStationsPage } from '@/pages/admin/admin-stations-page';
import { MockPaymentPage } from '@/pages/payments/mock-payment-page';
import { MyTicketsPage } from '@/pages/tickets/my-tickets-page';
import { TicketPage } from '@/pages/tickets/ticket-page';
import { HomeRoute } from '@/pages/home/home-route';
import { NotFoundPage } from '@/pages/not-found/not-found-page';

export function AppRouterProvider() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="pay/mock/:ref" element={<MockPaymentPage />} />
        <Route element={<AppShell />}>
          <Route index element={<HomeRoute />} />
          <Route path="login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
          <Route path="tickets" element={<RequireRole roles={['passenger']}><MyTicketsPage /></RequireRole>} />
          <Route path="tickets/:id" element={<RequireRole roles={['passenger']}><TicketPage /></RequireRole>} />
          <Route path="konduktor" element={<RequireRole roles={['konduktor']}><KonduktorHomePage /></RequireRole>} />
          <Route path="konduktor/scan" element={<RequireRole roles={['konduktor']}><ScanPage /></RequireRole>} />
          <Route path="konduktor/history" element={<RequireRole roles={['konduktor']}><ScanHistoryPage /></RequireRole>} />
          <Route path="admin" element={<RequireRole roles={['admin']}><AdminHomePage /></RequireRole>} />
          <Route path="admin/stations" element={<RequireRole roles={['admin']}><AdminStationsPage /></RequireRole>} />
          <Route path="admin/buses" element={<RequireRole roles={['admin']}><AdminBusesPage /></RequireRole>} />
          <Route path="admin/konduktors" element={<RequireRole roles={['admin']}><AdminKonduktorsPage /></RequireRole>} />
          <Route path="admin/live" element={<RequireRole roles={['admin']}><AdminLivePage /></RequireRole>} />
          <Route path="admin/payments" element={<RequireRole roles={['admin']}><AdminPaymentsPage /></RequireRole>} />
          <Route path="admin/fares" element={<RequireRole roles={['admin']}><AdminFaresPage /></RequireRole>} />
          <Route path="admin/scans" element={<RequireRole roles={['admin']}><AdminScansPage /></RequireRole>} />
          {/* New routes go here, above the catch-all. */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

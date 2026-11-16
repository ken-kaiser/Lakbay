/* ==========================================================================
   Lakbay — Rider entry point
   Boots the rider shell, registers all rider views, wires the incoming
   request manager and the verification auto-review simulation.
   ========================================================================== */
import { bootApp, App } from '../app.js';
import { Bookings, Users, Bus, Session } from '../storage.js';
import { dashboardView } from './dashboard.js';
import { tripView, navigationView } from './trip.js';
import { earningsView } from './earnings.js';
import { riderHistoryView } from './history.js';
import { riderProfileView } from './profile.js';
import { RequestManager } from './requests.js';
import { Toast } from '../shared/toast.js';

await bootApp({
  role: 'rider',
  homeView: 'dashboard',
  nav: [
    { id: 'dashboard', icon: 'gauge', label: 'Dashboard', badgeKey: 'active' },
    { id: 'trip', icon: 'route', label: 'Trip' },
    { id: 'earnings', icon: 'wallet', label: 'Earnings' },
    { id: 'activity', icon: 'history', label: 'History' },
    { id: 'profile', icon: 'user-round', label: 'Profile' },
  ],
  views: [
    dashboardView,
    tripView,
    navigationView,
    earningsView,
    riderHistoryView,
    riderProfileView,
    { ...riderProfileView, id: 'settings' },
  ],
});

/* ---------- incoming request manager ---------- */
const onlineGetter = () => RequestManager._online === true;
RequestManager.init({
  getUser: () => App.user,
  isOnline: onlineGetter,
  onAccepted: (booking) => {
    Toast.success('Request accepted', `${booking.pickup.name} → ${booking.dropoff.name}`);
    App.navigate('trip', { restPath: booking.id });
  },
});

/* Track the online flag (owned by dashboard view) */
RequestManager.setOnline = (v) => { RequestManager._online = !!v; };

/* ---------- verification auto-review (demo) ----------
   Newly submitted rider documents sit in "pending" for ~8 seconds, then a
   simulated reviewer verifies them and a notification is pushed. */
function tickVerification() {
  if (!App.user) return;
  const me = Users.byId(App.user.id);
  if (me && me.verification && me.verification.status === 'pending' && me.verification.submittedAt) {
    const waited = Date.now() - me.verification.submittedAt;
    if (waited > 8000) {
      Users.update(me.id, {
        verification: { ...me.verification, status: 'verified', reviewedAt: Date.now() },
      });
      import('../storage.js').then(({ Notifs }) => {
        Notifs.push({ userId: me.id, role: 'rider', title: 'You are verified', body: 'Your documents passed the review. You can start accepting rides.', icon: 'shield-check', tone: 'success' });
      });
      Toast.success('Verified!', 'Your rider account is verified. Go online from the dashboard.');
    }
  }
}
setInterval(tickVerification, 2000);
tickVerification();

/* ---------- orphan request scan ----------
   While online, periodically surface searching bookings that have no rider
   yet — covers bookings whose passenger tab closed mid-search and any
   missed broadcast while the rider app was busy. */
setInterval(() => {
  if (!RequestManager._online) return;
  const pending = Bookings.anySearching();
  if (pending && !pending.riderId) RequestManager.consider(pending);
}, 4000);

/* ---------- live request badge + toast for riders ---------- */
Bus.subscribe('booking:update', ({ booking }) => {
  if (!booking || booking.riderId) return;
  const active = ['accepted', 'arriving', 'arrived', 'in_progress'];
  const mine = booking.riderId === App.user.id;
  const dot = document.querySelector('.app-bottomnav [data-badge="active"], .app-sidebar [data-badge="active"]');
  if (dot) {
    const isActive = mine && active.includes(booking.status);
    dot.hidden = !isActive;
    if (isActive) dot.textContent = '1';
  }
});

/* Expose for debugging */
window.__lakbay = window.__lakbay || {};
window.__lakbay.rider = { App, RequestManager };

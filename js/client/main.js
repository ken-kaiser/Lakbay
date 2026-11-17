/* ==========================================================================
   Lakbay — Passenger client entry point
   Registers all passenger views, boots the authenticated shell, and paints
   the initial "active trip" nav badge.
   ========================================================================== */
import { bootApp, App } from '../app.js';
import { Bookings } from '../storage.js';
import { homeView } from './home.js';
import { bookingViews } from './booking.js';
import { tripViews } from './tracking.js';
import { walletView } from './payment.js';
import { activityView } from './history.js';
import { profileView } from './profile.js';

await bootApp({
  role: 'passenger',
  homeView: 'home',
  nav: [
    { id: 'home', icon: 'house', label: 'Home', badgeKey: 'active', group: 'Ride' },
    { id: 'activity', icon: 'history', label: 'Activity', group: 'Ride' },
    { id: 'wallet', icon: 'wallet', label: 'Wallet', group: 'Account' },
    { id: 'profile', icon: 'user-round', label: 'Profile', group: 'Account' },
  ],
  views: [
    homeView,
    ...bookingViews,
    ...tripViews,
    walletView,
    activityView,
    profileView,
    // The header account menu links to #/settings (built by app.js) — reuse
    // the profile view so that link resolves instead of bouncing home.
    { ...profileView, id: 'settings' },
  ],
});

// Paint the initial active-ride badge (app.js only updates it on events).
function paintInitialBadge() {
  const dot = document.querySelector('.app-bottomnav [data-badge="active"], .app-sidebar [data-badge="active"]');
  if (!dot || !App.user) return;
  const active = Bookings.activeFor(App.user.id, 'passenger').filter((b) => b.status !== 'scheduled');
  if (active.length > 0) { dot.hidden = false; dot.textContent = String(active.length); }
  else dot.hidden = true;
}
paintInitialBadge();

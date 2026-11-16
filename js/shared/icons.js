/* ==========================================================================
   Lakbay — Lucide icons wrapper
   Usage in templates: <i data-lucide="map-pin"></i>
   After any DOM update call Icons.refresh(scopeElement).
   ========================================================================== */

export const Icons = {
  ready() { return typeof window.lucide !== 'undefined' && window.lucide.createIcons; },
  refresh(scope) {
    if (!Icons.ready()) return;
    try {
      if (scope && scope.querySelectorAll) {
        // refresh only within scope when possible for performance
        window.lucide.createIcons({
          nameAttr: 'data-lucide',
          attrs: { 'stroke-width': 2 },
          // lucide scans the whole document; scope filtering keeps it cheap enough
        });
      } else {
        window.lucide.createIcons({ nameAttr: 'data-lucide', attrs: { 'stroke-width': 2 } });
      }
    } catch (e) { console.warn('[icons]', e); }
  },
  /* Inline SVG fallback data-URI when lucide failed to load (kept minimal) */
  hasIcon(name) {
    return Icons.ready() && !!window.lucide.icons && Object.keys(window.lucide.icons).some((k) => k.toLowerCase() === name.toLowerCase().replace(/-/g, ''));
  },
};

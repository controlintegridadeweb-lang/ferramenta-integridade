
'use strict';

const Icons = (() => {

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Generates an inline SVG string for use in innerHTML.
   * @param {string} paths - SVG path/polyline/etc content
   * @param {number} [size=16]
   * @param {string} [extraClass='']
   */
  function svg(paths, size = 16, extraClass = '') {
    return `<svg xmlns="${SVG_NS}" width="${size}" height="${size}" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"
      class="icon${extraClass ? ' ' + extraClass : ''}"
      aria-hidden="true">${paths}</svg>`;
  }

  // ── Icon Definitions ──────────────────────────────────────────

  const defs = {

    // Navigation / actions
    upload:     `<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                 <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>`,

    download:   `<polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/>
                 <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>`,

    search:     `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,

    filter:     `<line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><circle cx="17" cy="4" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="20" r="2"/>`,

    close:      `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,

    eye:        `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                 <circle cx="12" cy="12" r="3"/>`,

    chevronLeft:  `<polyline points="15 18 9 12 15 6"/>`,
    chevronRight: `<polyline points="9 18 15 12 9 6"/>`,

    chevronsUpDown: `<polyline points="7 15 12 20 17 15"/><polyline points="17 9 12 4 7 9"/>`,

    // Editing / manual input
    edit:       `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                 <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>`,

    pen:        `<path d="M12 20h9"/>
                 <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>`,

    // Lightning / quick action
    zap:        `<polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,

    // Arrow
    arrowRight: `<line x1="5" y1="12" x2="19" y2="12"/>
                 <polyline points="12 5 19 12 12 19"/>`,

    // Data / documents
    fileSpreadsheet: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="8" y1="13" x2="16" y2="13"/>
                      <line x1="8" y1="17" x2="16" y2="17"/>
                      <polyline points="10 9 9 9 8 9"/>`,

    fileText:    `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>`,

    fileCheck:   `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <polyline points="9 15 11 17 15 13"/>`,

    // Status / alerts
    alertTriangle: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>`,

    alertCircle:   `<circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>`,

    checkCircle:   `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>`,

    xCircle:       `<circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>`,

    info:          `<circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>`,

    shield:        `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,

    shieldCheck:   `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <polyline points="9 12 11 14 15 10"/>`,

    shieldOff:     `<path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18"/>
                    <path d="M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>`,

    // Layout / UI
    list:       `<line x1="8" y1="6" x2="21" y2="6"/>
                 <line x1="8" y1="12" x2="21" y2="12"/>
                 <line x1="8" y1="18" x2="21" y2="18"/>
                 <line x1="3" y1="6" x2="3.01" y2="6"/>
                 <line x1="3" y1="12" x2="3.01" y2="12"/>
                 <line x1="3" y1="18" x2="3.01" y2="18"/>`,

    grid:       `<rect x="3" y="3" width="7" height="7"/>
                 <rect x="14" y="3" width="7" height="7"/>
                 <rect x="14" y="14" width="7" height="7"/>
                 <rect x="3" y="14" width="7" height="7"/>`,

    building:   `<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                 <path d="M9 22V12h6v10"/>
                 <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01"/>`,

    hash:       `<line x1="4" y1="9" x2="20" y2="9"/>
                 <line x1="4" y1="15" x2="20" y2="15"/>
                 <line x1="10" y1="3" x2="8" y2="21"/>
                 <line x1="16" y1="3" x2="14" y2="21"/>`,

    tag:        `<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                 <line x1="7" y1="7" x2="7.01" y2="7"/>`,

    dollarSign: `<line x1="12" y1="1" x2="12" y2="23"/>
                 <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>`,

    calendar:   `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                 <line x1="16" y1="2" x2="16" y2="6"/>
                 <line x1="8" y1="2" x2="8" y2="6"/>
                 <line x1="3" y1="10" x2="21" y2="10"/>`,

    clipboard:  `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                 <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>`,

    database:   `<ellipse cx="12" cy="5" rx="9" ry="3"/>
                 <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                 <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>`,

    layers:     `<polyline points="12 2 2 7 12 12 22 7 12 2"/>
                 <polyline points="2 17 12 22 22 17"/>
                 <polyline points="2 12 12 17 22 12"/>`,

    // Monitoring / Gov
    activity:   `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,

    barChart2:  `<line x1="18" y1="20" x2="18" y2="10"/>
                 <line x1="12" y1="20" x2="12" y2="4"/>
                 <line x1="6" y1="20" x2="6" y2="14"/>`,

    trendingUp: `<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                 <polyline points="17 6 23 6 23 12"/>`,

    sliders:    `<line x1="4" y1="21" x2="4" y2="14"/>
                 <line x1="4" y1="10" x2="4" y2="3"/>
                 <line x1="12" y1="21" x2="12" y2="12"/>
                 <line x1="12" y1="8" x2="12" y2="3"/>
                 <line x1="20" y1="21" x2="20" y2="16"/>
                 <line x1="20" y1="12" x2="20" y2="3"/>
                 <line x1="1" y1="14" x2="7" y2="14"/>
                 <line x1="9" y1="8" x2="15" y2="8"/>
                 <line x1="17" y1="16" x2="23" y2="16"/>`,

    lock:       `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                 <path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,

    // Misc
    package:    `<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
                 <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                 <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                 <line x1="12" y1="22.08" x2="12" y2="12"/>`,

    link:       `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                 <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,

    inbox:      `<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                 <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>`,

    helpCircle: `<circle cx="12" cy="12" r="10"/>
                 <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                 <line x1="12" y1="17" x2="12.01" y2="17"/>`,

    minus:      `<line x1="5" y1="12" x2="19" y2="12"/>`,

    slash:      `<line x1="1" y1="1" x2="23" y2="23"/><circle cx="12" cy="12" r="10"/>`,

    // Manual Review icons
    clipboardCheck: `<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                     <rect x="9" y="3" width="6" height="4" rx="1" ry="1"/>
                     <path d="M9 12l2 2 4-4"/>`,

    clipboardList: `<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                    <rect x="9" y="3" width="6" height="4" rx="1" ry="1"/>
                    <line x1="9" y1="12" x2="15" y2="12"/>
                    <line x1="9" y1="16" x2="13" y2="16"/>`,

    refreshCw:  `<polyline points="23 4 23 10 17 10"/>
                 <polyline points="1 20 1 14 7 14"/>
                 <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>`,
    messageSquare: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,

  };

  /**
   * Returns an SVG icon string.
   * @param {string} name - Icon name
   * @param {number} [size=16]
   * @param {string} [extraClass='']
   * @returns {string} SVG HTML string
   */
  /* Interface minimalista: ícones desligados — só texto e cor comunicam status. */
  function get(_name, _size = 16, _extraClass = '') {
    return '';
  }

  return { get };
})();

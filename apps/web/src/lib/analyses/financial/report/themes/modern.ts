/**
 * Modern theme — Plus Jakarta Sans + Inter, blue accent palette, clean surfaces.
 * Matches aidvisora-report-v3-final.html exactly.
 */
export const MODERN_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">`;

export const MODERN_CSS = /* css */ `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#0d1117;--ink-2:#24292f;--ink-3:#57606a;--ink-4:#8c959f;--ink-5:#afb8c1;
  --surface:#ffffff;--surface-2:#f6f8fa;--surface-3:#eaeef2;--surface-4:#d0d7de;
  --brand:#2563eb;--brand-2:#1d4ed8;--brand-bg:#eff6ff;--brand-brd:#bfdbfe;
  --navy:#0f172a;--navy-2:#1e293b;--navy-3:#334155;
  --gold:#d97706;--gold-2:#b45309;--gold-bg:#fffbeb;--gold-brd:#fde68a;
  --pos:#16a34a;--pos-bg:#f0fdf4;--pos-brd:#bbf7d0;
  --neg:#dc2626;--neg-bg:#fef2f2;--neg-brd:#fecaca;
  --warn-bg:#fffbeb;--warn-brd:#fde68a;--warn:#b45309;
  --ff-ui:'Plus Jakarta Sans',system-ui,sans-serif;
  --ff-data:'Inter',system-ui,sans-serif;
  --sb:252px;
  --r1:4px;--r2:6px;--r3:8px;--r4:12px;--r5:16px;
  --sh1:0 1px 3px rgba(0,0,0,.07),0 1px 2px rgba(0,0,0,.05);
  --sh2:0 3px 10px rgba(0,0,0,.07),0 1px 4px rgba(0,0,0,.05);
  /* Compat aliases */
  --stone-400:var(--ink-4);--stone-500:var(--ink-3);--stone-700:var(--ink-2);--stone-800:var(--ink);--stone-900:var(--ink);
  --stone-200:var(--surface-3);--stone-100:var(--surface-2);--stone-50:var(--surface-2);--white:var(--surface);
  --navy-900:var(--navy);--navy-800:var(--navy-2);--navy-700:var(--navy-3);--navy-50:var(--brand-bg);--navy-100:var(--brand-brd);
  --gold-500:var(--gold);--gold-400:var(--gold);--gold-300:var(--gold-brd);--gold-100:var(--gold-bg);--gold-50:var(--gold-bg);
  --green-600:var(--pos);--green-500:var(--pos);--green-100:var(--pos-brd);--green-50:var(--pos-bg);
  --red-600:var(--neg);--red-500:var(--neg);--red-100:var(--neg-brd);--red-50:var(--neg-bg);
  --amber-500:#f59e0b;--amber-100:var(--warn-bg);
  --ff-serif:var(--ff-ui);--ff-sans:var(--ff-data);
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:20px;--s6:24px;--s8:32px;--s10:40px;--s12:48px;--s16:64px;--s20:80px;
  --r-sm:var(--r1);--r-md:var(--r3);--r-lg:var(--r4);--r-xl:var(--r5);
  --sidebar-w:var(--sb);
  --shadow-sm:var(--sh1);--shadow-md:var(--sh2);
}
html{scroll-behavior:smooth;font-size:14px}
body{font-family:var(--ff-data);background:var(--surface-2);color:var(--ink-2);line-height:1.6;display:flex;min-height:100vh;-webkit-font-smoothing:antialiased}

/* SIDEBAR */
.sidebar{width:var(--sidebar-w);min-height:100vh;background:var(--navy);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:200}
.sidebar::after{display:none}
.sb-brand{padding:20px 18px 16px;border-bottom:1px solid rgba(255,255,255,0.06);position:relative;z-index:2}
.sb-logo{display:flex;align-items:center;margin-bottom:14px;line-height:0}
.sb-logo-full{display:block;width:100%;max-width:200px;height:auto;max-height:44px;object-fit:contain;object-position:left center}
.sb-client-box{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.07);border-radius:var(--r2);padding:9px 11px}
.sb-client-label{font-family:var(--ff-ui);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:rgba(255,255,255,0.28);margin-bottom:3px}
.sb-client-name{font-family:var(--ff-ui);font-size:12.5px;font-weight:600;color:rgba(255,255,255,0.80);line-height:1.4}
.sb-client-date{font-size:11px;color:rgba(255,255,255,0.28);margin-top:2px;font-family:var(--ff-data)}
.sb-nav{flex:1;overflow-y:auto;padding:12px 10px;position:relative;z-index:2}
.sb-nav::-webkit-scrollbar{width:3px}.sb-nav::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:99px}
.sb-nav-group-label{font-family:var(--ff-ui);font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.2);padding:0 8px;margin:12px 0 4px}
.sb-nav-group-label:first-child{margin-top:0}
.sb-nav-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:var(--r2);text-decoration:none;color:rgba(255,255,255,0.45);font-family:var(--ff-data);font-size:12px;font-weight:500;transition:all .15s;cursor:pointer;margin-bottom:1px;position:relative}
.sb-nav-item:hover{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.78)}
.sb-nav-item.active{background:rgba(37,99,235,0.2);color:#93c5fd}
.sb-nav-item.active .nav-icon{color:#60a5fa}
.nav-icon{width:14px;height:14px;flex-shrink:0;color:rgba(255,255,255,0.3)}
.sb-nav-item:hover .nav-icon{color:rgba(255,255,255,0.6)}
.sb-progress{padding:10px 18px;border-top:1px solid rgba(255,255,255,0.06);position:relative;z-index:2}
.sb-progress-label{display:flex;justify-content:space-between;font-size:9.5px;font-weight:600;font-family:var(--ff-ui);color:rgba(255,255,255,0.22);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.sb-progress-track{height:3px;background:rgba(255,255,255,0.07);border-radius:99px;overflow:hidden}
.sb-progress-fill{height:100%;background:linear-gradient(90deg,var(--brand),#60a5fa);border-radius:99px;width:0%;transition:width .3s ease}
.sb-footer{padding:12px 18px;border-top:1px solid rgba(255,255,255,0.06);position:relative;z-index:2}
.sb-advisor-name{font-family:var(--ff-ui);font-size:11.5px;font-weight:600;color:rgba(255,255,255,0.5)}
.sb-advisor-role{font-size:10.5px;color:rgba(255,255,255,0.22);margin-top:1px}
.sb-company-divider{margin:8px 8px 0;padding:7px 0 0;border-top:1px solid rgba(255,255,255,0.06)}

/* MAIN */
.main{margin-left:var(--sidebar-w);flex:1}
.main .page-inner{max-width:880px;margin-left:auto;margin-right:auto;box-sizing:border-box;width:100%}
.page.hero .hero-logo-img,.page.company-hero .hero-logo-img{filter:brightness(0) invert(1)}
.print-only{display:none!important}
.fa-interactive-only{display:block}
.fa-interactive-note{font-size:12px;color:var(--ink-4);margin-top:14px}
.fa-proj-controls{margin:20px 0;padding:16px 20px;background:var(--surface-2);border:1px solid var(--surface-3);border-radius:var(--r3)}
.fa-proj-control-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.fa-proj-control-row:last-child{margin-bottom:0}
.fa-proj-control-lbl{flex:0 0 140px;font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:0.5px}
.fa-proj-range{flex:1;min-width:160px;max-width:360px}
.fa-proj-control-val{min-width:120px;font-size:12px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.fa-proj-chart-print{display:none}
.fa-proj-canvas-wrap{width:100%;overflow:auto}
.fa-backtest-controls{margin:16px 0;display:flex;flex-direction:column;gap:8px}
.fa-backtest-label{font-size:11px;font-weight:700;color:var(--ink-3)}
.fa-backtest-select{max-width:220px;padding:8px 10px;border-radius:var(--r2);border:1px solid var(--surface-3);font-size:14px;background:var(--surface)}
.fa-backtest-chart-wrap{position:relative;height:min(360px,55vh);min-height:240px;width:100%}
.fa-backtest-chart-wrap canvas{max-width:100%!important;height:auto!important}

/* PAGE SHELL */
.page{min-height:100vh;border-bottom:1px solid var(--surface-3);display:flex;flex-direction:column;position:relative}
.page:nth-child(odd){background:var(--surface)}.page:nth-child(even){background:var(--surface)}
.page+.page{page-break-before:always}
.page.hero{background:var(--navy)!important;min-height:100vh}
.page.company-hero{background:var(--navy-2)!important;min-height:100vh}
.page-bar{height:2.5px;background:var(--brand);flex-shrink:0}
.page.company-hero .page-bar{background:var(--gold)}
.page-inner{flex:1;padding:52px 60px;display:flex;flex-direction:column}

/* SECTION HEADER */
.sec-header{margin-bottom:36px;max-width:600px}
.sec-number{font-family:var(--ff-ui);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--brand);display:flex;align-items:center;gap:8px;margin-bottom:8px}
.sec-number::before{content:'';display:block;width:16px;height:1.5px;background:var(--brand);border-radius:99px}
.sec-number.gold{color:var(--gold)}.sec-number.gold::before{background:var(--gold)}
.sec-title{font-family:var(--ff-ui);font-size:34px;font-weight:800;color:var(--ink);letter-spacing:-1px;line-height:1.15;margin-bottom:6px}
.sec-desc{font-size:13px;color:var(--ink-3);line-height:1.7}

/* HERO */
.hero .page-inner{justify-content:space-between;padding-top:48px}
.hero-lines{display:none}
.hero-top{display:flex;justify-content:space-between;align-items:center;gap:16px}
.hero-brand-logo{display:flex;align-items:center;line-height:0;flex-shrink:0}
.hero-logo-img{display:block;height:40px;width:auto;max-width:min(220px,52vw);object-fit:contain;object-position:left center}
.hero-badge{font-family:var(--ff-ui);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#93c5fd;background:rgba(37,99,235,0.18);border:1px solid rgba(96,165,250,0.25);padding:4px 12px;border-radius:99px}
.hero-center{padding:72px 0 48px}
.hero-eyebrow{font-family:var(--ff-ui);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#60a5fa;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.hero-eyebrow-line{display:block;width:20px;height:1.5px;background:#60a5fa}
.hero-title{font-family:var(--ff-ui);font-size:clamp(46px,5.5vw,72px);font-weight:800;color:#fff;letter-spacing:-2.5px;line-height:1.07;margin-bottom:20px}
.hero-title em{font-style:normal;color:#60a5fa}
.hero-subtitle{font-family:var(--ff-data);font-size:14px;color:rgba(255,255,255,0.35);max-width:400px;line-height:1.7}
.hero-bottom{display:grid;grid-template-columns:auto auto auto 1fr;gap:0;border-top:1px solid rgba(255,255,255,0.07);padding-top:28px}
.hero-meta-item{padding-right:28px;margin-right:28px;border-right:1px solid rgba(255,255,255,0.07)}
.hero-meta-item:last-child{border-right:none;margin-right:0;padding-right:0;padding-left:28px}
.hero-meta-label{font-family:var(--ff-ui);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.22);margin-bottom:5px}
.hero-meta-val{font-family:var(--ff-ui);font-size:15px;font-weight:700;color:rgba(255,255,255,0.82);line-height:1.3}
.hero-meta-sub{font-size:11px;color:rgba(255,255,255,0.22);margin-top:2px;font-family:var(--ff-data)}

/* KPI */
.kpi-row{display:grid;gap:1px;background:var(--surface-3);border:1px solid var(--surface-3);border-radius:var(--r4);overflow:hidden;margin-bottom:24px}
.kpi-row-2{grid-template-columns:repeat(2,1fr)}.kpi-row-3{grid-template-columns:repeat(3,1fr)}.kpi-row-4{grid-template-columns:repeat(4,1fr)}.kpi-row-6{grid-template-columns:repeat(6,1fr)}
.kpi-cell{background:var(--surface);padding:20px 22px;display:flex;flex-direction:column}
.kpi-cell.dark-cell{background:var(--navy)}
.kpi-cell.gold-cell{background:var(--gold-bg);border-left:3px solid var(--gold)}
.kpi-cell.green-cell{background:var(--pos-bg);border-left:3px solid var(--pos)}
.kpi-cell.red-cell{background:var(--neg-bg);border-left:3px solid var(--neg)}
.kpi-label{font-family:var(--ff-ui);font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--ink-4);margin-bottom:4px}
.kpi-cell.dark-cell .kpi-label{color:rgba(255,255,255,0.28)}.kpi-cell.gold-cell .kpi-label{color:var(--gold-2)}
.kpi-value{font-family:var(--ff-ui);font-size:26px;font-weight:800;color:var(--ink);letter-spacing:-0.8px;line-height:1;margin-top:2px}
.kpi-cell.dark-cell .kpi-value{color:#fff}.kpi-cell.gold-cell .kpi-value{color:var(--gold)}.kpi-cell.green-cell .kpi-value{color:var(--pos)}.kpi-cell.red-cell .kpi-value{color:var(--neg)}
.kpi-sub{font-size:11px;color:var(--ink-4);margin-top:6px}
.kpi-cell.dark-cell .kpi-sub{color:rgba(255,255,255,0.25)}
.c-pos{color:var(--pos)!important}.c-neg{color:var(--neg)!important}.c-gold{color:var(--gold)!important}.c-muted{color:var(--ink-4)!important}.c-navy{color:var(--navy)!important}.c-white{color:#fff!important}

/* CARDS */
.card{background:var(--surface);border:1px solid var(--surface-3);border-radius:var(--r4);padding:20px}
.card.has-top-border-gold{border-top:2.5px solid var(--gold)}.card.has-top-border-green{border-top:2.5px solid var(--pos)}.card.has-top-border-red{border-top:2.5px solid var(--neg)}.card.has-top-border-navy{border-top:2.5px solid var(--navy)}
.card-padded{padding:20px}
.card-title{font-family:var(--ff-ui);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ink-4);margin-bottom:10px}

/* TABLES */
.tbl-wrap{border:1px solid var(--surface-3);border-radius:var(--r4);overflow:hidden;margin-bottom:20px;background:var(--surface)}
.tbl-cap{padding:12px 18px;background:var(--surface-2);border-bottom:1px solid var(--surface-3);display:flex;align-items:center;justify-content:space-between}
.tbl-cap-title{font-family:var(--ff-ui);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--ink-3)}
table.dt{width:100%;border-collapse:collapse}
table.dt thead tr{background:var(--surface-2);border-bottom:1px solid var(--surface-3)}
table.dt thead th{padding:10px 16px;font-family:var(--ff-ui);font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ink-4);text-align:left;white-space:nowrap}
table.dt thead th.r{text-align:right}
table.dt tbody tr{border-bottom:1px solid var(--surface-2)}
table.dt tbody tr:last-child{border-bottom:none}
table.dt tbody tr.total td{font-family:var(--ff-ui);font-weight:700;color:var(--ink);background:var(--surface-2);border-top:1.5px solid var(--surface-3)}
table.dt td{padding:12px 16px;font-size:13px;color:var(--ink-2);vertical-align:middle}
table.dt td.r{text-align:right;font-weight:600;white-space:nowrap}
table.dt td.bold{font-weight:700;color:var(--ink);font-family:var(--ff-ui)}
table.dt td.muted{color:var(--ink-4)}
table.dt td.num{font-size:14px;font-family:var(--ff-ui);font-weight:700}

/* CASHFLOW */
.cf-list{list-style:none}
.cf-item{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;border-bottom:1px solid var(--surface-2);font-size:13px}
.cf-item:last-child{border-bottom:none}
.cf-item.total{background:var(--surface-2);font-weight:700;color:var(--ink);border-top:1.5px solid var(--surface-3)}
.cf-name{color:var(--ink-3)}.cf-item.total .cf-name{color:var(--ink);font-family:var(--ff-ui);font-weight:700}
.cf-amt{font-weight:600;white-space:nowrap;font-family:var(--ff-ui)}

/* CALLOUTS */
.callout{display:flex;gap:12px;padding:12px 16px;border-radius:var(--r3);font-size:12.5px;line-height:1.6;margin:12px 0}
.callout-icon{flex-shrink:0;margin-top:1px}
.callout strong{display:block;font-weight:700;margin-bottom:1px;font-family:var(--ff-ui)}
.callout.success{background:var(--pos-bg);border:1px solid var(--pos-brd);color:#14532d}
.callout.warn{background:var(--warn-bg);border:1px solid var(--warn-brd);color:#78350f}
.callout.danger{background:var(--neg-bg);border:1px solid var(--neg-brd);color:#7f1d1d}
.callout.info{background:var(--brand-bg);border:1px solid var(--brand-brd);color:#1e40af}

/* PRODUCT CARDS */
.product-card{background:var(--surface);border:1px solid var(--surface-3);border-radius:var(--r5);overflow:hidden;margin-bottom:24px;box-shadow:var(--sh1)}
.product-card-head{padding:24px 28px 20px;border-bottom:1px solid var(--surface-2);display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.product-type-pill{display:inline-flex;align-items:center;gap:5px;font-family:var(--ff-ui);font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;padding:3px 9px;border-radius:99px;margin-bottom:8px}
.pill-blue{background:var(--brand-bg);color:var(--brand-2)}.pill-gold{background:var(--gold-bg);color:var(--gold-2)}.pill-green{background:var(--pos-bg);color:#166534}
.product-name{font-family:var(--ff-ui);font-size:26px;font-weight:800;color:var(--ink);letter-spacing:-0.8px;line-height:1.2}
.product-meta{font-size:12px;color:var(--ink-4);margin-top:3px}
.product-invest{text-align:right;flex-shrink:0;padding-left:20px}
.product-logo-wrap{margin-bottom:8px;display:flex;justify-content:flex-end}
.product-logo{height:28px;max-width:148px;object-fit:contain;display:block}
.product-logo-fallback{min-height:28px;padding:4px 8px;border:1px solid var(--surface-3);border-radius:var(--r2);font-size:10px;font-weight:700;line-height:1.1;color:var(--ink-4);text-transform:uppercase;letter-spacing:.6px;background:var(--surface-2);display:inline-flex;align-items:center;justify-content:center;text-align:center}
.product-invest-label{font-family:var(--ff-ui);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--ink-4);margin-bottom:4px}
.product-invest-amt{font-family:var(--ff-ui);font-size:22px;font-weight:800;color:var(--brand);letter-spacing:-0.5px;white-space:nowrap}
.product-card-body{padding:20px 28px}
.product-desc{font-size:13px;line-height:1.75;color:var(--ink-3);margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid var(--surface-2);max-height:10em;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical}
.product-hero-image-wrap{margin:0 auto 16px;border:none;border-radius:var(--r3);overflow:visible;background:transparent;text-align:center;max-width:100%}
.product-hero-image{width:auto;max-width:80%;max-height:260px;height:auto;object-fit:contain;display:block;margin:0 auto}
.product-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 auto 16px;max-width:92%;justify-items:center}
.product-gallery-item{border:1px solid var(--surface-3);border-radius:var(--r2);overflow:hidden;background:var(--surface-2);width:100%;max-width:min(280px,30vw)}
.product-gallery-image{width:100%;height:auto;max-height:120px;object-fit:contain;display:block}
.product-gallery-logos .product-gallery-item{background:#fff;padding:12px;display:flex;align-items:center;justify-content:center}
.product-gallery-logos .product-gallery-image{height:auto;max-height:100px;object-fit:contain}
.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--surface-3);border:1px solid var(--surface-3);border-radius:var(--r3);overflow:hidden;margin-bottom:20px}
.stat-cell{background:var(--surface);padding:12px 14px}
.stat-lbl{font-family:var(--ff-ui);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ink-4);margin-bottom:3px}
.stat-val{font-family:var(--ff-ui);font-size:14px;font-weight:700;color:var(--ink)}
.bar-section{margin-bottom:20px}.bar-section-title{font-family:var(--ff-ui);font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ink-4);margin-bottom:10px}
.bar-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.bar-row-name{font-size:12px;color:var(--ink-3);flex:0 0 140px}
.bar-track{flex:1;height:4px;background:var(--surface-3);border-radius:99px;overflow:hidden}
.bar-fill{height:100%;border-radius:99px}
.bar-pct{font-family:var(--ff-ui);font-size:12px;font-weight:700;color:var(--ink-2);flex:0 0 40px;text-align:right}
.check-list{list-style:none;display:flex;flex-direction:column;gap:9px}
.check-list li{display:flex;align-items:flex-start;gap:9px;font-size:13px;color:var(--ink-3);line-height:1.6}
.check-list li::before{content:'';width:16px;height:16px;flex-shrink:0;margin-top:2px;background:var(--pos-bg);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 6l3 3 5-5' stroke='%2316a34a' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:center;border-radius:50%}
.product-card-foot{padding:14px 28px;background:var(--surface-2);border-top:1px solid var(--surface-2);display:flex;align-items:center;justify-content:space-between}
.foot-label{font-family:var(--ff-ui);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ink-4)}
.foot-val{font-family:var(--ff-ui);font-size:22px;font-weight:800;color:var(--pos);letter-spacing:-0.5px}

/* CHART */
.chart-wrap{background:var(--surface);border:1px solid var(--surface-3);border-radius:var(--r4);padding:24px;margin-bottom:20px}
.chart-title{font-family:var(--ff-ui);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ink-4);margin-bottom:20px;display:flex;align-items:center;justify-content:space-between}
.chart-title-right{font-family:var(--ff-ui);font-size:20px;font-weight:800;color:var(--pos);letter-spacing:-0.5px;text-transform:none}
.alloc-section{display:grid;grid-template-columns:auto 1fr;gap:32px;align-items:center}
.alloc-legend{display:flex;flex-direction:column;gap:12px}
.legend-row{display:flex;align-items:center;gap:9px;font-size:12.5px}
.legend-swatch{width:10px;height:10px;border-radius:2px;flex-shrink:0}
.legend-name{color:var(--ink-2);flex:1}
.legend-pct{font-family:var(--ff-ui);font-size:16px;font-weight:800;color:var(--ink)}

/* INSURANCE */
.ins-person-header{display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--surface);border:1px solid var(--surface-3);border-radius:var(--r4);margin-bottom:16px}
.ins-person-icon{width:40px;height:40px;border-radius:var(--r3);display:flex;align-items:center;justify-content:center;font-family:var(--ff-ui);font-size:16px;font-weight:800;flex-shrink:0}
.icon-blue{background:var(--brand-bg);color:var(--brand)}.icon-red{background:var(--neg-bg);color:var(--neg)}.icon-gold{background:var(--gold-bg);color:var(--gold-2)}
.ins-person-title{font-family:var(--ff-ui);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:var(--ink-4);margin-bottom:3px}
.ins-person-income{font-family:var(--ff-ui);font-size:20px;font-weight:800;color:var(--ink);letter-spacing:-0.5px}
.ins-row{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start;padding:14px 16px;border-bottom:1px solid var(--surface-2)}
.ins-row:last-child{border-bottom:none}
.ins-name{font-family:var(--ff-ui);font-size:13.5px;font-weight:700;color:var(--ink)}
.ins-sub{font-size:11px;color:var(--ink-4);margin-top:2px}
.ins-amt{font-family:var(--ff-ui);font-size:16px;font-weight:800;color:var(--gold);text-align:right;white-space:nowrap}
.ins-amt.bad{color:var(--neg)}
.ins-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px;page-break-inside:avoid}
.ins-detail-card{background:var(--surface-2);border:1px solid var(--surface-3);border-radius:var(--r3);padding:16px}
.ins-detail-title{font-family:var(--ff-ui);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ink-4);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--surface-3)}
.ins-line{display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;font-size:12px;border-bottom:1px solid var(--surface-3)}
.ins-line:last-child{border-bottom:none}
.ins-line.sum{font-weight:700;color:var(--ink);border-top:1.5px solid var(--surface-3);margin-top:4px;padding-top:8px}
.ins-line-name{color:var(--ink-3)}
.ins-line-val{font-weight:600;white-space:nowrap;font-family:var(--ff-ui)}

/* GOAL BAR */
.goal-row{background:var(--surface);border:1px solid var(--surface-3);border-radius:var(--r4);padding:18px 20px;margin-bottom:14px}
.goal-row-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
.goal-name{font-family:var(--ff-ui);font-size:14px;font-weight:700;color:var(--ink)}
.goal-horizon{font-size:11.5px;color:var(--ink-4);margin-top:2px}
.goal-amt-val{font-family:var(--ff-ui);font-size:20px;font-weight:800;color:var(--ink);letter-spacing:-0.5px}
.goal-monthly{font-size:11.5px;color:var(--ink-4);text-align:right;margin-top:2px}
.goal-track{height:4px;background:var(--surface-3);border-radius:99px;overflow:hidden;margin-bottom:6px}
.goal-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--brand),var(--pos))}
.goal-meta{display:flex;justify-content:space-between;font-size:11px;color:var(--ink-4);font-weight:600}
.goal-covered{color:var(--pos);font-weight:700}

/* FORMULA */
.formula-box{background:var(--brand-bg);border:1px solid var(--brand-brd);border-radius:var(--r3);padding:18px 20px;margin-top:16px}
.formula-title{font-family:var(--ff-ui);font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--brand);margin-bottom:10px}
.formula-expr{font-family:'Georgia',serif;font-style:italic;font-size:17px;color:var(--brand-2);margin-bottom:8px}
.formula-desc{font-size:12px;color:var(--brand-2);line-height:1.7}

/* RISK GRID */
.risk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;page-break-inside:avoid}
.risk-item{background:var(--surface);border:1px solid var(--surface-3);border-radius:var(--r3);padding:16px 18px;display:flex;align-items:center;gap:12px;min-height:52px}
.risk-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.risk-dot.ok{background:var(--pos)}.risk-dot.bad{background:var(--neg)}
.risk-name{font-family:var(--ff-ui);font-size:12.5px;font-weight:600;color:var(--ink);flex:1;line-height:1.3}
.risk-status{font-size:11px;font-weight:700;text-align:right;flex-shrink:0;white-space:nowrap}
.risk-status.ok{color:var(--pos)}.risk-status.bad{color:var(--neg)}

/* GAP ROWS */
.gap-row{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--surface-2);font-size:13px}
.gap-row:last-child{border-bottom:none}
.gap-name{font-family:var(--ff-ui);font-weight:600;color:var(--ink)}
.gap-current{color:var(--ink-3)}
.gap-arrow{color:var(--ink-4);margin:0 8px;font-size:11px}
.gap-recommended{font-family:var(--ff-ui);font-weight:700;color:var(--brand)}
.gap-badge{font-family:var(--ff-ui);font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px}
.badge-ok{background:var(--pos-bg);color:var(--pos)}.badge-low{background:var(--neg-bg);color:var(--neg)}

/* OPP */
.opp-row{display:flex;align-items:center;gap:14px;padding:13px 16px;border-bottom:1px solid var(--surface-2)}
.opp-row:last-child{border-bottom:none}
.opp-num{width:24px;height:24px;background:var(--brand);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--ff-ui);font-size:11px;font-weight:800;color:#fff;flex-shrink:0}
.opp-name{font-family:var(--ff-ui);font-size:13px;font-weight:600;color:var(--ink);flex:1}
.opp-val{font-family:var(--ff-ui);font-size:14px;font-weight:800;color:var(--pos);white-space:nowrap}
.money,.currency,.kpi-value,.product-invest-amt,.foot-val,.ins-amt,.ins-line-val,.goal-amt-val,.cf-amt,.gap-recommended,.gap-current,.stat-val,.opp-val{white-space:nowrap}

/* DVZ */
.dvz-note{padding:11px 16px;background:var(--surface-2);border-radius:var(--r2);border:1px solid var(--surface-3);font-size:11px;color:var(--ink-4);text-align:center;margin-top:16px;font-family:var(--ff-data)}

/* INSURANCE PROVIDER LOGOS */
.ins-provider-cell{display:flex;align-items:center;gap:8px}
.ins-provider-logo{width:56px;height:40px;object-fit:contain;flex-shrink:0}
.ins-provider-fallback{font-size:11px;font-weight:600;color:var(--ink-3)}
.sum-row td{border-top:2px solid var(--brand);padding-top:8px;font-weight:700}

/* SIGNATURES */
.sig-area{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:60px;padding-top:32px}
.sig-box{text-align:center}
.sig-line-el{height:1px;background:var(--surface-4);margin-bottom:10px}
.sig-name{font-family:var(--ff-ui);font-size:13px;font-weight:700;color:var(--ink)}
.sig-role{font-size:11px;color:var(--ink-4);margin-top:2px}

/* LEGAL */
.legal{font-size:10.5px;color:var(--ink-5);line-height:1.7;padding:20px 0 0;border-top:1px solid var(--surface-3);margin-top:32px}

/* LAYOUT */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.g2>.card{display:flex;flex-direction:column}
.g2>.card .cf-list{flex:1}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}

/* ANIMATION */
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.page-inner>*{animation:fadeUp .4s ease both}
.page-inner>*:nth-child(1){animation-delay:0s}
.page-inner>*:nth-child(2){animation-delay:.04s}
.page-inner>*:nth-child(3){animation-delay:.08s}
.page-inner>*:nth-child(4){animation-delay:.12s}
.page-inner>*:nth-child(5){animation-delay:.16s}
.page-inner>*:nth-child(6){animation-delay:.2s}
.page-inner>*:nth-child(7){animation-delay:.24s}

/* PRINT */
@media print{
  .print-only.print-advisor-footer{display:block!important;position:fixed;bottom:0;left:0;right:0;padding:5mm 8mm;font-size:8pt;color:#444;border-top:1px solid #ccc;background:#fff;z-index:99999;text-align:center;box-sizing:border-box}
  .fa-interactive-only,.fa-interactive-note,.fa-backtest-controls,.fa-backtest-chart-wrap{display:none!important}
  .sidebar{display:none!important}
  .main{margin-left:0!important}
  .page{min-height:auto;page-break-after:always;break-after:page;page-break-inside:auto;break-inside:auto;overflow:visible;background:#fff!important}
  .page:last-child{page-break-after:auto;break-after:auto}
  .page+.page{page-break-before:auto}
  .page:nth-child(even),.page:nth-child(odd){background:#fff!important}
  .page.hero,.page.company-hero{
    background:var(--surface)!important;
    color:var(--ink);
    -webkit-print-color-adjust:economy;
    print-color-adjust:economy;
  }
  .page.hero .hero-title,.page.company-hero .hero-title{color:var(--ink)!important}
  .page.hero .hero-title em,.page.company-hero .hero-title em{color:var(--brand)!important}
  .page.hero .hero-subtitle,.page.company-hero .hero-subtitle{color:var(--ink-3)!important}
  .page.hero .hero-eyebrow,.page.company-hero .hero-eyebrow{color:var(--brand-2)!important}
  .page.hero .hero-meta-label,.page.company-hero .hero-meta-label{color:var(--ink-4)!important}
  .page.hero .hero-meta-val,.page.company-hero .hero-meta-val{color:var(--ink)!important}
  .page.hero .hero-meta-sub,.page.company-hero .hero-meta-sub{color:var(--ink-4)!important}
  .page.hero .hero-badge,.page.company-hero .hero-badge{color:var(--brand-2)!important;background:rgba(37,99,235,0.1)!important;border-color:rgba(37,99,235,0.25)!important}
  .page.hero .hero-bottom,.page.company-hero .hero-bottom{border-top-color:var(--surface-3)!important}
  .page.hero .hero-meta-item,.page.company-hero .hero-meta-item{border-right-color:var(--surface-3)!important}
  .page.hero .hero-logo-img,.page.company-hero .hero-logo-img{filter:none!important}
  .fa-proj-chart-print{display:block!important}
  .page-bar{height:1.5mm}
  .page-inner{padding:8mm 7mm}
  .hero-lines{display:none!important}
  .sec-header{margin-bottom:12px;page-break-after:avoid}
  .sec-title{font-size:24px;line-height:1.2;margin-bottom:4px}
  .sec-desc{font-size:11px;line-height:1.45}
  .sec-number{font-size:9px}
  .kpi-row{margin-bottom:10px}
  .kpi-cell{padding:10px 11px}
  .kpi-label{font-size:8px}
  .kpi-value{font-size:18px}
  .kpi-sub{font-size:9px}
  .tbl-wrap,.chart-wrap,.callout,.kpi-row,.risk-grid,.goal-row,.ins-person-header,.formula-box,.sig-area{page-break-inside:avoid;break-inside:avoid}
  .product-card{page-break-inside:auto;break-inside:auto}
  .product-card-head,.product-card-foot{page-break-inside:avoid;break-inside:avoid}
  .top-holdings-section > .holding-row:nth-child(n+7){display:none!important}
  .tbl-cap{padding:7px 10px}
  table.dt thead th{padding:6px 8px;font-size:8px}
  table.dt td{padding:6px 8px;font-size:10px}
  .cf-item,.ins-row,.gap-row,.opp-row{padding:6px 8px}
  .cf-name,.ins-sub{font-size:10px}
  .cf-amt,.ins-amt,.opp-val{font-size:11px}
  .callout{padding:7px 10px;font-size:10px;margin:8px 0}
  .product-card{margin-bottom:10px}
  .product-card-head{padding:10px 12px 8px}
  .product-card-body{padding:8px 12px}
  .product-card-foot{padding:7px 12px}
  .product-name{font-size:20px}
  .product-invest-amt{font-size:17px}
  .product-desc{font-size:10px;line-height:1.4;margin-bottom:8px;padding-bottom:8px;max-height:5.8em;-webkit-line-clamp:4}
  .product-hero-image{max-height:90px}
  .product-gallery{gap:6px;margin-bottom:10px}
  .product-gallery-image{height:58px}
  .product-gallery-logos .product-gallery-item{padding:6px}
  .product-gallery-logos .product-gallery-image{height:40px}
  .ins-provider-logo{width:44px;height:32px}
  .stat-cell{padding:7px 8px}
  .stat-lbl{font-size:7.5px}
  .stat-val{font-size:11px}
  .bar-section{margin-bottom:8px}
  .bar-section-title{font-size:8px;margin-bottom:4px}
  .bar-row{gap:7px;margin-bottom:4px}
  .bar-row-name{flex:0 0 98px;font-size:9px}
  .bar-pct{font-size:9px;flex-basis:30px}
  .check-list{gap:4px}
  .check-list li{font-size:9px;line-height:1.35}
  .chart-wrap{padding:8px}
  .chart-title{font-size:8px;margin-bottom:8px}
  .chart-title-right{font-size:14px}
  .alloc-section{gap:12px}
  .alloc-legend{gap:4px}
  .legend-row{font-size:10px}
  .legend-pct{font-size:12px}
  .goal-row{padding:8px 10px;margin-bottom:8px}
  .goal-name{font-size:11px}
  .goal-amt-val{font-size:14px}
  .goal-monthly,.goal-meta{font-size:9px}
  .ins-person-header{padding:8px 10px;margin-bottom:8px}
  .ins-person-icon{width:28px;height:28px;font-size:13px}
  .ins-person-income{font-size:14px}
  .ins-name{font-size:11px}
  .ins-detail-grid{gap:8px}
  .ins-detail-card{padding:8px}
  .ins-detail-title{font-size:8px;margin-bottom:6px;padding-bottom:4px}
  .ins-line{font-size:9px;padding:3px 0}
  .risk-grid{gap:8px;margin-bottom:10px}
  .risk-item{padding:8px 10px;min-height:42px}
  .risk-name{font-size:10px}
  .risk-status{font-size:9px}
  .formula-box{padding:8px 10px}
  .formula-title{font-size:8px;margin-bottom:5px}
  .formula-expr{font-size:13px;margin-bottom:4px}
  .formula-desc{font-size:9px;line-height:1.4}
  .sig-area{margin-top:16px;padding-top:10px;gap:20px}
  .sig-name{font-size:11px}
  .sig-role{font-size:9px}
  .legal{font-size:8px;line-height:1.35;margin-top:10px;padding-top:8px}
  .page-inner>*{animation:none!important}
  body{background:white;padding-bottom:12mm}
  .tbl-cap,.product-card-foot,.ins-detail-card{background:#fff!important}
  table.dt thead tr{background:#f8f9fa!important}
  table.dt tbody tr.total td{background:#f8f9fa!important}
  @page{size:A4;margin:10mm 8mm 16mm 8mm}
}
`;

/**
 * Elegant theme — Instrument Serif + Outfit, gold/navy palette, warm stone tones.
 * Matches aidvisora-report-v2.html exactly.
 */
export const ELEGANT_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">`;

export const ELEGANT_CSS = /* css */ `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy-950:#060e1e;--navy-900:#0b1929;--navy-800:#112238;--navy-700:#1a3350;
  --navy-600:#234369;--navy-500:#2d5380;--navy-300:#5a8bbf;--navy-100:#c5d8ed;--navy-50:#edf3fa;
  --gold-500:#c9a84c;--gold-400:#d8bb74;--gold-300:#e8d09e;--gold-100:#faf3e0;--gold-50:#fefdf8;
  --stone-900:#1c1917;--stone-700:#44403c;--stone-500:#78716c;--stone-400:#a8a29e;
  --stone-200:#e7e5e4;--stone-100:#f5f4f2;--stone-50:#fafaf9;--white:#ffffff;
  --green-600:#16a34a;--green-500:#22c55e;--green-100:#dcfce7;--green-50:#f0fdf4;
  --red-600:#dc2626;--red-500:#ef4444;--red-100:#fee2e2;--red-50:#fff5f5;
  --amber-500:#f59e0b;--amber-100:#fef3c7;
  --ff-serif:'Instrument Serif',Georgia,serif;
  --ff-sans:'Outfit',system-ui,sans-serif;
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:20px;--s6:24px;--s8:32px;--s10:40px;--s12:48px;--s16:64px;--s20:80px;
  --r-sm:4px;--r-md:8px;--r-lg:12px;--r-xl:16px;
  --sidebar-w:256px;
  --shadow-sm:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.06);
  --shadow-md:0 4px 12px rgba(0,0,0,.08),0 2px 4px rgba(0,0,0,.05);
}
html{scroll-behavior:smooth;font-size:15px}
body{font-family:var(--ff-sans);background:var(--stone-100);color:var(--stone-700);line-height:1.6;display:flex;min-height:100vh;-webkit-font-smoothing:antialiased}
.t-serif{font-family:var(--ff-serif)}.t-mono{font-variant-numeric:tabular-nums}
.t-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1.4px}
.t-caption{font-size:11.5px;color:var(--stone-400);line-height:1.5}

/* SIDEBAR */
.sidebar{width:var(--sidebar-w);min-height:100vh;background:var(--navy-900);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100;overflow-y:auto;overflow-x:hidden}
.sidebar::after{content:'';position:fixed;top:0;left:0;width:var(--sidebar-w);height:100vh;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");pointer-events:none;z-index:1}
.sb-brand{padding:var(--s8) var(--s6) var(--s6);border-bottom:1px solid rgba(255,255,255,0.06);position:relative;z-index:2}
.sb-logo{display:flex;align-items:center;margin-bottom:var(--s5);line-height:0}
.sb-logo-full{display:block;width:100%;max-width:200px;height:auto;max-height:44px;object-fit:contain;object-position:left center}
.sb-client-box{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:var(--r-md);padding:var(--s3) var(--s4)}
.sb-client-label{font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;color:rgba(255,255,255,0.25);margin-bottom:3px}
.sb-client-name{font-size:13px;font-weight:600;color:rgba(255,255,255,0.85);line-height:1.3}
.sb-client-date{font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px}
.sb-nav{flex:1;padding:var(--s5) var(--s4);position:relative;z-index:2}
.sb-nav-group-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.2);padding:0 var(--s3);margin:var(--s4) 0 var(--s2)}
.sb-nav-group-label:first-child{margin-top:0}
.sb-nav-item{display:flex;align-items:center;gap:var(--s3);padding:var(--s2) var(--s3);border-radius:var(--r-md);text-decoration:none;color:rgba(255,255,255,0.45);font-size:12.5px;font-weight:500;transition:all .18s ease;cursor:pointer;margin-bottom:1px;position:relative}
.sb-nav-item:hover{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.8)}
.sb-nav-item.active{background:rgba(201,168,76,0.12);color:var(--gold-400)}
.sb-nav-item.active .nav-icon{color:var(--gold-500)}
.nav-icon{width:16px;height:16px;flex-shrink:0;opacity:0.7}
.sb-nav-item.active .nav-icon{opacity:1}
.sb-progress{padding:var(--s4) var(--s6);border-top:1px solid rgba(255,255,255,0.06);position:relative;z-index:2}
.sb-progress-label{display:flex;justify-content:space-between;font-size:10px;font-weight:600;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:1px;margin-bottom:var(--s2)}
.sb-progress-track{height:3px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden}
.sb-progress-fill{height:100%;background:linear-gradient(90deg,var(--gold-500),var(--gold-300));border-radius:99px;width:0%;transition:width .4s ease}
.sb-footer{padding:var(--s5) var(--s6);border-top:1px solid rgba(255,255,255,0.06);position:relative;z-index:2}
.sb-advisor-name{font-size:12px;font-weight:600;color:rgba(255,255,255,0.55)}
.sb-advisor-role{font-size:10.5px;color:rgba(255,255,255,0.22);margin-top:1px}
.sb-company-divider{margin:var(--s2) var(--s3) 0;padding:var(--s2) 0 0;border-top:1px solid rgba(255,255,255,0.06)}
.sidebar::-webkit-scrollbar{width:4px}.sidebar::-webkit-scrollbar-track{background:transparent}.sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:99px}

/* MAIN */
.main{margin-left:var(--sidebar-w);flex:1;display:flex;flex-direction:column}
.main .page-inner{max-width:880px;margin-left:auto;margin-right:auto;box-sizing:border-box;width:100%}
.page.hero .hero-logo-img,.page.company-hero .hero-logo-img{filter:brightness(0) invert(1)}
.print-only{display:none!important}
.fa-interactive-only{display:block}
.fa-interactive-note{font-size:12px;color:var(--stone-500);margin-top:var(--s4)}
.fa-proj-controls{margin:var(--s5) 0;padding:var(--s4) var(--s5);background:var(--stone-50);border:1px solid var(--stone-200);border-radius:var(--r-md)}
.fa-proj-control-row{display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap;margin-bottom:var(--s3)}
.fa-proj-control-row:last-child{margin-bottom:0}
.fa-proj-control-lbl{flex:0 0 140px;font-size:11px;font-weight:600;color:var(--stone-600);text-transform:uppercase;letter-spacing:0.5px}
.fa-proj-range{flex:1;min-width:160px;max-width:360px}
.fa-proj-control-val{min-width:120px;font-size:12px;font-weight:600;color:var(--navy-800);font-variant-numeric:tabular-nums}
.fa-proj-chart-print{display:none}
.fa-proj-canvas-wrap{width:100%;overflow:hidden}
.fa-backtest-controls{margin:var(--s4) 0;display:flex;flex-direction:column;gap:var(--s2)}
.fa-backtest-label{font-size:11px;font-weight:600;color:var(--stone-600)}
.fa-backtest-select{max-width:220px;padding:8px 10px;border-radius:var(--r-md);border:1px solid var(--stone-200);font-size:14px;background:var(--white)}
.fa-backtest-chart-wrap{position:relative;height:min(360px,55vh);min-height:240px;width:100%}
.fa-backtest-chart-wrap canvas{max-width:100%!important;height:auto!important}

/* PAGE SHELL */
.page{min-height:100vh;position:relative;display:flex;flex-direction:column}
.page-bar{height:3px;background:linear-gradient(90deg,var(--gold-500) 0%,transparent 100%);flex-shrink:0}
.page-inner{flex:1;padding:var(--s12) var(--s16);display:flex;flex-direction:column}
.page:nth-child(even){background:var(--white)}.page:nth-child(odd){background:var(--stone-50)}
.page.hero{background:var(--navy-900)!important;min-height:100vh}
.page.company-hero{background:var(--navy-800)!important;min-height:100vh}

/* SECTION HEADER */
.sec-header{margin-bottom:var(--s10);max-width:640px}
.sec-number{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--gold-500);display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3)}
.sec-number::before{content:'';display:block;width:18px;height:1.5px;background:var(--gold-500);border-radius:99px}
.sec-title{font-family:var(--ff-serif);font-size:40px;font-weight:400;color:var(--stone-900);letter-spacing:-0.8px;line-height:1.18;margin-bottom:var(--s3)}
.sec-desc{font-size:13.5px;color:var(--stone-500);line-height:1.75}
.sec-number.gold{color:var(--gold-500)}.sec-number.gold::before{background:var(--gold-500)}

/* HERO */
.hero .page-inner{justify-content:space-between;padding:var(--s16) var(--s16) var(--s12)}
.hero-lines{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.hero-lines svg{position:absolute;bottom:0;right:0;width:60%;height:auto;opacity:0.04}
.hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:var(--s4)}
.hero-brand-logo{display:flex;align-items:center;line-height:0;flex-shrink:0}
.hero-logo-img{display:block;height:40px;width:auto;max-width:min(220px,52vw);object-fit:contain;object-position:left center}
.hero-badge{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:var(--gold-500);background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.2);padding:5px 12px;border-radius:99px}
.hero-center{padding:var(--s20) 0 var(--s12)}
.hero-eyebrow{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:2px;color:var(--gold-400);margin-bottom:var(--s5);display:flex;align-items:center;gap:var(--s3)}
.hero-eyebrow-line{display:block;width:24px;height:1.5px;background:var(--gold-400)}
.hero-title{font-family:var(--ff-serif);font-size:clamp(52px,6.5vw,80px);font-weight:400;color:var(--white);line-height:1.06;letter-spacing:-2px;margin-bottom:var(--s8)}
.hero-title em{font-style:italic;color:var(--gold-400)}
.hero-subtitle{font-size:14px;color:rgba(255,255,255,0.35);max-width:420px;line-height:1.7}
.hero-bottom{display:grid;grid-template-columns:repeat(3,auto) 1fr;gap:0;border-top:1px solid rgba(255,255,255,0.08);padding-top:var(--s8);align-items:start}
.hero-meta-item{padding-right:var(--s8);margin-right:var(--s8);border-right:1px solid rgba(255,255,255,0.08)}
.hero-meta-item:last-child{border-right:none;margin-right:0;padding-right:0}
.hero-meta-label{font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:1.4px;color:rgba(255,255,255,0.22);margin-bottom:5px}
.hero-meta-val{font-size:15px;font-weight:600;color:rgba(255,255,255,0.85);line-height:1.3}
.hero-meta-sub{font-size:11px;color:rgba(255,255,255,0.25);margin-top:2px}

/* KPI */
.kpi-row{display:grid;gap:1px;background:var(--stone-200);border:1px solid var(--stone-200);border-radius:var(--r-lg);overflow:hidden;margin-bottom:var(--s8)}
.kpi-row-2{grid-template-columns:repeat(2,1fr)}.kpi-row-3{grid-template-columns:repeat(3,1fr)}.kpi-row-4{grid-template-columns:repeat(4,1fr)}.kpi-row-6{grid-template-columns:repeat(6,1fr)}
.kpi-cell{background:var(--white);padding:var(--s6) var(--s8);display:flex;flex-direction:column;gap:var(--s1)}
.kpi-cell.dark-cell{background:var(--navy-900)}
.kpi-cell.gold-cell{background:var(--gold-50);border-left:3px solid var(--gold-500)}
.kpi-cell.green-cell{background:var(--green-50);border-left:3px solid var(--green-600)}
.kpi-cell.red-cell{background:var(--red-50);border-left:3px solid var(--red-600)}
.kpi-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;color:var(--stone-400);margin-bottom:var(--s1)}
.kpi-cell.dark-cell .kpi-label{color:rgba(255,255,255,0.28)}.kpi-cell.gold-cell .kpi-label{color:var(--gold-500)}
.kpi-value{font-family:var(--ff-serif);font-size:32px;font-weight:400;color:var(--stone-900);letter-spacing:-1px;line-height:1;margin-top:var(--s1);font-variant-numeric:tabular-nums}
.kpi-cell.dark-cell .kpi-value{color:var(--white)}
.kpi-sub{font-size:11.5px;color:var(--stone-400);margin-top:var(--s2)}
.kpi-cell.dark-cell .kpi-sub{color:rgba(255,255,255,0.25)}
.c-pos{color:var(--green-600)!important}.c-neg{color:var(--red-600)!important}.c-gold{color:var(--gold-500)!important}.c-muted{color:var(--stone-400)!important}.c-navy{color:var(--navy-800)!important}.c-white{color:var(--white)!important}

/* CARDS */
.card{background:var(--white);border:1px solid var(--stone-200);border-radius:var(--r-lg);overflow:hidden}
.card.has-top-border-gold{border-top:2.5px solid var(--gold-500)}.card.has-top-border-green{border-top:2.5px solid var(--green-600)}.card.has-top-border-red{border-top:2.5px solid var(--red-600)}.card.has-top-border-navy{border-top:2.5px solid var(--navy-700)}
.card-padded{padding:var(--s6)}
.card-header{padding:var(--s5) var(--s6);border-bottom:1px solid var(--stone-100);display:flex;align-items:center;justify-content:space-between;gap:var(--s3)}
.card-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--stone-500)}
.card-body{padding:var(--s5) var(--s6)}

/* DATA TABLES */
.tbl-wrap{border:1px solid var(--stone-200);border-radius:var(--r-lg);overflow:hidden;margin-bottom:var(--s5)}
.tbl-cap{padding:var(--s4) var(--s6);background:var(--stone-50);border-bottom:1px solid var(--stone-200);display:flex;align-items:center;justify-content:space-between}
.tbl-cap-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.9px;color:var(--stone-500)}
table.dt{width:100%;border-collapse:collapse}
table.dt thead tr{background:var(--stone-50);border-bottom:1px solid var(--stone-200)}
table.dt thead th{padding:var(--s3) var(--s5);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--stone-400);text-align:left;white-space:nowrap}
table.dt thead th.r{text-align:right}
table.dt tbody tr{border-bottom:1px solid var(--stone-100);transition:background .12s}
table.dt tbody tr:last-child{border-bottom:none}
table.dt tbody tr.total td{font-weight:700;color:var(--stone-900);background:var(--stone-50);border-top:1.5px solid var(--stone-200)}
table.dt td{padding:var(--s4) var(--s5);font-size:13px;color:var(--stone-700);vertical-align:middle}
table.dt td.r{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
table.dt td.bold{font-weight:600;color:var(--stone-900)}
table.dt td.muted{color:var(--stone-400)}
table.dt td.num{font-family:var(--ff-serif);font-size:15px;font-variant-numeric:tabular-nums}

/* CASHFLOW LIST */
.cf-list{list-style:none}
.cf-item{display:flex;justify-content:space-between;align-items:center;padding:var(--s4) var(--s5);border-bottom:1px solid var(--stone-100);font-size:13px}
.cf-item:last-child{border-bottom:none}
.cf-item.total{background:var(--stone-50);font-weight:700;color:var(--stone-900);border-top:1.5px solid var(--stone-200)}
.cf-name{color:var(--stone-600)}.cf-item.total .cf-name{color:var(--stone-800);font-weight:700}
.cf-amt{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}

/* CALLOUTS */
.callout{display:flex;gap:var(--s4);padding:var(--s4) var(--s5);border-radius:var(--r-md);font-size:13px;line-height:1.6;margin:var(--s4) 0}
.callout-icon{flex-shrink:0;font-size:15px;margin-top:1px}
.callout strong{display:block;font-weight:700;margin-bottom:2px}
.callout.success{background:var(--green-50);border:1px solid #bbf7d0;color:#14532d}
.callout.warn{background:var(--amber-100);border:1px solid #fde68a;color:#78350f}
.callout.danger{background:var(--red-50);border:1px solid #fca5a5;color:#7f1d1d}
.callout.info{background:var(--navy-50);border:1px solid var(--navy-100);color:var(--navy-700)}

/* PRODUCT CARDS */
.product-card{background:var(--white);border:1px solid var(--stone-200);border-radius:var(--r-xl);overflow:hidden;margin-bottom:var(--s6);box-shadow:var(--shadow-sm)}
.product-card-head{padding:var(--s8) var(--s8) var(--s6);display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--stone-100);gap:var(--s4)}
.product-type-pill{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;padding:4px 10px;border-radius:99px;margin-bottom:var(--s3)}
.pill-blue{background:var(--navy-50);color:var(--navy-700)}.pill-gold{background:var(--gold-100);color:#8b6914}.pill-green{background:var(--green-100);color:#14532d}
.product-name{font-family:var(--ff-serif);font-size:30px;font-weight:400;color:var(--stone-900);letter-spacing:-0.5px;line-height:1.2}
.product-meta{font-size:12.5px;color:var(--stone-400);margin-top:4px}
.product-invest{text-align:right;flex-shrink:0;padding-left:var(--s6)}
.product-logo-wrap{margin-bottom:8px;display:flex;justify-content:flex-end}
.product-logo{height:28px;max-width:148px;object-fit:contain;display:block}
.product-logo-fallback{min-height:28px;padding:4px 8px;border:1px solid var(--stone-200);border-radius:var(--r-sm);font-size:10px;font-weight:700;line-height:1.1;color:var(--stone-500);text-transform:uppercase;letter-spacing:.6px;background:var(--stone-50);display:inline-flex;align-items:center;justify-content:center;text-align:center}
.product-invest-label{font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;color:var(--stone-400);margin-bottom:4px}
.product-invest-amt{font-family:var(--ff-serif);font-size:26px;color:var(--navy-800);letter-spacing:-0.5px;white-space:nowrap}
.product-card-body{padding:var(--s6) var(--s8)}
.product-desc{font-size:13.5px;line-height:1.75;color:var(--stone-600);margin-bottom:var(--s6);padding-bottom:var(--s6);border-bottom:1px solid var(--stone-100)}
.product-hero-image-wrap{margin:0 auto var(--s5);border:none;border-radius:var(--r-md);overflow:visible;background:transparent;text-align:center;max-width:100%}
.product-hero-image{width:auto;max-width:80%;max-height:260px;height:auto;object-fit:contain;display:block;margin:0 auto}
.product-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 auto var(--s5);max-width:92%;justify-items:center}
.product-gallery-item{border:1px solid var(--stone-200);border-radius:var(--r-sm);overflow:hidden;background:var(--stone-50);width:100%;max-width:min(280px,30vw)}
.product-gallery-image{width:100%;height:auto;max-height:120px;object-fit:contain;display:block}
.product-gallery-logos .product-gallery-item{background:#fff;padding:12px;display:flex;align-items:center;justify-content:center}
.product-gallery-logos .product-gallery-image{height:auto;max-height:100px;object-fit:contain}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;background:var(--stone-100);border:1px solid var(--stone-100);border-radius:var(--r-md);overflow:hidden;margin-bottom:var(--s6)}
.stat-cell{background:var(--white);padding:var(--s4) var(--s5)}
.stat-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--stone-400);margin-bottom:4px}
.stat-val{font-size:13px;font-weight:600;color:var(--stone-800);white-space:normal;line-height:1.4}
.bar-section{margin-bottom:var(--s6)}.bar-section-title{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--stone-400);margin-bottom:var(--s4)}
.bar-row{display:flex;align-items:center;gap:var(--s4);margin-bottom:var(--s3)}
.bar-row-name{font-size:12.5px;color:var(--stone-600);flex:0 0 150px}
.bar-track{flex:1;height:4px;background:var(--stone-100);border-radius:99px;overflow:hidden}
.bar-fill{height:100%;border-radius:99px}
.bar-pct{font-size:12px;font-weight:700;color:var(--stone-700);flex:0 0 40px;text-align:right;font-variant-numeric:tabular-nums}
.check-list{list-style:none;display:flex;flex-direction:column;gap:var(--s3)}
.check-list li{display:flex;align-items:flex-start;gap:var(--s3);font-size:13px;color:var(--stone-600);line-height:1.6}
.check-list li::before{content:'';width:18px;height:18px;border-radius:50%;background:var(--green-100);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M2.5 7l3 3 6-6' stroke='%2316a34a' stroke-width='1.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:center;flex-shrink:0;margin-top:1px}
.product-card-foot{padding:var(--s5) var(--s8);background:var(--stone-50);border-top:1px solid var(--stone-100);display:flex;align-items:center;justify-content:space-between}
.foot-label{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--stone-400)}
.foot-val{font-family:var(--ff-serif);font-size:26px;letter-spacing:-0.5px;color:var(--green-600)}

/* CHART */
.chart-wrap{background:var(--white);border:1px solid var(--stone-200);border-radius:var(--r-lg);padding:var(--s8);margin-bottom:var(--s6)}
.chart-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--stone-400);margin-bottom:var(--s6);display:flex;align-items:center;justify-content:space-between}
.chart-title-right{font-family:var(--ff-serif);font-size:22px;font-weight:400;color:var(--green-600);letter-spacing:-0.5px;text-transform:none}
.alloc-section{display:grid;grid-template-columns:auto 1fr;gap:var(--s8);align-items:center}
.alloc-legend{display:flex;flex-direction:column;gap:var(--s4)}
.legend-row{display:flex;align-items:center;gap:var(--s3);font-size:13px}
.legend-swatch{width:10px;height:10px;border-radius:2px;flex-shrink:0}
.legend-name{color:var(--stone-700);flex:1}
.legend-pct{font-family:var(--ff-serif);font-size:18px;color:var(--stone-900);font-weight:400}

/* INSURANCE */
.ins-person-header{display:flex;align-items:center;gap:var(--s4);padding:var(--s5) var(--s6);background:var(--stone-50);border:1px solid var(--stone-200);border-radius:var(--r-lg);margin-bottom:var(--s5)}
.ins-person-icon{width:44px;height:44px;border-radius:var(--r-md);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.icon-blue{background:var(--navy-50)}.icon-red{background:var(--red-100)}.icon-gold{background:var(--gold-100)}
.ins-person-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--stone-400);margin-bottom:3px}
.ins-person-income{font-family:var(--ff-serif);font-size:22px;color:var(--stone-900);letter-spacing:-0.4px}
.ins-row{display:grid;grid-template-columns:1fr auto;gap:var(--s4);align-items:start;padding:var(--s5) var(--s6);border-bottom:1px solid var(--stone-100)}
.ins-row:last-child{border-bottom:none}
.ins-name{font-size:14px;font-weight:600;color:var(--stone-800)}
.ins-sub{font-size:11.5px;color:var(--stone-400);margin-top:2px}
.ins-amt{font-family:var(--ff-serif);font-size:18px;color:var(--gold-500);white-space:nowrap;text-align:right;letter-spacing:-0.3px}
.ins-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--s4);margin-top:var(--s5)}
.ins-detail-card{background:var(--stone-50);border:1px solid var(--stone-100);border-radius:var(--r-md);padding:var(--s5)}
.ins-detail-title{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.9px;color:var(--stone-400);margin-bottom:var(--s4);padding-bottom:var(--s3);border-bottom:1px solid var(--stone-200)}
.ins-line{display:flex;justify-content:space-between;align-items:baseline;padding:var(--s2) 0;font-size:12.5px;border-bottom:1px solid var(--stone-100)}
.ins-line:last-child{border-bottom:none}
.ins-line.sum{font-weight:700;color:var(--stone-900);border-top:1.5px solid var(--stone-200);margin-top:var(--s2);padding-top:var(--s3)}
.ins-line-name{color:var(--stone-500)}
.ins-line-val{font-weight:600;white-space:nowrap;color:var(--stone-800);font-variant-numeric:tabular-nums}

/* GOAL BAR */
.goal-row{background:var(--white);border:1px solid var(--stone-200);border-radius:var(--r-lg);padding:var(--s5) var(--s6);margin-bottom:var(--s4)}
.goal-row-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--s4)}
.goal-name{font-size:15px;font-weight:600;color:var(--stone-900)}
.goal-horizon{font-size:11.5px;color:var(--stone-400);margin-top:2px}
.goal-amt-val{font-family:var(--ff-serif);font-size:22px;color:var(--navy-800);letter-spacing:-0.4px}
.goal-monthly{font-size:11.5px;color:var(--stone-400);text-align:right;margin-top:2px}
.goal-track{height:5px;background:var(--stone-100);border-radius:99px;overflow:hidden;margin-bottom:var(--s2)}
.goal-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold-500),var(--green-500))}
.goal-meta{display:flex;justify-content:space-between;font-size:11px;color:var(--stone-400);font-weight:600}
.goal-covered{color:var(--green-600);font-weight:700}

/* FORMULA */
.formula-box{background:var(--navy-50);border:1px solid var(--navy-100);border-radius:var(--r-md);padding:var(--s5) var(--s6);margin-top:var(--s4)}
.formula-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--navy-600);margin-bottom:var(--s4)}
.formula-expr{font-family:'Georgia',serif;font-style:italic;font-size:18px;color:var(--navy-700);margin-bottom:var(--s3)}
.formula-desc{font-size:12px;color:var(--navy-600);line-height:1.7}

/* RISK GRID */
.risk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:var(--s5)}
.risk-item{background:var(--white);border:1px solid var(--stone-200);border-radius:var(--r-md);padding:14px 16px;display:flex;align-items:center;gap:10px}
.risk-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.risk-dot.ok{background:var(--green-600)}.risk-dot.bad{background:var(--red-600)}
.risk-name{font-size:12.5px;font-weight:600;color:var(--stone-800);flex:1}
.risk-status{font-size:11px;font-weight:700}
.risk-status.ok{color:var(--green-600)}.risk-status.bad{color:var(--red-600)}

/* GAP ROWS */
.gap-row{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--stone-100);font-size:13px}
.gap-row:last-child{border-bottom:none}
.gap-name{font-weight:600;color:var(--stone-800)}
.gap-current{color:var(--stone-500)}
.gap-arrow{color:var(--stone-400);margin:0 8px;font-size:11px}
.gap-recommended{font-weight:700;color:var(--navy-700)}
.gap-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px}
.badge-ok{background:var(--green-100);color:var(--green-600)}.badge-low{background:var(--red-100);color:var(--red-600)}

/* OPP ROWS */
.opp-row{display:flex;align-items:center;gap:14px;padding:13px 16px;border-bottom:1px solid var(--stone-100)}
.opp-row:last-child{border-bottom:none}
.opp-num{width:24px;height:24px;background:var(--gold-500);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--navy-900);flex-shrink:0}
.opp-name{font-size:13px;font-weight:600;color:var(--stone-800);flex:1}
.opp-val{font-size:14px;font-weight:800;color:var(--green-600);white-space:nowrap}

/* DVZ */
.dvz-note{padding:var(--s4) var(--s5);background:var(--stone-50);border-radius:var(--r-md);border:1px solid var(--stone-200);font-size:11px;color:var(--stone-400);text-align:center;margin-top:var(--s5)}

/* INSURANCE PROVIDER LOGOS */
.ins-provider-cell{display:flex;align-items:center;gap:8px}
.ins-provider-logo{width:56px;height:40px;object-fit:contain;flex-shrink:0}
.ins-provider-fallback{font-size:11px;font-weight:600;color:var(--stone-500)}
.sum-row td{border-top:2px solid var(--gold-500);padding-top:8px;font-weight:700}

/* SIGNATURES */
.sig-area{display:grid;grid-template-columns:1fr 1fr;gap:var(--s16);margin-top:var(--s16);padding-top:var(--s8)}
.sig-box{text-align:center}
.sig-line-el{height:1px;background:var(--stone-300);margin-bottom:var(--s3)}
.sig-name{font-size:13px;font-weight:600;color:var(--stone-800)}
.sig-role{font-size:11px;color:var(--stone-400);margin-top:2px}

/* LEGAL */
.legal{font-size:10.5px;color:var(--stone-400);line-height:1.7;padding:var(--s6) 0;border-top:1px solid var(--stone-200);margin-top:var(--s8)}

/* LAYOUT */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:var(--s5);align-items:start}
.g2>.card{display:flex;flex-direction:column}
.g2>.card .cf-list{flex:1}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--s4)}

/* ANIMATION */
@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.page-inner>*{animation:fadeInUp .45s ease both}
.page-inner>*:nth-child(1){animation-delay:0s}
.page-inner>*:nth-child(2){animation-delay:.05s}
.page-inner>*:nth-child(3){animation-delay:.1s}
.page-inner>*:nth-child(4){animation-delay:.15s}
.page-inner>*:nth-child(5){animation-delay:.2s}
.page-inner>*:nth-child(6){animation-delay:.25s}
.page-inner>*:nth-child(7){animation-delay:.3s}

/* PRINT */
@media print{
  .print-only.print-advisor-footer{display:block!important;position:fixed;bottom:0;left:0;right:0;padding:5mm 8mm;font-size:8pt;color:#444;border-top:1px solid #ccc;background:#fff;z-index:99999;text-align:center;box-sizing:border-box}
  .fa-interactive-only,.fa-interactive-note,.fa-backtest-controls,.fa-backtest-chart-wrap{display:none!important}
  .sidebar{display:none!important}
  .main{margin-left:0!important}
  .page{min-height:auto;page-break-after:always;break-after:page;page-break-inside:auto;break-inside:auto;overflow:visible}
  .page:last-child{page-break-after:auto;break-after:auto}
  .page+.page{page-break-before:auto}
  .page.hero,.page.company-hero{
    page-break-after:always;
    background:var(--white)!important;
    color:var(--stone-900);
    -webkit-print-color-adjust:economy;
    print-color-adjust:economy;
  }
  .page.hero .hero-title,.page.company-hero .hero-title{color:var(--stone-900)!important}
  .page.hero .hero-title em,.page.company-hero .hero-title em{color:var(--gold-500)!important}
  .page.hero .hero-subtitle,.page.company-hero .hero-subtitle{color:var(--stone-600)!important}
  .page.hero .hero-eyebrow,.page.company-hero .hero-eyebrow{color:var(--gold-600)!important}
  .page.hero .hero-meta-label,.page.company-hero .hero-meta-label{color:var(--stone-500)!important}
  .page.hero .hero-meta-val,.page.company-hero .hero-meta-val{color:var(--stone-900)!important}
  .page.hero .hero-meta-sub,.page.company-hero .hero-meta-sub{color:var(--stone-500)!important}
  .page.hero .hero-badge,.page.company-hero .hero-badge{color:var(--gold-700)!important;background:rgba(201,168,76,0.12)!important;border-color:rgba(201,168,76,0.35)!important}
  .page.hero .hero-bottom,.page.company-hero .hero-bottom{border-top-color:var(--stone-200)!important}
  .page.hero .hero-meta-item,.page.company-hero .hero-meta-item{border-right-color:var(--stone-200)!important}
  .page.hero .hero-logo-img,.page.company-hero .hero-logo-img{filter:none!important}
  .fa-proj-chart-print{display:block!important}
  .page-bar{height:1.6mm}
  .page-inner{padding:8mm 7mm}
  .hero-lines{display:none!important}
  .sec-header{margin-bottom:12px;page-break-after:avoid}
  .sec-title{font-size:28px;line-height:1.2;margin-bottom:4px}
  .sec-desc{font-size:11px;line-height:1.45}
  .sec-number{font-size:9px}
  .kpi-row{margin-bottom:10px}
  .kpi-cell{padding:10px 11px}
  .kpi-label{font-size:8px}
  .kpi-value{font-size:20px}
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
  .product-name{font-size:22px}
  .product-invest-amt{font-size:18px}
  .product-desc{font-size:10px;line-height:1.4;margin-bottom:8px;padding-bottom:8px}
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
  .goal-amt-val{font-size:15px}
  .goal-monthly,.goal-meta{font-size:9px}
  .ins-person-header{padding:8px 10px;margin-bottom:8px}
  .ins-person-icon{width:28px;height:28px;font-size:13px}
  .ins-person-income{font-size:15px}
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
  @page{size:A4;margin:10mm 8mm 16mm 8mm}
}
`;

const path = require("path");
const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");
const { withSentryConfig } = require("@sentry/nextjs");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});
const nextVersion = require("next/package.json").version;
const nextMajor = Number.parseInt(nextVersion.split(".")[0] || "0", 10);

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/favicon.ico", destination: "/favicon.png" },
      // iOS Universal Links — Apple fetchuje přesně tento path, musí vrátit
      // `application/json` bez přípony a bez redirectu. Rewrite (ne redirect)
      // zachová URL, kterou Apple handshake očekává.
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/apple-app-site-association",
      },
      // Android App Links handshake (analogie k Apple souboru výše). Google
      // Play vyžaduje `assetlinks.json` bez redirectu. Viz `docs/android/APP-LINKS.md`.
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/assetlinks",
      },
    ];
  },
  async redirects() {
    // `/vop` a `/dpa` redirecty řeší page-level `permanentRedirect` v
    // `apps/web/src/app/vop/page.tsx` a `apps/web/src/app/dpa/page.tsx` —
    // necháváme tam, aby se legal routing nešířil do dvou míst.
    return [];
  },
  async headers() {
    // Security headers (A6 delta audit). CSP runs v `Report-Only` módu, dokud
    // neověříme, že allowlist pokrývá všechny produkční callery (Stripe, Supabase,
    // Vimeo, Vercel, Sentry, Google Fonts, Resend attachmenty). Přepnutí na
    // `Content-Security-Policy` (enforcing) = CUTLIST item po 2 týdnech monitoringu.
    const csp = [
      "default-src 'self'",
      // Next inline runtime + Vercel Speed Insights. `unsafe-inline` je nutné pro
      // Next 16 dev; `unsafe-eval` jen v dev.
      "script-src 'self' 'unsafe-inline' " +
        (process.env.NODE_ENV === "production" ? "" : "'unsafe-eval' ") +
        "https://js.stripe.com " +
        "https://player.vimeo.com " +
        "https://www.youtube.com " +
        "https://*.vercel-insights.com " +
        // Google Maps JS + Places (AddressAutocomplete na klientu)
        "https://maps.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://*.public.blob.vercel-storage.com https://lh3.googleusercontent.com https://i.vimeocdn.com https://vumbnail.com https://i.ytimg.com https://maps.gstatic.com",
      "media-src 'self' blob: https://*.supabase.co https://player.vimeo.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.resend.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io https://api.openai.com https://api.anthropic.com https://*.vercel-insights.com https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://player.vimeo.com https://www.youtube.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
      "report-uri /api/security/csp-report",
    ].join("; ");

    const baseHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        // Aidvisora používá kameru (AI Review scan), mikrofon NE, geoloc NE,
        // clipboard-write ano (kopírování telefonního čísla / IBAN v detailu klienta).
        value:
          "camera=(self), microphone=(), geolocation=(), payment=(self), fullscreen=(self), clipboard-write=(self), interest-cohort=()",
      },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      // Next 16 respektuje header "Content-Security-Policy-Report-Only". Po 2
      // týdnech produkce → flip na "Content-Security-Policy" (enforcing).
      { key: "Content-Security-Policy-Report-Only", value: csp },
    ];

    const productionHeaders = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    ];

    // Perf — CDN caching pro anonymní marketing routy. `s-maxage` = TTL na
    // Vercel edge, `stale-while-revalidate` drží teplý cache i během regenerace.
    // HomePage + legal stránky jsou `force-static`, takže Next vydává statický
    // HTML z build outputu; tahle hlavička jen zajistí, že se dostane do CDN.
    const marketingCacheControl = {
      key: "Cache-Control",
      value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    };

    return [
      {
        source: "/:path*",
        headers: [
          ...baseHeaders,
          ...(process.env.NODE_ENV === "production" ? productionHeaders : []),
        ],
      },
      // Universal links / asset links musí být bez cache & frame-ancestors. Pozn.:
      // default headers se aplikují i tady — pro tyto soubory Apple/Google nepřečtou
      // CSP, ale frame-ancestors='none' a ostatní nevadí.
      {
        source: "/.well-known/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=300, s-maxage=300" }],
      },
      // Perf — dlouhý cache pro `/_next/static/*` (Next už defaultně nastavuje,
      // ale být explicitní pomáhá při custom CDN). Hashované URL = immutable.
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // Perf — marketing routy: jdou do Vercel CDN s hodinovým s-maxage.
      { source: "/", headers: [marketingCacheControl] },
      { source: "/pricing", headers: [marketingCacheControl] },
      { source: "/bezpecnost", headers: [marketingCacheControl] },
      { source: "/subprocessors", headers: [marketingCacheControl] },
      { source: "/terms", headers: [marketingCacheControl] },
      { source: "/privacy", headers: [marketingCacheControl] },
      { source: "/cookies", headers: [marketingCacheControl] },
      { source: "/o-nas", headers: [marketingCacheControl] },
      { source: "/kontakt", headers: [marketingCacheControl] },
      { source: "/pro-brokery", headers: [marketingCacheControl] },
      { source: "/demo", headers: [marketingCacheControl] },
      { source: "/beta-terms", headers: [marketingCacheControl] },
      { source: "/legal/:path*", headers: [marketingCacheControl] },
    ];
  },
  // Monorepo: lockfile lives at git repo root (project name e.g. aidvisora). A parent folder
  // on disk may contain another pnpm-lock.yaml — pin tracing root so Next does not infer the wrong root.
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  reactStrictMode: true,
  transpilePackages: ["db"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/**" },
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/**" },
      { protocol: "https", hostname: "i.vimeocdn.com", pathname: "/**" },
      { protocol: "https", hostname: "vumbnail.com", pathname: "/**" },
    ],
    // WebP jen — na WebKit/macOS někdy padá dekódování AVIF z `_next/image` (`initImage … err=-39`).
    // WebP zůstává výrazná úspora oproti původním PNG/JPEG.
    formats: ["image/webp"],
    minimumCacheTTL: 31536000,
    deviceSizes: [360, 420, 640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  experimental: {
    ...(nextMajor < 15
      ? {
          serverComponentsExternalPackages: [
            "postgres",
            "@napi-rs/canvas",
            "pdf-parse",
            "pdfjs-dist",
          ],
        }
      : {}),
    serverActions: {
      bodySizeLimit: "5mb",
    },
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  // Keep postgres external across Next 14+.
  ...(nextMajor >= 15
    ? {
        serverExternalPackages: ["postgres", "@napi-rs/canvas", "pdf-parse", "pdfjs-dist"],
      }
    : {}),
  // Required in Next 16 when custom webpack config is present.
  ...(nextMajor >= 16 ? { turbopack: {} } : {}),
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      db: path.resolve(__dirname, "src", "lib", "db.ts"),
      postgres: path.resolve(__dirname, "node_modules", "postgres"),
    };
    const appNodeModules = path.resolve(__dirname, "node_modules");
    const rootNodeModules = path.resolve(__dirname, "..", "..", "node_modules");
    config.resolve.modules = [
      appNodeModules,
      rootNodeModules,
      "node_modules",
      ...(config.resolve.modules || []),
    ];
    if (isServer) {
      config.externals = config.externals || [];
      const prev = Array.isArray(config.externals) ? config.externals : [config.externals];
      config.externals = [
        ...prev,
        (data, cb) => {
          if (data.request === "postgres") return cb(null, "commonjs " + data.request);
          cb();
        },
      ];
    }
    return config;
  },
};

// Workaround for __webpack_require__.n is not a function in dev.
module.exports = (phase, _context) => {
  const base = { ...nextConfig };
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    const extra =
      process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    base.allowedDevOrigins = [
      "10.0.2.2",
      "127.0.0.1",
      "localhost",
      "*.ngrok-free.app",
      "*.ngrok.io",
      "*.ngrok.app",
      ...extra,
    ];
  }
  const origWebpack = base.webpack;
  base.webpack = (config, options) => {
    const c = origWebpack ? origWebpack(config, options) : config;
    if (process.env.NODE_ENV === "development") {
      base.compress = false;
      c.optimization = c.optimization ?? {};
      c.optimization.minimize = false;
      c.cache = false;
    }
    return c;
  };

  return withSentryConfig(withBundleAnalyzer(base), {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    widenClientFileUpload: true,
    tunnelRoute: "/monitoring",
  });
};

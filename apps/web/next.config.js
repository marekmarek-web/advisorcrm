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
  // Monorepo: lockfile lives at repo root (advisor-crm). Parent folder (e.g. WePlan) may
  // have another pnpm-lock.yaml — pin tracing root so Next does not infer the wrong root.
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  reactStrictMode: true,
  transpilePackages: ["db"],
  experimental: {
    ...(nextMajor < 15
      ? {
          serverComponentsExternalPackages: ["postgres"],
        }
      : {}),
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  // Keep postgres external across Next 14+.
  ...(nextMajor >= 15 ? { serverExternalPackages: ["postgres"] } : {}),
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
    config.resolve.modules = [appNodeModules, "node_modules", ...(config.resolve.modules || [])];
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

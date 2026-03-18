const path = require("path");

// In pnpm monorepos Turbopack infers workspace root from lockfile but then resolves from wrong dir (e.g. src/app).
// Set root to the app dir (apps/web) so next/package.json is found in apps/web/node_modules.
const turbopackRoot = path.resolve(__dirname);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["db"],
  serverExternalPackages: ["postgres"],
  turbopack: {
    root: turbopackRoot,
  },
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
  return base;
};

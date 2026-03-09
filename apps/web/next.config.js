/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["db"],
  experimental: {
    serverComponentsExternalPackages: ["postgres"],
  },
};

// Workaround for __webpack_require__.n is not a function in dev (layout chunk
// can get a runtime where .n is missing; disabling minimize avoids the issue).
module.exports = (phase, _context) => {
  const base = { ...nextConfig };
  if (process.env.NODE_ENV === "development") {
    base.compress = false;
    const origWebpack = base.webpack;
    base.webpack = (config, options) => {
      config.optimization = config.optimization ?? {};
      config.optimization.minimize = false;
      return origWebpack ? origWebpack(config, options) : config;
    };
  }
  return base;
};

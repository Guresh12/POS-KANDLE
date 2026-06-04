// Strips esbuild's postinstall script during pnpm install to prevent
// ERR_PNPM_IGNORED_BUILDS on CI environments (Railway, Cloudflare Pages).
// The esbuild binary is available via @esbuild/linux-x64 optional dep,
// so the postinstall is not required for it to function.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === "esbuild" && pkg.scripts) {
        delete pkg.scripts.postinstall;
      }
      return pkg;
    },
  },
};

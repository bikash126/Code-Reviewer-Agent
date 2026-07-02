const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ["src/webview/main.tsx"],
  bundle: true,
  outfile: "dist/webview.js",
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: !production,
  minify: production,
};

async function run() {
  if (watch) {
    const [extCtx, webCtx] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(webviewConfig),
    ]);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log("watching for changes...");
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    console.log("build complete");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

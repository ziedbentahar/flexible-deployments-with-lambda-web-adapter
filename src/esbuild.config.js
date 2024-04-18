const path = require("path");
const esbuild = require("esbuild");
const { globSync } = require("glob");
const esbuildPluginTsc = require("esbuild-plugin-tsc");

const distDir = `dist`;

const entryPoints = globSync(`index.ts`, {
  ignore: ["node_modules/**"],
});

esbuild.build({
  entryPoints: entryPoints.filter((f) => f.indexOf(".test.ts") < 0),
  bundle: true,
  outdir: path.join(__dirname, distDir),
  outbase: ".",
  platform: "node",
  minify: true,

  plugins: [esbuildPluginTsc()],
  external: [],
});

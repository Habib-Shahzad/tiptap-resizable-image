import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import pkg from "./package.json" assert { type: "json" };
import typescript from "rollup-plugin-typescript2";

export default [
  // browser-friendly UMD build
  {
    input: "src/index.ts",
    output: [
      {
        name: pkg.name,
        file: pkg.umd,
        format: "umd",
        sourcemap: true,
      },
      {
        name: pkg.name,
        file: pkg.main,
        format: "cjs",
        sourcemap: true,
        exports: "auto",
      },
      {
        name: pkg.name,
        file: pkg.module,
        format: "es",
        sourcemap: true,
      },
    ],
    plugins: [
      resolve(), //
      commonjs(),
      typescript({ tsconfig: "./tsconfig.json" }),
    ],
  },

  // CommonJS (for Node) and ES module (for bundlers) build.
  {
    input: "src/index.ts",
    output: [
      { file: pkg.main, format: "cjs", sourcemap: true },
      { file: pkg.module, format: "es", sourcemap: true },
    ],
    plugins: [
      typescript({
        rollupCommonJSResolveHack: false,
        clean: true,
        tsconfig: "./tsconfig.json",
      }),
    ],
  },
];

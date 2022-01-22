import pkg from "./package.json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import commonjs from "@rollup/plugin-commonjs";
import { terser } from "rollup-plugin-terser";
import json from "@rollup/plugin-json";

const isProduction = process.env.NODE_ENV === "production";

export default {
  input: "src/connect-arango.ts",
  output: [
    {
      file: pkg.main,
      exports: "default",
      format: "cjs",
    },
    {
      file: pkg.module,
      exports: "default",
      format: "es", // the preferred format
    },
  ],
  plugins: [
    typescript(),
    json(),
    commonjs(),
    resolve(),
    isProduction ? terser() : null,
  ],
};

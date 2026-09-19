// Esbuild loads .css imports as text (see scripts/build.mjs).
declare module '*.css' {
  const css: string;
  export default css;
}

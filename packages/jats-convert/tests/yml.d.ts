// Bun supports `import text from './file.yml' with { type: 'text' }`; the default export is the
// raw file contents as a string. Declared here so editors and `tsc` accept the fixture imports.
declare module '*.yml' {
  const content: string;
  export default content;
}

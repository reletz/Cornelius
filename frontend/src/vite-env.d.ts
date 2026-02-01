/// <reference types="vite/client" />

// Raw imports for markdown files
declare module '*.md?raw' {
  const content: string;
  export default content;
}

// Regular markdown imports
declare module '*.md' {
  const content: string;
  export default content;
}

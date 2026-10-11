/// <reference types="vite/client" />

// vite-imagetools: `?…&as=srcset` imports resolve to a srcset string.
declare module '*&as=srcset' {
  const srcset: string;
  export default srcset;
}
declare module '*&format=jpg' {
  const src: string;
  export default src;
}

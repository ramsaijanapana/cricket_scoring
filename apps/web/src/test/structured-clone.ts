if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = structuredClone;
}

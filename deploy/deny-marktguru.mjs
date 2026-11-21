// CI only: a cache hit must work even when live Marktguru is unavailable.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, ...args) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (/^(?:api\.)?marktguru\.(?:de|at)$/.test(url.hostname)) {
    throw new Error('Live Marktguru access is forbidden in the isolated cache test');
  }
  return originalFetch(input, ...args);
};

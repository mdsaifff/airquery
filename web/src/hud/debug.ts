// Developer info (fps, latency) shows in dev builds or with ?debug in the URL.
export const debugMode: boolean =
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');

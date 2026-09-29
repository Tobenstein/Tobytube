(function () {
  const chunks = window.webpackChunk || [];
  const hlsChunk = chunks.find((chunk) => chunk && chunk[1] && chunk[1][5725]);
  if (!hlsChunk) {
    console.warn("Tobytube could not find Jellyfin hls.js chunk.");
    return;
  }

  const module = { exports: {} };
  hlsChunk[1][5725](module);
  window.Hls = module.exports;
})();

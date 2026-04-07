/** @type {import('next').NextConfig} */
const nextConfig = {
  cleanDistDir: true,

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "**.anilist.co" },
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "**.cloudfront.net" },
    ],
    unoptimized: true,
  },

  async headers() {
    const frameHosts = [
      "https://autoembed.co", "https://player.autoembed.app",
      "https://player.embed-api.stream",
      "https://multiembed.mov",
      "https://www.2embed.cc", "https://www.2embed.skin", "https://www.2embed.online",
      "https://hnembed.cc", "https://hnembed.net",
      "https://primesrc.me",
      "https://frembed.bond",
      "https://vsembed.ru", "https://vsembed.su",
      "https://vidsrc.to", "https://vidsrc.xyz",
      "https://*.disqus.com",
      "https://api.crysoline.moe", "https://disqus.com",
      "https://anilist.co",
    ].join(" ");

    // PROBLEM 1 FIX — CSP connect-src:
    // hls.js fetches .key (AES-128 encryption keys) and EXT-X-MAP URIs
    // directly via XHR before the proxy can intercept them. Even though the
    // m3u8 manifest has its URLs rewritten to /api/proxy, hls.js resolves
    // the #EXT-X-KEY URI from the already-fetched (proxied) text and issues a
    // new XHR — which the browser blocks because the target host isn't in CSP.
    //
    // The correct fix is NOT to whitelist every CDN (impossible, infinite list).
    // Instead we intercept .key fetches in the HLS loader (see HlsPlayer.jsx fix).
    // But as a belt-and-suspenders measure, 'self' covers /api/proxy which is the
    // only endpoint hls.js should be hitting after the manifest rewrite fix.
    //
    // The remaining connect-src entries are for direct API calls that legitimately
    // happen in the browser (AniList, TMDB, auth).
    const connectSrc = [
      "'self'",
      "https://graphql.anilist.co",
      "https://anilist.co",
      "https://api.themoviedb.org",
      "https://api.crysoline.moe",
      "https://*.disqus.com",
      "https://disqus.com",
      "https://identitytoolkit.googleapis.com",
      "https://*.googleapis.com",
      "https://*.firebaseapp.com",
      "https://*.firebase.com",
      "https://theanimecommunity.com",
      "https://*.theanimecommunity.com",
    ].join(" ");

    // media-src must include blob: for hls.js MSE playback
    // and 'self' so the video element can load from /api/proxy (same origin).
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.disqus.com https://disqus.com https://theanimecommunity.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.disqus.com",
              "font-src 'self' https://fonts.gstatic.com https://theanimecommunity.com",
              "img-src 'self' data: https: blob:",
              // PROBLEM 1 FIX: blob: is required for hls.js MSE; 'self' covers /api/proxy
              "media-src 'self' blob: data:",
              `frame-src ${frameHosts}`,
              `connect-src ${connectSrc}`,
              // PROBLEM 3 FIX: worker-src for hls.js web worker
              "worker-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin",  value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type,Range" },
        ],
      },
      {
        source: "/api/proxy",
        headers: [
          { key: "Access-Control-Allow-Origin",  value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,HEAD,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Range" },
          { key: "Access-Control-Expose-Headers", value: "Content-Range,Content-Length,Accept-Ranges" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

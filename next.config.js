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
    // NEXT_PUBLIC_PROXY_URL is the Cloudflare Worker URL.
    // Add it to connect-src so hls.js can reach it for manifest fetches.
    const cfProxyUrl = process.env.NEXT_PUBLIC_PROXY_URL || "";
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
      "https://api.aniskip.com",
      // Cloudflare Worker proxy — added dynamically so CSP is always correct
      ...(cfProxyUrl ? [cfProxyUrl] : []),
      // Allow direct CDN fetches for HLS segments (hls.js fetches .ts directly)
      "https://*",
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

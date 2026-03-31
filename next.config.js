/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent stale .next cache causing "Unexpected end of JSON input" on Windows
  // This cleans the dist dir on every build start
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

    // All CDN/stream fetches go through /api/proxy server-side,
    // so the browser only connects to 'self' for media — no CDN domains needed.
    const connectSrc = [
      "'self'",
      "https://graphql.anilist.co",
      "https://anilist.co",
      "https://api.themoviedb.org",
      "https://api.crysoline.moe",
      "https://*.disqus.com",
      "https://disqus.com",
    ].join(" ");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.disqus.com https://disqus.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.disqus.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https: blob:",
              "media-src 'self' blob: data:",
              `frame-src ${frameHosts}`,
              `connect-src ${connectSrc}`,
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
        // The proxy route needs to pass through Range headers for video seeking
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

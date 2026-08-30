/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { tsconfigPath: './tsconfig.json' },
  
  // Image optimization
  images: { 
    unoptimized: true, // Vercel handles optimization
    formats: ['image/avif', 'image/webp'],
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://supabase.co https://*.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://onesignal.com https://*.onesignal.com; img-src 'self' data: https:; frame-src 'self'; object-src 'none'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
  
  // Rewrites for clean URLs
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/dashboard/:path*", destination: "/dashboard/:path*" },
        { source: "/auth/:path*", destination: "/auth/:path*" },
      ],
    };
  },
  
  // Redirects
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
    ];
  },
  
  // Experimental optimizations for production
  experimental: {
    optimizePackageImports: [
      '@supabase/supabase-js',
      'lucide-react',
      'date-fns',
      'framer-motion',
    ],
  },

  // Production optimizations
  swcMinify: true,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  
  // Environment variables
  env: {
    NEXT_PUBLIC_APP_ENV: process.env.NODE_ENV || 'development',
  },
};

export default nextConfig;


/**
 * EDULINK Environment Configuration
 * Production-safe environment setup for Vercel deployment
 */

interface EnvironmentConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appUrl: string;
  isDevelopment: boolean;
  isProduction: boolean;
}

function getEnvironmentConfig(): EnvironmentConfig {
  // Validate required environment variables
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_APP_URL',
  ];

  const missingVars = requiredVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
      `Add these to Vercel Project Settings → Environment Variables`
    );
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'stub-anon-key',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    isDevelopment,
    isProduction,
  };
}

export const env = getEnvironmentConfig();

// Export individual values for convenience
export const supabaseUrl = env.supabaseUrl;
export const supabaseAnonKey = env.supabaseAnonKey;
export const appUrl = env.appUrl;
export const isDevelopment = env.isDevelopment;
export const isProduction = env.isProduction;

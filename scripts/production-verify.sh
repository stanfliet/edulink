#!/bin/bash
# EDULINK Production Deployment Script
# Run this on Vercel after git push

set -e

echo "🚀 EDULINK Production Deployment"
echo "=================================="
echo ""

# Detect environment
if [ "$VERCEL" = "1" ]; then
  echo "✓ Running on Vercel"
  ENVIRONMENT="production"
else
  echo "✓ Running locally"
  ENVIRONMENT="local"
fi

# Step 1: Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm ci --production

# Step 2: Build Next.js app
echo ""
echo "🔨 Building Next.js application..."
npm run build

# Step 3: Verify build
if [ -d ".next" ]; then
  echo "✓ Build successful (.next directory created)"
  SIZE=$(du -sh .next | cut -f1)
  echo "  Build size: $SIZE"
else
  echo "✗ Build failed - .next directory not found"
  exit 1
fi

# Step 4: Check for critical dependencies
echo ""
echo "🔍 Verifying critical dependencies..."
if npm list @supabase/supabase-js > /dev/null 2>&1; then
  echo "✓ Supabase client installed"
else
  echo "✗ Missing Supabase client"
  exit 1
fi

# Step 5: Environment validation
echo ""
echo "🔐 Verifying environment variables..."
REQUIRED_VARS=(
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "NEXT_PUBLIC_APP_URL"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  else
    echo "✓ $var is set"
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "✗ Missing environment variables:"
  printf '%s\n' "${MISSING_VARS[@]}"
  echo ""
  echo "Add these to Vercel Project Settings → Environment Variables"
  exit 1
fi

# Step 6: Deploy status
echo ""
echo "✅ Production build verification complete!"
echo ""
echo "Next steps:"
echo "  1. Verify deployment at: https://k2020.org.za"
echo "  2. Check Vercel Analytics: https://vercel.com/dashboard"
echo "  3. Monitor Supabase logs: https://app.supabase.com"
echo "  4. Test all 5 role dashboards"
echo ""
echo "If any issues occur, check:"
echo "  - Vercel Deployments tab for build logs"
echo "  - Supabase Console → Logs → Edge Functions"
echo "  - Render Dashboard for cron job status"
echo ""
echo "Support: Michael Stanfliet (stanfliet@contractor.net)"
echo ""

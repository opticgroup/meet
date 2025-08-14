# TalkGroup.ai Troubleshooting Guide

This guide covers common issues you may encounter while developing or deploying TalkGroup.ai and their solutions.

## Build Issues

### Node.js Version Problems

**Problem**: Build fails with Node.js version errors

**Solution**:
- Ensure you're using Node.js >=18 (as specified in `package.json` engines)
- Check your Node version: `node --version`
- If using nvm: `nvm use 18` or `nvm install 18`
- If using Vercel, ensure your project settings use Node.js 18+

```bash
# Check current Node version
node --version

# If using nvm to manage Node versions
nvm use 18
# or install if not available
nvm install 18

# If using pnpm (recommended package manager)
pnpm install
```

### Missing Environment Variables

**Problem**: Build fails due to missing required environment variables

**Required Variables**:
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET` 
- `LIVEKIT_URL`

**Solution**:
1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in the required values in `.env.local`:
   ```env
   LIVEKIT_API_KEY=your_api_key_here
   LIVEKIT_API_SECRET=your_api_secret_here
   LIVEKIT_URL=wss://your-project.livekit.cloud
   ```

3. For Vercel deployment, add environment variables in the Vercel dashboard or use CLI:
   ```bash
   vercel env add LIVEKIT_API_KEY
   vercel env add LIVEKIT_API_SECRET
   vercel env add LIVEKIT_URL
   ```

### TypeScript Errors

**Problem**: TypeScript compilation errors during build

**Common Solutions**:

1. **Check TypeScript version compatibility**:
   - Project uses TypeScript 5.8.3
   - Ensure your IDE/editor uses the workspace TypeScript version

2. **Clear Next.js cache**:
   ```bash
   rm -rf .next
   pnpm run build
   ```

3. **Check for type mismatches**:
   - Ensure React types match: `@types/react@18.3.23`
   - Verify LiveKit component types are compatible

4. **Module resolution issues**:
   - Paths are configured with `"@/*": ["./*"]` in `tsconfig.json`
   - Use `@/` for imports from project root

## Runtime Issues (500/404 Errors)

### Environment Variables Not Available in Browser

**Problem**: `NEXT_PUBLIC_*` variables are undefined in the browser

**Solution**:
1. **Verify variable naming**: Only variables prefixed with `NEXT_PUBLIC_` are available in the browser
2. **Check build-time availability**: These variables must be set during build, not just at runtime
3. **For Vercel deployment**:
   ```bash
   # Pull environment variables from Vercel
   vercel env pull
   
   # Rebuild with updated environment
   vercel --prod
   ```

**Optional Public Variables** (from `.env.example`):
- `NEXT_PUBLIC_SHOW_SETTINGS_MENU=true` - Enables Krisp noise filters
- `NEXT_PUBLIC_LK_RECORD_ENDPOINT=/api/record` - Recording endpoint
- `NEXT_PUBLIC_DATADOG_CLIENT_TOKEN` - DataDog logging
- `NEXT_PUBLIC_DATADOG_SITE` - DataDog site

### API Route Issues

**Problem**: API routes returning 404 or 500 errors

**Solution**:
1. **Check API route file structure**: Ensure files are in `pages/api/` or `app/api/` (depending on App Router usage)
2. **Verify environment variables**: Server-side API routes need access to private environment variables
3. **Check function exports**: Ensure proper default export for API handlers

## LiveKit Connection Issues

### WebSocket Connection Failures

**Problem**: Cannot connect to LiveKit server

**Common Error**: `WebSocket connection to 'wss://v0-demo-jaley50g.livekit.cloud/rtc?access_token=...' failed`

**Diagnostic Steps**:
1. **Check for newline characters in environment variables**:
   ```bash
   # Test the connection-details API response
   curl -s "https://your-domain.com/api/connection-details?roomName=test&participantName=test"
   ```
   Look for `\n` characters in the serverUrl field.

2. **Verify WebSocket URL is reachable**:
   ```bash
   # Test WebSocket connectivity (if wscat is installed)
   wscat -c wss://your-project.livekit.cloud
   
   # Or use curl to test HTTP endpoint
   curl -I https://your-project.livekit.cloud
   ```

3. **Check URL format**: Must be `wss://` protocol for secure WebSocket connection

**Solution**:
- **Fix newline characters**: Use `printf` instead of `echo` when setting environment variables:
  ```bash
  # WRONG (adds newline)
  echo "wss://your-project.livekit.cloud" | vercel env add LIVEKIT_URL production
  
  # CORRECT (no newline)
  printf "wss://your-project.livekit.cloud" | vercel env add LIVEKIT_URL production
  ```
- Ensure `LIVEKIT_URL` uses correct format: `wss://your-project.livekit.cloud`
- Verify the LiveKit server is running and accessible
- Check firewall/network restrictions

### Authentication Errors

**Problem**: "Invalid token" or authentication failures

**Solution**:
1. **Verify API credentials**:
   ```bash
   # Check if environment variables are set
   echo $LIVEKIT_API_KEY
   echo $LIVEKIT_API_SECRET
   ```

2. **Validate key/secret format**:
   - API Key should start with `API`
   - Secret should be a long alphanumeric string
   - No extra spaces or quotes in environment variables

3. **Test credentials**: Use LiveKit CLI or dashboard to verify credentials are active

### CORS Issues

**Problem**: CORS errors when connecting to LiveKit

**Current Configuration**: The project has CORS headers configured in both `next.config.js` and `vercel.json`:

```javascript
// Headers set by the application
'Cross-Origin-Opener-Policy': 'same-origin'
'Cross-Origin-Embedder-Policy': 'credentialless'
```

**Solution**:
- These headers enable SharedArrayBuffer for audio processing
- If you encounter CORS issues, verify:
  1. LiveKit server allows your domain origin
  2. Headers are properly set in production
  3. No conflicting headers from CDN/proxy

## UI and Styling Issues

### CSS Styling Problems

**Problem**: Styles not loading or appearing incorrectly

The project uses CSS Modules and custom CSS variables (not Tailwind):

**Current Setup**:
- CSS Modules: `Home.module.css`, `SettingsMenu.module.css`, `Debug.module.css`
- Global styles: `styles/globals.css` with TalkGroup.ai dark theme
- CSS Variables defined in `:root` for theming

**Solutions**:
1. **CSS Module imports**: Ensure proper import syntax:
   ```typescript
   import styles from '@/styles/Home.module.css';
   ```

2. **Global styles**: Verify `globals.css` is imported in `_app.tsx` or layout file

3. **Custom CSS variables**: Theme uses variables like:
   - `--tg-bg-primary: #0a0a0a`
   - `--tg-accent-primary: #FFD400`
   - `--tg-text-primary: #ffffff`

### Production Build Differences

**Problem**: Styles work in development but not in production

**Solution**:
1. **Check CSS purging**: While this project doesn't use Tailwind, ensure no build tools are removing used CSS
2. **Verify file paths**: Ensure all CSS module files are included in the build
3. **Check source maps**: Production source maps are enabled (`productionBrowserSourceMaps: true`)

## Package Manager Issues

### pnpm-specific Problems

**Problem**: Dependencies or scripts not working with pnpm

The project specifies `"packageManager": "pnpm@10.9.0"`

**Solutions**:
1. **Use correct pnpm version**:
   ```bash
   pnpm --version
   # Should be 10.9.0 or compatible
   ```

2. **Clear pnpm cache**:
   ```bash
   pnpm store prune
   pnpm install
   ```

3. **Lock file issues**:
   ```bash
   rm pnpm-lock.yaml
   pnpm install
   ```

## Development Environment

### Hot Reload Issues

**Problem**: Changes not reflected during development

**Solution**:
- React Strict Mode is disabled (`reactStrictMode: false`)
- Clear Next.js cache: `rm -rf .next`
- Restart dev server: `pnpm run dev`

### Source Map Issues

**Problem**: Debugging difficulties or source map warnings

**Configuration**: Source maps are enabled in both development and production
- `sourceMap: true` in `tsconfig.json`
- `productionBrowserSourceMaps: true` in `next.config.js`
- Custom webpack config for `.mjs` files with `source-map-loader`

## Quick Diagnostic Commands

```bash
# Check environment
node --version
pnpm --version
pnpm list

# Build and test locally
pnpm run build
pnpm run start

# Linting and formatting
pnpm run lint
pnpm run format:check

# Clean build
rm -rf .next
rm -rf node_modules
pnpm install
pnpm run build
```

## Getting Help

If you're still experiencing issues:

1. Check the [Next.js documentation](https://nextjs.org/docs)
2. Review [LiveKit documentation](https://docs.livekit.io/)
3. Check project-specific GitHub issues
4. Verify all environment variables are correctly set
5. Test with a minimal reproduction case

---

**Last Updated**: Created as part of Step 7 troubleshooting documentation

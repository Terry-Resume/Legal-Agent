import { healthHandler, isDemo } from '@kato8/core/server'

export default healthHandler('legal', () => ({
  auth: isDemo() || Boolean(process.env.CLERK_SECRET_KEY && (process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY)),
  ai: isDemo() || Boolean(process.env.ANTHROPIC_API_KEY),
}))

import { createPublicKey, verify } from 'node:crypto'

// Verifies the Clerk session token sent as `Authorization: Bearer <token>`.
// The signature is checked against Clerk's public JWKS, derived from the
// publishable key, so no secret is needed for that step. When CLERK_SECRET_KEY
// is set, the caller's role is also checked, matching the RoleGate in main.jsx.

const PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || ''
const FRONTEND_API = Buffer.from(PUBLISHABLE_KEY.split('_')[2] || '', 'base64').toString('utf8').replace(/\$$/, '')

let jwksCache = null
async function getKey(kid) {
  if (!jwksCache || !jwksCache.keys.some(k => k.kid === kid)) {
    const res = await fetch(`https://${FRONTEND_API}/.well-known/jwks.json`)
    if (!res.ok) throw new Error('Could not load Clerk JWKS')
    jwksCache = await res.json()
  }
  const jwk = jwksCache.keys.find(k => k.kid === kid)
  if (!jwk) throw new Error('Unknown signing key')
  return createPublicKey({ key: jwk, format: 'jwk' })
}

const b64url = s => Buffer.from(s, 'base64url')

async function verifySessionToken(token) {
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) throw new Error('Malformed token')
  const header = JSON.parse(b64url(h).toString('utf8'))
  if (header.alg !== 'RS256') throw new Error('Unexpected algorithm')
  const key = await getKey(header.kid)
  if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, b64url(s))) throw new Error('Bad signature')
  const claims = JSON.parse(b64url(p).toString('utf8'))
  const now = Math.floor(Date.now() / 1000)
  if (claims.exp && now > claims.exp + 5) throw new Error('Token expired')
  if (claims.nbf && now < claims.nbf - 5) throw new Error('Token not yet valid')
  return claims
}

// Role lookups are cached briefly; tools that poll (EA syncs every 15s) would
// otherwise call the Clerk API on every request.
const roleCache = new Map()
async function getRole(userId) {
  const hit = roleCache.get(userId)
  if (hit && hit.at > Date.now() - 60_000) return hit.role
  const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  })
  if (!res.ok) throw new Error('Could not load user')
  const user = await res.json()
  const role = user.public_metadata?.role ?? null
  roleCache.set(userId, { role, at: Date.now() })
  return role
}

// Returns the user id, or sends a 401/403 and returns null. `role` (one) or
// `roles` (any of) restrict access when CLERK_SECRET_KEY is set.
export async function requireUser(req, res, { role, roles } = {}) {
  const allowed = roles || (role ? [role] : null)
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !FRONTEND_API) {
    res.status(401).json({ error: 'Sign in required' })
    return null
  }
  let claims
  try {
    claims = await verifySessionToken(token)
  } catch {
    res.status(401).json({ error: 'Sign in required' })
    return null
  }
  if (allowed && process.env.CLERK_SECRET_KEY) {
    try {
      if (!allowed.includes(await getRole(claims.sub))) {
        res.status(403).json({ error: 'Forbidden' })
        return null
      }
    } catch {
      res.status(503).json({ error: 'Could not verify access' })
      return null
    }
  }
  return claims.sub
}

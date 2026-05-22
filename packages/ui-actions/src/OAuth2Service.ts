/**
 * OAuth2 PKCE Service (UC-ACT-012)
 *
 * Implements Authorization Code + PKCE flow for browser SPAs.
 * No client secret required — uses code_verifier/code_challenge.
 * Tokens are stored in memory only (XSS-safe).
 */

interface TokenSet {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  scope: string
}

interface OAuth2Config {
  authorizationEndpoint: string
  tokenEndpoint: string
  clientId: string
  scopes?: string
  logoutEndpoint?: string
}

/** Pending auth flow awaiting callback */
interface PendingFlow {
  codeVerifier: string
  state: string
  redirectUri: string
  config: OAuth2Config
  resolve: (token: string | null) => void
}

// Token cache: keyed by tokenEndpoint (identifies the auth server)
const tokenStore = new Map<string, TokenSet>()

// Pending PKCE flows waiting for callback
let pendingFlow: PendingFlow | null = null

// Refresh timer handles
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Generate a random string for PKCE code_verifier (43-128 chars)
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64url(array)
}

/**
 * Generate code_challenge from code_verifier using SHA-256
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64url(new Uint8Array(hash))
}

/**
 * Base64url encode a Uint8Array
 */
function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Generate a random state parameter for CSRF protection
 */
function generateState(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return base64url(array)
}

/**
 * Extract OAuth2Config from an auth configuration object (EMF or plain).
 * Handles both typed properties and reflective eGet access.
 */
export function extractOAuth2Config(auth: any): OAuth2Config | null {
  const get = (name: string): string | undefined => {
    if (auth[name] !== undefined) return auth[name]
    if (typeof auth.eGet === 'function' && typeof auth.eClass === 'function') {
      const f = auth.eClass().getEStructuralFeature?.(name)
      if (f) return auth.eGet(f) as string | undefined
    }
    return undefined
  }

  const authorizationEndpoint = get('authorizationEndpoint')
  const tokenEndpoint = get('tokenEndpoint')
  const clientId = get('clientId')

  if (!authorizationEndpoint || !tokenEndpoint || !clientId) return null

  return {
    authorizationEndpoint,
    tokenEndpoint,
    clientId,
    scopes: get('scopes') || 'openid profile email',
    logoutEndpoint: get('logoutEndpoint')
  }
}

/**
 * Get a valid access token for the given config.
 * Returns cached token if still valid, or null if login is required.
 */
export function getAccessToken(config: OAuth2Config): string | null {
  const tokenSet = tokenStore.get(config.tokenEndpoint)
  if (!tokenSet) return null

  // Check if token is still valid (with 30s buffer)
  if (tokenSet.expiresAt > Date.now() / 1000 + 30) {
    return tokenSet.accessToken
  }

  return null
}

/**
 * Check if we have a valid (or refreshable) session for this config.
 */
export function isAuthenticated(config: OAuth2Config): boolean {
  const tokenSet = tokenStore.get(config.tokenEndpoint)
  if (!tokenSet) return false
  // Valid token or has refresh token
  return tokenSet.expiresAt > Date.now() / 1000 + 30 || !!tokenSet.refreshToken
}

/**
 * Try to get a valid token, refreshing if needed.
 * Returns the access token or null if interactive login is required.
 */
export async function ensureAccessToken(config: OAuth2Config): Promise<string | null> {
  // Try cached token first
  const cached = getAccessToken(config)
  if (cached) return cached

  // Try refresh
  const tokenSet = tokenStore.get(config.tokenEndpoint)
  if (tokenSet?.refreshToken) {
    const refreshed = await refreshAccessToken(config, tokenSet.refreshToken)
    if (refreshed) return refreshed
  }

  return null
}

/**
 * Start the OAuth2 Authorization Code + PKCE flow.
 * Opens a popup window for Keycloak login.
 * Returns a Promise that resolves with the access token or null if cancelled.
 */
export async function startAuthFlow(config: OAuth2Config): Promise<string | null> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateState()
  const redirectUri = `${window.location.origin}/oauth2-callback.html`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: config.scopes || 'openid profile email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  })

  const authUrl = `${config.authorizationEndpoint}?${params.toString()}`

  return new Promise<string | null>((resolve) => {
    pendingFlow = { codeVerifier, state, redirectUri, config, resolve }

    // Open popup
    const width = 500
    const height = 650
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const popup = window.open(
      authUrl,
      'oauth2-login',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no`
    )

    if (!popup) {
      // Popup blocked — fallback to redirect
      console.warn('[OAuth2] Popup blocked, using redirect flow')
      // Store flow state in sessionStorage for redirect callback
      sessionStorage.setItem('oauth2_pending', JSON.stringify({
        codeVerifier, state, redirectUri,
        tokenEndpoint: config.tokenEndpoint,
        clientId: config.clientId
      }))
      window.location.href = authUrl
      return
    }

    // Poll for popup close (user cancelled)
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer)
        if (pendingFlow) {
          pendingFlow = null
          resolve(null)
        }
      }
    }, 500)
  })
}

/**
 * Handle the OAuth2 callback (from popup or redirect).
 * Call this when the callback URL is loaded with ?code=...&state=...
 */
export async function handleCallback(
  code: string,
  state: string,
  config?: OAuth2Config
): Promise<string | null> {
  // Check pending popup flow
  if (pendingFlow && pendingFlow.state === state) {
    const { codeVerifier, redirectUri, config: flowConfig, resolve } = pendingFlow
    pendingFlow = null

    const effectiveConfig = config || flowConfig
    const token = await exchangeCode(effectiveConfig, code, codeVerifier, redirectUri)
    resolve(token)
    return token
  }

  // Check sessionStorage (redirect flow)
  const stored = sessionStorage.getItem('oauth2_pending')
  if (stored) {
    sessionStorage.removeItem('oauth2_pending')
    const flow = JSON.parse(stored)
    if (flow.state !== state) {
      console.error('[OAuth2] State mismatch in redirect callback')
      return null
    }
    const redirectConfig: OAuth2Config = config || {
      authorizationEndpoint: '', // not needed for exchange
      tokenEndpoint: flow.tokenEndpoint,
      clientId: flow.clientId
    }
    return exchangeCode(redirectConfig, code, flow.codeVerifier, flow.redirectUri)
  }

  console.error('[OAuth2] No pending flow found for callback')
  return null
}

/**
 * Exchange authorization code for tokens.
 */
async function exchangeCode(
  config: OAuth2Config,
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<string | null> {
  try {
    const resp = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    })

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '')
      console.error('[OAuth2] Token exchange failed:', resp.status, errorText)
      return null
    }

    const json = await resp.json()
    storeTokens(config, json)
    return json.access_token
  } catch (e: any) {
    console.error('[OAuth2] Token exchange error:', e.message)
    return null
  }
}

/**
 * Refresh the access token using a refresh token.
 */
async function refreshAccessToken(config: OAuth2Config, refreshToken: string): Promise<string | null> {
  try {
    const resp = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        refresh_token: refreshToken
      })
    })

    if (!resp.ok) {
      console.warn('[OAuth2] Token refresh failed:', resp.status)
      // Remove stale tokens
      tokenStore.delete(config.tokenEndpoint)
      return null
    }

    const json = await resp.json()
    storeTokens(config, json)
    return json.access_token
  } catch (e: any) {
    console.error('[OAuth2] Token refresh error:', e.message)
    tokenStore.delete(config.tokenEndpoint)
    return null
  }
}

/**
 * Store tokens from a token response and schedule auto-refresh.
 */
function storeTokens(config: OAuth2Config, tokenResponse: any): void {
  const tokenSet: TokenSet = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() / 1000 + (tokenResponse.expires_in || 300),
    scope: tokenResponse.scope || ''
  }
  tokenStore.set(config.tokenEndpoint, tokenSet)

  // Schedule auto-refresh (60s before expiry)
  const existingTimer = refreshTimers.get(config.tokenEndpoint)
  if (existingTimer) clearTimeout(existingTimer)

  if (tokenSet.refreshToken) {
    const refreshIn = Math.max((tokenResponse.expires_in || 300) - 60, 10) * 1000
    const timer = setTimeout(async () => {
      await refreshAccessToken(config, tokenSet.refreshToken!)
    }, refreshIn)
    refreshTimers.set(config.tokenEndpoint, timer)
  }
}

/**
 * Logout — clear tokens and optionally redirect to Keycloak logout.
 */
export function logout(config: OAuth2Config): void {
  tokenStore.delete(config.tokenEndpoint)

  const timer = refreshTimers.get(config.tokenEndpoint)
  if (timer) {
    clearTimeout(timer)
    refreshTimers.delete(config.tokenEndpoint)
  }

  if (config.logoutEndpoint) {
    const params = new URLSearchParams({
      client_id: config.clientId,
      post_logout_redirect_uri: window.location.origin
    })
    window.open(`${config.logoutEndpoint}?${params}`, '_blank')
  }
}

/**
 * Get user info from the access token (JWT payload).
 */
export function getUserInfo(config: OAuth2Config): { sub: string; name?: string; email?: string; roles?: string[] } | null {
  const tokenSet = tokenStore.get(config.tokenEndpoint)
  if (!tokenSet) return null

  try {
    const parts = tokenSet.accessToken.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return {
      sub: payload.sub,
      name: payload.name || payload.preferred_username,
      email: payload.email,
      roles: payload.realm_access?.roles
    }
  } catch {
    return null
  }
}

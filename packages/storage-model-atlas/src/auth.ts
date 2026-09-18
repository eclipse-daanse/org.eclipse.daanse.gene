/**
 * Authentication against a Model Atlas.
 *
 * Two kinds that differ fundamentally in lifetime: a **Bearer** token expires
 * server-side (JWT: `exp`), **Basic** credentials never do — they *are* the
 * password. So only what describes the connection lives here (kind and user
 * name); the secret itself sits in the credential store and **only in this
 * session's memory**.
 *
 * No `localStorage` (survives a browser restart), no `sessionStorage`
 * (survives reloads and is readable by any script on the origin) and nothing
 * of it in a file: a session lasts exactly as long as the tab.
 */

export type AtlasAuthKind = 'none' | 'bearer' | 'basic'

/** How a connection authenticates — without the secret. */
export interface AtlasAuth {
  kind: AtlasAuthKind
  /** Only for `basic`: the user name the password belongs to. */
  user?: string
}

/** What the login dialog is asked for. */
export interface AtlasCredentialRequest {
  baseUrl: string
  auth: AtlasAuth
  /** A second attempt after a 401 — the dialog may say so. */
  retry: boolean
}

export type CredentialPrompt = (
  request: AtlasCredentialRequest,
) => Promise<string | null> | string | null

// ── Session store ──────────────────────────────────────────────────────────

/** Keyed by connection and user, not by scope. */
function cacheKey(baseUrl: string, user?: string): string {
  return `${baseUrl}|${user ?? ''}`
}

const secrets = new Map<string, string>()
let prompt: CredentialPrompt | null = null

/** Register the login dialog. Without it nothing is ever asked. */
export function setCredentialPrompt(fn: CredentialPrompt | null): void {
  prompt = fn
}

export function setCredential(baseUrl: string, user: string | undefined, secret: string): void {
  secrets.set(cacheKey(baseUrl, user), secret)
}

export function getCredential(baseUrl: string, user?: string): string | undefined {
  return secrets.get(cacheKey(baseUrl, user))
}

export function clearCredential(baseUrl: string, user?: string): void {
  secrets.delete(cacheKey(baseUrl, user))
}

/** Forget everything — on sign-out or in a test. */
export function clearAllCredentials(): void {
  secrets.clear()
}

// ── Header ─────────────────────────────────────────────────────────────────

/**
 * The `Authorization` header for one kind of authentication. `undefined`
 * means: send none (the server wants none, or the secret is missing).
 */
export function authorizationHeader(auth: AtlasAuth, secret?: string): string | undefined {
  if (auth.kind === 'none' || !secret) return undefined
  if (auth.kind === 'bearer') return `Bearer ${secret}`
  // Basic is base64 over "user:password" — without a user that would be
  // ":password", which some servers read as anonymous. Better send nothing.
  if (!auth.user) return undefined
  return `Basic ${btoa(`${auth.user}:${secret}`)}`
}

/**
 * The header for this connection — asks for the secret when needed.
 *
 * `retry` drops a stored secret first, so that after a 401 the user sees the
 * dialog again instead of being turned away in a loop.
 */
export async function resolveAuthorization(
  baseUrl: string,
  auth: AtlasAuth,
  options: { retry?: boolean } = {},
): Promise<string | undefined> {
  if (auth.kind === 'none') return undefined
  if (options.retry) clearCredential(baseUrl, auth.user)

  let secret = getCredential(baseUrl, auth.user)
  if (!secret) {
    if (!prompt) {
      /*
       * Nobody can be asked, so the request goes out unauthenticated and the
       * server will turn it away. Saying so beats a silent 401 somewhere else:
       * it means the plugin that owns the dialog is not active.
       */
      console.warn(
        `[atlas-auth] ${auth.kind} required for ${baseUrl}, no secret in this session and no login dialog registered`,
      )
      return undefined
    }
    const entered = await prompt({ baseUrl, auth, retry: !!options.retry })
    if (entered) {
      secret = entered
      setCredential(baseUrl, auth.user, entered)
    }
  }
  return authorizationHeader(auth, secret)
}

/**
 * What earlier versions carried as a single `token`, in the new shape.
 * An empty value means "no authentication".
 */
export function authFromToken(token?: string): { auth: AtlasAuth; secret?: string } {
  const value = token?.trim()
  if (!value) return { auth: { kind: 'none' } }
  return { auth: { kind: 'bearer' }, secret: value }
}

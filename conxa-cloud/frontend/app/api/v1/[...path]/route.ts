import { auth } from '@clerk/nextjs/server'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const INTERNAL_PROXY_HEADERS = new Set([
  'x-conxa-proxy-secret',
  'x-conxa-user-id',
  'x-conxa-org-id',
  'x-conxa-org-role',
  'x-conxa-org-name',
])

function upstreamOrigin() {
  return (process.env.API_ORIGIN || '').replace(/\/$/, '')
}

function apiProxySecret() {
  return (process.env.CONXA_API_PROXY_SECRET || '').trim()
}

async function proxy(request: Request, path: string[]) {
  const origin = upstreamOrigin()
  if (!origin) {
    return Response.json({ detail: 'api_origin_not_configured' }, { status: 500 })
  }

  const { getToken, userId, orgId, orgRole, orgSlug } = await auth()
  const upstreamUrl = new URL(`${origin}/api/v1/${path.join('/')}`)
  const currentUrl = new URL(request.url)
  upstreamUrl.search = currentUrl.search

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (!HOP_BY_HOP_HEADERS.has(lower) && !INTERNAL_PROXY_HEADERS.has(lower)) {
      headers.set(key, value)
    }
  })
  headers.set('x-forwarded-host', currentUrl.host)

  const token = await getToken()
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }
  // These three states are legitimate, documented fallbacks — not
  // misconfiguration — so they log every time rather than pretending a
  // "warn once" latch (which doesn't work correctly across serverless
  // instances anyway: each cold start gets its own, so a persistent problem
  // could warn once per instance forever, or never warn again within one
  // that already saw it) makes them one-off events worth investigating.
  const proxySecret = apiProxySecret()
  if (proxySecret && userId) {
    headers.set('x-conxa-proxy-secret', proxySecret)
    headers.set('x-conxa-user-id', userId)
    if (orgId) headers.set('x-conxa-org-id', orgId)
    if (orgRole) headers.set('x-conxa-org-role', orgRole)
    if (orgSlug) headers.set('x-conxa-org-name', orgSlug)
    if (!orgId) {
      console.info('proxy: no active Clerk org — backend will use the personal workspace', {
        path: upstreamUrl.pathname,
      })
    }
  } else if (proxySecret && !userId) {
    console.info('proxy: no Clerk userId — trusted proxy identity headers not sent, falling back to Bearer JWT', {
      path: upstreamUrl.pathname,
    })
  } else if (userId && !proxySecret) {
    console.info('proxy: CONXA_API_PROXY_SECRET not configured — backend identity comes from the Clerk JWT alone', {
      path: upstreamUrl.pathname,
    })
  }

  const method = request.method.toUpperCase()
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await request.text()

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
    })
  } catch (error) {
    console.error('API proxy request failed', {
      origin,
      path: path.join('/'),
      error,
    })
    // `origin` (an internal hostname) stays server-side in the log above —
    // it has no reason to reach the browser in the response body.
    return Response.json({ detail: 'backend_unavailable' }, { status: 503 })
  }

  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value)
    }
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

type RouteContext = {
  params: Promise<{
    path: string[]
  }>
}

async function handler(request: Request, context: RouteContext) {
  const { path } = await context.params
  return proxy(request, path)
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }

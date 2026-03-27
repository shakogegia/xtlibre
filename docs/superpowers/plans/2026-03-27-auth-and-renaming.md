# Authentication & XTLibre Renaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add env-based authentication (always required) to all routes including OPDS, and rename all "XTC Converter" references to "XTLibre".

**Architecture:** Simple credential auth via `AUTH_USERNAME` + `AUTH_PASSWORD` env vars. Login form POSTs to `/api/auth/login` which validates and sets a signed JWT cookie. A Next.js 16 `proxy.ts` (formerly middleware) protects all routes except `/login`, `/api/auth/*`, and static assets. The `/opds` endpoint additionally supports HTTP Basic Auth for e-reader devices. `jose` library for Edge-compatible JWT signing/verification.

**Tech Stack:** Next.js 16 (proxy.ts), jose (JWT), next-themes (already installed)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/auth.ts` | JWT sign/verify helpers, credential check, cookie config |
| Create | `src/app/api/auth/login/route.ts` | POST handler: validate credentials, set session cookie |
| Create | `src/app/api/auth/logout/route.ts` | POST handler: clear session cookie |
| Create | `src/proxy.ts` | Auth proxy: redirect unauthenticated to `/login` |
| Modify | `src/app/login/page.tsx` | Wire form to `/api/auth/login`, show errors |
| Modify | `src/app/opds/route.ts` | Add Basic Auth + session cookie check |
| Modify | `src/app/layout.tsx` | Already done (title says "XTLibre") |
| Modify | `src/app/opds/route.ts` | Rename "XTC Converter" → "XTLibre", "XTC Library" → "XTLibre Library" |
| Modify | `README.md` | Add auth section with env var docs |
| Modify | `Dockerfile` | Add AUTH_USERNAME/AUTH_PASSWORD env var comments |
| Modify | `Makefile` | Rename volume/container/image names to xtlibre |

---

### Task 1: Install jose

- [ ] **Step 1: Install jose**

```bash
pnpm add jose
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add jose for JWT auth"
```

---

### Task 2: Create auth library (`src/lib/auth.ts`)

**Files:**
- Create: `src/lib/auth.ts`

- [ ] **Step 1: Create the auth helpers file**

```ts
import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const SESSION_COOKIE = "session"
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret(): Uint8Array {
  const password = process.env.AUTH_PASSWORD
  if (!password) throw new Error("AUTH_PASSWORD env var is required")
  return new TextEncoder().encode(password)
}

export function getCredentials(): { username: string; password: string } {
  const username = process.env.AUTH_USERNAME
  const password = process.env.AUTH_PASSWORD
  if (!username || !password) {
    throw new Error("AUTH_USERNAME and AUTH_PASSWORD env vars are required")
  }
  return { username, password }
}

export function checkCredentials(username: string, password: string): boolean {
  const creds = getCredentials()
  return username === creds.username && password === creds.password
}

export async function createSession(username: string): Promise<string> {
  const token = await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret())
  return token
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret())
    return true
  } catch {
    return false
  }
}

/** Verify session from cookie — for use in API routes (server-side) */
export async function verifySessionCookie(): Promise<boolean> {
  const cookieStore = await cookies()
  const session = cookieStore.get(SESSION_COOKIE)
  if (!session?.value) return false
  return verifySession(session.value)
}

/** Verify HTTP Basic Auth header — for OPDS e-reader access */
export function verifyBasicAuth(authHeader: string | null): boolean {
  if (!authHeader?.startsWith("Basic ")) return false
  try {
    const decoded = atob(authHeader.slice(6))
    const [username, password] = decoded.split(":")
    return checkCredentials(username, password)
  } catch {
    return false
  }
}

export { SESSION_COOKIE, SESSION_MAX_AGE }
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: add auth library with JWT session and Basic Auth helpers"
```

---

### Task 3: Create login API route (`src/app/api/auth/login/route.ts`)

**Files:**
- Create: `src/app/api/auth/login/route.ts`

- [ ] **Step 1: Create the login endpoint**

```ts
import { checkCredentials, createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth"

export async function POST(request: Request) {
  const body = await request.json()
  const { username, password } = body

  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 })
  }

  if (!checkCredentials(username, password)) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const token = await createSession(username)

  const response = Response.json({ success: true })
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
  )
  return response
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/auth/login/route.ts
git commit -m "feat: add login API endpoint"
```

---

### Task 4: Create logout API route (`src/app/api/auth/logout/route.ts`)

**Files:**
- Create: `src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Create the logout endpoint**

```ts
import { SESSION_COOKIE } from "@/lib/auth"

export async function POST() {
  const response = Response.json({ success: true })
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  )
  return response
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/auth/logout/route.ts
git commit -m "feat: add logout API endpoint"
```

---

### Task 5: Create auth proxy (`src/proxy.ts`)

**Files:**
- Create: `src/proxy.ts`

Note: Next.js 16 renamed `middleware.ts` to `proxy.ts`. The file goes in `src/` (same level as `app/`). Export a named `proxy` function.

- [ ] **Step 1: Create the proxy file**

```ts
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

function getSecret(): Uint8Array {
  const password = process.env.AUTH_PASSWORD
  if (!password) throw new Error("AUTH_PASSWORD env var is required")
  return new TextEncoder().encode(password)
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const session = request.cookies.get("session")
  if (!session?.value) return false
  try {
    await jwtVerify(session.value, getSecret())
    return true
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow OPDS with Basic Auth (for e-reader devices)
  if (pathname === "/opds") {
    const auth = request.headers.get("authorization")
    if (auth?.startsWith("Basic ")) {
      return NextResponse.next()
    }
  }

  // Check session cookie
  if (await isAuthenticated(request)) {
    // If authenticated user visits /login, redirect to home
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url))
    }
    return NextResponse.next()
  }

  // Not authenticated — redirect to login
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: [
    // Match all paths except: /login, /api/auth/*, static files, images, favicon
    "/((?!login|api/auth|_next/static|_next/image|favicon\\.ico|lib/).*)",
  ],
}
```

- [ ] **Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: add auth proxy to protect all routes"
```

---

### Task 6: Wire login page to auth API

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Update login page to call API and handle errors**

Replace the `handleSubmit` function and add error state. The form should POST to `/api/auth/login` and redirect on success. Add error display below the form.

Key changes:
- Add `const [error, setError] = useState("")`
- Add `import { useRouter } from "next/navigation"`
- Replace `handleSubmit` to call `/api/auth/login`
- Show error message in the form
- On success, `router.push("/")`

- [ ] **Step 2: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: wire login page to auth API with error handling"
```

---

### Task 7: Protect OPDS endpoint with Basic Auth

**Files:**
- Modify: `src/app/opds/route.ts`

- [ ] **Step 1: Add auth check to OPDS route**

At the top of the GET handler, check for either a valid session cookie or valid Basic Auth. If neither, return 401 with `WWW-Authenticate: Basic` header (standard for OPDS clients).

```ts
import { verifyBasicAuth, verifySessionCookie } from "@/lib/auth"

// At the start of GET handler:
const authHeader = request.headers.get("authorization")
const hasBasicAuth = verifyBasicAuth(authHeader)
const hasSession = await verifySessionCookie()

if (!hasBasicAuth && !hasSession) {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="XTLibre OPDS"' },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/opds/route.ts
git commit -m "feat: protect OPDS endpoint with Basic Auth + session cookie"
```

---

### Task 8: Rename "XTC Converter" → "XTLibre" everywhere

**Files:**
- Modify: `src/app/opds/route.ts` — lines 38 ("XTC Library" → "XTLibre Library"), 40 ("XTC Converter" → "XTLibre"), 37 ("xtc-library" stays as URN — it's an identifier, not display text)
- Modify: `Makefile` — rename IMAGE_NAME, CONTAINER_NAME, VOLUME_NAME to `xtlibre`

- [ ] **Step 1: Fix OPDS route naming**

In `src/app/opds/route.ts`:
- Line with `<title>XTC Library</title>` → `<title>XTLibre Library</title>`
- Line with `<author><name>XTC Converter</name></author>` → `<author><name>XTLibre</name></author>`

- [ ] **Step 2: Fix Makefile naming**

```makefile
IMAGE_NAME := xtlibre
CONTAINER_NAME := xtlibre
VOLUME_NAME := xtlibre-data
```

- [ ] **Step 3: Commit**

```bash
git add src/app/opds/route.ts Makefile
git commit -m "chore: rename XTC Converter to XTLibre everywhere"
```

---

### Task 9: Update README with auth documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add authentication section to README**

Add after "Getting started" section:

```markdown
### Authentication

XTLibre requires authentication. Set the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_USERNAME` | Yes | Login username |
| `AUTH_PASSWORD` | Yes | Login password |

For local development:

```bash
AUTH_USERNAME=admin AUTH_PASSWORD=secret pnpm dev
```

The web UI uses a session cookie after login. The OPDS endpoint (`/opds`) also supports HTTP Basic Auth so Xteink devices can authenticate directly.
```

Update Docker sections to include auth env vars in `docker run` and `docker-compose.yml` examples.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add authentication section to README"
```

---

### Task 10: Update Dockerfile with auth env var comments

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Add env var comments**

After the `PUBLIC_URL` comment block in the Dockerfile, add:

```dockerfile
# Authentication credentials (required)
# ENV AUTH_USERNAME=
# ENV AUTH_PASSWORD=
```

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "docs: add auth env var placeholders to Dockerfile"
```

---

### Task 11: Verify everything works

- [ ] **Step 1: Type-check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Test dev server starts**

```bash
AUTH_USERNAME=admin AUTH_PASSWORD=secret pnpm dev
```

Verify:
- `http://localhost:3000` redirects to `/login`
- Login with admin/secret redirects to `/`
- `/opds` returns 401 without auth, works with Basic Auth `admin:secret`
- Logout clears session

- [ ] **Step 3: Final commit if any fixes needed**

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Angular 21 (standalone components, signals) front-end for a messenger app. The .NET backend (REST + SignalR hub) and Postgres DB are deployed and live on Azure; this frontend is deployed as an Azure Static Web App via git. The UI runs entirely on the real API/auth/SignalR layer — there is no mock data layer anymore.

## Commands

```bash
ng serve            # dev server on http://localhost:4200, auto-reloads
ng build             # production build to dist/
ng test              # unit tests via Vitest (jsdom), TestBed-based
ng test -- <pattern>  # run a subset (Vitest CLI filtering)
```

**Windows/this machine gotcha:** the `npm`/`node`/`ng` shims on PATH (`C:\Users\...\AppData\Roaming\npm\node.ps1`) are broken and fail with "system cannot find the path specified". If `npm run build` / `ng serve` fail that way, invoke the real node directly instead:
```bash
"C:\nvm4w\nodejs\node.exe" "node_modules\@angular\cli\bin\ng.js" build
"C:\nvm4w\nodejs\node.exe" "node_modules\@angular\cli\bin\ng.js" serve --port 4200
```

## Architecture

**Auth: Microsoft Entra External ID (CIAM) via MSAL.** Note this is *not* classic Azure AD B2C — Microsoft stopped letting new customers create B2C tenants, so this project uses B2C's modern successor. That matters for the config shape: CIAM's authority host is `<tenant-subdomain>.ciamlogin.com` (not `b2clogin.com`, and not the plain `login.microsoftonline.com/<tenant>` form workforce Entra ID uses), and unlike classic B2C, the policy/user-flow name is **not** part of the authority URL — the sign-in experience is linked to the app registration via a "User flow" configured in the tenant (Entra admin center → your CIAM tenant → User flows → the flow's "Applications" tab), not passed in the redirect. There is no custom login/password endpoint — `pages/auth/login` is a single "Sign in with Microsoft" button (`AuthService.login()` → `loginRedirect`). The `''` (Dashboard) route is guarded by the library's `MsalGuard`, which triggers the sign-in redirect itself if you're not authenticated (the `/login` page is a secondary manual entry point, guarded the other way by `guestGuard` so an already-authenticated user visiting it bounces back to `/`).
- `src/app/core/auth/msal.config.ts` — MSAL `Configuration` + the backend API scope string, filled in with the real CIAM tenant ("messengerpointbreak22") App Registration values: `clientId`/`authority: https://messengerpointbreak22.ciamlogin.com/`/`knownAuthorities`/`apiScope`. The app registration has the SPA redirect URIs (Static Web App URL + `http://localhost:4200`), the `access_as_user` delegated permission with admin consent granted, and is linked to a "Sign up and sign in" user flow — all three are required for sign-in to work, not just the app registration existing.
- `src/app/core/auth/msal-providers.ts` — exports `msalProviders: Provider[]`, spread into `app.config.ts`'s `providers`.
- `src/app/core/auth/auth.service.ts` — `AuthService` wraps `MsalService`: `currentAccount` (raw MSAL `AccountInfo`) and `currentUserProfile` (our `UserProfile` DTO, fetched via `UserApiService.getMe()` right after login success — `AccountInfo` alone has no `userName`/`avatarUrl`) signals, `isAuthenticated` computed, `login()`/`logout()` (redirect flow), `getAccessToken(scopes?)` (async, `acquireTokenSilent`, used by `ChatHubService`'s `accessTokenFactory`).
- `app.config.ts` registers `MsalInterceptor` (via `HTTP_INTERCEPTORS`, using `withInterceptorsFromDi()`) for REST auth headers, plus a `provideAppInitializer` that calls `msal.instance.initialize()` then awaits `handleRedirectObservable()` before the app renders — required once for MSAL's redirect-based login to resolve correctly.

**Data layer — everything is live, no mock service:**
- `src/environments/environment.ts` / `environment.production.ts` — `apiBaseUrl`/`hubUrl`. `environment.production.ts` has the real Azure App Service host; `environment.ts` (dev) still points at `localhost:5001` placeholders for a locally-run backend — point it at the Azure host too if you don't run the backend locally. Azure SignalR Service (Default mode) is transparent to the client: it still connects to the App Service's `/chathub` negotiate endpoint, which is why `hubUrl` is the same host as `apiBaseUrl`, not the SignalR resource's own URL.
- `src/app/core/http/api-endpoints.ts` — REST paths grouped by resource (`users`/`chats`/`messages`/`friends`/`attachments`), fully confirmed by the backend spec.
- `src/app/core/signalr/chat-hub.service.ts` — `ChatHubService`: `HubConnection` wrapper (`connect()/disconnect()`, `connectionState` signal, generic `on<T>()`/`invoke<T>()`), plus `joinChatRoom(chatId)`/`leaveChatRoom(chatId)`/`sendMessage(...)` wrappers. Connects at `/chathub`. `Dashboard` calls `connect()` in its constructor and `disconnect()` in `ngOnDestroy` (the route is guarded, so it's only ever constructed while authenticated).
- `src/app/services/*-api.service.ts` (`chat-api`, `message-api`, `user-api`, `attachment-api`) — thin `HttpClient` wrappers, one method per endpoint, no state.
- `src/app/stores/*.store.ts` (`chat.store`, `message.store`, `user.store`) — signal-based state, the only thing components inject (never `*-api.service.ts` directly). Event wiring: `MessageStore` appends on `'NewMessage'` (no timestamp in the payload, so `createdAt` is approximated as receive time) and sends via REST (`MessageApiService.sendMessage()`, "reliable across reconnects" per the spec — deliberately not optimistic, since the server echoes `NewMessage` back to the sender too) with a `crypto.randomUUID()` idempotency key; `UserStore` flips presence on `'UserWentOnline'`/`'UserWentOffline'` and appends on `'FriendRequestAccepted'` via `getUserById`; `ChatStore` refetches on `'AddedToGroup'`.
- **`ChatSummary` (`GET /chats/me`) has no display name/avatar for direct chats** (`name`/`ownerId` are null) and no "last message preview" field at all — `ChatStore` resolves both gaps itself: `directCounterparts` (signal, keyed by chatId) resolves each direct chat's other member via `UserApiService.getUserById` on every `loadChats()`; `selectedChatMemberProfiles` resolves the *selected* chat's full member list the same way (an `effect()` watching `selectedChat()`). Components read these instead of doing their own lookups. Chat-list rows show name/avatar/unread badge only — no message preview/time (dropped; would need per-chat message fetches with no batching support, see gap list).
- `src/app/shared/user-display.ts` — `getInitials()`, `formatLastSeen()`, `formatMessageTime()`. Neither `UserProfile` nor `ChatMessage` carries UI-ready display strings (initials, "Online"/"5m ago", localized time) — these are pure presentation helpers, not part of any DTO.

**Known backend gaps** (not yet resolved — don't guess at these client-side):
1. No batch "get users by ids" endpoint — `ChatStore`'s member/counterpart resolution above does one `GET /api/users/{id}` per user; fine for small groups, wasteful at scale. Would also let the chat list show a message preview cheaply if paired with a `lastMessage` field on `ChatSummary`.
2. An item in the backend spec pasted to Claude got cut off (fragment: a stray `100` then "Ответ 200: массив User (та же структура что GET /api/users/{id})", between the attachments section and `PUT /api/users/me`) — an endpoint returning `User[]` exists that isn't accounted for in this codebase. Ask the user to paste the missing piece before assuming what it is.

**Routing/shell:** `app.routes.ts` has two routes (`''` → Dashboard, guarded by `MsalGuard`; `login`, guarded by `guestGuard`; wildcard → `''`). `pages/dashboard/dashboard.html` is the app shell: `Header` on top, `LeftSidebar` (chats/groups/friends tabs) on the left, either `Chat` or an empty state in the middle, `RightSidebar` (contact/group info, or "who's online" by default) on the right — all driven by `ChatStore.selectedChat`.

**Structure convention:** `pages/` = routed, top-level views (`dashboard`, `chat`, `auth/login`); `components/` = reusable pieces embedded in pages (`header`, `left-sidebar`, `right-sidebar`, `icon`). Every component follows Angular CLI's default 3-file split (`.ts` + `.html` + `.css`), even when the `.css` ends up empty because all styling is done with Tailwind utility classes in the template.

**Theming (Tailwind v4, CSS-first config):** there is no `tailwind.config.js`. All color tokens are defined once as CSS custom properties in an `@theme` block in `src/styles.css` and consumed as Tailwind utility classes everywhere else — never hardcode hex colors or `white/[0.0x]` translucency in templates, extend/reuse the existing tokens instead:
- Surfaces (depth hierarchy, darkest→lightest): `background`, `surface`, `surface-alt`, `surface-elevated`, `surface-hover`
- Borders: `border`, `border-strong`
- Text: `foreground`, `muted-foreground`, `faint-foreground`
- Brand accent (blue→cyan gradient): `accent-400/500/600`, `accent2-400/500/600` — gradient (`from-accent-500 to-accent2-500`) is reserved for brand surfaces (logo, own-message bubbles, avatar fallbacks); everything else (buttons, badges, focus rings) uses solid `accent-500`
- Status: `online`

**Icons:** every icon is a `<symbol>` in one sprite file, `public/svg/icons.svg` (served at `/svg/icons.svg` since `public/` is the Angular assets root). Icons are used via the `Icon` component (`src/app/components/icon/icon.ts`), which has selector `svg[appIcon]` and hijacks the host `<svg>` tag directly, so usage in templates is one line: `<svg appIcon="search" class="h-4 w-4 text-faint-foreground"></svg>`. `stroke="currentColor"` is baked into each `<symbol>`, so icon color still follows Tailwind text-color classes/hover states on the host element. When adding a new icon: add a `<symbol id="...">` to the sprite, then reference it by that id — don't inline `<svg><path>` markup in component templates. Note: the `Icon` component's own template must write `<svg:use>` (explicit namespace prefix), not `<use>` — otherwise Angular's compiler throws `NG8001 'use' is not a known element`, because a component's own inline template doesn't inherit SVG-namespace context from wherever it's consumed.

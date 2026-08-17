# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Angular 21 (standalone components, signals) front-end for a messenger app. A separate .NET backend is being developed in parallel and both will deploy to Azure, but the backend is not wired up yet — all data currently comes from an in-memory mock service.

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

**Data layer (current UI):** `src/app/services/mock-data.service.ts` is what the pages/components actually run on today — a signal-based fake backend holding users, chats/groups, and messages-by-chat, plus the currently-selected chat. All UI components read/write through this service (`inject(MockDataService)`). Types live in `src/app/interfaces/` (`user.ts`, `chat.ts`, `message.ts`, `friend-request.ts`).

**API/auth/SignalR layer (scaffolded, not yet wired into the UI):** built ahead of the .NET backend so integration is a DI swap later, not a design exercise under pressure. Nothing here is imported by `pages/` or `app.routes.ts` yet — `Login`/`Register`/`Dashboard` still run on `MockDataService`. Auth is **Azure AD B2C via MSAL** (backend spec: `Authorization: Bearer <access_token_from_B2C>`; user id is the `sub` claim). There is no custom login/password endpoint. The REST/SignalR contract is fully confirmed by the backend (Postgres-backed: `users`/`chats`/`chat_members`/`messages`/`friendships`/`outbox_messages` tables), including message send/read receipts and profile editing — see the (short) gap list at the bottom for what's still open.
- API DTOs live in `interfaces/user-profile.ts` / `chat-summary.ts` (+ `ChatMember`) / `chat-message.ts` / `friend-request.ts` / `paged-result.ts` / `hub-events.ts` — **kept deliberately separate from `interfaces/user.ts`/`chat.ts`/`message.ts`**, which are the mock/UI-facing shapes `MockDataService` still drives the current UI with (different field names, e.g. real `UserProfile.userName`/`isOnline` vs mock `User.name`/`online`). Don't merge these until the UI is actually migrated off `MockDataService`.
- `src/environments/environment.ts` / `environment.production.ts` — `apiBaseUrl`/`hubUrl`; production file is swapped in via `fileReplacements` in `angular.json`'s `production` build configuration. The production URLs are still placeholders (`messenger-api.azurewebsites.net`) — update once the Azure App Service name is known.
- `src/app/core/http/api-endpoints.ts` — REST paths grouped by resource (`users`/`chats`/`messages`/`friends`/`attachments`), fully confirmed by the backend spec.
- `src/app/core/auth/msal.config.ts` — MSAL `Configuration` + the backend API scope string, `// TODO` placeholders. Note: this is **B2C**, whose `authority` is `https://<tenant>.b2clogin.com/<tenant>.onmicrosoft.com/<policy>/v2.0` (needs `knownAuthorities`) and whose exposed API scopes are full HTTPS URLs, not the plain `api://...` form — don't paste in a regular Entra ID tenant authority by mistake.
- `src/app/core/auth/msal-providers.ts` — exports `msalProviders: Provider[]` (MSAL_INSTANCE/MSAL_GUARD_CONFIG/MSAL_INTERCEPTOR_CONFIG factories + `MsalService`/`MsalGuard`/`MsalBroadcastService`). **Deliberately not registered in `app.config.ts` yet** — `PublicClientApplication` would still construct fine with placeholder values (provider factories are lazy, and MSAL only validates `clientId` is non-empty, not well-formed), but nothing should call `handleRedirectObservable()`/`initialize()` via an `APP_INITIALIZER` until real values exist, since that runs eagerly at bootstrap regardless of whether the UI uses auth. See the `// TODO` in `app.config.ts` for the exact wiring steps.
- `src/app/core/auth/auth.service.ts` — `AuthService` wraps `MsalService`: `currentAccount`/`isAuthenticated` signals (kept in sync via `MsalBroadcastService.msalSubject$`), `login()`/`logout()` (redirect flow), `getAccessToken(scopes?)` (async, `acquireTokenSilent`).
- `src/app/core/auth/auth.guard.ts` — only `guestGuard` (redirects an already-authenticated user away from login/register). For protecting routes, use the library's `MsalGuard` (from `msal-providers.ts`) once registered — there's no need to hand-roll an `authGuard`.
- `src/app/core/signalr/chat-hub.service.ts` — `ChatHubService`: thin `HubConnection` wrapper (`connect()/disconnect()`, `connectionState` signal, generic `on<T>()`/`invoke<T>()`), plus confirmed method wrappers `joinChatRoom(chatId)`/`leaveChatRoom(chatId)` and `sendMessage(chatId, text, attachmentUrl, idempotencyKey)` (a low-latency alternative to the REST send path — not used by `MessageStore` by default, see below). Token supplied via `accessTokenFactory` reading `AuthService.getAccessToken()`. Nothing calls `connect()` yet.
- `src/app/services/*-api.service.ts` (`chat-api`, `message-api`, `user-api`, `attachment-api`) — thin `HttpClient` wrappers, one method per endpoint, no state.
- `src/app/stores/*.store.ts` (`chat.store`, `message.store`, `user.store`) — signal-based state containers that call the `*-api.service.ts` files and register `ChatHubService.on(...)` handlers in their constructors, all against **confirmed** event payloads: `MessageStore` appends on `'NewMessage'` (`{messageId, chatId, senderId, text, attachmentUrl}` — no timestamp, so `createdAt` is approximated client-side as receive time) and sends via `MessageApiService.sendMessage()` (REST — "reliable across reconnects" per the spec; the server pushes `NewMessage` back to the sender too, so `sendMessage()` deliberately does not optimistically append) with a `crypto.randomUUID()` idempotency key; `UserStore` flips presence on `'UserWentOnline'`/`'UserWentOffline'` (raw userId string) and on `'FriendRequestAccepted'` (`{by}`) fetches that one profile via `getUserById` and appends it; `ChatStore` refetches all chats on `'AddedToGroup'` (`{chatId, chatName}` isn't enough to build a full `ChatSummary`, so refetch is the simple/correct choice). `ChatStore.selectChat()`/`closeChat()` fire-and-forget `hub.joinChatRoom`/`leaveChatRoom`. **Convention: components should eventually inject stores, never `*-api.service.ts` directly.**
- `app.config.ts` provides plain `provideHttpClient()` (no interceptor registered — see the MSAL note above for what replaces the old custom one).

**Known backend gaps** (not yet resolved — don't guess at these client-side):
1. No batch "get users by ids" endpoint — rendering a group's member list means one `GET /api/users/{id}` per member; fine for small groups, wasteful for large ones.
2. An item in the backend spec pasted to Claude got cut off (fragment: a stray `100` then "Ответ 200: массив User (та же структура что GET /api/users/{id})", between the attachments section and `PUT /api/users/me`) — an endpoint returning `User[]` exists that isn't accounted for in this codebase. Ask the user to paste the missing piece before assuming what it is.

**Routing/shell:** `app.routes.ts` has three routes (`''` → Dashboard, `login`, `register`, wildcard → `''`). `pages/dashboard/dashboard.html` is the app shell: `Header` on top, `LeftSidebar` (chats/groups/friends tabs) on the left, either `Chat` or an empty state in the middle, `RightSidebar` (contact/group info, or "who's online" by default) on the right — all driven by `MockDataService.selectedChat`.

**Structure convention:** `pages/` = routed, top-level views (`dashboard`, `chat`, `auth/login`, `auth/register`); `components/` = reusable pieces embedded in pages (`header`, `left-sidebar`, `right-sidebar`, `icon`). Every component follows Angular CLI's default 3-file split (`.ts` + `.html` + `.css`), even when the `.css` ends up empty because all styling is done with Tailwind utility classes in the template.

**Theming (Tailwind v4, CSS-first config):** there is no `tailwind.config.js`. All color tokens are defined once as CSS custom properties in an `@theme` block in `src/styles.css` and consumed as Tailwind utility classes everywhere else — never hardcode hex colors or `white/[0.0x]` translucency in templates, extend/reuse the existing tokens instead:
- Surfaces (depth hierarchy, darkest→lightest): `background`, `surface`, `surface-alt`, `surface-elevated`, `surface-hover`
- Borders: `border`, `border-strong`
- Text: `foreground`, `muted-foreground`, `faint-foreground`
- Brand accent (blue→cyan gradient): `accent-400/500/600`, `accent2-400/500/600` — gradient (`from-accent-500 to-accent2-500`) is reserved for brand surfaces (logo, own-message bubbles, avatar fallbacks); everything else (buttons, badges, focus rings) uses solid `accent-500`
- Status: `online`

**Icons:** every icon is a `<symbol>` in one sprite file, `public/svg/icons.svg` (served at `/svg/icons.svg` since `public/` is the Angular assets root). Icons are used via the `Icon` component (`src/app/components/icon/icon.ts`), which has selector `svg[appIcon]` and hijacks the host `<svg>` tag directly, so usage in templates is one line: `<svg appIcon="search" class="h-4 w-4 text-faint-foreground"></svg>`. `stroke="currentColor"` is baked into each `<symbol>`, so icon color still follows Tailwind text-color classes/hover states on the host element. When adding a new icon: add a `<symbol id="...">` to the sprite, then reference it by that id — don't inline `<svg><path>` markup in component templates. Note: the `Icon` component's own template must write `<svg:use>` (explicit namespace prefix), not `<use>` — otherwise Angular's compiler throws `NG8001 'use' is not a known element`, because a component's own inline template doesn't inherit SVG-namespace context from wherever it's consumed.

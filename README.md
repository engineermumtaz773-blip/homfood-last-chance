# Home Made Food

Next.js App Router storefront with Tailwind CSS 4 and an optional WordPress
REST API connection.

This project includes the Next.js storefront and an optional WordPress API plugin.

## Google OAuth 2.0 Integration

Home Made Food supports official Google OAuth 2.0 authentication (`accounts.google.com`) with automatic customer record linkage, 30-day encrypted HTTP-only session persistence (`hmf_customer_session`), and instant avatar/profile synchronization across the storefront and mobile app shell.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth 2.0 Client ID** (Web application).
2. Configure **Authorized JavaScript origins**:
   - `https://homefood.engineer`
   - `http://localhost:3000`
3. Configure **Authorized redirect URIs**:
   - `https://homefood.engineer/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback`
4. Set the following environment variables in Vercel or `.env.local`:
   ```env
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```

## Deployment

Configured for domain deployment at [homefood.engineer](https://homefood.engineer) via Vercel.

## Run locally

```powershell
npm run dev
```


Run the command from this directory and open
[http://localhost:3000](http://localhost:3000). If using a WordPress backend,
set `NEXT_PUBLIC_WORDPRESS_API_URL` in `.env.local` to its REST API root.

## Routes

- `/` storefront home
- `/menu` dish catalog and category filters
- `/daily-deals` combo offers
- `/about` kitchen story and values
- `/contact` contact details and WhatsApp message form
- `/checkout` cart summary and WhatsApp order handoff
- `/track-order` order update request
- `/admin` administrator-only live dashboard
- `/admin/orders`, `/admin/menu`, `/admin/categories`, `/admin/customers`, `/admin/analytics`, and `/admin/settings` protected admin routes
- `/admin/orders/[id]` protected live order detail and customer chat
- `/admin/login` WordPress administrator sign-in

The branded loading screen is used for route loading and delayed internal
navigation. The cart persists in browser local storage. WordPress menu data is
read from `/hmf/v1/dishes`; if WordPress is unavailable or returns an
incompatible response, the storefront logs the failure and shows the local
sample catalog. The home and menu refresh the published catalog every 15
seconds while open, and refresh immediately when the browser tab becomes
visible again.

The installable web app uses `src/app/manifest.ts`, the service worker at
`public/sw.js`, and a cached offline notice. It does not cache WordPress API
responses, customer information, or admin pages. Android APK and Windows
desktop downloads remain disabled until signed installers are published and
their HTTPS URLs are configured through `NEXT_PUBLIC_ANDROID_APK_URL` and
`NEXT_PUBLIC_WINDOWS_INSTALLER_URL`. iOS installation uses Safari's Share →
Add to Home Screen flow.

Configure `NEXT_PUBLIC_WORDPRESS_API_URL` to the WordPress REST API root,
`HMF_ADMIN_SESSION_SECRET` to a cryptographically random secret of at least 32
characters, the `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASS`, and `HMF_ADMIN_OTP_FROM_EMAIL` values for the OTP mailer, and server-only
`HMF_ADMIN_WP_USERNAME` / `HMF_ADMIN_WP_APPLICATION_PASSWORD` credentials for
a dedicated WordPress administrator account. The admin sign-in screen accepts
only an email address and a six-digit OTP; the only allowed email is
`engineermumtaz773@gmail.com`. The server validates the configured WordPress
account's email against this allowlist before sending a code and again before
issuing the session. WordPress credentials never enter the browser and are
never stored in a `NEXT_PUBLIC_` variable. OTPs expire after five minutes,
can only be used once, and can be resent after the 60-second countdown.
For Gmail SMTP, use `smtp.gmail.com`, port `465`, `SMTP_SECURE=true`,
`SMTP_USER` set to the authorized Gmail mailbox, and a Google App Password in
`SMTP_PASS` (not the Google account password). The sender address must match
`SMTP_USER`. The transport uses TLS, bounded connection timeouts, and checks
that the SMTP server accepted the recipient. The application cannot deliver
OTP mail until these SMTP credentials and the other required admin services
are configured in the deployment environment.

## Supabase platform synchronization

Apply [`supabase/order-sync.sql`](./supabase/order-sync.sql) to the Supabase
project, then configure the server-only `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` variables. The orders, order messages, dishes,
deals, settings, and customers APIs use Supabase as the authoritative
persistent store when configured. The browser also needs
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Realtime
subscriptions; the migration adds the tables to `supabase_realtime`.
The service-role key never reaches the browser. Customer messages are checked
against the order number and phone, while admin replies and order deletion
require the existing admin session.
Without these variables, the existing local `store-db.json` adapter remains
available for local development.

For local development only, admin sign-in has a loopback-only in-memory
fallback for any wholly unconfigured Redis or WordPress integration. If SMTP
is not configured, the six-digit OTP is printed to the development server
console and shown in a development-only badge on the OTP screen, where it can
be filled into the code field. Local fallback state is process-local and is
cleared when the server restarts; it is never enabled in production. Configure
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and HMF_ADMIN_OTP_FROM_EMAIL to
send actual admin OTP emails. Resend SMTP is supported with `smtp.resend.com`,
port 465 or 587, username `resend`, a Resend API key as SMTP_PASS, and a
verified sender address.

Admin brute-force state is shared across application instances using
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. These are required
for production sign-in; authentication fails closed if Redis is unavailable.
Loopback development uses in-memory rate limiting when Redis is unconfigured.
Three consecutive invalid-email attempts block the requesting IP; three incorrect
OTP attempts block both the IP and authorized account for 15 minutes. A
security-structured event is written to the server log when a block occurs.
The deployment's trusted proxy must overwrite `x-real-ip` (or append trusted
addresses to `x-forwarded-for`) so rate limits use the actual client IP. Use
HTTPS in production. Admin pages redirect to `/admin/login` when the
eight-hour session is missing or invalid, and the dashboard proxy rechecks
access against WordPress.

The installable plugin source is in
`../wordpress-plugin/homemade-food-api.php`.
Install and activate it in a running WordPress site, then use WordPress's
standard authenticated REST mechanisms (admin cookie with REST nonce or an
Application Password) for protected `/hmf/v1/auth`, `/hmf/v1/orders`, and
`/hmf/v1/dashboard` routes. The plugin allows local frontend origins and
optional exact origins configured using `HMF_ALLOWED_CORS_ORIGINS` in
`wp-config.php`; it never enables wildcard credentialed CORS. WordPress
registers REST rewrites itself; after plugin activation, save **Settings →
Permalinks** if the API still returns 404. The plugin must be installed on a
running WordPress site with its database configured. Its authenticated
dashboard refreshes order metrics and recent orders every 30 seconds. The
Next.js dashboard reads live protected totals and recent orders through its
server-side proxy. Checkout creates each order in WordPress, which assigns a
cryptographically random `HMF-…` reference and persists the submitted order;
`/track-order` looks it up by reference and customer phone and polls status
updates. Orders are also handed off to WhatsApp; the frontend does not process
payments. The Next.js deal editor remains browser-local and is not shared
between devices.
Deal prices remain defined in the frontend, and delivery timing is confirmed
by the kitchen after an order; neither is currently an editable WordPress
setting.

Run `..\..\export-backup.ps1` from this frontend directory or execute the
script directly to create a source-only ZIP in your Downloads folder. It
intentionally excludes credentials, WordPress core, and the database; export
those separately using the hosting platform's approved backup procedure.

## Live kitchen and payment operations

The admin Settings → Business Hours tab controls weekly hours and the
Breakfast, Lunch, and Dinner meal slots. The storefront refreshes these rules
through the existing Supabase Realtime channel (with a short polling fallback),
and `/api/orders` enforces them server-side before accepting an order.

Checkout provides Raast scanning, a printable challan voucher (use the browser
print dialog to save PDF), and paid-slip upload. Slips are stored on the order
as a bounded image data URL for the local adapter or Supabase row, enter
`Verification Pending`, and can be approved from Admin → Orders. Admin notes
and media URLs saved on an order are returned by the tracking API and refresh
with the same realtime channel. Apply the updated
[`supabase/order-sync.sql`](./supabase/order-sync.sql) migration before using
these fields with Supabase.

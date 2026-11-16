# Ignite Peptides local WordPress

## Connection

- Local WP site: `C:\Users\Crexed\Local Sites\ignitepeptides`
- Document root: `C:\Users\Crexed\Local Sites\ignitepeptides\app\public`
- Local domain: `http://ignitepeptides.local`
- Local WP site ID: `mf3RsOdvo`
- Environment: Local 10.1.2+7004, PHP 8.2.29, Nginx 1.26.1, MySQL 8.4.0
- Local WP reports site files under `app\public`; the workspace `D:\Homefood` is currently a separate Next.js/Supabase project, not a WordPress checkout.

## WordPress code inventory

- Themes: `hello-elementor`, `hello-theme-child-master`, `twentytwentyfive`, `twentytwentyfour`, `twentytwentythree`.
- Active-looking customization candidate: `hello-theme-child-master` (its stylesheet identifies `hello-elementor` as its parent). Confirm active theme in wp-admin before editing.
- Custom/plugin directories include `basaltsurge-woocommerce`, `auxpay-payment-gateway`, `clkk-iframe-checkout`, `clkk-woocommerce`, `ignite-email-otp`, `ignite-google-login-final-production`, `ignite-google-login-override`, `ignite-otp-login`, `nasupay-woocommerce`, `novamira`, `peptipay_free`, `store-sms`, and other vendor plugins. The complete installed plugin directory list is available from the Local WP site's `app\public\wp-content\plugins` folder.
- Must-use plugin directory: `wp-content\mu-plugins` (present; inspect its contents as changes require).
- Other custom-code locations observed: root `ig-form.php`, `wp-content\advanced-headers.php`, and plugin `code-snippets`. Treat root/plugin code as site-owned and avoid editing vendor code when a child theme or focused custom plugin can provide the change.

## Configuration audit (secrets omitted)

- `wp-config.php` uses database `local`, host `localhost`, and table prefix `wp_75d4aa565c_`.
- Credentials are configured in `wp-config.php` and Local WP metadata. They are intentionally not copied into this workspace document.
- `WP_DEBUG` and `WP_DEBUG_LOG` are explicitly false. No `WP_HOME` or `WP_SITEURL` override was found in the inspected config lines.
- Local WP metadata confirms PHP 8.2.29 and MySQL 8.4.0; it confirms the Nginx service. Nginx templates are in the site's `conf\nginx` folder.
- WordPress core version could not be confirmed from the inspected `wp-includes\version.php` output; verify in wp-admin or Local WP before relying on the supplied 7.1.4 version.

## Current diagnostics and limits

- `ignitepeptides.local` resolves to `127.0.0.1`, but an HTTP request was refused on port 80. The Local WP site/services appear stopped, or the local proxy is not listening. Start the site in Local WP, then retry the domain.
- Database connectivity was not tested because the MySQL process is managed by Local WP and was not confirmed running. Use Local WP's Database tab/phpMyAdmin after starting the site.
- The Local WP site resides outside the writable workspace roots in this Codex session. It was readable for inspection, but direct edits, synchronization, symlinks, and database changes are not available from this checkout. Keep the Local WP folder open as a separate project/workspace or provide a writable worktree/mirror for live editing.

## Suggested development workflow

1. Start `ignitepeptides` in Local WP and verify `http://ignitepeptides.local` and wp-admin load.
2. Confirm the active theme and WordPress version in wp-admin. Make presentation changes in `wp-content\themes\hello-theme-child-master`; place substantial WooCommerce behavior (quantity/BOGO rules, checkout adjustments) in a small purpose-built plugin rather than parent theme or vendor files.
3. Before database changes, export a Local WP database snapshot. For WooCommerce hooks, account for classic and block checkout paths and verify cart totals, coupons, taxes, and order creation in the local site.
4. Track only owned code in Git (child theme and custom plugins). Exclude uploads, cache, logs, generated backups, credentials, and Local WP runtime files. Keep secrets in local config, not source control.
5. Once the site folder is writable in Codex, add repo-local instructions for the custom theme/plugin directories and use Git diffs to review synchronization. Until then, this document is the workspace-side connection note; it does not create a live file mapping.

# Staff dashboard setup

The monitor and archive searches remain public. `/manage` provides collection controls, source editing and an owner-only approval list. `/api/*` refuses mutations without a signed Cloudflare Access identity and approval in D1. There is no shared passcode or browser-side GitHub token.

## One-time Cloudflare setup

1. Create a D1 database named `penn-news-staff`. Run `migrations/0001_staff.sql` in its SQL console. The database stores staff email addresses, approval status, an action audit and a dispatch cooldown; it contains no article archive data.
2. In the existing **penn-news-monitor** Pages project, add a production D1 binding named `STAFF_DB` to that database.
3. Set production variables:
   - `ADMIN_EMAIL`: the owner's exact sign-in email. Only this email can approve/revoke staff.
   - `ACCESS_TEAM_DOMAIN`: your Cloudflare Zero Trust team domain, e.g. `your-team.cloudflareaccess.com` (no scheme or slash).
   - `ACCESS_AUD`: the application audience tag from the Access application below.
4. Add the real fine-grained repository token as **Secret** `GITHUB_TOKEN` (or `MONITOR_GITHUB_TOKEN`). It must be restricted to Penn-News-Scraper with Actions read/write and Contents read/write. Do not paste descriptions, tokens or staff emails into public repository files. Existing Pages secrets can be reused if they have these permissions. The GitHub Actions repository secret is separate from the Pages runtime secret.
5. In Zero Trust, enable **One-time PIN** as an identity provider. Create a self-hosted Access application covering only the production monitor's `/api/login` path. Configure an **Allow** policy with the Everyone selector and One-time PIN as the only login method. This still requires email verification. Do not use Bypass or Service Auth. Email verification only allows users to request access; the application enforces owner approval before running jobs or editing anything. If using a custom hostname, configure that same hostname in Access and use it for staff sign-in. See https://developers.cloudflare.com/cloudflare-one/access-controls/policies/ and https://developers.cloudflare.com/cloudflare-one/identity/idp-integration/one-time-pin/ .
The other API paths validate the signed `CF_Authorization` cookie themselves; leave `/api/config` publicly reachable so the sign-in button can load. For a `pages.dev` hostname, first enable the project’s preview Access policy, then edit its hostname to the production project hostname and restrict its path to `/api/login`; do not protect the entire public monitor. See https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain .

6. Copy the application's AUD into `ACCESS_AUD` and redeploy using the existing collect workflow. Dashboard binding changes apply to the next deployment. The existing `wrangler pages deploy public` command bundles the repository's `functions/` directory automatically.
7. Visit `/manage`, sign in using the owner email and verify the owner approval panel appears. A staff member signs in with their email, enters their name, and selects **Request access**. The owner sees the request and selects **Approve**. Revocation takes effect on the next API request. No approval emails are sent; staff revisit the page to see their status.

Keep the D1 database and email records private. Do not expose D1 via a public endpoint. There is no fallback that accepts an unverified email header. If setup is missing or invalid, controls stay disabled.

## Verification

- An unsigned API request must fail; a signed but unapproved user can only view their status and request access.
- Sign in as an approved user, select one source and run a collection. Confirm the job appears, steps show progress and only that source's timestamps change.
- Run a 10-page archive expansion, then search for a faculty name or journal mentioned within an article. Coverage reports how many article bodies were indexed.
- Edit one source and save. A stale editor receives a conflict rather than overwriting another person's changes.
- Sign in as the owner to approve, deny or revoke a request. Staff never receive the repository token.

## Archive search

Archive jobs now index the readable article body, keywords, authors and journal/DOI metadata when available. Person and journal filters search exact phrases across indexed text and metadata; they do not assert that a named person is faculty or that a journal mention is a formal publication citation. Keyword search supports all/any words, quoted phrases and `-excluded` terms, case/accent normalization, and word boundaries (AI does not match "said"). Dates are publication dates unless marked "Seen". Undated stories are excluded from date-filtered results unless explicitly included.

Crawls remain bounded to 10, 25 or 50 listing pages per address and 500 article reads per run, with 80,000 characters per indexed article. Indexed bodies are cached and retained across later listing refreshes. Repeat runs index remaining unread articles; blocked articles are reported as headline/summary-only. This is best-effort discovery, not a guarantee of every story ever published. The earliest date limits how far back to traverse; the through-date is a search filter on saved results.

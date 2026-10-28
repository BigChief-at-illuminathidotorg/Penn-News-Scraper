# Penn News Monitor — online collection edition

## Staff
Open the website. Search, choose a week, and follow headlines. No software installation or Python commands required. Import and Export remain available for saved JSON snapshots. Imported data stays in this browser, pauses automatic updates, and is replaced by shared results only when Check for updates succeeds. “Check for updates” retrieves the published collection; it does not start the scraper. The included help page explains warnings and source-change requests.

## Hosting design
GitHub Actions runs the existing Python/Chromium scraper online. Cloudflare Pages serves only the public/ folder. The supplied snapshot is starter data, not proof that an online run has succeeded. It contains 52 sources, 37 with articles. Some sources require further tuning or may block hosted browsers.

## One-time owner setup (browser-based)
1. Create a private GitHub repository, with main as its default branch. Upload this package's contents, including .github/workflows/collect.yml. If the upload picker hides .github, create .github/workflows/collect.yml using GitHub's Create new file screen and paste its contents. Do not upload the outer folder as an extra directory level.
2. In the existing Cloudflare account, verify the Pages project is named penn-news-monitor and check its production branch. The workflow assumes main. Back up or retain the current production deployment for rollback. If the project already has automatic Git builds, disable those for this repository to avoid deploying before collection completes.
3. Create a Cloudflare API token with Account → Cloudflare Pages → Edit, restricted to the target account. In GitHub repository Settings → Secrets and variables → Actions, add secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Never put the token in website code or chat. If the Pages project name differs, add repository variable PAGES_PROJECT with its actual name.
4. Allow GitHub Actions and workflow repository write access. Branch protection must permit this workflow to save the generated snapshot on main, or the persistence step will fail. Run Actions → Collect and publish Penn news → Run workflow.
5. Wait for collection and deployment to succeed. Confirm the live site has a new collection timestamp, clickable articles, and meaningful source warnings. Verify source coverage from the GitHub log before treating the monitor as operational.
6. Enable GitHub failure notifications for the owner. Schedule: 11:17 and 17:17 UTC weekdays (7:17 a.m./1:17 p.m. Eastern daylight time; 6:17 a.m./12:17 p.m. Eastern standard time). Scheduled jobs can be delayed. Private repositories have Actions usage limits; check the account's allowance before enabling ongoing runs. Public repositories can have scheduled workflows disabled after 60 days of inactivity.

No Python or Node installation is needed on anyone's work machine. They are installed on the hosted runner. An owner still needs to perform this initial account configuration.

## Addresses
The workflow targets the existing penn-news-monitor.pages.dev project. Prefer news.illuminathi.org as a custom domain so the main personal website stays intact. Add that hostname through the Pages project's Custom domains screen first, then follow Cloudflare's DNS instructions. Do not simply replace illuminathi.org DNS. Hosting under illuminathi.org/news/ requires integration with its current hosting platform; its configuration has not been inspected.

## Source maintenance
Edit the central sites.js file in the repository; copy it to public/sites.js when changing the source list. The scraper currently reads newsUrl/feedUrl, not magazineUrl. The dashboard deliberately removes local-only source editing because those edits would not change online collection. A future authenticated source editor would be a separate feature.

## Failure behavior and limits
Failed/empty sources retain prior articles with a warning and their original source sync time. If every source returns no articles, publication fails and the old deployed collection remains. If deployment fails, the old site remains live; retry the workflow after fixing the failure. The page warns when its collection is over 30 hours old, including weekends. Results are bounded by the scraper's per-source limit; this is not an indefinite archive. Source selectors, date extraction and hosted-runner access still need live validation.

## Verification completed
JavaScript syntax check and offline snapshot-merge tests passed. No successful live scrape, browser visual QA, account connection, or production deployment has been verified.

## References
https://developers.cloudflare.com/pages/get-started/direct-upload/
https://developers.cloudflare.com/pages/configuration/custom-domains/
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

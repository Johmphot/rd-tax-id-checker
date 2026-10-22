# RD Tax ID Checker

Check a 13-digit Thai Tax ID against the Revenue Department's public web services:

- **VAT Service**: is the Tax ID VAT-registered? Returns registered name, branch and address.
- **TIN Service**: does the Tax ID exist at all?

Spec: https://www.rd.go.th/42535.html (public login `anonymous` / `anonymous`).

**Live page:** https://johmphot.github.io/rd-tax-id-checker/

## What's new (v1.2.2)

- The full registered name (for example "บริษัท … จำกัด") now sits next to the VAT-registered badge.
- Branch shows "00000 (สำนักงานใหญ่)" for the head office and "00001 (สาขา 1)" for a branch.
- New Advanced mode example: a branch office (captured reply for CP ALL, branch 1).

## v1.2.1

- Address shown in Thai order with Thai labels: อาคาร, ห้อง, ชั้น, หมู่บ้าน, หมู่, ซอย, ถนน, then แขวง/เขต for Bangkok or ตำบล/อำเภอ for other provinces, then province and postcode.

## v1.2.0

- Simpler page: type the Tax ID, choose what you want to know ("Is it VAT-registered?" or "Does the Tax ID exist?"), press **Check with RD**, read the result.
- The request, the raw reply box, the examples and the version moved behind the **Advanced mode** switch (remembered per browser).
- A result clears when the Tax ID is edited, and Enter in the Tax ID box runs the check.

## v1.1.0

- Hosted version: the page on GitHub Pages calls a small Cloudflare Worker that forwards to the Revenue Department.
- Rate limit: 3 checks per second per client, in the Worker and in the local relay.
- Page reads the Worker's address from `config.js`.

## How it fits together

The Revenue Department's service sends no CORS headers, so a browser page cannot call it directly. A relay does the call:

| Where | Relay | How to run |
|---|---|---|
| GitHub Pages (this repo's page) | `worker/`, a Cloudflare Worker | deploy once, see below |
| One machine, offline | `relay.mjs`, Node 18+, no dependencies | `node relay.mjs`, open http://127.0.0.1:8787 |

The Worker answers only requests from the Pages address, accepts only 13-digit input, and allows 3 requests per second per client IP. The data is public registry information.

## Deploy the Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

Copy the Worker's address from the output (`https://rd-tax-id-relay.<account>.workers.dev`) into `config.js`:

```js
window.RD_API_BASE = "https://rd-tax-id-relay.<account>.workers.dev";
```

Commit and push; Pages updates in a minute. If you host the page on another address, change `ALLOWED_ORIGIN` in `worker/wrangler.toml` and redeploy.

## Notes

- A result is true on the day of the check. A VAT registration can lapse, and the service has no stated uptime, so do not block anything on a failed call.
- `ServiceArr` and `ServiceTINArr` (several Tax IDs per call) are not used here.

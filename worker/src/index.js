// Relay for the RD Tax ID Checker on Cloudflare Workers.
// GET /api/check?svc=vat|tin&tin=<13 digits> -> raw SOAP reply from the Revenue Department.
// Limits: browser calls only from ALLOWED_ORIGIN; 13-digit input only; 3 requests per second per client IP.

const BASE = "https://rdws.rd.go.th/serviceRD3";
const SOAP = 'xmlns:soap="http://www.w3.org/2003/05/soap-envelope"';
const LIMIT = 3;
const WINDOW_MS = 1000;

const SERVICES = {
  vat: {
    url: `${BASE}/vatserviceRD3.asmx`,
    body: tin => `<soap:Envelope ${SOAP} xmlns:vat="${BASE}/vatserviceRD3"><soap:Header/><soap:Body><vat:Service><vat:username>anonymous</vat:username><vat:password>anonymous</vat:password><vat:TIN>${tin}</vat:TIN><vat:Name></vat:Name><vat:ProvinceCode>0</vat:ProvinceCode><vat:BranchNumber>0</vat:BranchNumber><vat:AmphurCode>0</vat:AmphurCode></vat:Service></soap:Body></soap:Envelope>`
  },
  tin: {
    url: `${BASE}/checktinpinservice.asmx`,
    body: tin => `<soap:Envelope ${SOAP} xmlns:chec="${BASE}/checktinpinservice"><soap:Header/><soap:Body><chec:ServiceTIN><chec:username>anonymous</chec:username><chec:password>anonymous</chec:password><chec:TIN>${tin}</chec:TIN></chec:ServiceTIN></soap:Body></soap:Envelope>`
  }
};

// One instance per client IP; keeps the timestamps of its last second of requests.
export class RateLimiter {
  constructor() { this.hits = []; }
  async fetch() {
    const now = Date.now();
    this.hits = this.hits.filter(t => now - t < WINDOW_MS);
    if (this.hits.length >= LIMIT) return new Response("limited", { status: 429 });
    this.hits.push(now);
    return new Response("ok");
  }
}

function reply(env, status, type, body, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Vary": "Origin",
      ...extra
    }
  });
}
const json = (env, status, error, extra) => reply(env, status, "application/json", JSON.stringify({ error }), extra);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/api/check") return json(env, 404, "Not found");
    if (req.method !== "GET") return json(env, 405, "GET only");
    if (req.headers.get("Origin") !== env.ALLOWED_ORIGIN) return json(env, 403, "This service only answers the Tax ID Checker page");

    const svc = SERVICES[url.searchParams.get("svc")];
    const tin = url.searchParams.get("tin") || "";
    if (!svc) return json(env, 400, "svc must be vat or tin");
    if (!/^\d{13}$/.test(tin)) return json(env, 400, "tin must be exactly 13 digits");

    const ip = req.headers.get("CF-Connecting-IP") || "unknown";
    const verdict = await env.LIMITER.get(env.LIMITER.idFromName(ip)).fetch("https://limiter/");
    if (verdict.status === 429) return json(env, 429, "Too many checks, max 3 per second", { "Retry-After": "1" });

    try {
      const r = await fetch(svc.url, {
        method: "POST",
        headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
        body: svc.body(tin),
        signal: AbortSignal.timeout(20000)
      });
      return reply(env, 200, "application/xml; charset=utf-8", await r.text());
    } catch (e) {
      return json(env, 502, "Could not reach the Revenue Department: " + e.message);
    }
  }
};

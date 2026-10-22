#!/usr/bin/env node
// Local relay for the RD Tax ID Checker. No dependencies, Node 18+.
//   node relay.mjs            then open http://127.0.0.1:8787
// Serves index.html and forwards GET /api/check?svc=vat|tin&tin=<13 digits>
// to the Revenue Department's public SOAP services (anonymous login), returning the raw XML reply.
// Listens on 127.0.0.1 only. Nothing is stored or logged beyond the status line.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 8787;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, "index.html");
const BASE = "https://rdws.rd.go.th/serviceRD3";
const SOAP = 'xmlns:soap="http://www.w3.org/2003/05/soap-envelope"';

const SERVICES = {
  vat: {
    url: `${BASE}/vatserviceRD3.asmx`,
    body: (tin, branch = 0) => `<soap:Envelope ${SOAP} xmlns:vat="${BASE}/vatserviceRD3"><soap:Header/><soap:Body><vat:Service><vat:username>anonymous</vat:username><vat:password>anonymous</vat:password><vat:TIN>${tin}</vat:TIN><vat:Name></vat:Name><vat:ProvinceCode>0</vat:ProvinceCode><vat:BranchNumber>${branch}</vat:BranchNumber><vat:AmphurCode>0</vat:AmphurCode></vat:Service></soap:Body></soap:Envelope>`
  },
  tin: {
    url: `${BASE}/checktinpinservice.asmx`,
    body: tin => `<soap:Envelope ${SOAP} xmlns:chec="${BASE}/checktinpinservice"><soap:Header/><soap:Body><chec:ServiceTIN><chec:username>anonymous</chec:username><chec:password>anonymous</chec:password><chec:TIN>${tin}</chec:TIN></chec:ServiceTIN></soap:Body></soap:Envelope>`
  }
};

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

// At most 3 checks per second (sliding window), same limit as the hosted Worker.
const LIMIT = 3, WINDOW_MS = 1000;
let hits = [];
function allowed() {
  const now = Date.now();
  hits = hits.filter(t => now - t < WINDOW_MS);
  if (hits.length >= LIMIT) return false;
  hits.push(now);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method !== "GET") return send(res, 405, "text/plain", "GET only");
  if (url.pathname === "/config.js") return send(res, 200, "text/javascript", "// local relay: same-origin API\n");

  if (url.pathname === "/" || url.pathname === "/index.html") {
    try { return send(res, 200, "text/html; charset=utf-8", fs.readFileSync(PAGE)); }
    catch { return send(res, 500, "text/plain", "index.html not found next to this script"); }
  }

  if (url.pathname === "/api/check") {
    const svc = SERVICES[url.searchParams.get("svc")];
    const tin = url.searchParams.get("tin") || "";
    if (!svc) return send(res, 400, "application/json", JSON.stringify({ error: "svc must be vat or tin" }));
    if (!/^\d{13}$/.test(tin)) return send(res, 400, "application/json", JSON.stringify({ error: "tin must be exactly 13 digits" }));
    const branchParam = url.searchParams.get("branch");
    if (branchParam !== null && !/^\d{1,5}$/.test(branchParam)) return send(res, 400, "application/json", JSON.stringify({ error: "branch must be 1 to 5 digits" }));
    if (!allowed()) return send(res, 429, "application/json", JSON.stringify({ error: "Too many checks, max 3 per second" }));
    try {
      const r = await fetch(svc.url, {
        method: "POST",
        headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
        body: svc.body(tin, branchParam === null ? 0 : Number(branchParam)),
        signal: AbortSignal.timeout(20000)
      });
      const xml = await r.text();
      console.log(`${new Date().toISOString()} ${url.searchParams.get("svc")} -> ${r.status}`);
      return send(res, 200, "application/xml; charset=utf-8", xml);
    } catch (e) {
      console.log(`${new Date().toISOString()} ${url.searchParams.get("svc")} failed: ${e.message}`);
      return send(res, 502, "application/json", JSON.stringify({ error: "Could not reach the Revenue Department: " + e.message }));
    }
  }
  send(res, 404, "text/plain", "Not found");
});

server.listen(PORT, "127.0.0.1", () => console.log(`RD Tax ID Checker: http://127.0.0.1:${PORT}`));

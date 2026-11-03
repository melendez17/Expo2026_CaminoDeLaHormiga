// Run ONLY against staging you control, with synthetic people and one-time access links.
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import crypto from "k6/crypto";
const base = (__ENV.BASE_URL || "").replace(/\/$/, "");
const vus = Number(__ENV.VUS || 100);
if (
  __ENV.ALLOW_STAGING_LOAD !== "true" ||
  !/^https?:\/\//.test(base) ||
  !__ENV.ACCESS_FILE ||
  !Number.isInteger(vus) ||
  vus < 1 ||
  vus > 1500
) {
  throw Error(
    "Require ALLOW_STAGING_LOAD=true, your staging BASE_URL, ACCESS_FILE and VUS 1..1500.",
  );
}
const access = new SharedArray("private-synthetic-access", () =>
  JSON.parse(open(__ENV.ACCESS_FILE)),
);
if (access.length < vus)
  throw Error(
    "One unique synthetic participant credential per virtual user is required.",
  );
export const options = {
  noCookiesReset: true,
  stages: [
    { duration: "2m", target: vus },
    { duration: "5m", target: vus },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};
let initialized = false;
function uuid() {
  const b = new Uint8Array(crypto.randomBytes(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const s = Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
function post(path, body) {
  return http.post(base + "/api/v1/" + path, JSON.stringify(body), {
    headers: { "Content-Type": "application/json", Origin: base },
    redirects: 0,
    tags: { name: "POST /api/v1/" + path },
  });
}
export default function () {
  if (!initialized) {
    const activation = post("auth/activate", {
      credential: access[__VU - 1].access.credential,
    });
    if (!check(activation, { "access activated": (r) => r.status === 200 })) {
      sleep(30);
      return;
    }
    const started = post("me/start", { requestId: uuid() });
    if (!check(started, { "route started": (r) => r.status === 200 })) {
      sleep(30);
      return;
    }
    initialized = true;
  }
  const state = http.get(base + "/api/v1/me", {
    tags: { name: "GET /api/v1/me" },
  });
  check(state, { "own state available": (r) => r.status === 200 });
  if (__ITER % 3 === 0) {
    const ranking = http.get(base + "/api/v1/leaderboard?limit=25", {
      tags: { name: "GET /api/v1/leaderboard" },
    });
    check(ranking, { "ranking available": (r) => r.status === 200 });
  }
  if (__ITER % 6 === 0)
    http.get(base + "/api/v1/catalog", {
      tags: { name: "GET /api/v1/catalog" },
    });
  sleep(10 + Math.random() * 10);
}

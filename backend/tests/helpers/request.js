// ─── HTTP Test Helper ─────────────────────────────────────────────────────────
// Minimal HTTP request helper using Node's built-in `http` module.
// Replaces the `supertest` package — no extra dependencies needed.
// Spins up the Express app on a random free port, fires one request,
// returns the response, then closes the server.

const http = require("http");

/**
 * @param {import('express').Application} app
 * @param {string} method  — "GET" | "POST" | "PATCH" | "DELETE"
 * @param {string} path    — e.g. "/auth/register"
 * @param {{ headers?: object, body?: object }} [opts]
 * @returns {Promise<{ status: number, body: any }>}
 */
async function req(app, method, path, opts = {}) {
  const { headers = {}, body } = opts;
  // Serialize body to JSON string if provided
  const bodyStr = body != null ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    // Port 0 → OS picks an available ephemeral port automatically
    const server = http.createServer(app).listen(0, "127.0.0.1", () => {
      const { port } = server.address();

      const options = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          // Only set Content-Length when there is a body
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
          ...headers,
        },
      };

      const httpReq = http.request(options, (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          server.close();
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch  { resolve({ status: res.statusCode, body: raw }); }
        });
      });

      httpReq.on("error", (err) => { server.close(); reject(err); });
      if (bodyStr) httpReq.write(bodyStr);
      httpReq.end();
    });
  });
}

module.exports = { req };

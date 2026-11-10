import http from "node:http";

// One HTTP server per test file, bound to 127.0.0.1 explicitly - pass it to
// supertest as request(server) instead of request(app).
//
// supertest's request(app) starts a fresh server per request with
// app.listen(0), which on macOS binds the IPv6 wildcard (::), then connects
// to 127.0.0.1:<port>. If another process already holds 127.0.0.1:<port>
// (IPv4 only), that bind still succeeds and the request lands on the other
// process instead: "Parse Error: Expected HTTP/" or a stray 404. Binding
// 127.0.0.1 only ever gets a port that is actually free there.
export async function listenLocal(handler: http.RequestListener): Promise<http.Server> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  return server;
}

export function closeServer(server: http.Server | undefined): Promise<void> {
  if (!server) return Promise.resolve();
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

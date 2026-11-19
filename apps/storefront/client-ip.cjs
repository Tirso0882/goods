// Preloaded by the storefront's server (`node --require ./client-ip.cjs`, see
// the Dockerfile) so the chat's rate limit can trust X-Forwarded-For.
//
// Next.js passes on whatever X-Forwarded-For a client sends, and fills it in
// from the connection only when it is missing, so on its own the header is the
// client's to pick. This appends, on every request, the address the server's
// own socket saw, the way a proxy does. Whatever a client writes stays to the
// left of that, where the chat route never looks unless it is told that many
// proxies of ours stand in front (CHAT_TRUSTED_PROXIES, src/lib/chat/client-ip.ts).

const http = require("node:http")

const emit = http.Server.prototype.emit

http.Server.prototype.emit = function (event, request, ...rest) {
  if (event === "request" && request && request.headers) {
    const peer = (request.socket && request.socket.remoteAddress) || "unknown"
    const given = request.headers["x-forwarded-for"]
    request.headers["x-forwarded-for"] = given ? `${given}, ${peer}` : peer
  }
  return emit.call(this, event, request, ...rest)
}

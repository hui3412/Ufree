// Test infrastructure only. No account, schedule, or authentication routes.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const headers = { "Cache-Control": "no-store" };
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, {
        status: 405, headers: { ...headers, Allow: "GET" },
      });
    }
    if (pathname !== "/" && pathname !== "/health") {
      return Response.json({ error: "Not found" }, { status: 404, headers });
    }
    try {
      const result = await env.DB.prepare("SELECT 1 AS ok").first();
      if (result?.ok !== 1) throw new Error("Database check failed");
      return Response.json({ service: "youfreetest", status: "ok", database: "connected", features: "not-installed" }, { headers });
    } catch {
      return Response.json({ service: "youfreetest", status: "unavailable", database: "unavailable" }, { status: 503, headers });
    }
  },
};

use axum::{Router, response::Html, routing::get};

use crate::api::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(index))
        .route("/ui", get(index))
}

async fn index() -> Html<&'static str> {
    Html(INDEX_HTML)
}

const INDEX_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dokuru Agent</title>
  <style>
    :root { color-scheme: dark; --bg:#080808; --card:#171717; --line:rgba(255,255,255,.13); --muted:#a3a3a3; --blue:#0ea5e9; --red:#ff3b4f; --green:#22c55e; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; background:var(--bg); color:#f5f5f5; font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    body:before { content:""; position:fixed; inset:0; pointer-events:none; background-image:linear-gradient(to right,rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.018) 1px,transparent 1px); background-size:64px 64px; }
    main { position:relative; width:min(1180px, calc(100% - 32px)); margin:0 auto; padding:42px 0; }
    header { display:flex; align-items:center; justify-content:space-between; gap:18px; margin-bottom:28px; }
    h1 { margin:0; font-size:38px; letter-spacing:-.04em; }
    p { margin:0; color:var(--muted); }
    button, input { font:inherit; }
    button { border:1px solid var(--line); background:#111; color:#fff; border-radius:12px; padding:11px 16px; font-weight:700; cursor:pointer; }
    button.primary { border-color:rgba(14,165,233,.45); background:var(--blue); }
    input { width:100%; border:1px solid var(--line); background:#101010; color:#fff; border-radius:12px; padding:12px 14px; outline:none; }
    input:focus { border-color:rgba(14,165,233,.65); }
    .brand { display:flex; align-items:center; gap:14px; }
    .logo { width:46px; height:46px; border:2px solid var(--blue); border-radius:14px; display:grid; place-items:center; color:var(--blue); font-weight:900; }
    .card { border:1px solid var(--line); background:rgba(23,23,23,.94); border-radius:22px; box-shadow:0 18px 80px rgba(0,0,0,.32); }
    .auth { display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:16px; margin-bottom:18px; }
    .status { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:14px; }
    .dot { width:9px; height:9px; border-radius:999px; background:var(--red); box-shadow:0 0 16px currentColor; color:var(--red); }
    .dot.up { background:var(--green); color:var(--green); }
    .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin:18px 0; }
    .metric { padding:18px; }
    .metric span { display:block; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.14em; }
    .metric strong { display:block; margin-top:8px; font-size:30px; letter-spacing:-.04em; }
    .panel { padding:20px; margin-top:14px; }
    .panel-head { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:16px; }
    .mono { font-family:"SF Mono", ui-monospace, Menlo, Consolas, monospace; }
    .muted { color:var(--muted); }
    .error { color:var(--red); }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:12px 8px; border-top:1px solid var(--line); text-align:left; font-size:14px; }
    th { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.13em; }
    .badge { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; padding:4px 9px; font-size:12px; }
    .badge.running { color:var(--green); border-color:rgba(34,197,94,.35); background:rgba(34,197,94,.08); }
    .badge.down { color:var(--red); border-color:rgba(255,59,79,.35); background:rgba(255,59,79,.08); }
    @media (max-width:800px) { header,.auth { grid-template-columns:1fr; flex-direction:column; align-items:stretch; } .grid { grid-template-columns:repeat(2,1fr); } h1 { font-size:31px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand">
        <div class="logo">D</div>
        <div>
          <h1>Dokuru Agent</h1>
          <p>Local Docker security dashboard</p>
        </div>
      </div>
      <div class="status"><span id="statusDot" class="dot"></span><span id="statusText">Disconnected</span></div>
    </header>

    <section class="card auth">
      <input id="tokenInput" type="password" autocomplete="current-password" placeholder="Paste agent token" />
      <div style="display:flex; gap:10px;">
        <button id="saveToken">Connect</button>
        <button id="refresh" class="primary">Refresh</button>
      </div>
    </section>

    <section class="grid">
      <div class="card metric"><span>Containers</span><strong id="containersTotal">-</strong></div>
      <div class="card metric"><span>Images</span><strong id="imagesTotal">-</strong></div>
      <div class="card metric"><span>Volumes</span><strong id="volumesTotal">-</strong></div>
      <div class="card metric"><span>Networks</span><strong id="networksTotal">-</strong></div>
    </section>

    <section class="card panel">
      <div class="panel-head">
        <div><h2 style="margin:0;">Host</h2><p id="hostMeta">Waiting for Docker info...</p></div>
        <span id="dockerVersion" class="badge mono">Docker -</span>
      </div>
      <div id="message" class="muted"></div>
    </section>

    <section class="card panel">
      <div class="panel-head">
        <div><h2 style="margin:0;">Containers</h2><p>Live snapshot from this agent</p></div>
        <span id="containerCount" class="badge">0 listed</span>
      </div>
      <div style="overflow:auto;">
        <table>
          <thead><tr><th>Name</th><th>Image</th><th>State</th><th>Status</th></tr></thead>
          <tbody id="containersTable"><tr><td colspan="4" class="muted">No data yet.</td></tr></tbody>
        </table>
      </div>
    </section>
  </main>

  <script>
    const tokenKey = "dokuru_agent_token";
    const tokenInput = document.getElementById("tokenInput");
    const statusDot = document.getElementById("statusDot");
    const statusText = document.getElementById("statusText");
    const message = document.getElementById("message");
    let ws;

    tokenInput.value = localStorage.getItem(tokenKey) || "";

    function token() { return tokenInput.value.trim(); }
    function headers() { return token() ? { Authorization: `Bearer ${token()}` } : {}; }
    function setStatus(up, text) { statusDot.className = up ? "dot up" : "dot"; statusText.textContent = text; }
    function setMessage(text, error = false) { message.textContent = text; message.className = error ? "error" : "muted"; }
    function fmtBytes(bytes) { const gb = bytes / 1024 / 1024 / 1024; return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 / 1024)} MB`; }

    async function api(path) {
      const res = await fetch(path, { headers: headers() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      return body.data ?? body;
    }

    function applyInfo(info) {
      document.getElementById("containersTotal").textContent = info.containers?.total ?? "-";
      document.getElementById("imagesTotal").textContent = info.images ?? "-";
      document.getElementById("volumesTotal").textContent = info.volumes ?? "-";
      document.getElementById("networksTotal").textContent = info.networks ?? "-";
      document.getElementById("dockerVersion").textContent = `Docker ${info.docker_version || "-"}`;
      document.getElementById("hostMeta").textContent = `${info.hostname || "unknown host"} · ${info.os || "unknown OS"} · ${info.cpu_count || 0} CPU · ${fmtBytes(info.memory_total || 0)}`;
    }

    function applyContainers(containers) {
      document.getElementById("containerCount").textContent = `${containers.length} listed`;
      const rows = containers.map((c) => {
        const name = (c.names && c.names[0] || c.id || "-").replace(/^\//, "");
        const running = c.state === "running";
        return `<tr><td class="mono">${escapeHtml(name)}</td><td>${escapeHtml(c.image || "-")}</td><td><span class="badge ${running ? "running" : "down"}">${escapeHtml(c.state || "unknown")}</span></td><td class="muted">${escapeHtml(c.status || "-")}</td></tr>`;
      });
      document.getElementById("containersTable").innerHTML = rows.join("") || '<tr><td colspan="4" class="muted">No containers found.</td></tr>';
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;" }[c]));
    }

    async function refresh() {
      if (!token()) { setMessage("Paste the agent token first.", true); return; }
      localStorage.setItem(tokenKey, token());
      setMessage("Loading Docker snapshot...");
      try {
        const [info, containers] = await Promise.all([
          api("/api/v1/info"),
          api("/docker/containers?all=true"),
        ]);
        applyInfo(info);
        applyContainers(containers);
        setStatus(true, "Connected");
        setMessage("Snapshot loaded. WebSocket will keep Docker info updated.");
        connectWs();
      } catch (err) {
        setStatus(false, "Disconnected");
        setMessage(err.message || "Failed to load agent data", true);
      }
    }

    function connectWs() {
      if (!token()) return;
      if (ws) ws.close();
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${scheme}://${location.host}/ws?token=${encodeURIComponent(token())}`);
      ws.onopen = () => setStatus(true, "Live");
      ws.onclose = () => setStatus(false, "Disconnected");
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "info:update") applyInfo(msg.data);
          if (msg.type === "info:error") setMessage(msg.message, true);
        } catch {}
      };
    }

    document.getElementById("saveToken").addEventListener("click", refresh);
    document.getElementById("refresh").addEventListener("click", refresh);
    tokenInput.addEventListener("keydown", (event) => { if (event.key === "Enter") refresh(); });
    if (token()) refresh();
  </script>
</body>
</html>"#;

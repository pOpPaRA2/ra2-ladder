// docs/matches.js
// Renders docs/matches.json (created by export_ladder_strong.py)

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

function fmtDelta(n) {
  if (n === null || n === undefined) return '<span class="muted">—</span>';
  const v = Number(n);
  const sign = v >= 0 ? "+" : "";
  return `<span class="pill">${sign}${v}</span>`;
}

function playerLink(id) {
  return `<a href="./?user_id=${encodeURIComponent(id)}">#${esc(id)}</a>`;
}

function safeTime(s) {
  if (!s) return "—";
  return esc(s).replace("T", " ").replace("+00:00"," UTC");
}

async function load() {
  const meta = document.getElementById("meta");
  const tbody = document.getElementById("rows");
  const q = document.getElementById("q");

  let data;
  try {
    const res = await fetch("./matches.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    meta.textContent = "Failed to load matches.json (did you export + push?)";
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Error: ${esc(e)}</td></tr>`;
    return;
  }

  const matches = Array.isArray(data.matches) ? data.matches : [];
  meta.textContent = `Generated: ${data.generated_at ?? "—"} • Showing: ${matches.length} matches`;

  function render(filter) {
    const f = (filter || "").trim().toLowerCase();
    const rows = matches.filter(m => {
      if (!f) return true;
      const blob = [
        m.match_id, m.winner_id, m.loser_id,
        m.score, m.format
      ].map(x => String(x ?? "")).join(" ").toLowerCase();
      return blob.includes(f);
    });

    tbody.innerHTML = rows.map(m => {
      const mid = m.match_id ?? "—";
      const when = safeTime(m.timestamp || m.confirmed_ts || m.completed_ts);
      const score = m.score ?? "—";
      const winId = m.winner_id ?? "—";
      const loseId = m.loser_id ?? "—";

      const winDelta = (m.winner_delta ?? null);
      const loseDelta = (m.loser_delta ?? null);

      const mmrCell = (winDelta !== null || loseDelta !== null)
        ? `${fmtDelta(winDelta)} / ${fmtDelta(loseDelta)}`
        : '<span class="muted">—</span>';

      return `
        <tr>
          <td><span class="pill">#${esc(mid)}</span></td>
          <td class="muted">${when}</td>
          <td>${playerLink(winId)} <span class="muted">${esc(m.winner_class ?? "")}</span></td>
          <td>${playerLink(loseId)} <span class="muted">${esc(m.loser_class ?? "")}</span></td>
          <td>${esc(score)}</td>
          <td>${mmrCell}</td>
        </tr>
      `;
    }).join("");

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No matches found.</td></tr>`;
    }
  }

  render("");
  q.addEventListener("input", () => render(q.value));
}

load();

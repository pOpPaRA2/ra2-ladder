import {
  validateLeaderboard, validateMatches, validatePlayers, validateHof, validateAudit
} from "./validate.js";
import { renderTop10Chart, renderEloLine } from "./charts.js";

function bust(url){ return url + "?v=" + Date.now(); }

function showError(msg){
  const box = document.getElementById("errorBox");
  if(!box) return;
  box.style.display = "block";
  box.textContent = msg;
}
function hideError(){
  const box = document.getElementById("errorBox");
  if(!box) return;
  box.style.display = "none";
  box.textContent = "";
}

export function displayName(p){
  if (p.display_name && String(p.display_name).trim()) return p.display_name;
  if (p.username && String(p.username).trim()) return p.username;
  return String(p.user_id);
}

export function normalizeClass(c){ return String(c ?? "").trim().toUpperCase(); }
export function rankClassName(c){
  const cc = normalizeClass(c);
  if (cc === "S") return "rank-s";
  if (cc === "A+") return "rank-aplus";
  if (cc === "A") return "rank-a";
  if (cc === "B+") return "rank-bplus";
  if (cc === "B") return "rank-b";
  if (cc === "B-") return "rank-bminus";
  if (cc === "C+") return "rank-cplus";
  if (cc === "C") return "rank-c";
  if (cc === "C-") return "rank-cminus";
  return "rank-unk";
}
export function classBadge(c){
  const cc = normalizeClass(c) || "—";
  return `<span class="badge ${rankClassName(cc)}"><span class="badge-dot"></span>${cc}</span>`;
}

export async function loadJson(path){
  const res = await fetch(bust(path), { cache:"no-store" });
  return await res.json();
}

export async function loadLeaderboard(path){
  const data = await loadJson(path);
  const err = validateLeaderboard(data);
  if(err) throw new Error(err);
  return data;
}

export function renderLeaderboardPage({ leaderboardPath }){
  const meta = document.getElementById("meta");
  const input = document.getElementById("q");
  const tbody = document.getElementById("rows");

  function renderTable(data){
    const ft = (input.value || "").trim().toLowerCase();
    tbody.innerHTML = "";

    (data.players || [])
      .filter(p =>
        String(p.user_id).includes(ft) ||
        String(p.class).toLowerCase().includes(ft) ||
        String(p.display_name ?? "").toLowerCase().includes(ft) ||
        String(p.username ?? "").toLowerCase().includes(ft)
      )
      .forEach((p, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${i+1}</td>
          <td>
            <a class="btn" style="padding:6px 10px" href="./player.html?id=${encodeURIComponent(p.user_id)}">
              ${displayName(p)}
            </a>
          </td>
          <td>${classBadge(p.class)}</td>
          <td>${p.rating}</td>
          <td>${p.wins}</td>
          <td>${p.losses}</td>
          <td>${p.games}</td>
          <td>${p.win_streak}</td>
          <td>${p.loss_streak}</td>
          <td>${p.dodges}</td>
          <td class="muted">${p.last_match ?? ""}</td>
        `;
        tbody.appendChild(tr);
      });

    renderTop10Chart("chartTop10", data.players, displayName);
  }

  async function tick(){
    try{
      const data = await loadLeaderboard(leaderboardPath);
      hideError();
      meta.textContent = `Players: ${(data.players||[]).length} • Updated: ${data.generated_at ?? "unknown"}`;
      renderTable(data);
    }catch(e){
      showError(String(e.message || e));
    }
  }

  input?.addEventListener("input", tick);
  tick();
  setInterval(tick, 30000);
}

export async function renderPlayerPage(){
  const id = new URLSearchParams(location.search).get("id");
  const nameEl = document.getElementById("pName");
  const metaEl = document.getElementById("pMeta");
  const mBody = document.getElementById("mRows");

  if(!id){ showError("Missing ?id="); return; }

  try{
    const [lb, matches, players] = await Promise.all([
      loadLeaderboard("./leaderboard.json"),
      loadJson("./matches.json"),
      loadJson("./players.json"),
    ]);

    const errM = validateMatches(matches); if(errM) throw new Error(errM);
    const errP = validatePlayers(players); if(errP) throw new Error(errP);

    const me = (lb.players||[]).find(p => String(p.user_id) === String(id));
    if(!me) throw new Error("Player not found in leaderboard.json");

    hideError();
    nameEl.textContent = displayName(me);
    metaEl.textContent = `Class ${normalizeClass(me.class)||"—"} • Rating ${me.rating} • W-L ${me.wins}-${me.losses} • Last ${me.last_match ?? "—"}`;

    // ELO series (preferred)
    const seriesObj = (players.players||[]).find(p => String(p.user_id) === String(id));
    if(seriesObj?.eloSeries?.length){
      renderEloLine("eloChart", seriesObj.eloSeries);
    } else {
      // fallback: build from matches
      const ms = (matches.matches||[])
        .filter(m => String(m.p1_id)===String(id) || String(m.p2_id)===String(id))
        .sort((a,b)=>String(a.ts).localeCompare(String(b.ts)));
      const series = ms.map(m => [String(m.ts).slice(0,10), Number(m.p1_id==id ? m.p1_after : m.p2_after)]);
      renderEloLine("eloChart", series);
    }

    // Match history
    const list = (matches.matches||[])
      .filter(m => String(m.p1_id)===String(id) || String(m.p2_id)===String(id))
      .sort((a,b)=>String(b.ts).localeCompare(String(a.ts)))
      .slice(0,30);

    mBody.innerHTML = "";
    for(const m of list){
      const isP1 = String(m.p1_id)===String(id);
      const oppId = isP1 ? m.p2_id : m.p1_id;
      const oppName = isP1 ? m.p2_name : m.p1_name;
      const before = isP1 ? m.p1_before : m.p2_before;
      const after  = isP1 ? m.p1_after  : m.p2_after;
      const delta = Number(after) - Number(before);
      const win = String(m.winner_id) === String(id);
      const res = win ? "WIN" : "LOSS";
      const cls = win ? "good" : "bad";
      const dTxt = delta >= 0 ? `+${delta}` : `${delta}`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="muted">${String(m.ts).slice(0,10)}</td>
        <td><a class="btn" style="padding:6px 10px" href="./player.html?id=${encodeURIComponent(oppId)}">${oppName}</a></td>
        <td class="${cls}">${res}</td>
        <td>${dTxt}</td>
      `;
      mBody.appendChild(tr);
    }

  }catch(e){
    showError(String(e.message || e));
  }
}

export async function renderHofPage(){
  try{
    const data = await loadJson("./hof.json");
    const err = validateHof(data);
    if(err) throw new Error(err);
    hideError();

    const box = document.getElementById("hofBox");
    box.innerHTML = data.entries.map(e => `
      <div class="section">
        <div><b>${e.title}</b></div>
        <div class="muted">${e.subtitle ?? ""}</div>
        <div style="margin-top:10px">
          ${(e.rows||[]).map(r => `
            <div style="display:flex; gap:10px; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06)">
              <span><a href="./player.html?id=${encodeURIComponent(r.user_id)}">${r.name}</a></span>
              <span class="muted">${r.value}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
  }catch(e){
    showError(String(e.message || e));
  }
}

export async function renderAdminPage(){
  try{
    const [lb, matches, hof, audit] = await Promise.all([
      loadLeaderboard("./leaderboard.json"),
      loadJson("./matches.json"),
      loadJson("./hof.json"),
      loadJson("./audit.json"),
    ]);

    const e1 = validateMatches(matches); if(e1) throw new Error(e1);
    const e2 = validateHof(hof); if(e2) throw new Error(e2);
    const e3 = validateAudit(audit); if(e3) throw new Error(e3);

    hideError();

    document.getElementById("admStats").innerHTML = `
      <div><b>Status:</b> <span class="good">OK</span></div>
      <div class="muted">Players: ${(lb.players||[]).length} • Matches: ${(matches.matches||[]).length} • Audit events: ${(audit.events||[]).length}</div>
    `;

    const list = (audit.events||[]).slice().reverse().slice(0,30);
    const tbody = document.getElementById("auditRows");
    tbody.innerHTML = "";
    for(const ev of list){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="muted">${String(ev.ts).slice(0,19).replace("T"," ")}</td>
        <td>${ev.actor ?? "system"}</td>
        <td>${ev.action}</td>
        <td class="muted">${ev.detail ?? ""}</td>
      `;
      tbody.appendChild(tr);
    }

  }catch(e){
    showError(String(e.message || e));
  }
}

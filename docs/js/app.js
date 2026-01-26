import { validateLeaderboard } from "./validate.js";
import { renderTop10Chart } from "./charts.js";

const errorBox = document.getElementById("errorBox");
const genAt = document.getElementById("genAt");
const lbTable = document.getElementById("lbTable");

function showError(msg){
  errorBox.style.display = "block";
  errorBox.textContent = msg;
}
function hideError(){
  errorBox.style.display = "none";
  errorBox.textContent = "";
}
function bust(url){ return `${url}?v=${Date.now()}`; }

function renderTable(players){
  lbTable.innerHTML = `
    <thead>
      <tr><th>#</th><th>Player</th><th>ELO</th><th>W-L</th></tr>
    </thead>
    <tbody>
      ${players.map((p,i)=>`
        <tr>
          <td>${i+1}</td>
          <td><a href="./player.html?id=${encodeURIComponent(p.id)}">${p.name}</a></td>
          <td>${p.elo}</td>
          <td>${p.wins}-${p.losses}</td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

async function load(){
  try{
    const res = await fetch(bust("./data/leaderboard.json"), { cache:"no-store" });
    const data = await res.json();

    const err = validateLeaderboard(data);
    if(err){ showError(err); return; }
    hideError();

    genAt.textContent = `Updated: ${data.generatedAt || "unknown"}`;
    renderTable(data.players);
    renderTop10Chart(data.players);

  }catch(e){
    showError("Failed to load ./data/leaderboard.json (missing or invalid JSON).");
  }
}

load();
setInterval(load, 30000);

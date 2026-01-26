let chart;

export function renderTop10Chart(players){
  const top = [...players].sort((a,b)=>b.elo-a.elo).slice(0,10).reverse();
  const labels = top.map(p=>p.name);
  const values = top.map(p=>p.elo);

  const ctx = document.getElementById("chartTop10");
  if(chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label:"ELO", data: values }] },
    options: {
      responsive:true,
      plugins:{ legend:{ display:false } }
    }
  });
}

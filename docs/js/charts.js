let topChart = null;
let eloChart = null;

export function renderTop10Chart(canvasId, players, nameFn){
  const top = [...players]
    .map(p => ({ name: nameFn(p), rating: Number(p.rating) }))
    .filter(x => !isNaN(x.rating))
    .sort((a,b)=>b.rating-a.rating)
    .slice(0,10)
    .reverse();

  const labels = top.map(x=>x.name);
  const values = top.map(x=>x.rating);

  const ctx = document.getElementById(canvasId);
  if(topChart) topChart.destroy();

  topChart = new Chart(ctx, {
    type:"bar",
    data:{ labels, datasets:[{ data: values }] },
    options:{ responsive:true, plugins:{ legend:{ display:false } } }
  });
}

export function renderEloLine(canvasId, series){
  const labels = series.map(x=>x[0]);
  const values = series.map(x=>x[1]);
  const ctx = document.getElementById(canvasId);
  if(eloChart) eloChart.destroy();

  eloChart = new Chart(ctx, {
    type:"line",
    data:{ labels, datasets:[{ data: values, tension:0.25, pointRadius:2 }] },
    options:{ responsive:true, plugins:{ legend:{ display:false } } }
  });
}

export function validateLeaderboard(data){
  if(!data || typeof data !== "object") return "leaderboard.json is not an object";
  if(!Array.isArray(data.players)) return "leaderboard.json missing players[]";
  for(const p of data.players){
    if(!p.id || !p.name) return "Player missing id or name";
    if(typeof p.elo !== "number") return `Player ${p.name} missing numeric elo`;
    if(typeof p.wins !== "number" || typeof p.losses !== "number") return `Player ${p.name} missing W/L`;
  }
  return null;
}

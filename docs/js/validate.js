export function validateLeaderboard(data){
  if(!data || typeof data !== "object") return "leaderboard.json invalid";
  if(!Array.isArray(data.players)) return "leaderboard.json missing players[]";
  for(const p of data.players){
    if(p.user_id === undefined) return "player missing user_id";
    if(p.rating === undefined) return "player missing rating";
  }
  return null;
}

export function validateMatches(data){
  if(!data || typeof data !== "object") return "matches.json invalid";
  if(!Array.isArray(data.matches)) return "matches.json missing matches[]";
  return null;
}

export function validatePlayers(data){
  if(!data || typeof data !== "object") return "players.json invalid";
  if(!Array.isArray(data.players)) return "players.json missing players[]";
  return null;
}

export function validateHof(data){
  if(!data || typeof data !== "object") return "hof.json invalid";
  if(!Array.isArray(data.entries)) return "hof.json missing entries[]";
  return null;
}

export function validateAudit(data){
  if(!data || typeof data !== "object") return "audit.json invalid";
  if(!Array.isArray(data.events)) return "audit.json missing events[]";
  return null;
}

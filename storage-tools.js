// storage-tools.js – stabile Keys, Migration, Backup/Import, Persistenz
(function(global){
  const KEYS = {
    expenses: "budget-tracker-react-v11", // <- DEINE Ausgaben-Daten (so bleiben!)
    wealth:   "wealth-data-v3",           // Vermögen
    trades:   "trades-data-v1",           // Trades
    summary:  "summary-data-v1"           // ✅ NEU: Abrechnung
  };

  const LEGACY = [
    "wealth-data-v2", "wealth_snapshots_v1", "bx_wealth_v1",
    "bx_expenses_v1", "budget-tracker-react-v10", "budget-tracker-react"
  ];

  function safeParse(json){ try{ return JSON.parse(json); }catch{ return null; } }

  function migrateOnce(){
    try{
      if (!localStorage.getItem(KEYS.wealth)){
        for (const k of LEGACY){ const v = localStorage.getItem(k); if (v){ localStorage.setItem(KEYS.wealth, v); break; } }
      }
      if (!localStorage.getItem(KEYS.expenses)){
        for (const k of LEGACY){ if (k.startsWith("budget-tracker-react")){ const v = localStorage.getItem(k); if (v){ localStorage.setItem(KEYS.expenses, v); break; } } }
      }
      // trades & summary hatten keine Legacy-Keys
    }catch(err){
      console.warn("Migration übersprungen:", err);
    }
  }

  async function requestPersistence(){
    if (!('storage' in navigator) || !('persist' in navigator.storage)) return "unsupported";
    try{
      const persisted = await navigator.storage.persisted?.();
      if (persisted) return "granted";
      const ok = await navigator.storage.persist();
      return ok ? "granted" : "prompt";
    }catch{ return "prompt"; }
  }

  function pickAvailableKeys(){
    const out = {};
    for (const [name, key] of Object.entries(KEYS)){
      const v = localStorage.getItem(key);
      if (v !== null) out[name] = safeParse(v) ?? v;
    }
    return out;
  }

  function downloadBackup(){
    const payload = {
      _type: "finance-app-backup",
      _version: 2,
      _timestamp: new Date().toISOString(),
      _origin: location.origin,
      data: pickAvailableKeys()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 300);
  }

  function restoreFromBackup(text){
    const json = safeParse(text);
    if (!json || json._type!=="finance-app-backup" || !json.data) throw new Error("Ungültige Backup-Datei");
    const data = json.data;
    let count = 0;
    if (data.expenses != null){ localStorage.setItem(KEYS.expenses, JSON.stringify(data.expenses)); count++; }
    if (data.wealth   != null){ localStorage.setItem(KEYS.wealth,   JSON.stringify(data.wealth));   count++; }
    if (data.trades   != null){ localStorage.setItem(KEYS.trades,   JSON.stringify(data.trades));   count++; }
    if (data.summary  != null){ localStorage.setItem(KEYS.summary,  JSON.stringify(data.summary));  count++; }
    return count;
  }

  global.StorageTools = {
    KEYS,
    migrateOnce,
    requestPersistence,
    downloadBackup,
    restoreFromBackup
  };
})(window);
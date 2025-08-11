// security.js – App-Sperre (Passwort + "Dieses Gerät merken")
(function(global){
  const LOCK_KEY    = "appLock.v1";        // { enabled, salt, iter, hashHex, trusted: [deviceId] }
  const DEVICE_KEY  = "appLock.deviceId";  // random per Browser
  const ITERATIONS  = 200000;

  const enc = new TextEncoder();

  // --------- Helpers ---------
  function toHex(buf){ const b=new Uint8Array(buf); return Array.from(b, x=>x.toString(16).padStart(2,"0")).join(""); }
  function fromHex(hex){ const u=new Uint8Array(hex.length/2); for(let i=0;i<u.length;i++) u[i]=parseInt(hex.slice(i*2,i*2+2),16); return u.buffer; }
  function randomHex(len=16){ const b=new Uint8Array(len); crypto.getRandomValues(b); return toHex(b); }

  async function pbkdf2(password, saltHex, iterations=ITERATIONS){
    const key = await crypto.subtle.importKey("raw", enc.encode(password), {name:"PBKDF2"}, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt: fromHex(saltHex), iterations}, key, 256);
    return toHex(bits);
  }

  function loadCfg(){ try{ const raw=localStorage.getItem(LOCK_KEY); return raw? JSON.parse(raw):null; }catch{ return null; } }
  function saveCfg(cfg){ localStorage.setItem(LOCK_KEY, JSON.stringify(cfg)); }
  function getDeviceId(){
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id){ id = "dev_"+randomHex(16); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  }

  // --------- UI (Styles + Overlays) ---------
  function ensureStyles(){
    if (document.getElementById("applock-styles")) return;
    const s = document.createElement("style");
    s.id = "applock-styles";
    s.textContent = `
    .lock-overlay{ position:fixed; inset:0; z-index:2000; display:flex; align-items:center; justify-content:center; backdrop-filter: blur(6px); background:rgba(0,0,0,.35);}
    [data-theme="light"] .lock-overlay{ background:rgba(255,255,255,.55);}
    .lock-card{ width:min(460px,92vw); background: var(--panel,#111a33); color: var(--text,#eef2ff);
      border:1px solid var(--line,#162046); border-radius:16px; padding:16px; box-shadow:0 20px 60px rgba(0,0,0,.35); }
    .lock-card h3{ margin:0 0 10px 0; font-size:18px; }
    .lock-row{ display:flex; gap:8px; align-items:center; margin:8px 0; flex-wrap:wrap; }
    .lock-input, .lock-btn, .lock-check{ -webkit-appearance:none; appearance:none; border-radius:10px; border:1px solid var(--line,#162046);
      padding:10px 12px; font-size:14px; background:color-mix(in oklab, var(--panel,#111a33) 85%, var(--bg,#0b1225) 15%); color:var(--text,#eef2ff); }
    .lock-btn{ cursor:pointer; }
    .lock-btn.primary{ background: var(--accent,#4f7cff); border-color: var(--accent-border,#365bff); color:#fff; }
    .lock-help{ color: var(--muted,#9aa3b2); font-size:12px; }
    .lock-error{ color:#ffb4b4; font-size:13px; min-height:1.2em; }
    .lock-settings{ position:fixed; inset:0; z-index:2001; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.35); }
    .lock-settings .lock-card{ width:min(520px,94vw); }
    `;
    document.head.appendChild(s);
  }

  function overlay(html){
    ensureStyles();
    const root = document.createElement("div");
    root.className = "lock-overlay";
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  function settingsModal(cfg){
    ensureStyles();
    const wrap = document.createElement("div");
    wrap.className = "lock-settings";
    const enabled = cfg?.enabled === true;
    wrap.innerHTML = `
      <div class="lock-card">
        <h3>🔒 Sicherheit</h3>

        <div class="lock-row" style="justify-content:space-between">
          <label class="lock-help" style="display:flex;align-items:center;gap:8px;">
            <input id="lockEnabled" type="checkbox" ${enabled?"checked":""}/>
            App-Sperre aktivieren
          </label>
          <button id="lockNow" class="lock-btn">Jetzt sperren</button>
        </div>

        <hr style="opacity:.1; border:none; border-top:1px solid var(--line,#162046); margin:10px 0"/>

        <div class="lock-row" style="flex-direction:column; align-items:stretch">
          <label class="lock-help">Passwort ${cfg?.hashHex? "(ändern)":"(setzen)"}:</label>
          ${cfg?.hashHex ? '<input id="curPw" class="lock-input" type="password" placeholder="Aktuelles Passwort (nur fürs Ändern)"/>' : ''}
          <input id="newPw" class="lock-input" type="password" placeholder="Neues Passwort"/>
          <input id="newPw2" class="lock-input" type="password" placeholder="Neues Passwort bestätigen"/>
          <div id="pwError" class="lock-error"></div>
          <div class="lock-row" style="justify-content:flex-end">
            <button id="savePw" class="lock-btn primary">${cfg?.hashHex? "Passwort ändern":"Passwort setzen"}</button>
            <button id="closeSettings" class="lock-btn">Schließen</button>
          </div>
        </div>

        <hr style="opacity:.1; border:none; border-top:1px solid var(--line,#162046); margin:10px 0"/>

        <div class="lock-row" style="justify-content:space-between">
          <div class="lock-help">Vertrauenswürdige Geräte: ${Array.isArray(cfg?.trusted)? cfg.trusted.length : 0}</div>
          <div>
            <button id="forgetThis" class="lock-btn">Dieses Gerät vergessen</button>
            <button id="forgetAll" class="lock-btn">Alle Geräte vergessen</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    // Wiring
    const devId = getDeviceId();
    wrap.querySelector("#closeSettings").onclick = ()=> wrap.remove();
    wrap.querySelector("#lockNow").onclick = ()=> { wrap.remove(); openLockOverlay(); };
    wrap.querySelector("#lockEnabled").onchange = (e)=>{
      const c = loadCfg() || {};
      c.enabled = !!e.target.checked;
      saveCfg(c);
      alert("Sperre "+(c.enabled?"aktiviert":"deaktiviert")+".");
    };
    wrap.querySelector("#savePw").onclick = async ()=>{
      const cur = loadCfg() || {};
      const curPw = wrap.querySelector("#curPw")?.value || "";
      const npw  = wrap.querySelector("#newPw").value || "";
      const npw2 = wrap.querySelector("#newPw2").value || "";
      const err  = wrap.querySelector("#pwError");
      err.textContent = "";
      if (!npw || npw.length < 4){ err.textContent = "Bitte ein Passwort mit mind. 4 Zeichen setzen."; return; }
      if (npw !== npw2){ err.textContent = "Passwörter stimmen nicht überein."; return; }
      if (cur.hashHex){
        // verify current
        const test = await pbkdf2(curPw, cur.salt, cur.iter || ITERATIONS);
        if (test !== cur.hashHex){ err.textContent = "Aktuelles Passwort ist falsch."; return; }
      }
      const salt = randomHex(16);
      const hashHex = await pbkdf2(npw, salt, ITERATIONS);
      const trusted = Array.isArray(cur.trusted) ? cur.trusted : [];
      saveCfg({ enabled: true, salt, iter: ITERATIONS, hashHex, trusted });
      alert("Passwort gespeichert. Sperre ist aktiviert.");
    };
    wrap.querySelector("#forgetThis").onclick = ()=>{
      const c = loadCfg() || {};
      c.trusted = (c.trusted||[]).filter(x=>x!==devId);
      saveCfg(c);
      alert("Dieses Gerät wurde aus der Vertrauensliste entfernt.");
    };
    wrap.querySelector("#forgetAll").onclick = ()=>{
      const c = loadCfg() || {};
      c.trusted = [];
      saveCfg(c);
      alert("Alle Geräte aus der Vertrauensliste entfernt.");
    };
  }

  function openLockOverlay(){
    const cfg = loadCfg();
    if (!cfg || !cfg.hashHex){ settingsModal(cfg||{}); return; } // erst Passwort setzen
    const root = overlay(`
      <div class="lock-card">
        <h3>🔒 App gesperrt</h3>
        <div class="lock-row">
          <input id="lockPw" class="lock-input" type="password" placeholder="Passwort eingeben" autofocus/>
        </div>
        <div class="lock-row" style="justify-content:space-between">
          <label class="lock-help" style="display:flex; align-items:center; gap:6px;">
            <input id="rememberDevice" type="checkbox"/> Dieses Gerät merken
          </label>
          <button id="unlockBtn" class="lock-btn primary">Entsperren</button>
        </div>
        <div id="lockErr" class="lock-error"></div>
        <div class="lock-help">Tipp: Einstellungen über „🔒 Sperre“ im Header.</div>
      </div>
    `);
    const err = root.querySelector("#lockErr");
    root.querySelector("#unlockBtn").onclick = async ()=>{
      try{
        const pw = root.querySelector("#lockPw").value || "";
        const cfg = loadCfg();
        const test = await pbkdf2(pw, cfg.salt, cfg.iter || ITERATIONS);
        if (test !== cfg.hashHex){ err.textContent = "Falsches Passwort."; return; }
        if (root.querySelector("#rememberDevice").checked){
          const id = getDeviceId();
          const list = Array.isArray(cfg.trusted) ? cfg.trusted : [];
          if (!list.includes(id)) list.push(id);
          cfg.trusted = list; saveCfg(cfg);
        }
        root.remove();
      }catch(e){ err.textContent = "Entsperren fehlgeschlagen."; }
    };
    root.querySelector("#lockPw").addEventListener("keydown",(e)=>{ if(e.key==="Enter") root.querySelector("#unlockBtn").click(); });
  }

  // --------- Startup: sperren falls nötig ---------
  function ensureLockedIfNeeded(){
    const cfg = loadCfg();
    if (!cfg || !cfg.enabled || !cfg.hashHex) return; // nichts zu tun
    const id = getDeviceId();
    const list = Array.isArray(cfg.trusted)? cfg.trusted : [];
    if (list.includes(id)) return; // vertrautes Gerät
    // sperren
    openLockOverlay();
  }

  // Public API
  global.AppLock = {
    openSettings: ()=> settingsModal(loadCfg()||{}),
    lockNow: openLockOverlay,
    isEnabled: ()=> !!(loadCfg()?.enabled)
  };

  // Auto-check
  document.addEventListener("DOMContentLoaded", ensureLockedIfNeeded);
})(window);
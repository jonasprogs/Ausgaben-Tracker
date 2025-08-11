// abrechnung.js – Monats-Abrechnung (React UMD, kein JSX)
// Features:
// - Liest ALLE Ausgaben des gewählten Monats automatisch aus deiner Ausgaben-App (localStorage["budget-tracker-react-v11"])
//   Felder: expenses[{ amount, dateStr, category }], monthlyBudget, useOverride, overrideSpentToDate
// - Live-Updates: gleicher Tab (localStorage-Hook), andere Tabs (BroadcastChannel + storage-Event), sanftes Polling
// - Einklappbare Sektionen (Einnahmen / Fixkosten / Ausgaben), Zustand wird gespeichert
// - Netto = Sum(Einnahmen) - Sum(Fixkosten) - GesamtAusgaben - Manuell geplant - Auto-Plan (Lebensmittel-Rest, optional)

(function(){
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var STORAGE_KEY  = "summary-data-v1"; // Abrechnung
  var EXPENSES_KEY = (window.StorageTools && StorageTools.KEYS && StorageTools.KEYS.expenses) || "budget-tracker-react-v11"; // Ausgaben

  // ---- Realtime Init (einmal pro Seite) ----
  (function initRealtime(){
    if (!window.__lsHooked) {
      window.__lsHooked = true;
      var origSet = localStorage.setItem, origRem = localStorage.removeItem;
      function fire(key){
        try{
          window.dispatchEvent(new CustomEvent("ls-change", { detail:{ key } }));
          if (window.bcFinance) window.bcFinance.postMessage({ type:"ls", key });
        }catch(_){}
      }
      localStorage.setItem = function(k,v){ var r = origSet.apply(this, arguments); fire(k); return r; };
      localStorage.removeItem = function(k){ var r = origRem.apply(this, arguments); fire(k); return r; };
    }
    if (!window.bcFinance && "BroadcastChannel" in window){
      try { window.bcFinance = new BroadcastChannel("finance-app"); } catch(_){}
    }
  })();

  function nowYM(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function fmtEUR(n){ return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n||0)); }
  function loadCfg(){ try{ var raw=localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):{}; }catch(e){ return {}; } }
  function saveCfg(obj){ localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }

  // ---------- Ausgaben aus Ausgaben-App lesen ----------
  function readFromExpenseApp(month){
    var raw = localStorage.getItem(EXPENSES_KEY);
    if (!raw) return { found:false, total:0, groceries:0, monthBudget:0, useOverride:false, overrideAdd:0, sig:"" };

    var st; try{ st = JSON.parse(raw); }catch(e){ return { found:false, total:0, groceries:0, monthBudget:0, useOverride:false, overrideAdd:0, sig:"" }; }
    var expenses = Array.isArray(st.expenses) ? st.expenses : [];
    var total = 0, groceries = 0;

    for (var i=0;i<expenses.length;i++){
      var e = expenses[i];
      var ds = e && e.dateStr ? String(e.dateStr) : null;
      if (!ds) continue;
      // Monat bestimmen (Day.js vorhanden; Fallback: String slice)
      var ym = (window.dayjs ? dayjs(ds, "YYYY-MM-DD", true).format("YYYY-MM") : ds.slice(0,7));
      if (ym !== month) continue;

      var amt = Number(e.amount||0);
      total += amt; // ALLE Ausgaben zählen
      if ((e.category||"") === "Lebensmittel") groceries += amt; // Lebensmittel separat
    }

    var monthBudget = Number(st.monthlyBudget || 0);
    var useOverride = !!st.useOverride;
    var overrideAdd = useOverride && isFinite(Number(st.overrideSpentToDate)) ? Number(st.overrideSpentToDate) : 0;

    var sig = [expenses.length, total.toFixed(2), groceries.toFixed(2),
               monthBudget.toFixed(2), useOverride?1:0, Number(overrideAdd||0).toFixed(2)].join("|");
    return { found:true, total, groceries, monthBudget, useOverride, overrideAdd, sig };
  }

  function App(){
    var init = loadCfg();
    var initialYM = init.__lastYM || nowYM();

    // Migration: altes "income" → incomes[]
    if (init[initialYM] && init[initialYM].income != null && (!Array.isArray(init[initialYM].incomes) || init[initialYM].incomes.length===0)){
      var old = Number(init[initialYM].income||0);
      init[initialYM].incomes = old ? [{id:uid(), name:"Einkommen", amount: old}] : [];
      delete init[initialYM].income;
      saveCfg(init);
    }

    // Defaults (nur wenn Monat neu)
    if(!init[initialYM]) init[initialYM] = { incomes:[], planned:0, fixed:[], overrides:{}, useAutoPlan:true };
    if(!init.__uiCollapsed) init.__uiCollapsed = { incomes:false, fixed:false, out:false };

    var st = useState(init);        var data = st[0], setData = st[1];
    var ymst = useState(initialYM); var month = ymst[0], setMonth = ymst[1];
    var tick = useState(0);         var setTick = tick[1];

    // Sichtbar? (dann schneller refresht)
    function isVisible(){
      var el = document.getElementById("page-abrechnung");
      return el && el.style.display!=="none" && document.visibilityState==="visible";
    }

    // Realtime: Events + Polling
    var lastSigRef = useRef("");
    useEffect(function(){
      function refresh(reason){
        var auto = readFromExpenseApp(month);
        if (auto.sig !== lastSigRef.current){
          lastSigRef.current = auto.sig;
          setTick(function(t){ return (t+1)%100000; });
        } else if (reason==="force" && isVisible()){
          setTick(function(t){ return (t+1)%100000; });
        }
      }

      function onLs(ev){ if (ev?.detail?.key===EXPENSES_KEY) refresh("event"); }
      function onStorage(ev){ if (ev && ev.key===EXPENSES_KEY) refresh("storage"); }
      window.addEventListener("ls-change", onLs);
      window.addEventListener("storage", onStorage);
      if (window.bcFinance) window.bcFinance.addEventListener("message", function(msg){
        if (msg && msg.data && msg.data.key===EXPENSES_KEY) refresh("bc");
      });

      var id = setInterval(function(){ refresh("tick"); }, isVisible()? 900 : 3000);
      var vis = function(){ refresh("force"); };
      document.addEventListener("visibilitychange", vis);

      refresh("init");

      return function(){
        window.removeEventListener("ls-change", onLs);
        window.removeEventListener("storage", onStorage);
        document.removeEventListener("visibilitychange", vis);
        clearInterval(id);
      };
    }, [month]);

    // Helpers
    function monthData(){
      var cur = data[month];
      if (!cur){
        cur = { incomes:[], planned:0, fixed:[], overrides:{}, useAutoPlan:true };
        setData(function(prev){ var c=Object.assign({},prev); c[month]=cur; c.__lastYM=month; saveCfg(c); return c; });
      }
      cur.incomes   = Array.isArray(cur.incomes) ? cur.incomes : [];
      cur.fixed     = Array.isArray(cur.fixed)   ? cur.fixed   : [];
      cur.overrides = cur.overrides || {};
      if (typeof cur.useAutoPlan !== "boolean") cur.useAutoPlan = true;
      return cur;
    }
    function setMonthPatch(patch){
      setData(function(prev){
        var copy = Object.assign({}, prev);
        var base = copy[month] || { incomes:[], planned:0, fixed:[], overrides:{}, useAutoPlan:true };
        copy[month] = Object.assign({}, base, patch);
        copy.__lastYM = month;
        saveCfg(copy);
        return copy;
      });
    }
    function ensureMonth(m){
      setData(function(prev){
        var copy = Object.assign({}, prev);
        if(!copy[m]) copy[m] = { incomes:[], planned:0, fixed:[], overrides:{}, useAutoPlan:true };
        copy.__lastYM = m;
        saveCfg(copy);
        return copy;
      });
    }
    function setCollapsed(section, value){
      setData(function(prev){
        var copy = Object.assign({}, prev);
        var ui = Object.assign({ incomes:false, fixed:false, out:false }, copy.__uiCollapsed||{});
        ui[section] = !!value;
        copy.__uiCollapsed = ui;
        saveCfg(copy);
        return copy;
      });
    }

    // Derivate
    var cur = monthData();
    var ui = Object.assign({ incomes:false, fixed:false, out:false }, data.__uiCollapsed||{});

    var incomes = cur.incomes;
    var plannedManual = Number(cur.planned||0);
    var fixed = cur.fixed;
    var ovr = cur.overrides;

    var incomeSum = incomes.reduce((a,b)=>a+Number(b.amount||0),0);
    var fixedSum  = fixed.reduce((a,b)=>a+Number(b.amount||0),0);

    var auto = readFromExpenseApp(month);
    var groceriesWithOverride = auto.groceries + (auto.overrideAdd || 0);
    var totalSpent = auto.total; // ALLE Ausgaben des Monats
    var autoPlanRest = Math.max(0, Number(auto.monthBudget || 0) - Number(groceriesWithOverride || 0));

    var totalSpentEff = (ovr.totalSpent!=null)     ? Number(ovr.totalSpent)     : totalSpent;
    var groceriesEff  = (ovr.groceriesSpent!=null) ? Number(ovr.groceriesSpent) : groceriesWithOverride;
    var autoPlanEff   = cur.useAutoPlan ? autoPlanRest : 0;

    var otherSpent = Math.max(0, Number(totalSpentEff) - Number(groceriesEff));
    var net = Number(incomeSum) - Number(fixedSum) - Number(totalSpentEff) - Number(plannedManual) - Number(autoPlanEff);

    // Mutators
    function addIncome(){ setMonthPatch({ incomes: incomes.concat([{id:uid(), name:"", amount:0}]) }); }
    function updIncome(id, patch){ setMonthPatch({ incomes: incomes.map(x=>x.id===id? Object.assign({},x,patch):x) }); }
    function delIncome(id){ setMonthPatch({ incomes: incomes.filter(x=>x.id!==id) }); }

    function addFixed(){ setMonthPatch({ fixed: fixed.concat([{id:uid(), name:"", amount:0}]) }); }
    function updFixed(id, patch){ setMonthPatch({ fixed: fixed.map(x=>x.id===id? Object.assign({},x,patch):x) }); }
    function delFixed(id){ setMonthPatch({ fixed: fixed.filter(x=>x.id!==id) }); }

    function recalcFromExpenses(){
      var base = data[month] || { incomes:[], planned:0, fixed:[], overrides:{} };
      base.overrides = Object.assign({}, base.overrides, {
        totalSpent: totalSpent,
        groceriesSpent: groceriesWithOverride
      });
      setMonthPatch(base);
      alert("Ausgaben neu übernommen.");
    }

    // UI
    return h("div",{className:"w-container"},

      // Kopf
      h("div",{className:"w-card"},
        h("div",{className:"w-row"},
          h("div",null,
            h("label",{className:"w-subtle"},"Monat"),
            h("input",{type:"month", value:month, onChange:function(e){ var v=e.target.value; setMonth(v); ensureMonth(v); }, className:"w-input", style:{minWidth:"180px"}})
          ),
          h("div",{className:"w-spacer"}),
          h("div",{className:"w-pill"},"Einnahmen: "+fmtEUR(incomeSum)),
          h("div",{className:"w-pill"},"Fixkosten: "+fmtEUR(fixedSum)),
          h("div",{className:"w-pill"},"Ausgaben: "+fmtEUR(totalSpentEff))
        )
      ),

      // Einnahmen (einklappbar)
      h("div",{className:"w-card"},
        h("div",{className:"w-row", style:{marginBottom:"8px"}},
          h("h3",{style:{margin:0}},"Einnahmen"),
          h("div",{className:"w-spacer"}),
          h("button",{className:"w-button w-btn-ghost", onClick:function(){ setCollapsed("incomes", !ui.incomes); }}, ui.incomes? "Ausklappen":"Einklappen"),
          h("button",{className:"w-button w-btn-primary", onClick:addIncome, style:{display: ui.incomes? "none":"inline-flex"}},"+ Einnahme")
        ),
        ui.incomes ? h("div",{className:"w-subtle"},"eingeklappt")
        : h("div",{style:{overflowX:"auto"}},
            h("table",{className:"w-table"},
              h("thead",null, h("tr",null, h("th",null,"Name"), h("th",{className:"w-num"},"Betrag (€)"), h("th",null,"Aktion"))),
              h("tbody",null,
                incomes.map(function(row){
                  return h("tr",{key:row.id},
                    h("td",null, h("input",{className:"w-input", value:row.name||"", onChange:function(e){ updIncome(row.id,{name:e.target.value}); }})),
                    h("td",{className:"w-num"}, h("input",{className:"w-input", type:"number", step:"0.01", value:row.amount||0, onChange:function(e){ updIncome(row.id,{amount:Number(e.target.value||0)}); }})),
                    h("td",null, h("button",{className:"w-button w-btn-danger", onClick:function(){ delIncome(row.id); }},"Löschen"))
                  );
                })
              )
            )
          )
      ),

      // Fixkosten (einklappbar)
      h("div",{className:"w-card"},
        h("div",{className:"w-row", style:{marginBottom:"8px"}},
          h("h3",{style:{margin:0}},"Fixkosten"),
          h("div",{className:"w-spacer"}),
          h("button",{className:"w-button w-btn-ghost", onClick:function(){ setCollapsed("fixed", !ui.fixed); }}, ui.fixed? "Ausklappen":"Einklappen"),
          h("button",{className:"w-button w-btn-primary", onClick:addFixed, style:{display: ui.fixed? "none":"inline-flex"}},"+ Position")
        ),
        ui.fixed ? h("div",{className:"w-subtle"},"eingeklappt")
        : h("div",{style:{overflowX:"auto"}},
            h("table",{className:"w-table"},
              h("thead",null, h("tr",null, h("th",null,"Name"), h("th",{className:"w-num"},"Betrag (€)"), h("th",null,"Aktion"))),
              h("tbody",null,
                fixed.map(function(fx){
                  return h("tr",{key:fx.id},
                    h("td",null, h("input",{className:"w-input", value:fx.name||"", onChange:function(e){ updFixed(fx.id,{name:e.target.value}); }})),
                    h("td",{className:"w-num"}, h("input",{className:"w-input", type:"number", step:"0.01", value:fx.amount||0, onChange:function(e){ updFixed(fx.id,{amount:Number(e.target.value||0)}); }})),
                    h("td",null, h("button",{className:"w-button w-btn-danger", onClick:function(){ delFixed(fx.id); }},"Löschen"))
                  );
                })
              )
            )
          )
      ),

      // Ausgaben & Auto-Werte (einklappbar)
      h("div",{className:"w-card"},
        h("div",{className:"w-row", style:{marginBottom:"8px"}},
          h("h3",{style:{margin:0}},"Ausgaben & Auto-Werte"),
          h("div",{className:"w-spacer"}),
          h("button",{className:"w-button w-btn-ghost", onClick:function(){ setCollapsed("out", !ui.out); }}, ui.out? "Ausklappen":"Einklappen")
        ),
        ui.out ? h("div",{className:"w-subtle"},"eingeklappt")
        : h(React.Fragment, null,
            // Auto-Werte + manuelle Overrides
            h("div",{className:"w-grid-2"},
              h("div",null,
                h("label",{className:"w-subtle"},"Gesamt ausgegeben (auto, "+month+")"),
                h("input",{className:"w-input", type:"number", step:"0.01",
                  value:(ovr.totalSpent!=null? ovr.totalSpent : totalSpent),
                  onChange:function(e){
                    var v=Number(e.target.value||0);
                    var next = Object.assign({}, cur.overrides, { totalSpent:v });
                    setMonthPatch({ overrides: next });
                  }})
              ),
              h("div",null,
                h("label",{className:"w-subtle"},"Lebensmittel (inkl. Override)"),
                h("input",{className:"w-input", type:"number", step:"0.01",
                  value:(ovr.groceriesSpent!=null? ovr.groceriesSpent : groceriesWithOverride),
                  onChange:function(e){
                    var v=Number(e.target.value||0);
                    var next = Object.assign({}, cur.overrides, { groceriesSpent:v });
                    setMonthPatch({ overrides: next });
                  }})
              )
            ),
            h("div",{className:"w-row", style:{marginTop:"8px"}},
              h("button",{className:"w-button w-btn-ghost", onClick:recalcFromExpenses},"Neu aus Ausgaben übernehmen"),
              h("div",{className:"w-subtle"},"Quelle: localStorage[\""+EXPENSES_KEY+"\"] – "+(auto.found? "Daten erkannt ✓" : "keine Daten")),
              h("div",{className:"w-spacer"}),
              h("div",{className:"w-subtle"}, isVisible()? "Live-Update aktiv ✓" : "Hintergrund-Modus")
            ),

            // Geplantes
            h("div",{className:"w-grid-2", style:{marginTop:"10px"}},
              h("div",null,
                h("label",{className:"w-subtle"},"Auto-Plan (Rest Lebensmittelbudget)"),
                h("div",{className:"w-row"},
                  h("div",{className:"w-pill"},"Auto-Plan: "+fmtEUR(Math.max(0, Number(cur.useAutoPlan ? (Math.max(0, Number(auto.monthBudget||0) - Number(groceriesWithOverride||0))) : 0)))),
                  h("label", {className:"w-subtle", style:{display:"flex", alignItems:"center", gap:8}},
                    h("input",{type:"checkbox", checked:!!cur.useAutoPlan, onChange:function(e){ setMonthPatch({ useAutoPlan: !!e.target.checked }); }}),
                    "In Netto einbeziehen"
                  )
                )
              ),
              h("div",null,
                h("label",{className:"w-subtle"},"Zusätzlich eingeplant (manuell, andere Kategorien)"),
                h("input",{className:"w-input", type:"number", step:"0.01", value:plannedManual, onChange:function(e){ setMonthPatch({ planned:Number(e.target.value||0) }); }})
              )
            )
          )
      ),

      // Netto-Ergebnis
      h("div",{className:"w-card"},
        h("h3",null,"Netto-Projektion"),
        h("div",{className:"w-kacheln"},
          h("div",{className:"w-kachel"}, h("strong",null,"Summe Einnahmen"),    h("small",null, fmtEUR(incomeSum))),
          h("div",{className:"w-kachel"}, h("strong",null,"Fixkosten"),          h("small",null, "− "+fmtEUR(fixedSum))),
          h("div",{className:"w-kachel"}, h("strong",null,"Gesamt ausgegeben"),  h("small",null, "− "+fmtEUR(totalSpentEff))),
          cur.useAutoPlan ? h("div",{className:"w-kachel"}, h("strong",null,"Auto-Plan (Lebensmittel)"), h("small",null, "− "+fmtEUR(autoPlanEff))) : null,
          h("div",{className:"w-kachel"}, h("strong",null,"Zusätzlich eingeplant"), h("small",null, "− "+fmtEUR(plannedManual)))
        ),
        h("div",{className:"w-row", style:{marginTop:"10px"}},
          h("div",{className:"w-pill", style:{fontWeight:700}}, "≈ Netto am Monatsende: "+fmtEUR(net)),
          h("div",{className:"w-spacer"}),
          h("div",{className:"w-subtle"},"Andere Ausgaben (ohne Lebensmittel): "+fmtEUR(otherSpent))
        )
      )
    );
  }

  document.addEventListener("DOMContentLoaded", function(){
    var mount = document.getElementById("summary-app");
    if(!mount) return;
    var root = ReactDOM.createRoot ? ReactDOM.createRoot(mount) : null;
    if(root){ root.render(h(App)); } else { ReactDOM.render(h(App), mount); }
  });
})();
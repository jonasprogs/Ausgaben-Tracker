// abrechnung.js – Monats-Abrechnung (React UMD, kein JSX)
// Features:
// - Mehrere Einnahmen (Liste)
// - Fixkosten-Liste
// - Automatische Übernahme "Gesamt ausgegeben" + "Lebensmittel" aus Ausgabentracker (localStorage)
// - Live-Update: reagiert auf Änderungen am Ausgabentracker (Polling + storage-Event)
// - Netto = Sum(Einnahmen) - Sum(Fixkosten) - GesamtAusgaben - Eingeplant

(function(){
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var STORAGE_KEY = "summary-data-v1"; // kompatibel zu vorher
  // Ausgaben Storage-Key aus StorageTools, sonst Fallback:
  var EXPENSES_KEY = (window.StorageTools && StorageTools.KEYS && StorageTools.KEYS.expenses) || "budget-tracker-react-v11";

  function nowYM(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function fmtEUR(n){ return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n||0)); }
  function load(){ try{ var raw=localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):{}; }catch(e){ return {}; } }
  function save(obj){ localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }

  // ---------- Ausgaben lesen (tolerant) ----------
  function pickArrayLike(obj){
    if (!obj || typeof obj!=="object") return [];
    if (Array.isArray(obj)) return obj;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.entries)) return obj.entries;
    var best = [];
    for (var k in obj){ if (Array.isArray(obj[k]) && obj[k].length>best.length) best = obj[k]; }
    return best;
  }
  function parseDateish(v){
    if (!v) return null;
    if (typeof v==="string"){
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10);
      var t = Date.parse(v); if (!isNaN(t)) return new Date(t).toISOString().slice(0,10);
    }
    if (typeof v==="number"){ var d=new Date(v); if (!isNaN(d.getTime())) return d.toISOString().slice(0,10); }
    return null;
  }
  function normalizeItem(it){
    if (!it || typeof it!=="object") return null;
    var keys = Object.keys(it);
    var lkeys = keys.map(k=>k.toLowerCase());
    function g(names){
      for (var i=0;i<names.length;i++){
        var id = names[i]; var idx = lkeys.indexOf(id);
        if (idx>-1) return it[keys[idx]];
      }
      return undefined;
    }
    var date = parseDateish( g(["date","datum","createdat","timestamp","time","day"]) );
    var amount = Number( g(["amount","betrag","value","price","sum","total","cost","eur","gesamt"]) );
    if (!isFinite(amount)) return null;
    var cat = g(["category","kategorie","cat","type","tag","gruppe","group"]);
    if (typeof cat!=="string") cat = "";
    return { date: date, amount: amount, category: cat };
  }
  function readExpensesForMonth(month){
    var raw = localStorage.getItem(EXPENSES_KEY);
    if (!raw) return { total:0, groceries:0, count:0, found:false, sig:"" };
    var obj; try{ obj = JSON.parse(raw); }catch(e){ return { total:0, groceries:0, count:0, found:false, sig:"" }; }
    var arr = pickArrayLike(obj);
    if (!arr || !arr.length){ // sammle alle Arrays 1. Ebene
      arr = [];
      for (var k in obj){ if (Array.isArray(obj[k])) arr = arr.concat(obj[k]); }
    }
    var rows = [];
    arr.forEach(function(it){ var n=normalizeItem(it); if(n && n.date && n.date.slice(0,7)===month) rows.push(n); });
    var total = rows.reduce((a,b)=>a+Number(b.amount||0),0);
    var groceries = rows.reduce((a,b)=>{
      var c = (b.category||"").toLowerCase();
      var isGrocery = c.includes("lebens") || c.includes("grocery") || c.includes("essen") || c.includes("food");
      return a + (isGrocery? Number(b.amount||0) : 0);
    },0);
    // Signatur für Change-Detection
    var sig = String(rows.length)+"|"+total.toFixed(2)+"|"+groceries.toFixed(2);
    return { total: total, groceries: groceries, count: rows.length, found:true, sig:sig };
  }

  function App(){
    var init = load();
    var initialYM = init.__lastYM || nowYM();
    if(!init[initialYM]) init[initialYM] = { incomes:[], planned:0, fixed:[], overrides:{} };

    // Migration: altes income-Feld in incomes umwandeln (einmalig)
    if (init[initialYM] && init[initialYM].income != null && (!Array.isArray(init[initialYM].incomes) || init[initialYM].incomes.length===0)){
      var old = Number(init[initialYM].income||0);
      init[initialYM].incomes = old ? [{id:uid(), name:"Einkommen", amount: old}] : [];
      delete init[initialYM].income;
      save(init);
    }

    var st = useState(init); var data = st[0], setData = st[1];
    var ymst = useState(initialYM); var month = ymst[0], setMonth = ymst[1];
    var tick = useState(0); var setTick = tick[1]; // für Live-Refresh

    // Live-Update: Polling alle 1.5s + storage-Event (für Änderungen in anderen Tabs)
    var lastSigRef = useRef("");
    useEffect(function(){
      function check(){
        var auto = readExpensesForMonth(month);
        if (auto.sig !== lastSigRef.current){
          lastSigRef.current = auto.sig;
          setTick(function(t){ return (t+1)%100000; }); // re-render
        }
      }
      var id = setInterval(check, 1500);
      function onStorage(e){
        if (e && e.key === EXPENSES_KEY) check();
      }
      window.addEventListener("storage", onStorage);
      check();
      return function(){ clearInterval(id); window.removeEventListener("storage", onStorage); };
    }, [month]);

    function monthData(){
      var cur = data[month];
      if (!cur){
        cur = { incomes:[], planned:0, fixed:[], overrides:{} };
        setData(function(prev){ var c=Object.assign({},prev); c[month]=cur; c.__lastYM=month; save(c); return c; });
      }
      // Sicherheit: Felder
      cur.incomes = Array.isArray(cur.incomes) ? cur.incomes : [];
      cur.fixed   = Array.isArray(cur.fixed)   ? cur.fixed   : [];
      cur.overrides = cur.overrides || {};
      return cur;
    }

    // State-Derivate
    var cur = monthData();
    var incomes = cur.incomes;
    var planned = Number(cur.planned||0);
    var fixed = cur.fixed;
    var ovr = cur.overrides;

    var incomeSum = incomes.reduce((a,b)=>a+Number(b.amount||0),0);
    var fixedSum  = fixed.reduce((a,b)=>a+Number(b.amount||0),0);

    var auto = readExpensesForMonth(month);
    var totalSpent     = (ovr.totalSpent!=null)     ? Number(ovr.totalSpent)     : auto.total;
    var groceriesSpent = (ovr.groceriesSpent!=null) ? Number(ovr.groceriesSpent) : auto.groceries;
    var otherSpent = Math.max(0, Number(totalSpent) - Number(groceriesSpent));

    var net = Number(incomeSum) - Number(fixedSum) - Number(totalSpent) - Number(planned);

    // Helpers to mutate
    function setMonthPatch(patch){
      setData(function(prev){
        var copy = Object.assign({}, prev);
        var base = copy[month] || { incomes:[], planned:0, fixed:[], overrides:{} };
        copy[month] = Object.assign({}, base, patch);
        copy.__lastYM = month;
        save(copy);
        return copy;
      });
    }
    function ensureMonth(m){
      setData(function(prev){
        var copy = Object.assign({}, prev);
        if(!copy[m]) copy[m] = { incomes:[], planned:0, fixed:[], overrides:{} };
        copy.__lastYM = m;
        save(copy);
        return copy;
      });
    }

    // Einnahmen
    function addIncome(){
      var arr = incomes.slice();
      arr.push({ id:uid(), name:"", amount:0 });
      setMonthPatch({ incomes: arr });
    }
    function updIncome(id, patch){
      var arr = incomes.map(function(x){ return x.id===id ? Object.assign({},x,patch) : x; });
      setMonthPatch({ incomes: arr });
    }
    function delIncome(id){
      var arr = incomes.filter(function(x){ return x.id!==id; });
      setMonthPatch({ incomes: arr });
    }

    // Fixkosten
    function addFixed(){
      var arr = fixed.slice();
      arr.push({ id:uid(), name:"", amount:0 });
      setMonthPatch({ fixed: arr });
    }
    function updFixed(id, patch){
      var arr = fixed.map(function(x){ return x.id===id ? Object.assign({},x,patch) : x; });
      setMonthPatch({ fixed: arr });
    }
    function delFixed(id){
      var arr = fixed.filter(function(x){ return x.id!==id; });
      setMonthPatch({ fixed: arr });
    }

    function recalcFromExpenses(){
      // überschreibt nur die Auto-Felder in overrides
      var base = data[month] || { incomes:[], planned:0, fixed:[], overrides:{} };
      base.overrides = Object.assign({}, base.overrides, { totalSpent: auto.total, groceriesSpent: auto.groceries });
      setMonthPatch(base);
      alert("Werte neu aus Ausgaben übernommen.");
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
          h("div",{className:"w-pill"},"Ausgaben: "+fmtEUR(totalSpent))
        )
      ),

      // Einnahmen & Planung
      h("div",{className:"w-card"},
        h("div",{className:"w-row", style:{marginBottom:"8px"}},
          h("h3",{style:{margin:0}},"Einnahmen & Planung"),
          h("div",{className:"w-spacer"}),
          h("button",{className:"w-button w-btn-primary", onClick:addIncome},"+ Einnahme")
        ),
        h("div",{style:{overflowX:"auto"}},
          h("table",{className:"w-table"},
            h("thead",null,
              h("tr",null,
                h("th",null,"Name"),
                h("th",{className:"w-num"},"Betrag (€)"),
                h("th",null,"Aktion")
              )
            ),
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
        ),
        h("div",{className:"w-grid-2", style:{marginTop:"10px"}},
          h("div",null,
            h("label",{className:"w-subtle"},"Eingeplante Ausgaben (Rest des Monats)"),
            h("input",{className:"w-input", type:"number", step:"0.01", value:planned, onChange:function(e){ setMonthPatch({ planned:Number(e.target.value||0) }); }})
          ),
          h("div",null,
            h("label",{className:"w-subtle"},"Hinweis"),
            h("div",{className:"w-subtle"},"Einnahmen können mehrere Quellen enthalten (Gehalt, Nebenverdienst, Rückerstattung, …).")
          )
        )
      ),

      // Fixkosten-Liste
      h("div",{className:"w-card"},
        h("div",{className:"w-row", style:{marginBottom:"8px"}},
          h("h3",{style:{margin:0}},"Fixkosten"),
          h("div",{className:"w-spacer"}),
          h("button",{className:"w-button w-btn-primary", onClick:addFixed},"+ Position")
        ),
        h("div",{style:{overflowX:"auto"}},
          h("table",{className:"w-table"},
            h("thead",null,
              h("tr",null,
                h("th",null,"Name"),
                h("th",{className:"w-num"},"Betrag (€)"),
                h("th",null,"Aktion")
              )
            ),
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

      // Ausgaben-Übernahme & Overrides
      h("div",{className:"w-card"},
        h("h3",null,"Ausgaben (auto – editierbar)"),
        h("div",{className:"w-grid-2"},
          h("div",null,
            h("label",{className:"w-subtle"},"Gesamt ausgegeben (bisher, "+month+")"),
            h("input",{className:"w-input", type:"number", step:"0.01",
              value:(ovr.totalSpent!=null? ovr.totalSpent : auto.total),
              onChange:function(e){
                var v=Number(e.target.value||0);
                var next = Object.assign({}, cur.overrides, { totalSpent:v });
                setMonthPatch({ overrides: next });
              }})
          ),
          h("div",null,
            h("label",{className:"w-subtle"},"Lebensmittel (bisher)"),
            h("input",{className:"w-input", type:"number", step:"0.01",
              value:(ovr.groceriesSpent!=null? ovr.groceriesSpent : auto.groceries),
              onChange:function(e){
                var v=Number(e.target.value||0);
                var next = Object.assign({}, cur.overrides, { groceriesSpent:v });
                setMonthPatch({ overrides: next });
              }})
          )
        ),
        h("div",{className:"w-row", style:{marginTop:"10px"}},
          h("button",{className:"w-button w-btn-ghost", onClick:recalcFromExpenses},"Neu aus Ausgaben berechnen"),
          h("div",{className:"w-subtle"},"Quelle: localStorage[\""+EXPENSES_KEY+"\"] – erkannt: "+(auto.found? (auto.count+" Buchungen"):"keine Daten")),
          h("div",{className:"w-spacer"}),
          h("div",{className:"w-subtle"},"Live-Update aktiv ✓")
        )
      ),

      // Netto-Rechnung
      h("div",{className:"w-card"},
        h("h3",null,"Netto-Projektion"),
        h("div",{className:"w-kacheln"},
          h("div",{className:"w-kachel"}, h("strong",null,"Summe Einnahmen"),    h("small",null, fmtEUR(incomeSum))),
          h("div",{className:"w-kachel"}, h("strong",null,"Fixkosten"),          h("small",null, "− "+fmtEUR(fixedSum))),
          h("div",{className:"w-kachel"}, h("strong",null,"Gesamt ausgegeben"),  h("small",null, "− "+fmtEUR(totalSpent))),
          h("div",{className:"w-kachel"}, h("strong",null,"Eingeplant (Rest)"), h("small",null, "− "+fmtEUR(planned)))
        ),
        h("div",{className:"w-row", style:{marginTop:"10px"}},
          h("div",{className:"w-pill", style:{fontWeight:700}}, "≈ Netto am Monatsende: "+fmtEUR(net)),
          h("div",{className:"w-spacer"}),
          h("div",{className:"w-subtle"},"Andere Ausgaben (ohne Lebensmittel): "+fmtEUR(otherSpent))
        )
      )
    );
  }

  // Mount
  document.addEventListener("DOMContentLoaded", function(){
    var mount = document.getElementById("summary-app");
    if(!mount) return;
    var root = ReactDOM.createRoot ? ReactDOM.createRoot(mount) : null;
    if(root){ root.render(h(App)); } else { ReactDOM.render(h(App), mount); }
  });
})();
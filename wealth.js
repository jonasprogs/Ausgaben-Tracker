// wealth.js – reines React UMD, KEIN JSX, KEIN Chart.js nötig
(function(){
  // kleine Hilfsfunktionen
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var STORAGE_KEY = "wealth-data-v2"; // { [YYYY-MM]: [{id,name,category,amount}] , __lastYM: "YYYY-MM" }
  var DEFAULT_CATS = ["Cash","Tagesgeld","Depot","Krypto","Renten/ETF","Sonstiges"];

  function nowYM(){
    var d = new Date();
    var ym = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
    return ym;
  }
  function load(){
    try { var raw = localStorage.getItem(STORAGE_KEY); return raw? JSON.parse(raw): {}; } catch(e){ return {}; }
  }
  function save(obj){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function fmtEUR(n){
    return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n||0));
  }

  function App(){
    var _dataInit = load();
    var _initialYM = _dataInit.__lastYM || nowYM();
    if(!_dataInit[_initialYM]) _dataInit[_initialYM] = { items: [] };

    var _a = useState(_dataInit); var data = _a[0]; var setData = _a[1];
    var _b = useState(_initialYM); var month = _b[0]; var setMonth = _b[1];

    // Eingabe-States für neue Position
    var _c = useState(""); var name = _c[0]; var setName = _c[1];
    var _d = useState("Cash"); var category = _d[0]; var setCategory = _d[1];
    var _e = useState(""); var amount = _e[0]; var setAmount = _e[1];

    useEffect(function(){
      var copy = Object.assign({}, data, { __lastYM: month });
      save(copy);
    }, [data, month]);

    function monthItems(){
      var m = data[month];
      return m ? (m.items || []) : [];
    }

    function setMonthItems(newItems){
      setData(function(prev){
        var cur = Object.assign({}, prev);
        if(!cur[month]) cur[month] = { items: [] };
        cur[month] = { items: newItems };
        return cur;
      });
    }

    function handleAdd(){
      var val = Number(amount);
      if(!name || !isFinite(val)) return;
      var items = monthItems().slice();
      items.push({ id: uid(), name: name, category: category, amount: val });
      setMonthItems(items);
      setName(""); setCategory("Cash"); setAmount("");
    }

    function handleDelete(id){
      var items = monthItems().filter(function(it){ return it.id !== id; });
      setMonthItems(items);
    }

    function handleUpdate(id, patch){
      var items = monthItems().map(function(it){ return it.id===id ? Object.assign({}, it, patch) : it; });
      setMonthItems(items);
    }

    function ensureMonth(m){
      setData(function(prev){
        var cur = Object.assign({}, prev);
        if(!cur[m]) cur[m] = { items: [] };
        return cur;
      });
    }

    function duplicateFromPrevious(){
      var parts = month.split("-");
      if(parts.length!==2) return;
      var y = parseInt(parts[0],10), m = parseInt(parts[1],10);
      var prev = new Date(y, m-2, 1); // JS: Monat 0-basiert
      var ym = prev.getFullYear() + "-" + String(prev.getMonth()+1).padStart(2,"0");
      var src = data[ym];
      setData(function(prevData){
        var cur = Object.assign({}, prevData);
        if(src && src.items){
          cur[month] = { items: src.items.map(function(x){ return {id:uid(), name:x.name, category:x.category, amount:Number(x.amount||0)}; }) };
        } else {
          cur[month] = cur[month] || { items: [] };
        }
        return cur;
      });
    }

    // Berechnungen
    var items = monthItems();
    var total = items.reduce(function(a,b){ return a + Number(b.amount||0); }, 0);
    var byCategory = (function(){
      var map = {};
      items.forEach(function(it){
        var k = it.category || "Sonstiges";
        map[k] = (map[k]||0) + Number(it.amount||0);
      });
      var rows = Object.keys(map).map(function(k){ 
        var amount = map[k];
        var pct = total ? (amount/total*100) : 0;
        return { category:k, amount:amount, pct:pct };
      });
      rows.sort(function(a,b){ return b.amount - a.amount; });
      return rows;
    })();

    // UI-Elemente
    return h("div", {style:{color:"#e5e7eb"}},
      // Kopf / Monat
      h("div", {style:{marginBottom:"12px", display:"flex", gap:"8px", alignItems:"center", flexWrap:"wrap"}},
        h("div", null,
          h("label", {style:{display:"block", fontSize:"12px", color:"#9aa3b2", marginBottom:"4px"}}, "Monat"),
          h("input", {
            type:"month",
            value: month,
            onChange: function(e){ var v=e.target.value; setMonth(v); ensureMonth(v); }
          })
        ),
        h("button", { onClick: function(){ ensureMonth(month); }, style:btn("ghost") }, "Monat anlegen"),
        h("button", { onClick: duplicateFromPrevious, style:btn() }, "Vom Vormonat übernehmen"),
        h("div",{style:{flex:"1"}}),
        h("div", {style:pill()}, "Gesamt: " + fmtEUR(total)),
        h("div", {style:pill()}, "Positionen: " + items.length)
      ),

      // Liste nach Kategorie (Prozent)
      h("div", {style:card()},
        h("h3", {style:{margin:"0 0 8px 0"}}, "Verteilung"),
        byCategory.length===0
          ? h("div", {style:{color:"#9aa3b2"}}, "Noch keine Einträge für diesen Monat.")
          : h("ul", {style:{listStyle:"none", padding:0, margin:0, display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px"}},
              byCategory.map(function(r){
                return h("li", {key:r.category, style:{display:"flex", justifyContent:"space-between", background:"#0f1835", border:"1px solid #162046", borderRadius:"8px", padding:"8px 10px"}},
                  h("span", null, r.category),
                  h("span", {style:{color:"#9aa3b2"}}, r.pct.toFixed(1) + "% · " + fmtEUR(r.amount))
                );
              })
            )
      ),

      // Tabelle Positionen
      h("div", {style:card()},
        h("div", {style:{display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px"}},
          h("h3", {style:{margin:"0"}}, "Positionen"),
          h("div",{style:{flex:"1"}}),
          h("button", {onClick: function(){
              var val = Number(amount);
              if(!name || !isFinite(val)) return;
              var arr = items.slice();
              arr.push({ id:uid(), name:name, category:category, amount:val });
              setMonthItems(arr); setName(""); setCategory("Cash"); setAmount("");
            }, style:btnPrimary()}, "+ Position")
        ),

        // Eingabezeile
        h("div", {style:{display:"grid", gridTemplateColumns:"1fr 180px 180px 120px", gap:"8px", marginBottom:"8px"}},
          h("input", {placeholder:"Name (z. B. Sparkasse)", value:name, onChange:function(e){ setName(e.target.value); }}),
          h("select", {value:category, onChange:function(e){ setCategory(e.target.value); }},
            DEFAULT_CATS.map(function(c){ return h("option", {value:c, key:c}, c); })
          ),
          h("input", {type:"number", step:"0.01", placeholder:"Betrag (€)", value:amount, onChange:function(e){ setAmount(e.target.value); }}),
          h("button", {onClick: handleAdd, style:btnPrimary()}, "Hinzufügen")
        ),

        // Tabelle
        h("div", {style:{overflowX:"auto"}},
          h("table", {style:table()},
            h("thead", null,
              h("tr", null,
                h("th", {style:th()}, "Name"),
                h("th", {style:th()}, "Kategorie"),
                h("th", {style:th({textAlign:"right"})}, "Betrag (€)"),
                h("th", {style:th()}, "Aktion")
              )
            ),
            h("tbody", null,
              items.map(function(it){
                return h("tr", {key:it.id},
                  h("td", {style:td()},
                    h("input", {value: it.name || "", onChange:function(e){ handleUpdate(it.id, {name:e.target.value}); }})
                  ),
                  h("td", {style:td()},
                    h("select", {value: it.category || "Cash", onChange:function(e){ handleUpdate(it.id, {category:e.target.value}); }},
                      DEFAULT_CATS.map(function(c){ return h("option", {value:c, key:c}, c); })
                    )
                  ),
                  h("td", {style:td({textAlign:"right"})},
                    h("input", {type:"number", step:"0.01", value: it.amount || 0, onChange:function(e){ handleUpdate(it.id, {amount: Number(e.target.value||0)}); }})
                  ),
                  h("td", {style:td()},
                    h("button", {onClick:function(){ handleDelete(it.id); }, style:btnDanger()}, "Löschen")
                  )
                );
              })
            )
          )
        ),
        h("div", {style:{marginTop:"6px", color:"#9aa3b2", fontSize:"12px"}}, "Hinweis: Prozentwerte berechnen sich aus der Monatssumme.")
      )
    );
  }

  // --------- simple Style helpers (Inline) ----------
  function card(){
    return { background:"#121a33", border:"1px solid #162046", borderRadius:"12px", padding:"12px", marginBottom:"12px" };
  }
  function table(){
    return { width:"100%", borderCollapse:"collapse", color:"#eef2ff" };
  }
  function th(extra){
    var base = { textAlign:"left", padding:"8px", borderBottom:"1px solid #162046", color:"#cdd6f4" };
    return Object.assign(base, extra||{});
  }
  function td(extra){
    var base = { padding:"8px", borderBottom:"1px solid #162046" };
    return Object.assign(base, extra||{});
  }
  function btn(kind){
    // ghost default
    var base = { background:"transparent", border:"1px solid #162046", color:"#eef2ff", borderRadius:"8px", padding:"8px 12px", cursor:"pointer" };
    if(kind==="ghost") return base;
    return base;
  }
  function btnPrimary(){
    return { background:"#4f7cff", border:"1px solid #365bff", color:"#fff", borderRadius:"8px", padding:"8px 12px", cursor:"pointer" };
  }
  function btnDanger(){
    return { background:"#ff50611a", border:"1px solid #ff5061", color:"#ffd7db", borderRadius:"8px", padding:"6px 10px", cursor:"pointer" };
  }
  function pill(){
    return { background:"#0f1835", border:"1px solid #162046", color:"#cfe1ff", borderRadius:"999px", padding:"6px 10px", fontSize:"12px" };
  }

  // Mounten (ohne JSX)
  document.addEventListener("DOMContentLoaded", function(){
    var mount = document.getElementById("wealth-app");
    if(!mount){ console.warn("wealth-app Container nicht gefunden."); return; }
    var root = ReactDOM.createRoot ? ReactDOM.createRoot(mount) : null;
    if(root){ root.render(h(App)); } else { ReactDOM.render(h(App), mount); }
  });
})();
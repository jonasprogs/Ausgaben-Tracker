// wealth.js – polierte UI ohne Chart, React UMD, keine JSX
(function(){
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var STORAGE_KEY = "wealth-data-v3"; // { [YYYY-MM]: {items:[...]}, __lastYM }
  var DEFAULT_CATS = ["Cash","Tagesgeld","Depot","Krypto","Renten/ETF","Sonstiges"];

  function nowYM(){
    var d = new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function load(){
    try{ var raw=localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):{};}catch(e){return {};}
  }
  function save(obj){ localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }
  function fmtEUR(n){ return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n||0)); }

  // ---------- App ----------
  function App(){
    var init = load();
    var initialYM = init.__lastYM || nowYM();
    if(!init[initialYM]) init[initialYM] = { items:[] };

    var st = useState(init); var data = st[0], setData = st[1];
    var ymst = useState(initialYM); var month = ymst[0], setMonth = ymst[1];

    // Eingaben
    var nst = useState(""); var name = nst[0], setName = nst[1];
    var cst = useState("Cash"); var category = cst[0], setCategory = cst[1];
    var ast = useState(""); var amount = ast[0], setAmount = ast[1];

    useEffect(function(){ save(Object.assign({}, data, {__lastYM: month})); }, [data,month]);

    function items(){ return (data[month] && data[month].items) ? data[month].items : []; }
    function setItems(arr){
      setData(function(prev){
        var copy = Object.assign({}, prev);
        copy[month] = { items: arr };
        return copy;
      });
    }
    function ensureMonth(m){
      setData(function(prev){
        var copy = Object.assign({}, prev);
        if(!copy[m]) copy[m] = { items:[] };
        return copy;
      });
    }
    function duplicateFromPrev(){
      var p = month.split("-"); if(p.length!==2) return;
      var y=+p[0], m=+p[1];
      var prev = new Date(y, m-2, 1);
      var prevYM = prev.getFullYear()+"-"+String(prev.getMonth()+1).padStart(2,"0");
      var src = data[prevYM];
      setData(function(prevData){
        var copy = Object.assign({}, prevData);
        copy[month] = src ? { items: src.items.map(function(x){return {id:uid(), name:x.name, category:x.category, amount:Number(x.amount||0)};}) } : { items:[] };
        return copy;
      });
    }

    function addItem(){
      var v = Number(amount);
      if(!name || !isFinite(v)) return;
      var arr = items().slice();
      arr.push({id:uid(), name:name, category:category, amount:v});
      setItems(arr); setName(""); setCategory("Cash"); setAmount("");
    }
    function updateItem(id, patch){
      setItems(items().map(function(it){ return it.id===id ? Object.assign({}, it, patch) : it; }));
    }
    function delItem(id){ setItems(items().filter(function(it){ return it.id!==id; })); }

    // totals
    var list = items();
    var total = list.reduce(function(a,b){ return a + Number(b.amount||0); }, 0);
    var buckets = (function(){
      var map = {};
      list.forEach(function(it){ var k=it.category||"Sonstiges"; map[k]=(map[k]||0)+Number(it.amount||0); });
      return Object.keys(map).sort(function(a,b){return map[b]-map[a];})
        .map(function(k){ var amt = map[k]; return {category:k, amount:amt, pct: total? (amt/total*100):0}; });
    })();

    // UI
    return h("div",{className:"w-container"},
      // Kopf
      h("div",{className:"w-card"},
        h("div",{className:"w-row"},
          h("div",null,
            h("label",{className:"w-subtle"},"Monat"),
            h("input",{type:"month", value:month, onChange:function(e){ var v=e.target.value; setMonth(v); ensureMonth(v); }, className:"w-input", style:{minWidth:"180px"}})
          ),
          h("button",{className:"w-button w-btn-ghost", onClick:function(){ ensureMonth(month); }},"Monat anlegen"),
          h("button",{className:"w-button w-btn-ghost", onClick:duplicateFromPrev},"Vom Vormonat übernehmen"),
          h("div",{className:"w-spacer"}),
          h("div",{className:"w-pill"},"Gesamt: "+fmtEUR(total)),
          h("div",{className:"w-pill"},"Positionen: "+list.length)
        )
      ),

      // Verteilung
      h("div",{className:"w-card"},
        h("h3",null,"Verteilung"),
        buckets.length===0
          ? h("div",{className:"w-subtle"},"Noch keine Einträge für diesen Monat.")
          : h("div",{className:"w-kacheln"},
              buckets.map(function(b){
                return h("div",{className:"w-kachel", key:b.category},
                  h("strong",null,b.category),
                  h("small",null, b.pct.toFixed(1)+"% · "+fmtEUR(b.amount))
                );
              })
            )
      ),

      // Positionen
      h("div",{className:"w-card"},
        h("div",{className:"w-row", style:{marginBottom:"8px"}},
          h("h3",{style:{margin:0}},"Positionen"),
          h("div",{className:"w-spacer"}),
          h("button",{className:"w-button w-btn-primary", onClick:addItem},"+ Position")
        ),

        // Eingabezeile
        h("div",{className:"w-grid-2", style:{marginBottom:"10px"}},
          h("input",{className:"w-input", placeholder:"Name (z. B. Sparkasse)", value:name, onChange:function(e){setName(e.target.value);}}),
          h("div",{className:"w-row", style:{gap:"8px", flexWrap:"nowrap"}},
            h("select",{className:"w-select", value:category, onChange:function(e){setCategory(e.target.value);}},
              DEFAULT_CATS.map(function(c){return h("option",{key:c, value:c}, c);})
            ),
            h("input",{className:"w-input", type:"number", step:"0.01", placeholder:"Betrag (€)", value:amount, onChange:function(e){setAmount(e.target.value);}}),
            h("button",{className:"w-button w-btn-primary", onClick:addItem}, "Hinzufügen")
          )
        ),

        // Tabelle
        h("div",{style:{overflowX:"auto"}},
          h("table",{className:"w-table"},
            h("thead",null,
              h("tr",null,
                h("th",null,"Name"),
                h("th",null,"Kategorie"),
                h("th",{className:"w-num"},"Betrag (€)"),
                h("th",null,"Aktion")
              )
            ),
            h("tbody",null,
              list.map(function(it){
                return h("tr",{key:it.id},
                  h("td",null,
                    h("input",{className:"w-input", value:it.name||"", onChange:function(e){ updateItem(it.id,{name:e.target.value}); }})
                  ),
                  h("td",null,
                    h("select",{className:"w-select", value:it.category||"Cash", onChange:function(e){ updateItem(it.id,{category:e.target.value}); }},
                      DEFAULT_CATS.map(function(c){return h("option",{key:c, value:c}, c);})
                    )
                  ),
                  h("td",{className:"w-num"},
                    h("input",{className:"w-input", type:"number", step:"0.01", value:it.amount||0, onChange:function(e){ updateItem(it.id,{amount:Number(e.target.value||0)}); }})
                  ),
                  h("td",null,
                    h("button",{className:"w-button w-btn-danger", onClick:function(){ delItem(it.id); }},"Löschen")
                  )
                );
              })
            )
          )
        ),
        h("div",{className:"w-subtle", style:{marginTop:"6px"}},"Hinweis: Prozentwerte berechnen sich aus der Monatssumme.")
      )
    );
  }

  // Mount
  document.addEventListener("DOMContentLoaded", function(){
    var mount = document.getElementById("wealth-app");
    if(!mount) return;
    var root = ReactDOM.createRoot ? ReactDOM.createRoot(mount) : null;
    if(root){ root.render(h(App)); } else { ReactDOM.render(h(App), mount); }
  });
})();
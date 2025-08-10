// trades.js – React UMD, kein JSX. Monatsbasierte Trades + Linienchart (pro Tag Nettop&l)
(function(){
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var STORAGE_KEY = "trades-data-v1"; // { [YYYY-MM]: {items:[{id,name,date,amount}]} , __lastYM }
  var GREEN = "#34d399", RED = "#f87171";

  function nowYM(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
  function todayStr(){ return new Date().toISOString().slice(0,10); }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function fmtEUR(n){ return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n||0)); }
  function load(){ try{ var raw=localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):{}; }catch(e){ return {}; } }
  function save(obj){ localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }

  function App(){
    var init = load();
    var initialYM = init.__lastYM || nowYM();
    if(!init[initialYM]) init[initialYM] = { items:[] };

    var st = useState(init); var data = st[0], setData = st[1];
    var ymst = useState(initialYM); var month = ymst[0], setMonth = ymst[1];

    // Eingaben
    var nst = useState(""); var name = nst[0], setName = nst[1];
    var dst = useState(todayStr()); var date = dst[0], setDate = dst[1];
    var typ = useState("gain"); var type = typ[0], setType = typ[1]; // gain | loss
    var vst = useState(""); var value = vst[0], setValue = vst[1];

    useEffect(function(){ save(Object.assign({}, data, {__lastYM: month})); }, [data,month]);

    function items(){ return (data[month] && data[month].items) ? data[month].items : []; }
    function setItems(arr){
      setData(function(prev){ var copy=Object.assign({},prev); copy[month]={items:arr}; return copy; });
    }
    function ensureMonth(m){
      setData(function(prev){ var copy=Object.assign({},prev); if(!copy[m]) copy[m]={items:[]}; return copy; });
    }

    function addTrade(){
      var val = Number(value);
      if(!name || !date || !isFinite(val)) return;
      var sign = (type==="gain") ? 1 : -1;
      var amt = sign * Math.abs(val);
      var ym = date.slice(0,7);
      if (ym !== month){ setMonth(ym); ensureMonth(ym); }
      var arr = (data[ym] && data[ym].items) ? data[ym].items.slice() : [];
      arr.push({ id:uid(), name:name, date:date, amount:amt });
      setData(function(prev){ var copy=Object.assign({},prev); copy[ym]={items:arr}; return copy; });
      setName(""); setValue(""); setType("gain");
    }

    function updateTrade(id, patch){ setItems(items().map(function(t){ return t.id===id ? Object.assign({},t,patch) : t; })); }
    function delTrade(id){ setItems(items().filter(function(t){ return t.id!==id; })); }

    // Sort + KPIs
    var list = items().slice().sort(function(a,b){ return a.date.localeCompare(b.date); });
    var total = list.reduce(function(a,b){ return a + Number(b.amount||0); }, 0);

    // Chart-Daten (pro Tag Nettosumme)
    var daysInMonth = (function(){ var y=+month.slice(0,4), m=+month.slice(5,7); return new Date(y,m,0).getDate(); })();
    var perDay = new Array(daysInMonth).fill(0);
    list.forEach(function(t){
      if (t.date && t.date.slice(0,7)===month){
        var d = +t.date.slice(8,10);
        if (d>=1 && d<=daysInMonth) perDay[d-1] += Number(t.amount||0);
      }
    });
    var days = Array.from({length:daysInMonth}, (_,i)=> String(i+1));
    var gains = perDay.map(function(v){ return v>0 ? v : null; });
    var losses = perDay.map(function(v){ return v<0 ? v : null; });

    // Chart render (responsive)
    var chartRef = React.useRef(null);
    var chartObj = React.useRef(null);
    useEffect(function(){
      var ctx = chartRef.current;
      if (!ctx || !window.Chart) return;
      if (chartObj.current) chartObj.current.destroy();
      chartObj.current = new Chart(ctx, {
        type: "line",
        data: {
          labels: days,
          datasets: [
            { label:"Gewinn", data: gains, spanGaps:true, borderColor:GREEN, backgroundColor:GREEN, pointRadius:2.5, tension:.25 },
            { label:"Verlust", data: losses, spanGaps:true, borderColor:RED, backgroundColor:RED, pointRadius:2.5, tension:.25 }
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ position:"bottom", labels:{ color:getComputedStyle(document.documentElement).getPropertyValue('--text') || '#e5e7eb' } } },
          scales:{
            x:{ ticks:{ color:getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#cbd5e1' },
                grid:{ color:"rgba(148,163,184,.15)"} },
            y:{ ticks:{ color:getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#cbd5e1',
                        callback:function(v){ return fmtEUR(v); } },
                grid:{ color:"rgba(148,163,184,.15)" } }
          }
        }
      });
      return function(){ if(chartObj.current) chartObj.current.destroy(); };
    }, [month, list.length, total, document.documentElement.getAttribute("data-theme")]);

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
          h("div",{className:"w-pill"},"Netto: "+fmtEUR(total)),
          h("div",{className:"w-pill"},"Trades: "+list.length)
        )
      ),

      // Formular – mobil stapelbar
      h("div",{className:"w-card"},
        h("h3",null,"Trade hinzufügen"),
        h("div",{className:"w-grid-2", style:{marginBottom:"10px"}},
          h("input",{className:"w-input", placeholder:"Name (z. B. Aktie/ETF)", value:name, onChange:function(e){setName(e.target.value);}}),
          h("div",{className:"w-row", style:{gap:"8px"}},
            h("input",{className:"w-input", type:"date", value:date, onChange:function(e){setDate(e.target.value);}, style:{minWidth:"130px"}}),
            h("select",{className:"w-select", value:type, onChange:function(e){setType(e.target.value);}, style:{minWidth:"120px"}},
              h("option",{value:"gain"},"Gewinn"),
              h("option",{value:"loss"},"Verlust")
            ),
            h("input",{className:"w-input", type:"number", step:"0.01", placeholder:"Betrag (€)", value:value, onChange:function(e){setValue(e.target.value);}, style:{minWidth:"120px"}}),
            h("button",{className:"w-button w-btn-primary", onClick:addTrade, style:{whiteSpace:"nowrap"}}, "Hinzufügen")
          )
        ),
        h("div",{className:"t-legend"},
          h("div",{className:"dot green"}), h("span",{className:"w-subtle"},"Gewinn"),
          h("div",{className:"dot red"}), h("span",{className:"w-subtle"},"Verlust")
        )
      ),

      // Chart
      h("div",{className:"w-card t-chart", style:{height:"240px"}},
        h("h3",null,"Gewinn/Verlust pro Tag"),
        h("div",{style:{position:"relative", height:"180px"}},
          h("canvas",{ref:chartRef})
        )
      ),

      // Tabelle
      h("div",{className:"w-card"},
        h("h3",null,"Trades"),
        h("div",{style:{overflowX:"auto"}},
          h("table",{className:"w-table"},
            h("thead",null,
              h("tr",null,
                h("th",null,"Name"),
                h("th",null,"Datum"),
                h("th",null,"Typ"),
                h("th",{className:"w-num"},"Betrag (€)"),
                h("th",null,"Aktion")
              )
            ),
            h("tbody",null,
              list.map(function(t){
                var isGain = (t.amount||0) >= 0;
                return h("tr",{key:t.id},
                  h("td",null,
                    h("input",{className:"w-input", value:t.name||"", onChange:function(e){ updateTrade(t.id,{name:e.target.value}); }})
                  ),
                  h("td",null,
                    h("input",{className:"w-input", type:"date", value:t.date||"", onChange:function(e){ updateTrade(t.id,{date:e.target.value}); }})
                  ),
                  h("td",null,
                    h("select",{className:"w-select", value:isGain?"gain":"loss", onChange:function(e){
                      var typ=e.target.value;
                      var amt = Math.abs(Number(t.amount||0));
                      updateTrade(t.id,{ amount: typ==="gain" ? amt : -amt });
                    }} ,
                      h("option",{value:"gain"},"Gewinn"),
                      h("option",{value:"loss"},"Verlust")
                    ),
                    " ",
                    h("span",{className:"t-badge "+(isGain?"gain":"loss")}, isGain? "Gewinn" : "Verlust")
                  ),
                  h("td",{className:"w-num"},
                    h("input",{className:"w-input", type:"number", step:"0.01", value:Math.abs(Number(t.amount||0)), onChange:function(e){
                      var v = Math.abs(Number(e.target.value||0));
                      var sign = ( (t.amount||0) >= 0 ) ? 1 : -1;
                      updateTrade(t.id,{ amount: sign*v });
                    }})
                  ),
                  h("td",null,
                    h("button",{className:"w-button w-btn-danger", onClick:function(){ delTrade(t.id); }},"Löschen")
                  )
                );
              })
            )
          )
        )
      )
    );
  }

  // Mount
  document.addEventListener("DOMContentLoaded", function(){
    var mount = document.getElementById("trades-app");
    if(!mount) return;
    var root = ReactDOM.createRoot ? ReactDOM.createRoot(mount) : null;
    if(root){ root.render(h(App)); } else { ReactDOM.render(h(App), mount); }
  });
})();
(function(){
  const { useState, useEffect } = React;

  function WealthApp(){
    const STORAGE_KEY = "wealth-data-v1";
    const [entries, setEntries] = useState(() => {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    });
    const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
    const [asset, setAsset] = useState("");
    const [value, setValue] = useState("");

    useEffect(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }, [entries]);

    const filtered = entries.filter(e => e.month === month);
    const total = filtered.reduce((sum, e) => sum + e.value, 0);

    useEffect(() => {
      if(filtered.length > 0){
        renderChart(filtered);
      }
    }, [filtered]);

    function addEntry(){
      if(!asset || !value) return;
      setEntries([...entries, { id: Date.now(), month, asset, value: parseFloat(value) }]);
      setAsset(""); setValue("");
    }
    function deleteEntry(id){
      setEntries(entries.filter(e => e.id !== id));
    }

    return (
      <div>
        <h2>Vermögen ({month})</h2>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)} />
        <div>
          <input placeholder="Asset" value={asset} onChange={e=>setAsset(e.target.value)} />
          <input type="number" placeholder="Wert" value={value} onChange={e=>setValue(e.target.value)} />
          <button onClick={addEntry}>Hinzufügen</button>
        </div>
        <canvas id="wealth-chart" width="400" height="200"></canvas>
        <ul>
          {filtered.map(e => (
            <li key={e.id}>
              {e.asset}: {e.value.toLocaleString()} € 
              <button onClick={()=>deleteEntry(e.id)}>🗑️</button>
            </li>
          ))}
        </ul>
        <h3>Gesamt: {total.toLocaleString()} €</h3>
      </div>
    );
  }

  function renderChart(data){
    const ctx = document.getElementById("wealth-chart").getContext("2d");
    if(window.wealthChart) window.wealthChart.destroy();
    window.wealthChart = new Chart(ctx, {
      type: "pie",
      data: {
        labels: data.map(e=>e.asset),
        datasets: [{
          data: data.map(e=>e.value),
          backgroundColor: ["#4cafef","#f44336","#ff9800","#4caf50","#9c27b0","#03a9f4"]
        }]
      }
    });
  }

  ReactDOM.render(<WealthApp />, document.getElementById("wealth-app"));
})();
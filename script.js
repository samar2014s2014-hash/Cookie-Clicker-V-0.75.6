// script.js - modular, improved, with export/import, offline gains, better scaling
const DEFAULT = {
  coins: 0,
  clickPower: 1,
  autoCount: 0,
  cps: 0,
  lastSave: Date.now(),
  tempClickMult: 1, // NEW: Tracks temporary click multiplier
  tempAllMult: 1,   // NEW: Tracks temporary all multiplier
  shop: [
    // click upgrades (smaller steps)
    {id:'click1', name:'+1 Click', baseCost:10, level:0, type:'click', effect:1},
    {id:'click5', name:'+5 Click', baseCost:80, level:0, type:'click', effect:5},
    {id:'click25', name:'+25 Click', baseCost:600, level:0, type:'click', effect:25},
    {id:'click100', name:'+100 Click', baseCost:3000, level:0, type:'click', effect:100},
    // autos
    {id:'auto1', name:'Auto Clicker +1/s', baseCost:50, level:0, type:'auto', effect:1},
    {id:'auto10', name:'Auto Clicker +10/s', baseCost:900, level:0, type:'auto', effect:10},
    {id:'auto50', name:'Auto Clicker +50/s', baseCost:8000, level:0, type:'auto', effect:50},
    // multipliers
    {id:'multi2', name:'Multiplier x2', baseCost:2000, level:0, type:'mult', effect:2},
    {id:'multi3', name:'Multiplier x3', baseCost:10000, level:0, type:'mult', effect:3},
    // temporary boosts (note: these will NOT increase level when bought)
    {id:'temp_click', name:'Golden Cookie (x2 Click Power for 30s)', baseCost:100000, level:0, type:'temp_click', effect:2},
    {id:'temp_all', name:'Mega Multiplier (x3 All for 30s)', baseCost:500000, level:0, type:'temp_all', effect:3}
  ],
  achievements: {}
};

let state = load() || structuredClone(DEFAULT);

const elements = {
  coinsDisplay: document.getElementById('coinsDisplay'),
  coinsStat: document.getElementById('coinsStat'),
  cpsStat: document.getElementById('cpsStat'),
  clickArea: document.getElementById('clickArea'),
  clickPowerEl: document.getElementById('clickPower'),
  autoCountEl: document.getElementById('autoCount'),
  shopEl: document.getElementById('shop'),
  achListEl: document.getElementById('achList'),
  saveBtn: document.getElementById('saveBtn'),
  resetBtn: document.getElementById('resetBtn'),
  soundToggle: document.getElementById('soundToggle'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile')
};

const audioCtx = (typeof AudioContext !== 'undefined') ? new AudioContext() : null;
function playClick(){
  if(!audioCtx || !elements.soundToggle.checked) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'triangle'; o.frequency.value = 600 + Math.random()*200;
  g.gain.value = 0.02;
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + 0.06);
}

function formatNumber(n){
  if(!isFinite(n)) return '0';
  if(n >= 1e12) return (n/1e12).toFixed(2) + 'T';
  if(n >= 1e9) return (n/1e9).toFixed(2) + 'B';
  if(n >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if(n >= 1000) return (n/1000).toFixed(1) + 'K';
  return Math.floor(n);
}

function shopItemCost(item){
  // safer scaling: baseCost * (1.15 ^ level) * (1.02 ^ level^1.1)
  return Math.max(1, Math.floor(item.baseCost * Math.pow(1.15, item.level) * Math.pow(1.02, Math.pow(item.level,1.1))));
}

function render(){
  elements.coinsDisplay.textContent = formatNumber(state.coins);
  elements.coinsStat.textContent = `Coins: ${formatNumber(state.coins)}`;
  elements.cpsStat.textContent = `/s: ${formatNumber(state.cps)}`;
  // Round displayed numbers for a cleaner look
  elements.clickPowerEl.textContent = Math.floor(state.clickPower);
  elements.autoCountEl.textContent = Math.floor(state.autoCount);
  renderShop();
  renderAchievements();
}

function renderShop(){
  elements.shopEl.innerHTML = '';
  state.shop.forEach(item => {
    const cost = shopItemCost(item);
    const el = document.createElement('div');
    el.className = 'upgrade';
    // Display Lvl 0 for one-time temporary boosts
    const levelText = (item.type === 'temp_click' || item.type === 'temp_all') ? '' : `Lvl ${item.level}`;
    el.innerHTML = `
      <div class="row"><div><strong>${item.name}</strong></div><div class="small">${levelText}</div></div>
      <div class="row"><div class="small">Cost: ${formatNumber(cost)}</div><div><button class="btn" data-id="${item.id}">Buy</button></div></div>
    `;
    const btn = el.querySelector('button');
    btn.disabled = state.coins < cost;
    btn.addEventListener('click', () => buy(item.id));
    elements.shopEl.appendChild(el);
  });
}

function buy(id){
  const item = state.shop.find(s=>s.id===id);
  if(!item) return;
  const cost = shopItemCost(item);
  if(state.coins < cost) { flash('Not enough coins'); return; }
  
  state.coins -= cost;
  
  // CRITICAL FIX: Only increment level for permanent upgrades
  if(item.type !== 'temp_click' && item.type !== 'temp_all'){
      item.level += 1;
  }
  
  applyItemEffect(item);
  // CPS is recalculated within render() which calls recalcFromShop()
  render(); 
  save();
  flash('Purchased: ' + item.name);
}

function applyItemEffect(item){
  if(item.type === 'click'){
    // Recalc from shop will be called after render to ensure correct application
    recalcFromShop(state); 
  } else if(item.type === 'auto'){
    recalcFromShop(state);
  } else if(item.type === 'mult'){
    recalcFromShop(state);
  } else if(item.type === 'temp_click'){
    boostTemporary('click', item.effect, 30000);
  } else if(item.type === 'temp_all'){
    boostTemporary('all', item.effect, 30000);
  }
}

// CRITICAL FIX: Rewritten to safely apply and revert only the multiplier
function boostTemporary(multType, multiplier, duration){
    let propName;
    if(multType === 'click') propName = 'tempClickMult';
    else if(multType === 'all') propName = 'tempAllMult';
    else return;

    // Set the multiplier (overwriting any previous one)
    state[propName] = multiplier;
    
    // Recalculate stats with the new temporary multiplier
    recalcFromShop(state);
    render();
    flash('Boost Active!');

    // Set timer to revert
    setTimeout(()=>{
        state[propName] = 1; // Revert the multiplier
        recalcFromShop(state); // Recalculate everything with the new base
        render();
        flash('Boost Ended!');
    }, duration);
}

function recalcCPS(){
  // Recalc CPS is handled inside recalcFromShop now, but keeping this simple wrapper
  state.cps = state.autoCount * state.clickPower;
}

function doClick(){
  state.coins += state.clickPower;
  playClick();
  checkAchievements();
  render();
}

elements.clickArea.addEventListener('click', () => {
  doClick();
  elements.clickArea.animate([{transform:'scale(1)'},{transform:'scale(0.96)'},{transform:'scale(1)'}],{duration:160});
});

window.addEventListener('keydown', (e) => {
  if(e.code === 'Space' || e.key === 'Enter'){
    e.preventDefault();
    doClick();
  }
  if(e.key === 's' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); save(); flash('Saved'); }
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;
  // earn coins continuously proportional to cps
  if(state.cps > 0){
    state.coins += state.cps * (dt/1000);
  }
}, 100);

// REMOVED REDUNDANT setInterval for recalcCPS/render (L134 in original)

function save(){
  try{
    state.lastSave = Date.now();
    localStorage.setItem('clicker_state_v3', JSON.stringify(state));
    flash('Saved');
  }catch(e){
    console.warn('Save failed', e);
    flash('Save failed');
  }
}

elements.saveBtn.addEventListener('click', ()=>{ save(); });
elements.resetBtn.addEventListener('click', ()=>{
  if(!confirm('Reset game? This will clear progress.')) return;
  state = structuredClone(DEFAULT);
  // Ensure the default temporary multipliers are set to 1
  state.tempClickMult = 1;
  state.tempAllMult = 1; 
  save(); render(); flash('Reset');
});

// Export / Import
elements.exportBtn.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'clicker-save.json'; a.click();
  URL.revokeObjectURL(url);
  flash('Exported save');
});
elements.importBtn.addEventListener('click', ()=> elements.importFile.click());
elements.importFile.addEventListener('change', (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const imported = JSON.parse(reader.result);
      // basic validation and merge
      if(imported && imported.shop){
        state = imported;
        // Ensure new multiplier fields are present after import
        state.tempClickMult = state.tempClickMult || 1;
        state.tempAllMult = state.tempAllMult || 1;
        recalcFromShop(state);
        save(); render(); flash('Imported save');
      } else flash('Import failed: invalid file');
    }catch(err){ flash('Import failed: parse error'); }
  };
  reader.readAsText(f);
});

// achievements
function renderAchievements(){
  elements.achListEl.innerHTML = '';
  const list = Object.keys(state.achievements).filter(k=>state.achievements[k]);
  if(list.length === 0) elements.achListEl.innerHTML = '<div class="ach">None yet — earn coins!</div>';
  else list.forEach(a => { const d = document.createElement('div'); d.className='ach'; d.textContent = niceAchName(a); elements.achListEl.appendChild(d); });
}

function niceAchName(key){
  const map = {
    firstClick: 'First Click',
    hundred: '100 Coins',
    thousand: '1,000 Coins',
    tenK: '10,000 Coins',
    clickerPro: 'Clicker Pro (1000 clicks)'
  };
  return map[key] || key;
}

function checkAchievements(){
  if(!state.achievements.firstClick && state.coins > 0){ state.achievements.firstClick = true; flash('First Click!'); }
  if(!state.achievements.hundred && state.coins >= 100){ state.achievements.hundred = true; flash('100 Coins!'); }
  if(!state.achievements.thousand && state.coins >= 1000){ state.achievements.thousand = true; flash('1,000 Coins!'); }
  if(!state.achievements.tenK && state.coins >= 10000){ state.achievements.tenK = true; flash('10,000 Coins!'); }
  save();
}

// Load + offline gains
function load(){
  try{
    const raw = localStorage.getItem('clicker_state_v3');
    if(!raw) return null;
    const s = JSON.parse(raw);
    
    // ensure new default fields exist after loading an old save
    s.shop = s.shop || DEFAULT.shop;
    s.achievements = s.achievements || {};
    s.tempClickMult = s.tempClickMult || 1; // ensure new field is 1 by default
    s.tempAllMult = s.tempAllMult || 1;     // ensure new field is 1 by default

    recalcFromShop(s);
    // offline accrual
    if(s.lastSave){
      const diff = Date.now() - s.lastSave;
      const seconds = Math.floor(diff/1000);
      if(seconds > 5){
        // Do not need to call recalcCPS here, it's done in recalcFromShop above
        const offlineGain = s.cps * seconds;
        s.coins += offlineGain;
        toast('Offline gains: ' + formatNumber(Math.floor(offlineGain)) + ' coins (' + seconds + 's)');
      }
    }
    return s;
  }catch(e){ console.warn('Load failed', e); return null; }
}

// CRITICAL FIX: Now calculates permanent effects first, then applies temporary multipliers.
function recalcFromShop(s){
  let cp_base = 1; // Base click power from permanent upgrades
  let ac_base = 0; // Base auto count from permanent upgrades

  s.shop.forEach(item => {
    if(item.type === 'click') cp_base += (item.level || 0) * item.effect;
    if(item.type === 'auto') ac_base += (item.level || 0) * item.effect;
    
    // EFFICIENCY FIX: Replaced loop with Math.pow for permanent multipliers
    if(item.type === 'mult'){ cp_base *= Math.pow(item.effect, item.level || 0); }
  });

  // Apply temporary multipliers (tracked in state) to the base values
  // Click power gets both temp click and temp all
  s.clickPower = cp_base * s.tempClickMult * s.tempAllMult;
  // Auto count only gets temp all
  s.autoCount = ac_base * s.tempAllMult;
  
  s.cps = s.autoCount * s.clickPower;
}

// little UI helpers
function flash(text){
  const old = elements.saveBtn.textContent;
  elements.saveBtn.textContent = text;
  setTimeout(()=>elements.saveBtn.textContent = old,900);
}
function toast(text){
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  document.body.appendChild(el);
  setTimeout(()=>el.style.opacity='0',2600);
  setTimeout(()=>el.remove(),3200);
}

// initial render and autosave
// REMOVED REDUNDANT recalcFromShop(state) call here (L231 in original)
render();
setInterval(()=>{ state.lastSave = Date.now(); localStorage.setItem('clicker_state_v3', JSON.stringify(state)); }, 5000);

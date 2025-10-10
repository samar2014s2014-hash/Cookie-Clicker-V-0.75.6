// script.js - improved, robust, bug-free Cookie Clicker logic

const STORAGE_KEY = 'clicker_state_v3';

const DEFAULT = {
  coins: 0,
  clickPower: 1,
  autoCount: 0,
  cps: 0,
  lastSave: Date.now(),
  shop: [
    {id:'click1', name:'+1 Click', baseCost:10, level:0, type:'click', effect:1},
    {id:'click5', name:'+5 Click', baseCost:80, level:0, type:'click', effect:5},
    {id:'click25', name:'+25 Click', baseCost:600, level:0, type:'click', effect:25},
    {id:'click100', name:'+100 Click', baseCost:3000, level:0, type:'click', effect:100},
    {id:'auto1', name:'Auto Clicker +1/s', baseCost:50, level:0, type:'auto', effect:1},
    {id:'auto10', name:'Auto Clicker +10/s', baseCost:900, level:0, type:'auto', effect:10},
    {id:'auto50', name:'Auto Clicker +50/s', baseCost:8000, level:0, type:'auto', effect:50},
    {id:'multi2', name:'Multiplier x2', baseCost:2000, level:0, type:'mult', effect:2},
    {id:'multi3', name:'Multiplier x3', baseCost:10000, level:0, type:'mult', effect:3},
    {id:'temp_click', name:'Golden Cookie (x2 Click Power for 30s)', baseCost:100000, level:0, type:'temp_click', effect:2},
    {id:'temp_all', name:'Mega Multiplier (x3 All for 30s)', baseCost:500000, level:0, type:'temp_all', effect:3}
  ],
  achievements: {}
};

function getElements() {
  return {
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
}

let state = load() || structuredClone(DEFAULT);

const elements = getElements();

let audioCtx;
let soundUnlocked = false;
function playClick(){
  if(!elements.soundToggle.checked) return;
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.value = 600 + Math.random()*200;
    g.gain.value = 0.02;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.06);
  } catch (e) {
    // ignore sound errors
  }
}

function unlockAudioContext() {
  if (!audioCtx) {
    audioCtx = (typeof window.AudioContext !== "undefined")
      ? new window.AudioContext()
      : (typeof window.webkitAudioContext !== "undefined")
        ? new window.webkitAudioContext()
        : null;
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  soundUnlocked = true;
}

// Format number for display
function formatNumber(n){
  if(!isFinite(n)) return '0';
  if(n >= 1e12) return (n/1e12).toFixed(2) + 'T';
  if(n >= 1e9) return (n/1e9).toFixed(2) + 'B';
  if(n >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if(n >= 1000) return (n/1000).toFixed(1) + 'K';
  return Math.floor(n);
}

function shopItemCost(item){
  return Math.max(1, Math.floor(item.baseCost * Math.pow(1.15, item.level) * Math.pow(1.02, Math.pow(item.level,1.1))));
}

function render(){
  elements.coinsDisplay.textContent = formatNumber(state.coins);
  elements.coinsStat.textContent = `Coins: ${formatNumber(state.coins)}`;
  elements.cpsStat.textContent = `/s: ${formatNumber(state.cps)}`;
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
    el.innerHTML = `
      <div class="row"><div><strong>${item.name}</strong></div><div class="small">Lvl ${item.level}</div></div>
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
  item.level += 1;
  applyItemEffect(item);
  recalcCPS();
  render();
  save();
  flash('Purchased: ' + item.name);
}

function applyItemEffect(item){
  if(item.type === 'click'){
    state.clickPower += item.effect;
  } else if(item.type === 'auto'){
    state.autoCount += item.effect;
  } else if(item.type === 'mult'){
    state.clickPower *= item.effect;
  } else if(item.type === 'temp_click'){
    boostTemporary('clickPower', item.effect, 30000);
  } else if(item.type === 'temp_auto'){
    boostTemporary('autoCount', item.effect, 30000);
  } else if(item.type === 'temp_all'){
    boostTemporary('all', item.effect, 30000);
  }
}

function boostTemporary(stat, multiplier, duration){
  const original = {clickPower: state.clickPower, autoCount: state.autoCount};
  if(stat === 'clickPower') state.clickPower *= multiplier;
  else if(stat === 'autoCount') state.autoCount *= multiplier;
  else if(stat === 'all'){ state.clickPower *= multiplier; state.autoCount *= multiplier; }
  recalcCPS();
  flash('Boost Active!');
  render();
  setTimeout(()=>{
    state.clickPower = original.clickPower;
    state.autoCount = original.autoCount;
    recalcCPS();
    render();
    flash('Boost Ended!');
  }, duration);
}

function recalcCPS(){
  state.cps = state.autoCount * state.clickPower;
}

function doClick(){
  state.coins += state.clickPower;
  playClick();
  checkAchievements();
  render();
}

// Accessibility: also focus ring on click area
elements.clickArea.addEventListener('click', () => {
  doClick();
  elements.clickArea.animate([{transform:'scale(1)'},{transform:'scale(0.96)'},{transform:'scale(1)'}],{duration:160});
});
elements.clickArea.addEventListener('keydown', (e) => {
  if(e.code === 'Space' || e.key === 'Enter'){
    e.preventDefault();
    doClick();
  }
});
elements.clickArea.addEventListener('pointerdown', unlockAudioContext);
elements.clickArea.addEventListener('touchstart', unlockAudioContext);

// Keyboard shortcut for save
window.addEventListener('keydown', (e) => {
  if(e.key === 's' && (e.ctrlKey || e.metaKey)){
    e.preventDefault();
    save();
    flash('Saved');
  }
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

// Recalc/render every second
setInterval(() => { recalcCPS(); render(); }, 1000);

function save(){
  try{
    state.lastSave = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  recalcFromShop(state);
  save(); render(); flash('Reset');
});

// Export / Import
elements.exportBtn.addEventListener('click', ()=>{
  try {
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'clicker-save.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('Exported save');
  } catch (e) {
    flash('Export failed');
  }
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
      if(imported && Array.isArray(imported.shop)){
        state = imported;
        recalcFromShop(state);
        save(); render(); flash('Imported save');
      } else flash('Import failed: invalid file');
    }catch(err){ flash('Import failed: parse error'); }
  };
  reader.readAsText(f);
});

function renderAchievements(){
  elements.achListEl.innerHTML = '';
  const list = Object.keys(state.achievements).filter(k=>state.achievements[k]);
  if(list.length === 0) elements.achListEl.innerHTML = '<div class="ach">None yet — earn coins!</div>';
  else list.forEach(a => {
    const d = document.createElement('div');
    d.className='ach';
    d.textContent = niceAchName(a);
    elements.achListEl.appendChild(d);
  });
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
  let changed = false;
  if(!state.achievements.firstClick && state.coins > 0){ state.achievements.firstClick = true; flash('First Click!'); changed = true; }
  if(!state.achievements.hundred && state.coins >= 100){ state.achievements.hundred = true; flash('100 Coins!'); changed = true; }
  if(!state.achievements.thousand && state.coins >= 1000){ state.achievements.thousand = true; flash('1,000 Coins!'); changed = true; }
  if(!state.achievements.tenK && state.coins >= 10000){ state.achievements.tenK = true; flash('10,000 Coins!'); changed = true; }
  if(changed) save();
}

// Load + offline gains
function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const s = JSON.parse(raw);
    // ensure default fields exist
    s.shop = s.shop || structuredClone(DEFAULT.shop);
    s.achievements = s.achievements || {};
    s.clickPower = s.clickPower || DEFAULT.clickPower;
    s.autoCount = s.autoCount || DEFAULT.autoCount;
    recalcFromShop(s);
    // offline accrual
    if(s.lastSave){
      const diff = Date.now() - s.lastSave;
      const seconds = Math.floor(diff/1000);
      if(seconds > 5){
        recalcCPS();
        const offlineGain = s.cps * seconds;
        s.coins += offlineGain;
        toast('Offline gains: ' + formatNumber(Math.floor(offlineGain)) + ' coins (' + seconds + 's)');
      }
    }
    return s;
  }catch(e){ console.warn('Load failed', e); return null; }
}

function recalcFromShop(s){
  let cp = 1; let ac = 0;
  s.shop.forEach(item => {
    if(item.type === 'click') cp += (item.level || 0) * item.effect;
    if(item.type === 'auto') ac += (item.level || 0) * item.effect;
    if(item.type === 'mult'){ for(let i=0;i<(item.level||0);i++) cp *= item.effect; }
  });
  s.clickPower = cp; s.autoCount = ac; s.cps = ac * cp;
}

// UI helpers
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
recalcFromShop(state);
render();
setInterval(()=>{ state.lastSave = Date.now(); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, 5000);

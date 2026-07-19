(()=>{
'use strict';

const CATS = [
  {name:'Food',icon:'🍔',color:'#f97316'},
  {name:'Coffee',icon:'☕',color:'#92400e'},
  {name:'Transport',icon:'🚗',color:'#3b82f6'},
  {name:'Shopping',icon:'🛍️',color:'#8b5cf6'},
  {name:'Health',icon:'💊',color:'#ef4444'},
  {name:'Bills',icon:'💱',color:'#eab308'},
  {name:'Fun',icon:'🎮',color:'#ec4899'},
  {name:'Home',icon:'🏠',color:'#14b8a6'},
  {name:'Income',icon:'💰',color:'#10b981'},
  {name:'Other',icon:'📦',color:'#6b7280'},
];
const catMap = Object.fromEntries(CATS.map(c=>[c.name,c]));
const getCat = n => catMap[n]||{name:n,icon:'📦',color:'#6b7280'};

let amt = '0';
let selectedCat = null;
let histMonth = new Date();

// DOM
const $=id=>document.getElementById(id);
const amtEl=$('amount-value'), noteEl=$('note-input'), catsEl=$('categories');
const toastEl=$('toast'), todayBadge=$('today-total-badge'), topDate=$('top-date');
const screenEntry=$('screen-entry'), screenHistory=$('screen-history');

// --- Helpers ---
function fmtMoney(n){return '$'+Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',')}
function fmtDate(s){const d=new Date(s+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
function monthStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function fmtMonth(d){return d.toLocaleDateString('en-US',{month:'long',year:'numeric'})}
function today(){return new Date().toISOString().split('T')[0]}
function toast(msg,ok){
  toastEl.textContent=msg;toastEl.className='toast'+(ok?' success':'')+' show';
  setTimeout(()=>toastEl.classList.remove('show'),2000)
}
async function api(url,opts){
  const r=await fetch(url,opts);
  if(!r.ok){const b=await r.json().catch(()=>({}));throw new Error(b.error||'failed')}
  return r.json()
}

// --- Amount pad ---
function setAmt(v){amt=v;amtEl.textContent=amt}
function pressKey(k){
  if(k==='del'){setAmt(amt.length<=1?'0':amt.slice(0,-1));return}
  if(k==='.'&&amt.includes('.'))return;
  if(amt.includes('.')&&amt.split('.')[1].length>=2)return;
  if(amt==='0'&&k!=='.')setAmt(k);else setAmt(amt+k)
}

// --- Render categories ---
function renderCats(){
  catsEl.innerHTML=CATS.map(c=>
    `<button class="cat-btn${selectedCat===c.name?' selected':''}" data-cat="${c.name}">
      <span class="cat-icon">${c.icon}</span>
      <span class="cat-name">${c.name}</span>
    </button>`
  ).join('');
}

// --- Submit on category tap ---
async function submit(catName){
  const val=parseFloat(amt);
  if(!val||val<=0){toast('Enter an amount first');return}
  const isIncome = catName==='Income';
  const amount = isIncome ? val : -val;
  try{
    await api('/api/transactions',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({amount,category:catName,description:noteEl.value.trim(),date:today()})
    });
    toast(isIncome?'+'+fmtMoney(val)+' income':fmtMoney(val)+' '+catName,true);
    setAmt('0');noteEl.value='';selectedCat=null;renderCats();
    loadTodayTotal();
  }catch(e){toast('Error: '+e.message)}
}

// --- Today total badge ---
async function loadTodayTotal(){
  try{
    const d=await api('/api/summary?month='+monthStr(new Date()));
    const spent=Math.abs(d.total_expenses||0);
    todayBadge.textContent=fmtMoney(spent);
  }catch(e){todayBadge.textContent='$0'}
}

// --- History screen ---
function showHistory(){screenHistory.classList.add('active');screenEntry.classList.add('slide-left');loadHistory()}
function hideHistory(){screenHistory.classList.remove('active');screenEntry.classList.remove('slide-left')}

async function loadHistory(){
  const m=monthStr(histMonth);
  $('month-label').textContent=fmtMonth(histMonth);
  try{
    const [txData,summary]=await Promise.all([
      api('/api/transactions?month='+m),
      api('/api/summary?month='+m)
    ]);
    renderSummary(summary);
    renderTxns(txData.transactions||[]);
  }catch(e){console.error(e)}
}

function renderSummary(s){
  $('sum-expense').textContent=fmtMoney(s.total_expenses||0);
  $('sum-income').textContent=fmtMoney(s.total_income||0);
  const net=(s.total_income||0)-(s.total_expenses||0);
  const netEl=$('sum-net');
  netEl.textContent=(net<0?'-':'')+fmtMoney(net);
  netEl.className='summary-val'+(net<0?' expense':net>0?' income':'');

  const cats=(s.by_category||[]).filter(c=>c.total<0).sort((a,b)=>a.total-b.total);
  $('cat-summary').innerHTML=cats.map(c=>{
    const info=getCat(c.category);
    return `<span class="cat-pill"><span class="pill-icon">${info.icon}</span>${c.category} <span class="pill-amount">${fmtMoney(c.total)}</span></span>`
  }).join('');
}

function renderTxns(txns){
  const el=$('txn-list');
  if(!txns.length){el.innerHTML='<div class="empty-msg"><div class="e-icon">💭</div>No transactions this month</div>';return}
  const groups={};
  txns.forEach(t=>{(groups[t.date]=groups[t.date]||[]).push(t)});
  let html='';
  Object.keys(groups).sort().reverse().forEach(date=>{
    html+=`<div class="date-label">${fmtDate(date)}</div>`;
    groups[date].forEach(t=>{
      const info=getCat(t.category);
      const pos=t.amount>=0;
      const desc = (t.description && typeof t.description === 'string') ? t.description : '';
      html+=`<div class="txn-row">
        <span class="txn-icon">${info.icon}</span>
        <div class="txn-info">
          <div class="txn-cat">${t.category}</div>
          ${desc?`<div class="txn-note">${esc(desc)}</div>`:''}
        </div>
        <span class="txn-amt ${pos?'pos':'neg'}">${pos?'+':''}${fmtMoney(t.amount)}</span>
        <button class="txn-del" data-id="${t.id}">✕</button>
      </div>`;
    });
  });
  el.innerHTML=html;
  el.querySelectorAll('.txn-del').forEach(b=>b.addEventListener('click',()=>delTxn(b.dataset.id)));
}

function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

async function delTxn(id){
  if(!confirm('Delete this transaction?'))return;
  try{await api('/api/transactions/'+id,{method:'DELETE'});toast('Deleted',true);loadHistory();loadTodayTotal()}catch(e){toast('Error: '+e.message)}
}

// --- Events ---
document.querySelector('.numpad').addEventListener('click',e=>{
  const k=e.target.closest('.num-key');
  if(k)pressKey(k.dataset.key);
});

catsEl.addEventListener('click',e=>{
  const btn=e.target.closest('.cat-btn');
  if(!btn)return;
  const cat=btn.dataset.cat;
  // If amount entered, submit immediately. Otherwise just select.
  if(amt!=='0'&&parseFloat(amt)>0){
    submit(cat);
  } else {
    selectedCat=selectedCat===cat?null:cat;
    renderCats();
  }
});

$('btn-history').addEventListener('click',showHistory);
$('btn-today-total').addEventListener('click',showHistory);
$('btn-back').addEventListener('click',hideHistory);
$('month-prev').addEventListener('click',()=>{histMonth.setMonth(histMonth.getMonth()-1);loadHistory()});
$('month-next').addEventListener('click',()=>{histMonth.setMonth(histMonth.getMonth()+1);loadHistory()});

// physical keyboard
document.addEventListener('keydown',e=>{
  if(document.activeElement===noteEl)return;
  if(e.key>='0'&&e.key<='9')pressKey(e.key);
  else if(e.key==='.')pressKey('.');
  else if(e.key==='Backspace')pressKey('del');
});

// --- Init ---
topDate.textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
renderCats();
loadTodayTotal();

// PWA install
if('serviceWorker' in navigator){navigator.serviceWorker.register('/static/sw.js').catch(()=>{})}
})();

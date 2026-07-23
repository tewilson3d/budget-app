(()=>{
'use strict';

// Categories (must match server). Order = 2x2 grid.
const CATS = [
  {name:'Food',        icon:'\u{1F35C}', color:'#f97316', period:'daily'},
  {name:'Groceries',   icon:'\u{1F6D2}', color:'#3b82f6', period:'monthly'},
  {name:'Dogs',        icon:'\u{1F436}', color:'#a855f7', period:'monthly'},
  {name:'Miscellaneous',icon:'\u{1F4E6}',color:'#6b7280', period:'monthly'},
];
const catMap = Object.fromEntries(CATS.map(c=>[c.name,c]));
const getCat = n => catMap[n]||{name:n,icon:'\u{1F4E6}',color:'#6b7280'};

let amt = '0';
let viewMonth = new Date();

// DOM
const $=id=>document.getElementById(id);
const amtEl=$('amount-value'), catsEl=$('categories'), toastEl=$('toast'), topDate=$('top-date');
const screenEntry=$('screen-entry'), screenBudget=$('screen-budget');

// --- Helpers ---
function fmtB(n){
  const v=Math.round((Math.abs(n)+Number.EPSILON)*100)/100;
  const s=(v%1===0)?v.toFixed(0):v.toFixed(2);
  return '\u0e3f'+s.replace(/\B(?=(\d{3})+(?!\d))/g,',');
}
function monthStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function fmtMonth(d){return d.toLocaleDateString('en-US',{month:'long',year:'numeric'})}
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function fmtDate(s){const d=new Date(s+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
function toast(msg,ok){
  toastEl.textContent=msg;toastEl.className='toast'+(ok?' success':' error')+' show';
  setTimeout(()=>toastEl.classList.remove('show'),1800);
}
async function api(url,opts){
  const r=await fetch(url,opts);
  if(!r.ok){const b=await r.json().catch(()=>({}));throw new Error(b.error||'failed')}
  return r.json();
}

// --- Amount pad ---
function setAmt(v){amt=v;amtEl.textContent=amt}
function pressKey(k){
  if(k==='del'){setAmt(amt.length<=1?'0':amt.slice(0,-1));return}
  if(k==='.'){if(amt.includes('.'))return; setAmt(amt+'.'); return}
  if(amt.includes('.')&&amt.split('.')[1].length>=2)return;
  if(amt==='0')setAmt(k);else setAmt(amt+k);
}

// --- Categories (entry) ---
function renderCats(){
  catsEl.innerHTML=CATS.map(c=>
    `<button class="cat-btn" data-cat="${c.name}" style="--c:${c.color}">
      <span class="cat-icon">${c.icon}</span>
      <span class="cat-name">${c.name}</span>
    </button>`
  ).join('');
}

async function submit(catName){
  const val=parseFloat(amt);
  if(!val||val<=0){toast('Enter an amount first');return}
  try{
    await api('/api/transactions',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({amount:val,category:catName,date:today()})
    });
    toast('Saved '+fmtB(val)+' \u00b7 '+catName,true);
    if(navigator.vibrate)navigator.vibrate(15);
    setAmt('0');
    loadReminder();
  }catch(e){toast('Error: '+e.message)}
}

// --- Food reminder (entry page) ---
async function loadReminder(){
  try{
    const d=await api('/api/summary?month='+monthStr(new Date()));
    const food=(d.today&&d.today.food)||0;
    const budget=(d.today&&d.today.food_budget)||0;
    const frText=$('fr-text'), frFill=$('fr-fill');
    if(budget>0){
      const pct=Math.min(100,(food/budget)*100);
      frFill.style.width=pct+'%';
      const over=food>budget;
      frFill.style.background=over?'var(--red)':(pct>80?'var(--amber)':'var(--green)');
      const diff=budget-food;
      frText.innerHTML=`Food today: <b>${fmtB(food)}</b> of ${fmtB(budget)} `+
        (over?`<span class="over">(${fmtB(-diff)} over)</span>`:`<span class="under">(${fmtB(diff)} left)</span>`);
    }else{
      frFill.style.width='0%';
      frText.innerHTML=`Food today: <b>${fmtB(food)}</b> (no budget set)`;
    }
  }catch(e){/* silent */}
}

// --- Navigation ---
function showBudget(){screenBudget.classList.add('active');screenEntry.classList.add('slide-left');loadBudget()}
function hideBudget(){screenBudget.classList.remove('active');screenEntry.classList.remove('slide-left')}

// --- Budget / overview page ---
let lastSummary=null;
async function loadBudget(){
  const m=monthStr(viewMonth);
  $('month-label').textContent=fmtMonth(viewMonth);
  try{
    const [summary,txData]=await Promise.all([
      api('/api/summary?month='+m),
      api('/api/transactions?month='+m)
    ]);
    lastSummary=summary;
    renderBudgetCards(summary);
    renderTxns(txData.transactions||[]);
    $('month-total').innerHTML='Spent this month: <b>'+fmtB(summary.month_total||0)+'</b>';
  }catch(e){console.error(e);toast('Load error: '+e.message)}
}

function renderBudgetCards(s){
  const el=$('budget-cards');
  const dayOfMonth=s.day_of_month||1;
  const dim=s.days_in_month||30;
  el.innerHTML=(s.categories||[]).map(c=>{
    const info=getCat(c.category);
    const budget=c.budget||0;
    const spent=c.month||0; // month-to-date spend for the bar
    const pct=budget>0?Math.min(100,(spent/budget)*100):0;
    const over=budget>0&&spent>budget;
    let paceHtml='';
    if(c.period==='daily'){
      // Food: expected pace by today
      const pace=(s.food_month_pace!=null)?s.food_month_pace:0;
      const dailyBudget=(s.today&&s.today.food_budget)||0;
      const diffPace=spent-pace;
      const paceCls=diffPace>0?'over':'under';
      paceHtml=`<div class="bc-pace">Daily \u0e3f${fmtNum(dailyBudget)} \u00b7 by day ${dayOfMonth} expect ${fmtB(pace)} \u2192 `+
        `<span class="${paceCls}">${diffPace>0?fmtB(diffPace)+' ahead':fmtB(-diffPace)+' under'}</span></div>`;
    }
    const barColor=over?'var(--red)':(pct>80?'var(--amber)':info.color);
    const budgetLabel=budget>0?('of '+fmtB(budget)+(c.period==='daily'?' /mo':'')):'no budget';
    return `<div class="bcard" data-cat="${c.category}">
      <div class="bc-head">
        <span class="bc-icon" style="background:${info.color}22;color:${info.color}">${info.icon}</span>
        <span class="bc-name">${c.category}</span>
        <span class="bc-badge">${c.period}</span>
        <button class="bc-edit" data-cat="${c.category}" data-amt="${c.period==='daily'?((s.today&&s.today.food_budget)||0):budget}">edit</button>
      </div>
      <div class="bc-nums"><b>${fmtB(spent)}</b> <span class="bc-of">${budgetLabel}</span></div>
      <div class="bc-bar"><div class="bc-fill" style="width:${pct}%;background:${barColor}"></div></div>
      ${paceHtml}
    </div>`;
  }).join('');
  el.querySelectorAll('.bc-edit').forEach(b=>b.addEventListener('click',ev=>{
    ev.stopPropagation();
    editBudget(b.dataset.cat, parseFloat(b.dataset.amt)||0);
  }));
}

function fmtNum(n){const v=Math.round(n);return v.toLocaleString('en-US')}

async function editBudget(cat, current){
  const info=getCat(cat);
  const label=info.period==='daily'?'daily food budget (\u0e3f)':'monthly budget (\u0e3f)';
  const v=prompt('Set '+cat+' '+label+':', current||'');
  if(v===null)return;
  const amount=parseFloat(v);
  if(isNaN(amount)||amount<0){toast('Invalid amount');return}
  try{
    await api('/api/budgets/'+encodeURIComponent(cat),{
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({amount})
    });
    toast('Budget saved',true);
    loadBudget();loadReminder();
  }catch(e){toast('Error: '+e.message)}
}

function renderTxns(txns){
  const el=$('txn-list');
  if(!txns.length){el.innerHTML='<div class="empty-msg"><div class="e-icon">\u{1F4AD}</div>No transactions this month</div>';return}
  const groups={};
  txns.forEach(t=>{(groups[t.date]=groups[t.date]||[]).push(t)});
  let html='';
  Object.keys(groups).sort().reverse().forEach(date=>{
    const dayTotal=groups[date].reduce((a,t)=>a+t.amount,0);
    html+=`<div class="date-label"><span>${fmtDate(date)}</span><span class="date-total">${fmtB(dayTotal)}</span></div>`;
    groups[date].forEach(t=>{
      const info=getCat(t.category);
      html+=`<div class="txn-row">
        <span class="txn-icon" style="background:${info.color}22;color:${info.color}">${info.icon}</span>
        <div class="txn-info"><div class="txn-cat">${t.category}</div></div>
        <span class="txn-amt">${fmtB(t.amount)}</span>
        <button class="txn-del" data-id="${t.id}">\u2715</button>
      </div>`;
    });
  });
  el.innerHTML=html;
  el.querySelectorAll('.txn-del').forEach(b=>b.addEventListener('click',()=>delTxn(b.dataset.id)));
}

async function delTxn(id){
  if(!confirm('Delete this transaction?'))return;
  try{await api('/api/transactions/'+id,{method:'DELETE'});toast('Deleted',true);loadBudget();loadReminder()}catch(e){toast('Error: '+e.message)}
}

async function pushSheet(){
  try{
    const d=await api('/api/push',{method:'POST'});
    toast(d.ok?'Pushed to Sheets':(d.message||'Not connected'), d.ok);
  }catch(e){toast('Error: '+e.message)}
}

// --- Events ---
document.querySelector('.numpad').addEventListener('click',e=>{
  const k=e.target.closest('.num-key');
  if(k)pressKey(k.dataset.key);
});
catsEl.addEventListener('click',e=>{
  const btn=e.target.closest('.cat-btn');
  if(btn)submit(btn.dataset.cat);
});
$('btn-budgets').addEventListener('click',showBudget);
$('btn-back').addEventListener('click',hideBudget);
$('btn-push').addEventListener('click',pushSheet);
$('month-prev').addEventListener('click',()=>{viewMonth.setMonth(viewMonth.getMonth()-1);loadBudget()});
$('month-next').addEventListener('click',()=>{viewMonth.setMonth(viewMonth.getMonth()+1);loadBudget()});

document.addEventListener('keydown',e=>{
  if(!screenBudget.classList.contains('active')){
    if(e.key>='0'&&e.key<='9')pressKey(e.key);
    else if(e.key==='.')pressKey('.');
    else if(e.key==='Backspace')pressKey('del');
  }
});

// --- Init ---
topDate.textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
renderCats();
loadReminder();
if('serviceWorker' in navigator){navigator.serviceWorker.register('/static/sw.js').catch(()=>{})}
})();

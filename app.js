'use strict';

// Приложение работает локально. Никаких запросов с финансовыми данными не отправляется.
const STORAGE_KEY = 'my-finances-v1';
const ACCOUNT_NAMES = {card:'Карта',savings:'Накопительный'};
const ACCOUNT_ICONS = {card:'💳',savings:'🏦'};
const CATEGORIES = {
  expense: [
    {id:'food',name:'Кафе и еда',icon:'☕',color:'#69d7bd'},
    {id:'groceries',name:'Продукты',icon:'🛒',color:'#77a7fc'},
    {id:'games',name:'Игры',icon:'🎮',color:'#aa91fa'},
    {id:'transport',name:'Транспорт',icon:'🚕',color:'#f8c178'},
    {id:'gifts',name:'Подарки',icon:'🎁',color:'#f18db5'},
    {id:'housing',name:'Дом и счета',icon:'🏠',color:'#78cddd'},
    {id:'health',name:'Здоровье',icon:'💊',color:'#bcdf8d'},
    {id:'shopping',name:'Покупки',icon:'🛍️',color:'#edaa7e'},
    {id:'other',name:'Другое',icon:'✨',color:'#8b9db8'}
  ],
  income: [
    {id:'salary',name:'Зарплата',icon:'💼',color:'#69d7bd'},
    {id:'refund',name:'Возврат',icon:'↩️',color:'#77a7fc'},
    {id:'other_income',name:'Другой доход',icon:'✨',color:'#aa91fa'}
  ]
};
const MAX_MONEY = 999999999999; // копейки: не более 9 999 999 999,99 ₽
const $ = id => document.getElementById(id);
const now = new Date();
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const currentMonth = () => todayLocal().slice(0,7);
const money = kopecks => `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2,minimumFractionDigits:0}).format(kopecks/100)} ₽`;
const signedMoney = (amount, sign) => `${sign}${money(amount)}`;
const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtInput = amount => (amount/100).toFixed(2).replace('.',',');
const fmtDate = date => {
  const [y,m,d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'}).format(new Date(y,m-1,d));
};
const monthName = ym => {
  const [y,m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));
};
const shortMonth = ym => {
  const [y,m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(new Date(y,m-1,1)).replace('.','');
};
const shiftMonth = (ym, delta) => {
  const [y,m] = ym.split('-').map(Number);
  const d = new Date(y,m-1+delta,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};
const defaultData = () => ({
  version:1, sourceApp:'my-finances-pwa', accounts:{card:0,savings:0},
  monthlyBudget:0,savingsGoal:0,transactions:[]
});
function amountToKopecks(value,{allowZero=false,allowNegative=false}={}) {
  const normalized = String(value).trim().replace(/[\s\u00a0\u202f₽]/g,'').replace(',','.');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const result = Math.round(Number(normalized)*100);
  if (!Number.isSafeInteger(result) || Math.abs(result)>MAX_MONEY || (!allowNegative && result<0) || (!allowZero && result===0)) return null;
  return result;
}
function validDate(input) {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const [y,m,d] = input.split('-').map(Number), date = new Date(y,m-1,d);
  return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d && y>=2000 && y<=2100;
}
function validateBackup(raw) {
  if (!raw || typeof raw!=='object' || raw.version!==1 || raw.sourceApp!=='my-finances-pwa' || !raw.accounts || !Array.isArray(raw.transactions)) throw new Error('Формат файла не поддерживается');
  if (raw.transactions.length>50000) throw new Error('Слишком много операций');
  const number = (val,negative=false) => Number.isSafeInteger(val) && Math.abs(val)<=MAX_MONEY && (negative || val>=0);
  if (!number(raw.accounts.card,true) || !number(raw.accounts.savings,true) || !number(raw.monthlyBudget) || !number(raw.savingsGoal)) throw new Error('Некорректные остатки или лимиты');
  const seen = new Set();
  const transactions = raw.transactions.map(t => {
    if (!t || typeof t!=='object' || !['expense','income','transfer'].includes(t.type) || !number(t.amount) || t.amount===0 || !ACCOUNT_NAMES[t.accountId] || !validDate(t.date) || typeof t.note!=='string' || t.note.length>160 || typeof t.id!=='string' || !/^[\w-]{1,80}$/.test(t.id) || seen.has(t.id)) throw new Error('Некорректная операция в файле');
    seen.add(t.id);
    if (t.type==='transfer') {
      if (!ACCOUNT_NAMES[t.toAccountId] || t.toAccountId===t.accountId) throw new Error('Некорректный перевод в файле');
    } else if (!CATEGORIES[t.type].some(c => c.id===t.category)) throw new Error('Неизвестная категория в файле');
    return {id:t.id,type:t.type,amount:t.amount,accountId:t.accountId,toAccountId:t.type==='transfer'?t.toAccountId:null,category:t.type==='transfer'?null:t.category,note:t.note,date:t.date,createdAt:typeof t.createdAt==='string'?t.createdAt:''};
  });
  return {version:1,sourceApp:'my-finances-pwa',accounts:{card:raw.accounts.card,savings:raw.accounts.savings},monthlyBudget:raw.monthlyBudget,savingsGoal:raw.savingsGoal,transactions};
}
let data;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  data = saved ? validateBackup(JSON.parse(saved)) : defaultData();
} catch (e) {
  data = defaultData();
  alert('Не удалось прочитать сохранённые данные. Они НЕ были перезаписаны. Проверьте резервную копию перед добавлением новых операций.');
}
let hasStorageReadError = false;
try { if (localStorage.getItem(STORAGE_KEY)) validateBackup(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
catch { hasStorageReadError = true; }
let tab = 'home';
let filterMonth = currentMonth();
let filterType = 'all';
let filterQuery = '';
let editingId = null;
let activeTxType = 'expense';
let toastTimeout;

function persist() {
  if (hasStorageReadError) { alert('Сохранение заблокировано: предыдущие данные не удалось прочитать. Сначала сохраните или восстановите копию.'); return false; }
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); return true; }
  catch { alert('Не удалось сохранить данные на устройстве. Экспортируйте резервную копию в настройках.'); return false; }
}
function toast(message) {
  const node = $('toast'); node.textContent=message;node.classList.add('show');
  clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>node.classList.remove('show'),2600);
}
function category(type,id) {
  return CATEGORIES[type]?.find(c=>c.id===id) || {name:'Другое',icon:'✨',color:'#889ab4'};
}
function sortedTransactions() {
  return [...data.transactions].sort((a,b)=>b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
function balanceOf(account) {
  let balance = data.accounts[account];
  data.transactions.forEach(t=>{
    if(t.type==='income' && t.accountId===account) balance+=t.amount;
    if(t.type==='expense' && t.accountId===account) balance-=t.amount;
    if(t.type==='transfer') {
      if(t.accountId===account) balance-=t.amount;
      if(t.toAccountId===account) balance+=t.amount;
    }
  });
  return balance;
}
function monthly(month=currentMonth()) {
  const tx=data.transactions.filter(t=>t.date.startsWith(month));
  return {expenses:tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0),income:tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount,0),transactions:tx};
}
function breakdown(month=currentMonth()) {
  const grouped=new Map();
  monthly(month).transactions.filter(t=>t.type==='expense').forEach(t=>grouped.set(t.category,(grouped.get(t.category)||0)+t.amount));
  return [...grouped.entries()].map(([id,amount])=>({...category('expense',id),id,amount})).sort((a,b)=>b.amount-a.amount);
}
function progressHtml(value,goal,description='') {
  if (!goal) return `<p class="progress-note">Лимит пока не установлен. Задай его в настройках, если хочешь контролировать траты.</p>`;
  const pct = Math.round(value/goal*100);
  return `<div class="progress-head"><span>${money(value)} из ${money(goal)}</span><strong>${pct}%</strong></div><div class="progress-track"><div class="progress-fill ${value>goal?'over':''}" style="width:${Math.min(pct,100)}%"></div></div><p class="progress-note">${description || (value<=goal?`Осталось до лимита: ${money(goal-value)}`:`Превышение лимита: ${money(value-goal)}`)}</p>`;
}
function listHtml(items,emptyText='Пока ничего нет') {
  if(!items.length) return `<div class="empty"><span class="empty-icon">🧾</span>${esc(emptyText)}</div>`;
  return `<div class="transaction-list">${items.map(t=>{
    const transfer=t.type==='transfer', c=transfer?{icon:'↔️',name:'Перевод между счетами'}:category(t.type,t.category);
    const title=t.note.trim() || c.name;
    const subtitle=transfer?`${ACCOUNT_NAMES[t.accountId]} → ${ACCOUNT_NAMES[t.toAccountId]}`:`${c.name} · ${ACCOUNT_NAMES[t.accountId]}`;
    const sign=t.type==='income'?'+':t.type==='expense'?'−':'↔ ';
    return `<div class="transaction"><div class="tx-symbol" aria-hidden="true">${c.icon}</div><div class="tx-detail"><div class="tx-title">${esc(title)}</div><div class="tx-secondary">${esc(fmtDate(t.date))} · ${esc(subtitle)}</div></div><div class="tx-money ${t.type}">${signedMoney(t.amount,sign)}</div><button type="button" class="tx-edit" data-edit="${esc(t.id)}" aria-label="Редактировать операцию ${esc(title)}">⋯</button></div>`;
  }).join('')}</div>`;
}
function donutHtml(month=currentMonth()) {
  const cats=breakdown(month), total=cats.reduce((v,c)=>v+c.amount,0);
  if (!total) return `<div class="empty"><span class="empty-icon">🍩</span>Добавь первую покупку — здесь появится распределение расходов.</div>`;
  let offset=0;
  const stops=cats.map(c=>{const from=offset;offset+=100*c.amount/total;return `${c.color} ${from.toFixed(3)}% ${offset.toFixed(3)}%`;}).join(',');
  const legend=cats.slice(0,5).map(c=>`<div class="legend-row"><div class="legend-label"><span class="legend-dot" style="background:${c.color}"></span>${esc(c.name)}</div><div class="legend-value">${Math.round(c.amount/total*100)}%</div></div>`).join('');
  return `<div class="donut-layout"><div class="donut" style="background:conic-gradient(${stops})"><div class="donut-center">РАСХОДЫ<b>${money(total)}</b></div></div><div class="legend">${legend}</div></div>`;
}
function homeHtml() {
  const card=balanceOf('card'),savings=balanceOf('savings'),total=card+savings,m=monthly();
  const recent=sortedTransactions().slice(0,5);
  return `<section class="panel hero"><div class="hero-top"><span class="subtle">Все мои деньги</span><span class="pill">Только на устройстве 🔒</span></div><div class="hero-amount">${money(total)}</div><div class="account-grid"><div class="account-card"><div class="account-title"><span class="account-icon">💳</span> На карте</div><div class="account-amount">${money(card)}</div></div><div class="account-card"><div class="account-title"><span class="account-icon">🏦</span> Накопления</div><div class="account-amount">${money(savings)}</div></div></div></section>
    ${data.transactions.length===0&&data.accounts.card===0&&data.accounts.savings===0?`<section class="panel section" style="margin-top:18px"><h3>👋 Начнём с твоих остатков</h3><p class="progress-note">Укажи текущие суммы на карте и накопительном счёте. Это начальная точка для новых операций. Старые траты автоматически не добавлены.</p><button type="button" class="secondary-btn" data-go="settings" style="margin-top:12px">Указать остатки</button></section>`:''}
    <div class="layout"><div><section class="panel section"><div class="section-head"><div><h3>Этот месяц</h3><div class="section-description">${esc(monthName(currentMonth()))}</div></div></div><div class="summary-columns"><div class="metric expense"><div class="metric-name">↗ Расходы</div><div class="metric-amount">${money(m.expenses)}</div></div><div class="metric income"><div class="metric-name">↙ Доходы</div><div class="metric-amount">${money(m.income)}</div></div></div><div style="margin-top:22px"><div class="section-head" style="margin-bottom:12px"><h3>Лимит расходов</h3></div>${progressHtml(m.expenses,data.monthlyBudget)}</div></section>
    <section class="panel section"><div class="section-head"><div><h3>Последние операции</h3><div class="section-description">Расходы, доходы и переводы</div></div><button type="button" class="link-btn" data-go="transactions">Все →</button></div>${listHtml(recent,'Здесь появятся твои операции')}</section></div>
    <div><section class="panel section"><div class="section-head"><div><h3>Быстро записать</h3><div class="section-description">Напиши покупку обычными словами</div></div></div><form class="quick-input" id="quickForm"><input id="quickText" type="text" maxlength="200" aria-label="Сумма и описание покупки" placeholder="430 кофе и печенье" autocomplete="off" required><button type="submit">Добавить</button></form><p class="help">Покажу форму с уже заполненной суммой и описанием, чтобы ты проверил запись.</p></section>
    <section class="panel section"><div class="section-head"><div><h3>Куда уходят деньги</h3><div class="section-description">По категориям за месяц</div></div><button type="button" class="link-btn" data-go="analytics">Подробнее →</button></div>${donutHtml()}</section></div></div>`;
}
function transactionsHtml() {
  return `<div class="page-head"><div><div class="eyebrow">ИСТОРИЯ</div><h2>Операции</h2></div><span class="pill">${data.transactions.length} всего</span></div><section class="panel section"><div class="filter-grid"><div class="field"><label for="filterMonth">Месяц</label><input id="filterMonth" type="month" value="${esc(filterMonth)}"></div><div class="field"><label for="filterType">Тип</label><select id="filterType"><option value="all" ${filterType==='all'?'selected':''}>Все</option><option value="expense" ${filterType==='expense'?'selected':''}>Расходы</option><option value="income" ${filterType==='income'?'selected':''}>Доходы</option><option value="transfer" ${filterType==='transfer'?'selected':''}>Переводы</option></select></div><div class="field search-field"><label for="filterQuery">Поиск</label><input type="search" id="filterQuery" value="${esc(filterQuery)}" placeholder="Название или категория"></div></div><div id="transactionResults"></div></section>`;
}
function renderTransactionResults() {
  const target=$('transactionResults');if(!target)return;
  let tx=sortedTransactions().filter(t=>t.date.startsWith(filterMonth) && (filterType==='all'||t.type===filterType));
  if(filterQuery.trim()) {
    const q=filterQuery.toLocaleLowerCase('ru');
    tx=tx.filter(t=>`${t.note} ${t.type==='transfer'?'перевод':category(t.type,t.category).name} ${ACCOUNT_NAMES[t.accountId]}`.toLocaleLowerCase('ru').includes(q));
  }
  target.innerHTML=tx.length?`<p class="section-description" style="margin-bottom:18px">Найдено: ${tx.length}</p>${listHtml(tx)}`:listHtml([], 'За этот период операций не найдено');
}
function analyticsHtml() {
  const m=monthly(filterMonth), cats=breakdown(filterMonth);
  const periods=Array.from({length:6},(_,i)=>shiftMonth(filterMonth,i-5));
  const vals=periods.map(p=>monthly(p).expenses), max=Math.max(1,...vals);
  const bars=periods.map((p,i)=>`<div class="bar-group"><span class="bar-value">${vals[i]?esc(new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1}).format(vals[i]/100)):'0'}</span><div class="bar ${p===filterMonth?'current':''}" style="height:${Math.max(2,Math.round(vals[i]/max*125))}px" title="${esc(monthName(p))}: ${money(vals[i])}"></div><div class="bar-label">${esc(shortMonth(p))}</div></div>`).join('');
  return `<div class="page-head"><div><div class="eyebrow">КАРТИНА РАСХОДОВ</div><h2>Аналитика</h2></div><div class="field"><label for="analyticsMonth">Месяц</label><input id="analyticsMonth" type="month" value="${esc(filterMonth)}"></div></div>
    <div class="small-stats"><div class="panel small-stat"><div class="metric-name">Расходы</div><div class="metric-amount" style="color:var(--red)">${money(m.expenses)}</div></div><div class="panel small-stat"><div class="metric-name">Доходы</div><div class="metric-amount" style="color:var(--teal)">${money(m.income)}</div></div><div class="panel small-stat"><div class="metric-name">Баланс месяца</div><div class="metric-amount">${money(m.income-m.expenses)}</div></div></div>
    <div class="layout"><div><section class="panel section"><h3>Расходы за 6 месяцев</h3><p class="section-description">Переводы между своими счетами не учитываются</p><div class="monthbar">${bars}</div><div class="months-legend">Столбики показывают сумму расходов в каждом месяце</div></section><section class="panel section"><div class="section-head"><h3>Категории</h3></div>${cats.length?cats.map(c=>`<div class="category-row"><div class="category-row-head"><div class="cat-left">${c.icon} ${esc(c.name)}</div><strong>${money(c.amount)}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${(c.amount/m.expenses*100).toFixed(2)}%;background:${c.color}"></div></div></div>`).join(''):`<p class="empty">Нет расходов за выбранный месяц</p>`}</section></div>
    <div><section class="panel section"><h3 style="margin-bottom:19px">Структура расходов</h3>${donutHtml(filterMonth)}</section><section class="panel section"><h3>Месячный лимит</h3><div style="margin-top:17px">${progressHtml(m.expenses,data.monthlyBudget)}</div></section></div></div>`;
}
function settingsHtml() {
  return `<div class="page-head"><div><div class="eyebrow">УПРАВЛЕНИЕ</div><h2>Настройки</h2></div></div><div class="settings-grid">
  <section class="panel settings-panel"><h3>Начальные остатки</h3><p>Введи реальные суммы, которые у тебя были <strong>до внесённых в приложение операций</strong>. Текущий баланс рассчитывается автоматически. Переводы между счетами не являются расходами.</p><form id="settingsForm"><div class="field"><label for="settingCard">💳 Карта, ₽</label><input id="settingCard" type="text" inputmode="decimal" value="${esc(fmtInput(data.accounts.card))}" required></div><div class="field"><label for="settingSavings">🏦 Накопительный счёт, ₽</label><input id="settingSavings" type="text" inputmode="decimal" value="${esc(fmtInput(data.accounts.savings))}" required></div><div class="field"><label for="settingBudget">Лимит трат в месяц, ₽ (0 = без лимита)</label><input id="settingBudget" type="text" inputmode="decimal" value="${esc(fmtInput(data.monthlyBudget))}" required></div><div class="field"><label for="settingGoal">Цель накоплений, ₽ (0 = без цели)</label><input id="settingGoal" type="text" inputmode="decimal" value="${esc(fmtInput(data.savingsGoal))}" required></div><button class="primary-btn" type="submit">Сохранить настройки</button></form></section>
  <div><section class="panel settings-panel"><h3>Цель накоплений</h3><p>Прогресс считается от текущего остатка накопительного счёта.</p>${data.savingsGoal?progressHtml(Math.max(0,balanceOf('savings')),data.savingsGoal,'Цель: '+money(data.savingsGoal)):`<p class="progress-note">Укажи желаемую сумму в поле слева или выше.</p>`}</section>
  <section class="panel settings-panel" style="margin-top:14px"><h3>Резервные копии</h3><p>Операции хранятся только в браузере этого устройства. Сохраняй JSON-файл в «Файлы» на iPhone: он пригодится при смене телефона, очистке данных Safari или переустановке.</p><div class="button-stack"><button type="button" id="exportBtn" class="primary-btn">↓ Сохранить копию</button><button type="button" id="importBtn" class="secondary-btn">↑ Восстановить</button></div><div class="warning">Важно: удаление данных сайта или установленного веб-приложения может стереть историю. Резервная копия не создаётся автоматически. Файл содержит суммы и описания покупок — храни его безопасно.</div></section>
  <section class="panel settings-panel" style="margin-top:14px"><h3>О приложении</h3><p>Личная версия 1.0. Без регистрации, рекламы, аналитических трекеров и подключения к банковским счетам.</p><button type="button" id="resetBtn" class="danger-outline">Стереть все данные</button></section></div></div><p class="footer-note">Мои финансы · Только на твоём устройстве · RUB</p>`;
}
function render() {
  $('app').innerHTML=({home:homeHtml,transactions:transactionsHtml,analytics:analyticsHtml,settings:settingsHtml})[tab]();
  document.querySelectorAll('.nav-btn').forEach(btn=>{const active=btn.dataset.tab===tab;btn.classList.toggle('active',active);if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});
  if(tab==='transactions') renderTransactionResults();
  if(tab==='settings') bindSettings();
  if(tab==='home') bindQuick();
  if(tab==='transactions') {
    $('filterMonth').addEventListener('change',e=>{filterMonth=e.target.value||currentMonth();renderTransactionResults();});
    $('filterType').addEventListener('change',e=>{filterType=e.target.value;renderTransactionResults();});
    $('filterQuery').addEventListener('input',e=>{filterQuery=e.target.value;renderTransactionResults();});
  }
  if(tab==='analytics') $('analyticsMonth').addEventListener('change',e=>{filterMonth=e.target.value||currentMonth();render();});
}
function setTab(name) {
  if(!['home','transactions','analytics','settings'].includes(name))return;
  tab=name;render();window.scrollTo({top:0,behavior:'instant'});
}
function guessCategory(note) {
  const t=note.toLocaleLowerCase('ru');
  if(/steam|стим|игр|донат|clash|critters|playstation|xbox|psn|flesh and blood/.test(t))return 'games';
  if(/ашан|магазин|магнит|пятёроч|пятероч|перекрёст|перекрест|красн.*бел|продукт/.test(t))return 'groceries';
  if(/кофе|чай|печень|шоколад|марс|ростикс|ролл|обед|кафе|еда|напит|dr pepper|доктор пеппер|вода/.test(t))return 'food';
  if(/такси|метро|автобус|проезд|билет/.test(t))return 'transport';
  if(/подар|девушк|цветы/.test(t))return 'gifts';
  if(/аренд|коммун|квартир|интернет|связь|свет/.test(t))return 'housing';
  if(/аптек|лекарств|витамин|врач/.test(t))return 'health';
  if(/кабель|клавиатур|мышк|одежд|заказ/.test(t))return 'shopping';
  return 'other';
}
function bindQuick() {
  $('quickForm').addEventListener('submit',event=>{
    event.preventDefault(); const entry=$('quickText').value.trim();
    const matched=entry.match(/^\s*[-+]?\s*(\d[\d\s\u00a0\u202f]*(?:[.,]\d{1,2})?)\s*₽?\s*(.*)$/);
    if(!matched){toast('Сначала напиши сумму, например: 430 кофе');return;}
    const amount=amountToKopecks(matched[1]);
    if(amount===null){toast('Проверь сумму покупки');return;}
    const description=matched[2].replace(/^[-–—:,\s]+/,'').trim();
    openDialog(null,{amount,note:description.slice(0,160),category:guessCategory(description)});
  });
}
function bindSettings() {
  $('settingsForm').addEventListener('submit',event=>{
    event.preventDefault();
    const card=amountToKopecks($('settingCard').value,{allowZero:true,allowNegative:true});
    const savings=amountToKopecks($('settingSavings').value,{allowZero:true,allowNegative:true});
    const budget=amountToKopecks($('settingBudget').value,{allowZero:true});
    const goal=amountToKopecks($('settingGoal').value,{allowZero:true});
    if([card,savings,budget,goal].some(x=>x===null)){toast('Проверь суммы в настройках');return;}
    const old=data;
    data={...data,accounts:{card,savings},monthlyBudget:budget,savingsGoal:goal};
    if(!persist()){data=old;return;}
    toast('Настройки сохранены');render();
  });
  $('exportBtn').addEventListener('click',exportBackup);
  $('importBtn').addEventListener('click',()=>$('importFile').click());
  $('resetBtn').addEventListener('click',()=>{
    if(!confirm('Удалить ВСЕ операции, остатки и настройки с этого устройства? Сначала сохрани резервную копию.'))return;
    if(!confirm('Это действие нельзя отменить без резервной копии. Продолжить?'))return;
    const previous=data;data=defaultData();if(!persist()){data=previous;return;}
    filterMonth=currentMonth();setTab('home');toast('Данные очищены');
  });
}
function setTxType(type) {
  activeTxType=type;
  document.querySelectorAll('.type-switch button').forEach(b=>b.classList.toggle('chosen',b.dataset.type===type));
  $('txCategoryWrap').classList.toggle('hidden',type==='transfer');
  $('txToWrap').classList.toggle('hidden',type!=='transfer');
  const items=CATEGORIES[type]||[];
  const selected=$('txCategory').value;
  $('txCategory').innerHTML=items.map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  if(items.some(c=>c.id===selected)) $('txCategory').value=selected;
  $('txAccount').previousElementSibling.textContent=type==='income'?'На какой счёт зачислить':type==='transfer'?'Откуда переводим':'С какого счёта списать';
  if(type==='transfer') $('txTo').value=$('txAccount').value==='card'?'savings':'card';
}
function openDialog(id=null,prefill={}) {
  editingId=id;
  const t=id?data.transactions.find(x=>x.id===id):null;
  if(id&&!t){toast('Операция не найдена');return;}
  $('txForm').reset();$('formError').hidden=true;
  $('dialogTitle').textContent=t?'Изменить операцию':'Новая операция';
  $('deleteTx').classList.toggle('hidden',!t);
  setTxType(t?.type||'expense');
  $('txAmount').value=t?fmtInput(t.amount):prefill.amount?fmtInput(prefill.amount):'';
  $('txAccount').value=t?.accountId||'card';
  if(t?.type==='transfer')$('txTo').value=t.toAccountId;
  if(t?.category) $('txCategory').value=t.category;
  else if(prefill.category && CATEGORIES.expense.some(c=>c.id===prefill.category)) $('txCategory').value=prefill.category;
  $('txDate').value=t?.date||todayLocal();
  $('txNote').value=t?.note||prefill.note||'';
  $('txDialog').showModal();
  $('txAmount').focus();
}
function newId() {
  if(crypto?.randomUUID)return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
$('txForm').addEventListener('submit',event=>{
  event.preventDefault();const err=$('formError');err.hidden=true;
  const amount=amountToKopecks($('txAmount').value),accountId=$('txAccount').value,toAccountId=$('txTo').value,date=$('txDate').value,note=$('txNote').value.trim().slice(0,160);
  if(amount===null){err.textContent='Введи корректную сумму больше нуля.';err.hidden=false;return;}
  if(!ACCOUNT_NAMES[accountId]||!validDate(date)){err.textContent='Проверь счёт и дату.';err.hidden=false;return;}
  if(activeTxType==='transfer'&&(accountId===toAccountId||!ACCOUNT_NAMES[toAccountId])){err.textContent='Для перевода нужны два разных счёта.';err.hidden=false;return;}
  const categoryId=activeTxType==='transfer'?null:$('txCategory').value;
  if(categoryId&&!CATEGORIES[activeTxType].some(c=>c.id===categoryId)){err.textContent='Выбери категорию.';err.hidden=false;return;}
  const oldData=data;
  const original=editingId?data.transactions.find(t=>t.id===editingId):null;
  const tx={id:original?.id||newId(),createdAt:original?.createdAt||new Date().toISOString(),type:activeTxType,amount,accountId,toAccountId:activeTxType==='transfer'?toAccountId:null,category:categoryId,note,date};
  data={...data,transactions:original?data.transactions.map(t=>t.id===editingId?tx:t):[...data.transactions,tx]};
  if(!persist()){data=oldData;return;}
  $('txDialog').close();render();toast(original?'Операция изменена':'Операция сохранена');
});
$('closeDialog').addEventListener('click',()=>$('txDialog').close());
$('txDialog').addEventListener('click',e=>{if(e.target===$('txDialog')) $('txDialog').close();});
document.querySelectorAll('.type-switch button').forEach(b=>b.addEventListener('click',()=>setTxType(b.dataset.type)));
$('txAccount').addEventListener('change',()=>{if(activeTxType==='transfer')$('txTo').value=$('txAccount').value==='card'?'savings':'card';});
$('deleteTx').addEventListener('click',()=>{
  if(!editingId||!confirm('Точно удалить эту операцию?'))return;
  const oldData=data;data={...data,transactions:data.transactions.filter(t=>t.id!==editingId)};
  if(!persist()){data=oldData;return;}
  $('txDialog').close();render();toast('Операция удалена');
});
function exportBackup() {
  const snapshot=JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2);
  const blob=new Blob([snapshot],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=`moi-finansy-${todayLocal()}.json`;
  document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast('Копия подготовлена — сохрани файл в надёжном месте');
}
$('importFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.size>10*1024*1024){toast('Файл слишком большой');return;}
  let imported;
  try {imported=validateBackup(JSON.parse(await file.text()));}
  catch(error){alert('Не удалось восстановить данные: '+error.message);return;}
  if(!confirm(`Заменить текущие данные резервной копией? В файле ${imported.transactions.length} операций. Текущая история будет ПОЛНОСТЬЮ заменена.`))return;
  const oldData=data;const oldReadError=hasStorageReadError;
  hasStorageReadError=false;data=imported;
  if(!persist()){data=oldData;hasStorageReadError=oldReadError;return;}
  filterMonth=currentMonth();setTab('home');toast(`Восстановлено операций: ${imported.transactions.length}`);
});
$('app').addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit]');if(edit){openDialog(edit.dataset.edit);return;}
  const go=e.target.closest('[data-go]');if(go){setTab(go.dataset.go);return;}
});
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
$('addBtn').addEventListener('click',()=>openDialog());
$('backupShortcut').addEventListener('click',()=>setTab('settings'));
render();
if('serviceWorker' in navigator && location.protocol==='https:') {
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

(function() {
  'use strict';

  const CATEGORIES = {
    expense: [
      { name: 'Food', emoji: '🍔', color: '#f97316' },
      { name: 'Transport', emoji: '🚗', color: '#3b82f6' },
      { name: 'Housing', emoji: '🏠', color: '#8b5cf6' },
      { name: 'Utilities', emoji: '⚡', color: '#eab308' },
      { name: 'Entertainment', emoji: '🎬', color: '#ec4899' },
      { name: 'Shopping', emoji: '🛍️', color: '#14b8a6' },
      { name: 'Health', emoji: '🏥', color: '#ef4444' },
      { name: 'Education', emoji: '📚', color: '#6366f1' },
      { name: 'Other', emoji: '📦', color: '#6b7280' },
    ],
    income: [
      { name: 'Salary', emoji: '💵', color: '#16a34a' },
      { name: 'Freelance', emoji: '💻', color: '#0891b2' },
      { name: 'Investment', emoji: '📈', color: '#7c3aed' },
      { name: 'Gift', emoji: '🎁', color: '#e11d48' },
      { name: 'Other', emoji: '📦', color: '#6b7280' },
    ],
  };

  const ALL_CATEGORIES = [...CATEGORIES.expense, ...CATEGORIES.income];

  function getCatInfo(name) {
    return ALL_CATEGORIES.find(c => c.name === name) || { name, emoji: '📦', color: '#6b7280' };
  }

  let currentDate = new Date();
  let currentType = 'expense';

  // Elements
  const monthLabel = document.getElementById('currentMonth');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  const form = document.getElementById('addForm');
  const amountInput = document.getElementById('amount');
  const categorySelect = document.getElementById('category');
  const descInput = document.getElementById('description');
  const dateInput = document.getElementById('date');
  const submitBtn = document.getElementById('submitBtn');
  const totalIncome = document.getElementById('totalIncome');
  const totalExpenses = document.getElementById('totalExpenses');
  const totalBalance = document.getElementById('totalBalance');
  const categoryBars = document.getElementById('categoryBars');
  const transactionsList = document.getElementById('transactionsList');
  const categorySection = document.getElementById('categorySection');
  const toastEl = document.getElementById('toast');

  function getMonthStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function formatMonth(d) {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function formatMoney(n) {
    return '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  function populateCategories() {
    const cats = CATEGORIES[currentType];
    categorySelect.innerHTML = '<option value="">Select...</option>';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.emoji + ' ' + c.name;
      categorySelect.appendChild(opt);
    });
  }

  function updateMonthDisplay() {
    monthLabel.textContent = formatMonth(currentDate);
  }

  function setType(type) {
    currentType = type;
    document.querySelectorAll('.type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === type);
    });
    submitBtn.textContent = 'Add ' + (type === 'income' ? 'Income' : 'Expense');
    submitBtn.className = 'submit-btn ' + type;
    populateCategories();
  }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Request failed');
    }
    return res.json();
  }

  async function loadData() {
    const month = getMonthStr(currentDate);
    try {
      const [transactions, summary] = await Promise.all([
        fetchJSON('/api/transactions?month=' + month),
        fetchJSON('/api/summary?month=' + month),
      ]);
      renderSummary(summary);
      renderCategoryBars(summary.categories || []);
      renderTransactions(transactions || []);
    } catch (err) {
      console.error('Load error:', err);
      toast('Failed to load data');
    }
  }

  function renderSummary(s) {
    totalIncome.textContent = formatMoney(s.income);
    totalExpenses.textContent = formatMoney(s.expenses);
    totalBalance.textContent = (s.balance < 0 ? '-' : '') + formatMoney(s.balance);
    totalBalance.className = 'card-value' + (s.balance < 0 ? ' negative' : '');
  }

  function renderCategoryBars(categories) {
    // Only show expense categories (negative totals)
    const expenses = categories.filter(c => c.total < 0).map(c => ({ ...c, total: Math.abs(c.total) }));
    if (expenses.length === 0) {
      categorySection.style.display = 'none';
      return;
    }
    categorySection.style.display = '';
    const max = Math.max(...expenses.map(c => c.total));
    categoryBars.innerHTML = expenses.map(c => {
      const info = getCatInfo(c.category);
      const pct = max > 0 ? (c.total / max * 100) : 0;
      return `<div class="cat-row">
        <span class="cat-emoji">${info.emoji}</span>
        <span class="cat-name">${c.category}</span>
        <div class="cat-bar-wrap">
          <div class="cat-bar" style="width:${pct}%;background:${info.color}"></div>
        </div>
        <span class="cat-amount">${formatMoney(c.total)}</span>
      </div>`;
    }).join('');
  }

  function renderTransactions(txns) {
    if (txns.length === 0) {
      transactionsList.innerHTML = `<div class="empty-state">
        <div class="empty-icon">💭</div>
        <p>No transactions this month</p>
      </div>`;
      return;
    }

    // Group by date
    const groups = {};
    txns.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });

    let html = '';
    Object.keys(groups).sort().reverse().forEach(date => {
      html += `<div class="date-group">
        <div class="date-header">${formatDate(date)}</div>`;
      groups[date].forEach(t => {
        const info = getCatInfo(t.category);
        const isPositive = t.amount >= 0;
        html += `<div class="txn-item">
          <span class="txn-emoji">${info.emoji}</span>
          <div class="txn-details">
            <div class="txn-category">${t.category}</div>
            ${t.description ? `<div class="txn-desc">${escapeHTML(t.description)}</div>` : ''}
          </div>
          <span class="txn-amount ${isPositive ? 'positive' : 'negative'}">
            ${isPositive ? '+' : '-'}${formatMoney(t.amount)}
          </span>
          <button class="txn-delete" data-id="${t.id}" title="Delete">✕</button>
        </div>`;
      });
      html += '</div>';
    });
    transactionsList.innerHTML = html;

    // Attach delete handlers
    transactionsList.querySelectorAll('.txn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
    });
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function addTransaction(e) {
    e.preventDefault();
    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) { toast('Enter a valid amount'); return; }
    if (!categorySelect.value) { toast('Select a category'); return; }
    if (!dateInput.value) { toast('Select a date'); return; }

    try {
      await fetchJSON('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount,
          category: categorySelect.value,
          description: descInput.value.trim(),
          date: dateInput.value,
          type: currentType,
        }),
      });
      toast((currentType === 'income' ? 'Income' : 'Expense') + ' added!');
      amountInput.value = '';
      descInput.value = '';
      categorySelect.value = '';
      loadData();
    } catch (err) {
      toast('Error: ' + err.message);
    }
  }

  async function deleteTransaction(id) {
    if (!confirm('Delete this transaction?')) return;
    try {
      await fetchJSON('/api/transactions/' + id, { method: 'DELETE' });
      toast('Transaction deleted');
      loadData();
    } catch (err) {
      toast('Error: ' + err.message);
    }
  }

  // Init
  dateInput.value = new Date().toISOString().split('T')[0];
  setType('expense');
  updateMonthDisplay();
  loadData();

  // Events
  form.addEventListener('submit', addTransaction);
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => setType(btn.dataset.type));
  });
  prevBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    updateMonthDisplay();
    loadData();
  });
  nextBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    updateMonthDisplay();
    loadData();
  });
})();

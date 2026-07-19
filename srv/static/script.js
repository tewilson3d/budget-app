(() => {
  'use strict';

  const CATEGORY_COLORS = {
    Income: 'var(--cat-income)',
    Food: 'var(--cat-food)',
    Transport: 'var(--cat-transport)',
    Housing: 'var(--cat-housing)',
    Utilities: 'var(--cat-utilities)',
    Entertainment: 'var(--cat-entertainment)',
    Shopping: 'var(--cat-shopping)',
    Health: 'var(--cat-health)',
    Education: 'var(--cat-education)',
    Other: 'var(--cat-other)',
  };

  function currentMonthString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const state = {
    month: currentMonthString(),
    type: 'expense',
  };

  const els = {
    currentMonth: document.getElementById('current-month'),
    prevMonth: document.getElementById('prev-month'),
    nextMonth: document.getElementById('next-month'),
    form: document.getElementById('add-form'),
    amount: document.getElementById('amount'),
    category: document.getElementById('category'),
    description: document.getElementById('description'),
    date: document.getElementById('date'),
    toggleExpense: document.getElementById('toggle-expense'),
    toggleIncome: document.getElementById('toggle-income'),
    summaryIncome: document.getElementById('summary-income'),
    summaryExpenses: document.getElementById('summary-expenses'),
    summaryBalance: document.getElementById('summary-balance'),
    categoryBreakdown: document.getElementById('category-breakdown'),
    transactionsList: document.getElementById('transactions-list'),
    rowTemplate: document.getElementById('transaction-row-template'),
    authStatus: document.getElementById('auth-status'),
  };

  function todayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function formatMonthLabel(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function shiftMonth(monthStr, delta) {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatCurrency(value) {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  }

  function formatDateHeading(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  async function apiFetch(url, options) {
    const resp = await fetch(url, options);
    if (resp.status === 401) {
      setUnauthenticated();
      throw new Error('unauthenticated');
    }
    if (!resp.ok) {
      let message = `Request failed (${resp.status})`;
      try {
        const body = await resp.json();
        if (body && body.error) message = body.error;
      } catch (e) {
        // ignore
      }
      throw new Error(message);
    }
    if (resp.status === 204) return null;
    return resp.json();
  }

  function setUnauthenticated() {
    els.authStatus.textContent = 'Not signed in';
  }

  function setType(type) {
    state.type = type;
    els.toggleExpense.classList.toggle('active', type === 'expense');
    els.toggleIncome.classList.toggle('active', type === 'income');
    if (type === 'income') {
      els.category.value = 'Income';
    } else if (els.category.value === 'Income') {
      els.category.value = 'Food';
    }
  }

  function renderMonth() {
    els.currentMonth.textContent = formatMonthLabel(state.month);
  }

  function renderSummary(summary) {
    els.summaryIncome.textContent = formatCurrency(summary.total_income);
    els.summaryExpenses.textContent = formatCurrency(summary.total_expenses);
    els.summaryBalance.textContent = formatCurrency(summary.balance);

    const container = els.categoryBreakdown;
    container.innerHTML = '';

    const expenseCategories = (summary.by_category || [])
      .filter((c) => c.total < 0)
      .map((c) => ({ category: c.category, total: Math.abs(c.total) }))
      .sort((a, b) => b.total - a.total);

    if (expenseCategories.length === 0) {
      container.innerHTML = '<p class="empty-state">No spending yet this month.</p>';
      return;
    }

    const maxTotal = Math.max(...expenseCategories.map((c) => c.total));

    for (const entry of expenseCategories) {
      const row = document.createElement('div');
      row.className = 'category-bar-row';

      const label = document.createElement('div');
      label.className = 'category-bar-label';
      label.textContent = entry.category;

      const track = document.createElement('div');
      track.className = 'category-bar-track';
      const fill = document.createElement('div');
      fill.className = 'category-bar-fill';
      const pct = maxTotal > 0 ? (entry.total / maxTotal) * 100 : 0;
      fill.style.width = `${pct}%`;
      fill.style.background = CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.Other;
      track.appendChild(fill);

      const value = document.createElement('div');
      value.className = 'category-bar-value';
      value.textContent = formatCurrency(entry.total);

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(value);
      container.appendChild(row);
    }
  }

  function renderTransactions(transactions) {
    const container = els.transactionsList;
    container.innerHTML = '';

    if (!transactions || transactions.length === 0) {
      container.innerHTML = '<p class="empty-state">No transactions yet this month.</p>';
      return;
    }

    const groups = new Map();
    for (const t of transactions) {
      if (!groups.has(t.date)) groups.set(t.date, []);
      groups.get(t.date).push(t);
    }

    const sortedDates = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : -1));

    for (const date of sortedDates) {
      const groupEl = document.createElement('div');
      groupEl.className = 'transaction-date-group';

      const heading = document.createElement('div');
      heading.className = 'transaction-date-heading';
      heading.textContent = formatDateHeading(date);
      groupEl.appendChild(heading);

      for (const t of groups.get(date)) {
        groupEl.appendChild(buildTransactionRow(t));
      }

      container.appendChild(groupEl);
    }
  }

  function buildTransactionRow(t) {
    const fragment = els.rowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('.transaction-row');
    const dot = fragment.querySelector('.transaction-category-dot');
    const desc = fragment.querySelector('.transaction-description');
    const cat = fragment.querySelector('.transaction-category');
    const amount = fragment.querySelector('.transaction-amount');
    const deleteBtn = fragment.querySelector('.delete-btn');

    dot.style.background = CATEGORY_COLORS[t.category] || CATEGORY_COLORS.Other;
    desc.textContent = t.description || t.category;
    cat.textContent = t.category;
    amount.textContent = (t.amount >= 0 ? '+' : '') + formatCurrency(t.amount);
    amount.classList.add(t.amount >= 0 ? 'positive' : 'negative');

    deleteBtn.addEventListener('click', () => deleteTransaction(t.id));

    row.dataset.id = t.id;
    return row;
  }

  async function deleteTransaction(id) {
    if (!confirm('Delete this transaction?')) return;
    try {
      await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  async function refresh() {
    renderMonth();
    try {
      const [txData, summaryData] = await Promise.all([
        apiFetch(`/api/transactions?month=${encodeURIComponent(state.month)}`),
        apiFetch(`/api/summary?month=${encodeURIComponent(state.month)}`),
      ]);
      renderTransactions(txData.transactions);
      renderSummary(summaryData);
    } catch (err) {
      if (err.message !== 'unauthenticated') {
        console.error(err);
      }
    }
  }

  async function handleSubmit(evt) {
    evt.preventDefault();

    const rawAmount = parseFloat(els.amount.value);
    if (isNaN(rawAmount) || rawAmount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    const amount = state.type === 'income' ? Math.abs(rawAmount) : -Math.abs(rawAmount);

    const payload = {
      amount,
      category: els.category.value,
      description: els.description.value.trim(),
      date: els.date.value,
    };

    try {
      await apiFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      els.amount.value = '';
      els.description.value = '';
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  function init() {
    els.date.value = todayString();
    setType('expense');

    els.toggleExpense.addEventListener('click', () => setType('expense'));
    els.toggleIncome.addEventListener('click', () => setType('income'));

    els.prevMonth.addEventListener('click', () => {
      state.month = shiftMonth(state.month, -1);
      refresh();
    });
    els.nextMonth.addEventListener('click', () => {
      state.month = shiftMonth(state.month, 1);
      refresh();
    });

    els.form.addEventListener('submit', handleSubmit);

    refresh();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

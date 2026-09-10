export type Category = 'food' | 'groceries' | 'dogs' | 'automotive' | 'household' | 'miscellaneous';

export const CATEGORIES: Category[] = ['food', 'groceries', 'dogs', 'automotive', 'household', 'miscellaneous'];

export const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food',
  groceries: 'Groceries',
  dogs: 'Dogs',
  automotive: 'Automotive',
  household: 'Household',
  miscellaneous: 'Miscellaneous',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  food: '#e67e22',
  groceries: '#27ae60',
  dogs: '#8e44ad',
  automotive: '#00897b',
  household: '#d81b60',
  miscellaneous: '#2980b9',
};

export type BudgetPeriod = 'daily' | 'monthly';

export const CATEGORY_BUDGET_PERIODS: Record<Category, BudgetPeriod> = {
  food: 'daily',
  groceries: 'monthly',
  dogs: 'monthly',
  automotive: 'monthly',
  household: 'monthly',
  miscellaneous: 'monthly',
};

// Food is a daily amount. Every other category is a monthly amount.
// The legacy property name is retained so existing on-device settings/backups continue to work.
export const DEFAULT_DAILY_BUDGETS: Record<Category, number> = {
  food: 1500,
  groceries: 500,
  dogs: 53,
  automotive: 0,
  household: 0,
  miscellaneous: 833,
};

export function emptyCategoryAmounts(): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map(category => [category, 0])) as Record<Category, number>;
}

export type Entry = {
  id: string;
  date: string; // YYYY-MM-DD
  category: Category;
  amount: number;
  note?: string;
  ts?: number; // epoch ms when logged (older entries may lack it; id prefix is the fallback)
};

// "I have ฿X as of this moment" — expenses logged after ts count down from amount
export type BalanceAnchor = {
  amount: number;
  ts: number;
};

// Fixed monthly bill (utilities, internet, …) — checked off once per month
export type Bill = {
  id: string;
  name: string;
  amount: number; // THB
};

// Amounts from the Financial Runway Tracker sheet's Year Summary.
// USD subscriptions converted at the sheet's 33.5 THB/USD rate.
export const DEFAULT_BILLS: Bill[] = [
  { id: 'utilities', name: 'Utilities', amount: 6000 },
  { id: 'phone', name: 'Phone', amount: 1500 },
  { id: 'internet', name: 'Internet', amount: 1000 },
  { id: 'water', name: 'Water', amount: 200 },
  { id: 'cleaning', name: 'Cleaning', amount: 2300 },
  { id: 'spotify', name: 'Spotify ($12)', amount: 402 },
  { id: 'openai', name: 'OpenAI ($20)', amount: 670 },
];

export type Settings = {
  dailyBudgets: Record<Category, number>;
  balanceAnchor: BalanceAnchor | null;
  bills: Bill[];
};

export const DEFAULT_SETTINGS: Settings = {
  dailyBudgets: DEFAULT_DAILY_BUDGETS,
  balanceAnchor: null,
  bills: DEFAULT_BILLS,
};

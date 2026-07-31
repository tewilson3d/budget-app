export type Category = 'food' | 'groceries' | 'dogs' | 'miscellaneous';

export const CATEGORIES: Category[] = ['food', 'groceries', 'dogs', 'miscellaneous'];

export const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food',
  groceries: 'Groceries',
  dogs: 'Dogs',
  miscellaneous: 'Miscellaneous',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  food: '#e67e22',
  groceries: '#27ae60',
  dogs: '#8e44ad',
  miscellaneous: '#2980b9',
};

export const DEFAULT_DAILY_BUDGETS: Record<Category, number> = {
  food: 1500,
  groceries: 500,
  dogs: 53,
  miscellaneous: 833,
};

export type Entry = {
  id: string;
  date: string; // YYYY-MM-DD
  category: Category;
  amount: number;
  note?: string;
};

export type Settings = {
  dailyBudgets: Record<Category, number>;
  googleClientId: string;
  sheetId: string;
};

export const DEFAULT_SETTINGS: Settings = {
  dailyBudgets: DEFAULT_DAILY_BUDGETS,
  googleClientId: '',
  sheetId: '1opcqms60Ts7LfS7qz4WQsQMUO9Yx6nSXM_4dB_lMDzE',
};

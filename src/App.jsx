import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AreaChart as AreaChartIcon,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Download,
  FileSpreadsheet,
  Globe,
  LogOut,
  Moon,
  PackageOpen,
  Settings,
  ShoppingCart,
  SunMedium,
  Truck,
  UserCog,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from './lib/db';
import { hashPassword, verifyPassword } from './lib/auth';
import {
  normalizeRecord,
  parseAccessFile,
  parseCsvText,
  parseGoogleSheetInput,
  parseXlsxFile,
  sanitizeNumber,
} from './lib/import';
import { seedRecords, seedUsers } from './data/seed';

const navItems = [
  { key: 'dashboard', label: 'Overview', icon: AreaChartIcon },
  { key: 'imports', label: 'Imports', icon: Download },
  { key: 'admin', label: 'User Admin', icon: UserCog },
];

const rolePalette = ['#d71920', '#ef4444', '#f97316', '#22c55e', '#38bdf8'];

const initialForm = {
  username: '',
  password: '',
  role: 'Manager',
  fullName: '',
};

function formatMoney(value) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(0)}%`;
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('hn-theme');
    return saved ? JSON.parse(saved) : false;
  });
  const [sessionUser, setSessionUser] = useState(() => {
    const saved = localStorage.getItem('hn-session');
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState([]);
  const [records, setRecords] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [authState, setAuthState] = useState('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [newUserForm, setNewUserForm] = useState(initialForm);
  const [importForm, setImportForm] = useState({ sourceType: 'googleSheet', sourceValue: '', fileName: '' });
  const [importStatus, setImportStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme);
    localStorage.setItem('hn-theme', JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const existingUsers = await db.users.toArray();
        if (!existingUsers.length) {
          const createdUsers = [];
          for (const user of seedUsers) {
            const hashed = await hashPassword(user.password);
            createdUsers.push({
              username: user.username,
              fullName: user.fullName,
              role: user.role,
              passwordHash: hashed.hash,
              salt: hashed.salt,
              createdAt: new Date().toISOString(),
            });
          }
          await db.users.bulkAdd(createdUsers);
          setUsers(createdUsers);
        } else {
          setUsers(existingUsers);
        }

        const existingRecords = await db.storeSnapshots.toArray();
        if (!existingRecords.length) {
          const withMeta = seedRecords.map((record) => ({
            ...normalizeRecord(record),
            createdAt: new Date().toISOString(),
          }));
          await db.storeSnapshots.bulkAdd(withMeta);
          setRecords(withMeta);
        } else {
          setRecords(existingRecords);
        }
      } catch (error) {
        console.error(error);
        setErrorMessage('There was an issue preparing the local database.');
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, []);

  const filteredRecords = useMemo(() => {
    if (!sessionUser) {
      return [];
    }

    if (sessionUser.role === 'Manager') {
      return records;
    }

    if (sessionUser.role === 'Salesperson') {
      return records.filter((record) => {
        const targetName = sessionUser.fullName || sessionUser.username;
        return (
          record.salesPerson?.toLowerCase() === targetName.toLowerCase() ||
          record.salesPerson?.toLowerCase().includes(targetName.toLowerCase().split(' ')[0])
        );
      });
    }

    if (sessionUser.role === 'Warehouse') {
      return records.filter((record) => record.inventory > 0 || record.fulfillmentRate > 0);
    }

    return records;
  }, [records, sessionUser]);

  const summaryCards = useMemo(() => {
    const revenue = filteredRecords.reduce((sum, record) => sum + sanitizeNumber(record.sales), 0);
    const units = filteredRecords.reduce((sum, record) => sum + sanitizeNumber(record.units), 0);
    const avgFulfillment =
      filteredRecords.length > 0
        ? filteredRecords.reduce((sum, record) => sum + sanitizeNumber(record.fulfillmentRate), 0) /
          filteredRecords.length
        : 0;
    const inventoryLevel = filteredRecords.reduce((sum, record) => sum + sanitizeNumber(record.inventory), 0);

    if (sessionUser?.role === 'Salesperson') {
      return [
        { label: 'Personal sales', value: formatMoney(revenue), icon: ShoppingCart, tone: 'red' },
        { label: 'Units sold', value: `${units}`, icon: PackageOpen, tone: 'amber' },
        { label: 'Target attainment', value: formatPercent(Math.min((revenue / 18000) * 100, 100)), icon: Activity, tone: 'green' },
        { label: 'Avg fulfillment', value: formatPercent(avgFulfillment), icon: Truck, tone: 'sky' },
      ];
    }

    if (sessionUser?.role === 'Warehouse') {
      return [
        { label: 'Inventory on hand', value: `${inventoryLevel}`, icon: PackageOpen, tone: 'red' },
        { label: 'Avg fulfillment', value: formatPercent(avgFulfillment), icon: Truck, tone: 'green' },
        { label: 'Open orders', value: `${Math.max(12, Math.round(filteredRecords.length * 1.3))}`, icon: Bell, tone: 'amber' },
        { label: 'Units to ship', value: `${Math.max(40, Math.round(units * 0.7))}`, icon: BriefcaseBusiness, tone: 'sky' },
      ];
    }

    return [
      { label: 'Total sales', value: formatMoney(revenue), icon: ShoppingCart, tone: 'red' },
      { label: 'Units sold', value: `${units}`, icon: PackageOpen, tone: 'amber' },
      { label: 'Avg fulfillment', value: formatPercent(avgFulfillment), icon: Truck, tone: 'green' },
      { label: 'Inventory depth', value: `${inventoryLevel}`, icon: Activity, tone: 'sky' },
    ];
  }, [filteredRecords, sessionUser]);

  const trendData = useMemo(() => {
    return filteredRecords.slice(-7).map((record, index) => ({
      name: `D${index + 1}`,
      sales: sanitizeNumber(record.sales),
      fulfillment: sanitizeNumber(record.fulfillmentRate),
      inventory: sanitizeNumber(record.inventory),
    }));
  }, [filteredRecords]);

  const regionalData = useMemo(() => {
    const aggregate = {};
    filteredRecords.forEach((record) => {
      const region = record.region || 'Unknown';
      aggregate[region] = (aggregate[region] || 0) + sanitizeNumber(record.sales);
    });

    return Object.entries(aggregate).map(([name, value]) => ({ name, value }));
  }, [filteredRecords]);

  const topStores = useMemo(() => {
    return [...filteredRecords]
      .sort((a, b) => sanitizeNumber(b.sales) - sanitizeNumber(a.sales))
      .slice(0, 5)
      .map((record) => ({
        name: record.storeName,
        sales: sanitizeNumber(record.sales),
        fulfillment: sanitizeNumber(record.fulfillmentRate),
      }));
  }, [filteredRecords]);

  const roleTableData = useMemo(() => {
    if (sessionUser?.role === 'Warehouse') {
      return filteredRecords.slice(0, 6).map((record) => ({
        store: record.storeName,
        product: record.product,
        inventory: record.inventory,
        fulfillment: `${record.fulfillmentRate}%`,
        status: record.status,
      }));
    }

    return filteredRecords.slice(0, 6).map((record) => ({
      store: record.storeName,
      rep: record.salesPerson,
      product: record.product,
      sales: formatMoney(record.sales),
      target: formatMoney(record.target),
      status: record.status,
    }));
  }, [filteredRecords, sessionUser]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorMessage('');

    try {
      const allUsers = await db.users.toArray();
      const match = allUsers.find((user) => user.username.toLowerCase() === loginForm.username.toLowerCase());

      if (!match) {
        setErrorMessage('User not found. Try one of the seeded account names.');
        return;
      }

      const validPass = await verifyPassword(loginForm.password, match.salt, match.passwordHash);
      if (!validPass) {
        setErrorMessage('The password entered is invalid.');
        return;
      }

      const safeUser = {
        id: match.id,
        username: match.username,
        fullName: match.fullName,
        role: match.role,
      };
      localStorage.setItem('hn-session', JSON.stringify(safeUser));
      setSessionUser(safeUser);
      setActiveView('dashboard');
    } catch (error) {
      console.error(error);
      setErrorMessage('Login failed. Please try again.');
    }
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    if (sessionUser?.role !== 'Manager') {
      setImportStatus('Only managers can assign roles.');
      return;
    }

    const normalizedUsername = newUserForm.username.trim();
    const existing = await db.users.where('username').equalsIgnoreCase(normalizedUsername).first();

    if (existing) {
      setImportStatus('A user with that username already exists.');
      return;
    }

    const hashed = await hashPassword(newUserForm.password);
    const userRecord = {
      username: normalizedUsername,
      fullName: newUserForm.fullName.trim() || normalizedUsername,
      role: newUserForm.role,
      passwordHash: hashed.hash,
      salt: hashed.salt,
      createdAt: new Date().toISOString(),
    };

    const id = await db.users.add(userRecord);
    setUsers((current) => [...current, { id, ...userRecord }]);
    setNewUserForm(initialForm);
    setImportStatus('User created successfully.');
  };

  const handleImport = async (event) => {
    event.preventDefault();
    setImportStatus('');

    try {
      let rows = [];
      if (importForm.sourceType === 'googleSheet') {
        rows = parseGoogleSheetInput(importForm.sourceValue);
      }

      if (importForm.sourceType === 'csv') {
        const file = event.target.elements.file.files?.[0];
        if (!file) {
          setImportStatus('Choose a CSV file to import.');
          return;
        }
        const text = await file.text();
        rows = parseCsvText(text);
      }

      if (importForm.sourceType === 'xlsx') {
        const file = event.target.elements.file.files?.[0];
        if (!file) {
          setImportStatus('Choose an XLSX file to import.');
          return;
        }
        rows = await parseXlsxFile(file);
      }

      if (importForm.sourceType === 'access') {
        const file = event.target.elements.file.files?.[0];
        if (!file) {
          setImportStatus('Choose an Access database file to import.');
          return;
        }
        rows = parseAccessFile(file);
      }

      if (!rows.length) {
        setImportStatus('No rows were detected in the incoming dataset.');
        return;
      }

      const normalizedRows = rows.map((row) => ({
        ...normalizeRecord(row),
        sourceName: importForm.sourceValue || importForm.fileName || row.sourceName,
        createdAt: new Date().toISOString(),
      }));

      await db.storeSnapshots.bulkAdd(normalizedRows);
      setRecords((current) => [...current, ...normalizedRows]);
      setImportStatus(`Imported ${normalizedRows.length} records from ${importForm.sourceType}.`);
      setImportForm((current) => ({ ...current, sourceValue: '', fileName: '' }));
      event.target.reset();
    } catch (error) {
      console.error(error);
      setImportStatus('Import failed. Validate the source file and try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hn-session');
    setSessionUser(null);
    setAuthState('login');
  };

  if (!sessionUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-950">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-2">
          <div className="bg-gradient-to-br from-harvey-red via-red-700 to-red-900 p-8 text-white">
            <div className="mb-12 flex items-center gap-3">
              <div className="rounded-xl bg-white/15 p-2.5">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-red-100">Harvey Norman</p>
                <h1 className="text-2xl font-semibold">Operations Command Center</h1>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-red-100">Overview</p>
                <h2 className="mt-3 text-4xl font-semibold">Unified retail KPI visibility.</h2>
              </div>

              <div className="space-y-5 text-red-50">
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-sm text-red-100">Role-based access</p>
                  <p className="mt-2 text-xl font-medium">Manager, Salesperson, Warehouse views</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-sm text-red-100">Local-first storage</p>
                  <p className="mt-2 text-xl font-medium">IndexedDB with secure password hashing</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-sm text-red-100">Multi-source ingestion</p>
                  <p className="mt-2 text-xl font-medium">Google Sheets, XLSX, CSV, Access DB</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 sm:p-10">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-300">Welcome back</p>
                <h2 className="text-3xl font-semibold">Sign in</h2>
              </div>
              <button
                type="button"
                onClick={() => setTheme((current) => !current)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 dark:border-slate-700 dark:text-slate-300"
              >
                {theme ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Username</label>
                <input
                  className="soft-input"
                  value={loginForm.username}
                  onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })}
                  placeholder="manager"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Password</label>
                <input
                  type="password"
                  className="soft-input"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                  placeholder="Harvey123!"
                />
              </div>

              {errorMessage && <div className="rounded-xl border border-red-500/20 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>}

              <button type="submit" className="w-full rounded-xl bg-harvey-red px-4 py-3 font-medium text-white hover:bg-red-700">
                Sign in
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <p className="font-medium text-slate-700 dark:text-slate-100">Demo accounts</p>
              <div className="mt-2 space-y-1">
                <p>Manager: manager / Harvey123!</p>
                <p>Salesperson: sales / Harvey123!</p>
                <p>Warehouse: warehouse / Harvey123!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canManageUsers = sessionUser.role === 'Manager';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        <aside className="w-full border-b border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-900 lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-100 p-2 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Harvey Norman</p>
                <h1 className="text-lg font-semibold">Pulse</h1>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTheme((current) => !current)}
              className="rounded-full border border-slate-200 p-2 text-slate-500 dark:border-slate-700 dark:text-slate-300"
            >
              {theme ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <nav className="mt-7 space-y-2">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveView(key)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  activeView === key
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          <div className="mt-8 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Logged in as</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                {sessionUser.fullName?.slice(0, 1) || sessionUser.username.slice(0, 1)}
              </div>
              <div>
                <p className="font-medium">{sessionUser.fullName || sessionUser.username}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{sessionUser.role}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-slate-400">Operations dashboard</p>
              <h2 className="mt-1 text-2xl font-semibold">{sessionUser.role} workspace</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {new Date().toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <button type="button" className="rounded-xl bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </header>

          {isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Loading dashboard…
            </div>
          ) : activeView === 'dashboard' ? (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map(({ label, value, icon: Icon, tone }) => (
                  <div key={label} className="card-surface p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
                        <p className="mt-3 text-2xl font-semibold">{value}</p>
                      </div>
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                          tone === 'red'
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                            : tone === 'amber'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                              : tone === 'green'
                                ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300'
                                : 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                ))}
              </section>

              <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.95fr]">
                <div className="card-surface p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Performance trend</p>
                      <h3 className="text-xl font-semibold">Revenue momentum</h3>
                    </div>
                    <div className="rounded-xl bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
                      Live snapshot
                    </div>
                  </div>

                  <div className="h-80 w-full">
                    <ResponsiveContainer>
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="5%" stopColor="#d71920" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#d71920" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip formatter={(value) => formatMoney(value)} />
                        <Area type="monotone" dataKey="sales" stroke="#d71920" strokeWidth={3} fill="url(#salesFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card-surface p-4 sm:p-5">
                  <div className="mb-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Regional spread</p>
                    <h3 className="text-xl font-semibold">Sales by region</h3>
                  </div>

                  <div className="h-80">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={regionalData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={4}>
                          {regionalData.map((entry, index) => (
                            <Cell key={entry.name} fill={rolePalette[index % rolePalette.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatMoney(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="card-surface p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Operational view</p>
                      <h3 className="text-xl font-semibold">{sessionUser.role === 'Warehouse' ? 'Warehouse pulse' : 'Store highlights'}</h3>
                    </div>
                    <div className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {filteredRecords.length} records
                    </div>
                  </div>

                  <div className="h-72">
                    <ResponsiveContainer>
                      <BarChart data={topStores}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip formatter={(value) => formatMoney(value)} />
                        <Bar dataKey="sales" fill="#d71920" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card-surface p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Fulfillment</p>
                      <h3 className="text-xl font-semibold">Service quality</h3>
                    </div>
                    <Truck className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="space-y-4">
                    {filteredRecords.slice(0, 4).map((record) => (
                      <div key={`${record.storeName}-${record.product}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{record.storeName}</span>
                          <span className="text-slate-500 dark:text-slate-300">{record.fulfillmentRate}%</span>
                        </div>
                        <div className="mt-3 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-700"
                            style={{ width: `${Math.min(record.fulfillmentRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          ) : activeView === 'imports' ? (
            <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="card-surface p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-red-100 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    <Download className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Data ingestion</p>
                    <h3 className="text-xl font-semibold">Unified import center</h3>
                  </div>
                </div>

                <form onSubmit={handleImport} className="space-y-4" encType="multipart/form-data">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Import source</label>
                    <select
                      className="soft-input"
                      value={importForm.sourceType}
                      onChange={(event) => setImportForm({ ...importForm, sourceType: event.target.value })}
                    >
                      <option value="googleSheet">Google Sheets</option>
                      <option value="xlsx">XLSX</option>
                      <option value="csv">CSV</option>
                      <option value="access">Microsoft Access (.mdb/.accdb)</option>
                    </select>
                  </div>

                  {importForm.sourceType === 'googleSheet' ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Google Sheets URL or ID</label>
                      <input
                        className="soft-input"
                        value={importForm.sourceValue}
                        onChange={(event) => setImportForm({ ...importForm, sourceValue: event.target.value })}
                        placeholder="https://docs.google.com/spreadsheets/... or sheet-id"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Upload file</label>
                      <input
                        className="soft-input"
                        type="file"
                        accept={
                          importForm.sourceType === 'access'
                            ? '.mdb,.accdb'
                            : importForm.sourceType === 'csv'
                              ? '.csv'
                              : '.xlsx,.xls'
                        }
                        onChange={(event) => setImportForm({ ...importForm, fileName: event.target.files?.[0]?.name || '' })}
                      />
                    </div>
                  )}

                  <button type="submit" className="w-full rounded-xl bg-harvey-red px-4 py-3 font-medium text-white hover:bg-red-700">
                    Import data
                  </button>
                </form>

                {importStatus && (
                  <div className="mt-4 rounded-xl border border-red-500/20 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
                    {importStatus}
                  </div>
                )}
              </div>

              <div className="card-surface p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-slate-100 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Normalized view</p>
                    <h3 className="text-xl font-semibold">Internal schema preview</h3>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <th className="pb-2 pr-4">Store</th>
                        <th className="pb-2 pr-4">Region</th>
                        <th className="pb-2 pr-4">Product</th>
                        <th className="pb-2 pr-4">Sales</th>
                        <th className="pb-2 pr-4">Inventory</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.slice(0, 6).map((record) => (
                        <tr key={`${record.storeName}-${record.product}-${record.date}`} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-3 pr-4 font-medium">{record.storeName}</td>
                          <td className="py-3 pr-4">{record.region}</td>
                          <td className="py-3 pr-4">{record.product}</td>
                          <td className="py-3 pr-4">{formatMoney(record.sales)}</td>
                          <td className="py-3 pr-4">{record.inventory}</td>
                          <td className="py-3">
                            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-950/60 dark:text-green-300">
                              {record.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : (
            <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="card-surface p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-red-100 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Access control</p>
                    <h3 className="text-xl font-semibold">Assign roles</h3>
                  </div>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Full name</label>
                    <input className="soft-input" value={newUserForm.fullName} onChange={(event) => setNewUserForm({ ...newUserForm, fullName: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Username</label>
                    <input className="soft-input" value={newUserForm.username} onChange={(event) => setNewUserForm({ ...newUserForm, username: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Password</label>
                    <input
                      type="password"
                      className="soft-input"
                      value={newUserForm.password}
                      onChange={(event) => setNewUserForm({ ...newUserForm, password: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Role</label>
                    <select className="soft-input" value={newUserForm.role} onChange={(event) => setNewUserForm({ ...newUserForm, role: event.target.value })}>
                      <option value="Manager">Manager</option>
                      <option value="Salesperson">Salesperson</option>
                      <option value="Warehouse">Warehouse</option>
                    </select>
                  </div>

                  <button type="submit" className="w-full rounded-xl bg-harvey-red px-4 py-3 font-medium text-white hover:bg-red-700">
                    Create user
                  </button>
                </form>

                {importStatus && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{importStatus}</div>}
              </div>

              <div className="card-surface p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-slate-100 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <Settings className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">User roster</p>
                    <h3 className="text-xl font-semibold">Directory</h3>
                  </div>
                </div>

                <div className="space-y-3">
                  {users.map((user) => (
                    <div key={user.id || user.username} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                          {(user.fullName || user.username).slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{user.fullName || user.username}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{user.username}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                        {user.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="card-surface p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Performance table</p>
                  <h3 className="text-xl font-semibold">Operational detail</h3>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                  <BarChart3 className="h-4 w-4" />
                  KPI
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="pb-2 pr-4">Store</th>
                      <th className="pb-2 pr-4">{sessionUser.role === 'Warehouse' ? 'Product' : 'Rep'}</th>
                      <th className="pb-2 pr-4">{sessionUser.role === 'Warehouse' ? 'Inventory' : 'Sales'}</th>
                      <th className="pb-2 pr-4">Target</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleTableData.map((row, index) => (
                      <tr key={`${row.store}-${row.product}-${index}`} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-3 pr-4 font-medium">{row.store}</td>
                        <td className="py-3 pr-4">{row.rep || row.product}</td>
                        <td className="py-3 pr-4">{row.inventory || row.sales}</td>
                        <td className="py-3 pr-4">{row.target || row.fulfillment}</td>
                        <td className="py-3">
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-950/60 dark:text-green-300">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card-surface p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Command center</p>
                  <h3 className="text-xl font-semibold">System health</h3>
                </div>
                <Globe className="h-5 w-5 text-red-600" />
              </div>

              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80">
                  <div className="flex items-center justify-between text-sm">
                    <span>Sync status</span>
                    <span className="font-medium text-green-600">Online</span>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80">
                  <div className="flex items-center justify-between text-sm">
                    <span>Local cache</span>
                    <span className="font-medium">{records.length} records</span>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80">
                  <div className="flex items-center justify-between text-sm">
                    <span>Security</span>
                    <span className="font-medium text-red-600">PBKDF2</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

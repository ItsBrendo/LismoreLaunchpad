import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AreaChart as AreaChartIcon,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Download,
  Edit3,
  FileSpreadsheet,
  Globe,
  LogOut,
  Moon,
  PackageOpen,
  Plus,
  Settings,
  ShoppingCart,
  SunMedium,
  Target,
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

const rolePalette = ['#d71920', '#ef4444', '#f97316', '#22c55e', '#38bdf8'];

const initialForm = {
  username: '',
  password: '',
  role: 'Manager',
  fullName: '',
};

const defaultModules = [
  { id: 'sales-trend', title: 'Revenue Trend', type: 'line', metric: 'sales', entity: 'salespeople' },
  { id: 'store-mix', title: 'Store Mix', type: 'pie', metric: 'sales', entity: 'stores' },
  { id: 'target-gap', title: 'Target Gap', type: 'bar', metric: 'target', entity: 'salespeople' },
];

const legacyModules = [
  { id: 'legacy-overview', title: 'Basic Overview', type: 'line', metric: 'sales', entity: 'stores' },
  { id: 'legacy-fulfillment', title: 'Legacy Fulfillment', type: 'bar', metric: 'fulfillmentRate', entity: 'stores' },
];

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
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [newUserForm, setNewUserForm] = useState(initialForm);
  const [importForm, setImportForm] = useState({ sourceType: 'googleSheet', sourceValue: '', fileName: '' });
  const [importStatus, setImportStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [customModules, setCustomModules] = useState(defaultModules);
  const [moduleDraft, setModuleDraft] = useState({ title: '', type: 'line', metric: 'sales', entity: 'salespeople' });
  const [salespersonUpload, setSalespersonUpload] = useState({
    date: new Date().toISOString().slice(0, 10),
    salesPerson: '',
    storeName: 'Main Store',
    target: 12000,
    sales: 0,
    units: 0,
    notes: '',
  });
  const [storeUpload, setStoreUpload] = useState({
    date: new Date().toISOString().slice(0, 10),
    storeName: 'Main Store',
    target: 250000,
    sales: 0,
    fulfillmentRate: 0,
    status: 'Healthy',
  });
  const [managerEdits, setManagerEdits] = useState({});
  const [storeEdits, setStoreEdits] = useState({});

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

  const navItems = useMemo(() => {
    const items = [
      { key: 'dashboard', label: 'Dashboard', icon: AreaChartIcon },
      { key: 'individual', label: 'Individual Performance', icon: Users },
      { key: 'store', label: 'Store Performance', icon: BriefcaseBusiness },
      { key: 'eod', label: 'EOD Upload', icon: Download },
    ];

    if (sessionUser?.role === 'Manager') {
      items.push({ key: 'admin', label: 'User Admin', icon: UserCog });
    }

    return items;
  }, [sessionUser]);

  const filteredRecords = useMemo(() => {
    if (!sessionUser) return [];

    if (sessionUser.role === 'Manager') return records;

    if (sessionUser.role === 'Salesperson') {
      const targetName = sessionUser.fullName || sessionUser.username;
      return records.filter((record) => {
        const salesPerson = record.salesPerson || '';
        return (
          salesPerson.toLowerCase() === targetName.toLowerCase() ||
          salesPerson.toLowerCase().includes(targetName.toLowerCase().split(' ')[0])
        );
      });
    }

    return records.filter((record) => record.inventory > 0 || record.fulfillmentRate > 0);
  }, [records, sessionUser]);

  const summaryCards = useMemo(() => {
    const revenue = filteredRecords.reduce((sum, record) => sum + sanitizeNumber(record.sales), 0);
    const units = filteredRecords.reduce((sum, record) => sum + sanitizeNumber(record.units), 0);
    const avgFulfillment =
      filteredRecords.length > 0
        ? filteredRecords.reduce((sum, record) => sum + sanitizeNumber(record.fulfillmentRate), 0) / filteredRecords.length
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

  const salespeopleSummary = useMemo(() => {
    const map = {};
    records.forEach((record) => {
      const name = record.salesPerson || 'Unassigned';
      if (!map[name]) {
        map[name] = { salesPerson: name, totalSales: 0, target: 0, units: 0 };
      }
      map[name].totalSales += sanitizeNumber(record.sales);
      map[name].target += sanitizeNumber(record.target);
      map[name].units += sanitizeNumber(record.units);
    });
    return Object.values(map).sort((a, b) => b.totalSales - a.totalSales);
  }, [records]);

  const storeSummary = useMemo(() => {
    const map = {};
    records.forEach((record) => {
      const name = record.storeName || 'Unknown';
      if (!map[name]) {
        map[name] = { storeName: name, totalSales: 0, target: 0, fulfillmentRate: 0, count: 0 };
      }
      map[name].totalSales += sanitizeNumber(record.sales);
      map[name].target += sanitizeNumber(record.target);
      map[name].fulfillmentRate += sanitizeNumber(record.fulfillmentRate);
      map[name].count += 1;
    });
    return Object.values(map).map((entry) => ({
      ...entry,
      fulfillmentRate: Math.round(entry.fulfillmentRate / entry.count),
    })).sort((a, b) => b.totalSales - a.totalSales);
  }, [records]);

  const recordTableRows = useMemo(() => {
    if (sessionUser?.role === 'Warehouse') {
      return filteredRecords.slice(0, 5).map((record) => ({
        store: record.storeName,
        item: record.product,
        value: record.inventory,
        target: `${record.fulfillmentRate}%`,
        status: record.status,
      }));
    }

    return filteredRecords.slice(0, 5).map((record) => ({
      store: record.storeName,
      item: record.salesPerson,
      value: formatMoney(record.sales),
      target: formatMoney(record.target),
      status: record.status,
    }));
  }, [filteredRecords, sessionUser]);

  const customChartData = useMemo(() => {
    if (sessionUser?.role === 'Salesperson') {
      return filteredRecords.slice(-6).map((record) => ({
        name: record.storeName || 'Store',
        sales: sanitizeNumber(record.sales),
        target: sanitizeNumber(record.target),
      }));
    }

    return salespeopleSummary.slice(0, 6).map((row) => ({
      name: row.salesPerson,
      sales: row.totalSales,
      target: row.target,
    }));
  }, [filteredRecords, salespeopleSummary, sessionUser]);

  const renderModuleCard = (module) => {
    const chartData = module.entity === 'stores'
      ? storeSummary.slice(0, 5).map((store) => ({ name: store.storeName, sales: store.totalSales, target: store.target }))
      : customChartData;

    const commonProps = {
      margin: { top: 10, right: 10, left: -15, bottom: 0 },
    };

    return (
      <div key={module.id} className="card-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Custom module</p>
            <h3 className="text-xl font-semibold">{module.title}</h3>
          </div>
          <div className="rounded-xl bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {module.type}
          </div>
        </div>

        <div className="h-64 w-full">
          {module.type === 'line' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} {...commonProps}>
                <defs>
                  <linearGradient id={`module-fill-${module.id}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#d71920" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#d71920" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" />
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Area type="monotone" dataKey="sales" stroke="#d71920" strokeWidth={3} fill={`url(#module-fill-${module.id})`} />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {module.type === 'bar' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} {...commonProps}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" />
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Bar dataKey="sales" fill="#d71920" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {module.type === 'pie' && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="sales" nameKey="name" innerRadius={38} outerRadius={72} paddingAngle={4}>
                  {chartData.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={rolePalette[index % rolePalette.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(value)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  };

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

    if (!newUserForm.username.trim()) {
      setImportStatus('Username is required.');
      return;
    }

    const normalizedUsername = newUserForm.username.trim();
    const existing = await db.users.where('username').equalsIgnoreCase(normalizedUsername).first();

    if (existing) {
      setImportStatus('A user with that username already exists.');
      return;
    }

    const hashed = await hashPassword(newUserForm.password || 'Harvey123!');
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

  const handleSalespersonUpload = (event) => {
    event.preventDefault();
    const newRecord = {
      id: Date.now(),
      date: salespersonUpload.date,
      storeName: salespersonUpload.storeName,
      region: 'Local',
      salesPerson: sessionUser?.role === 'Salesperson' ? sessionUser.fullName || sessionUser.username : salespersonUpload.salesPerson,
      category: 'Daily KPI',
      product: 'Daily Sales',
      units: Number(salespersonUpload.units || 0),
      sales: Number(salespersonUpload.sales || 0),
      inventory: 0,
      fulfillmentRate: Number((Number(salespersonUpload.sales || 0) / Math.max(Number(salespersonUpload.target || 1), 1)) * 100),
      target: Number(salespersonUpload.target || 0),
      status: Number(salespersonUpload.sales || 0) >= Number(salespersonUpload.target || 0) ? 'Healthy' : 'Watch',
      sourceName: 'Daily Upload',
      createdAt: new Date().toISOString(),
      notes: salespersonUpload.notes,
    };

    setRecords((current) => [newRecord, ...current]);
    setSalespersonUpload({
      date: new Date().toISOString().slice(0, 10),
      salesPerson: sessionUser?.role === 'Salesperson' ? sessionUser.fullName || sessionUser.username : '',
      storeName: 'Main Store',
      target: 12000,
      sales: 0,
      units: 0,
      notes: '',
    });
    setImportStatus('Individual performance submitted successfully.');
  };

  const handleStoreUpload = (event) => {
    event.preventDefault();
    const newRecord = {
      id: Date.now(),
      date: storeUpload.date,
      storeName: storeUpload.storeName,
      region: 'Regional',
      salesPerson: 'Manager Upload',
      category: 'Store KPI',
      product: 'Store Performance',
      units: 0,
      sales: Number(storeUpload.sales || 0),
      inventory: 0,
      fulfillmentRate: Number(storeUpload.fulfillmentRate || 0),
      target: Number(storeUpload.target || 0),
      status: storeUpload.status,
      sourceName: 'Manager EOD Upload',
      createdAt: new Date().toISOString(),
    };

    setRecords((current) => [newRecord, ...current]);
    setStoreUpload({
      date: new Date().toISOString().slice(0, 10),
      storeName: 'Main Store',
      target: 250000,
      sales: 0,
      fulfillmentRate: 0,
      status: 'Healthy',
    });
    setImportStatus('Store EOD performance uploaded successfully.');
  };

  const handleSalespersonEdit = (salesPerson, field, value) => {
    const nextValue = field === 'sales' || field === 'target' ? Number(value || 0) : value;
    setManagerEdits((current) => ({
      ...current,
      [salesPerson]: {
        ...(current[salesPerson] || { sales: 0, target: 0, status: 'Healthy' }),
        [field]: nextValue,
      },
    }));
  };

  const saveSalespersonEdits = (salesPerson) => {
    const updates = managerEdits[salesPerson] || {};
    setRecords((current) =>
      current.map((record) => {
        if ((record.salesPerson || '').toLowerCase() !== salesPerson.toLowerCase()) return record;
        const nextSales = updates.sales ?? sanitizeNumber(record.sales);
        const nextTarget = updates.target ?? sanitizeNumber(record.target);
        const nextStatus = updates.status || (nextSales >= nextTarget ? 'Healthy' : 'Watch');
        return {
          ...record,
          sales: nextSales,
          target: nextTarget,
          status: nextStatus,
          fulfillmentRate: Math.min((nextSales / Math.max(nextTarget, 1)) * 100, 100),
        };
      })
    );
    setManagerEdits((current) => {
      const next = { ...current };
      delete next[salesPerson];
      return next;
    });
  };

  const handleStoreEdit = (storeName, field, value) => {
    const nextValue = field === 'totalSales' || field === 'target' ? Number(value || 0) : value;
    setStoreEdits((current) => ({
      ...current,
      [storeName]: {
        ...(current[storeName] || { totalSales: 0, target: 0, status: 'Healthy' }),
        [field]: nextValue,
      },
    }));
  };

  const saveStoreEdits = (storeName) => {
    const updates = storeEdits[storeName] || {};
    setRecords((current) =>
      current.map((record) => {
        if ((record.storeName || '').toLowerCase() !== storeName.toLowerCase()) return record;
        const nextSales = updates.totalSales ?? sanitizeNumber(record.sales);
        const nextTarget = updates.target ?? sanitizeNumber(record.target);
        const nextStatus = updates.status || (nextSales >= nextTarget ? 'Healthy' : 'Watch');
        return {
          ...record,
          sales: nextSales,
          target: nextTarget,
          status: nextStatus,
          fulfillmentRate: Math.min((nextSales / Math.max(nextTarget, 1)) * 100, 100),
        };
      })
    );
    setStoreEdits((current) => {
      const next = { ...current };
      delete next[storeName];
      return next;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('hn-session');
    setSessionUser(null);
    setActiveView('dashboard');
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
                <h1 className="text-2xl font-semibold">Performance Command Center</h1>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-red-100">Overview</p>
                <h2 className="mt-3 text-4xl font-semibold">Modular KPI reporting for teams and stores.</h2>
              </div>

              <div className="space-y-5 text-red-50">
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-sm text-red-100">Role-based workflow</p>
                  <p className="mt-2 text-xl font-medium">Salespeople, managers and store teams</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-sm text-red-100">Custom modules</p>
                  <p className="mt-2 text-xl font-medium">Build dashboards around your own KPI views</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-sm text-red-100">Daily EOD uploads</p>
                  <p className="mt-2 text-xl font-medium">Personal KPI and manager-controlled store reporting</p>
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

  const isManager = sessionUser.role === 'Manager';
  const isSalesperson = sessionUser.role === 'Salesperson';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        <aside className="w-full border-b border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-900 lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-100 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-300">
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
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Logged in as</p>
              {isManager && (
                <button
                  type="button"
                  onClick={() => setDebugMode((current) => !current)}
                  className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                    debugMode ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
                  }`}
                >
                  {debugMode ? 'Debug' : 'Normal'}
                </button>
              )}
            </div>
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

              <section className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
                <div className="card-surface p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Custom modules</p>
                      <h3 className="text-xl font-semibold">Performance workspace</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('individual')}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white"
                    >
                      <Plus className="h-4 w-4" />
                      Create module
                    </button>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {customModules.map(renderModuleCard)}
                  </div>
                </div>

                <div className="card-surface p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Create</p>
                      <h3 className="text-xl font-semibold">Module builder</h3>
                    </div>
                    <Target className="h-5 w-5 text-red-600" />
                  </div>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const title = moduleDraft.title.trim() || `${moduleDraft.type} module`;
                      setCustomModules((current) => [{ id: Date.now().toString(), title, ...moduleDraft }, ...current]);
                      setModuleDraft({ title: '', type: 'line', metric: 'sales', entity: 'salespeople' });
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Title</label>
                      <input
                        className="soft-input"
                        value={moduleDraft.title}
                        onChange={(event) => setModuleDraft({ ...moduleDraft, title: event.target.value })}
                        placeholder="Sales performance"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Chart type</label>
                      <select
                        className="soft-input"
                        value={moduleDraft.type}
                        onChange={(event) => setModuleDraft({ ...moduleDraft, type: event.target.value })}
                      >
                        <option value="line">Line</option>
                        <option value="bar">Bar</option>
                        <option value="pie">Pie</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Metric</label>
                      <select
                        className="soft-input"
                        value={moduleDraft.metric}
                        onChange={(event) => setModuleDraft({ ...moduleDraft, metric: event.target.value })}
                      >
                        <option value="sales">Sales</option>
                        <option value="target">Target</option>
                        <option value="fulfillmentRate">Fulfillment</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Scope</label>
                      <select
                        className="soft-input"
                        value={moduleDraft.entity}
                        onChange={(event) => setModuleDraft({ ...moduleDraft, entity: event.target.value })}
                      >
                        <option value="salespeople">Salespeople</option>
                        <option value="stores">Stores</option>
                      </select>
                    </div>

                    <button type="submit" className="w-full rounded-xl bg-harvey-red px-4 py-3 font-medium text-white hover:bg-red-700">
                      Add custom module
                    </button>
                  </form>
                </div>
              </section>

              {debugMode && (
                <section className="mt-6 card-surface p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Debug access</p>
                      <h3 className="text-xl font-semibold">Legacy basic modules</h3>
                    </div>
                    <div className="rounded-xl bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
                      Hidden by default
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {legacyModules.map(renderModuleCard)}
                  </div>
                </section>
              )}
            </>
          ) : activeView === 'individual' ? (
            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="card-surface p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Individual KPI</p>
                    <h3 className="text-xl font-semibold">{isSalesperson ? 'My performance' : 'Salesperson performance'}</h3>
                  </div>
                  <div className="rounded-xl bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    Daily EOD
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <th className="pb-2 pr-4">Salesperson</th>
                        <th className="pb-2 pr-4">Sales</th>
                        <th className="pb-2 pr-4">Target</th>
                        <th className="pb-2 pr-4">Units</th>
                        {isManager && <th className="pb-2">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {salespeopleSummary.map((row) => (
                        <tr key={row.salesPerson} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-3 pr-4 font-medium">{row.salesPerson}</td>
                          <td className="py-3 pr-4">
                            {isManager ? (
                              <input
                                className="soft-input min-w-[120px]"
                                value={managerEdits[row.salesPerson]?.sales ?? row.totalSales}
                                onChange={(event) => handleSalespersonEdit(row.salesPerson, 'sales', event.target.value)}
                              />
                            ) : (
                              formatMoney(row.totalSales)
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            {isManager ? (
                              <input
                                className="soft-input min-w-[120px]"
                                value={managerEdits[row.salesPerson]?.target ?? row.target}
                                onChange={(event) => handleSalespersonEdit(row.salesPerson, 'target', event.target.value)}
                              />
                            ) : (
                              formatMoney(row.target)
                            )}
                          </td>
                          <td className="py-3 pr-4">{row.units}</td>
                          {isManager && (
                            <td className="py-3">
                              <button
                                type="button"
                                onClick={() => saveSalespersonEdits(row.salesPerson)}
                                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-medium text-white"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Save
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card-surface p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-red-100 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Daily upload</p>
                    <h3 className="text-xl font-semibold">Submit KPI</h3>
                  </div>
                </div>

                <form onSubmit={handleSalespersonUpload} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Date</label>
                    <input
                      type="date"
                      className="soft-input"
                      value={salespersonUpload.date}
                      onChange={(event) => setSalespersonUpload({ ...salespersonUpload, date: event.target.value })}
                    />
                  </div>

                  {!isSalesperson && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Salesperson</label>
                      <input
                        className="soft-input"
                        value={salespersonUpload.salesPerson}
                        onChange={(event) => setSalespersonUpload({ ...salespersonUpload, salesPerson: event.target.value })}
                        placeholder="Name of salesperson"
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Store</label>
                    <input
                      className="soft-input"
                      value={salespersonUpload.storeName}
                      onChange={(event) => setSalespersonUpload({ ...salespersonUpload, storeName: event.target.value })}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Sales</label>
                      <input
                        type="number"
                        className="soft-input"
                        value={salespersonUpload.sales}
                        onChange={(event) => setSalespersonUpload({ ...salespersonUpload, sales: Number(event.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Target</label>
                      <input
                        type="number"
                        className="soft-input"
                        value={salespersonUpload.target}
                        onChange={(event) => setSalespersonUpload({ ...salespersonUpload, target: Number(event.target.value) })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Units</label>
                    <input
                      type="number"
                      className="soft-input"
                      value={salespersonUpload.units}
                      onChange={(event) => setSalespersonUpload({ ...salespersonUpload, units: Number(event.target.value) })}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Notes</label>
                    <textarea
                      className="soft-input min-h-[110px]"
                      value={salespersonUpload.notes}
                      onChange={(event) => setSalespersonUpload({ ...salespersonUpload, notes: event.target.value })}
                    />
                  </div>

                  <button type="submit" className="w-full rounded-xl bg-harvey-red px-4 py-3 font-medium text-white hover:bg-red-700">
                    Submit KPI
                  </button>
                </form>
              </div>
            </section>
          ) : activeView === 'store' ? (
            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="card-surface p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Store performance</p>
                    <h3 className="text-xl font-semibold">Branch overview</h3>
                  </div>
                  <div className="rounded-xl bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    Monthly view
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <th className="pb-2 pr-4">Store</th>
                        <th className="pb-2 pr-4">Sales</th>
                        <th className="pb-2 pr-4">Target</th>
                        <th className="pb-2 pr-4">Fulfillment</th>
                        {isManager && <th className="pb-2">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {storeSummary.map((row) => (
                        <tr key={row.storeName} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-3 pr-4 font-medium">{row.storeName}</td>
                          <td className="py-3 pr-4">
                            {isManager ? (
                              <input
                                className="soft-input min-w-[120px]"
                                value={storeEdits[row.storeName]?.totalSales ?? row.totalSales}
                                onChange={(event) => handleStoreEdit(row.storeName, 'totalSales', event.target.value)}
                              />
                            ) : (
                              formatMoney(row.totalSales)
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            {isManager ? (
                              <input
                                className="soft-input min-w-[120px]"
                                value={storeEdits[row.storeName]?.target ?? row.target}
                                onChange={(event) => handleStoreEdit(row.storeName, 'target', event.target.value)}
                              />
                            ) : (
                              formatMoney(row.target)
                            )}
                          </td>
                          <td className="py-3 pr-4">{row.fulfillmentRate}%</td>
                          {isManager && (
                            <td className="py-3">
                              <button
                                type="button"
                                onClick={() => saveStoreEdits(row.storeName)}
                                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-medium text-white"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Save
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card-surface p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-red-100 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Store KPI</p>
                    <h3 className="text-xl font-semibold">Branch summary</h3>
                  </div>
                </div>

                <div className="space-y-4">
                  {storeSummary.slice(0, 4).map((store) => (
                    <div key={store.storeName} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{store.storeName}</p>
                        <span className="text-sm text-slate-500 dark:text-slate-300">{store.fulfillmentRate}%</span>
                      </div>
                      <div className="mt-3 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-700"
                          style={{ width: `${Math.min(store.fulfillmentRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : activeView === 'eod' ? (
            <section className="grid gap-6 xl:grid-cols-2">
              <div className="card-surface p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-red-100 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Salesperson upload</p>
                    <h3 className="text-xl font-semibold">EOD individual performance</h3>
                  </div>
                </div>

                <form onSubmit={handleSalespersonUpload} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Date</label>
                    <input
                      type="date"
                      className="soft-input"
                      value={salespersonUpload.date}
                      onChange={(event) => setSalespersonUpload({ ...salespersonUpload, date: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Salesperson</label>
                    <input
                      className="soft-input"
                      value={salespersonUpload.salesPerson || sessionUser.fullName || sessionUser.username}
                      onChange={(event) => setSalespersonUpload({ ...salespersonUpload, salesPerson: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Store</label>
                    <input
                      className="soft-input"
                      value={salespersonUpload.storeName}
                      onChange={(event) => setSalespersonUpload({ ...salespersonUpload, storeName: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Sales</label>
                      <input
                        type="number"
                        className="soft-input"
                        value={salespersonUpload.sales}
                        onChange={(event) => setSalespersonUpload({ ...salespersonUpload, sales: Number(event.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Target</label>
                      <input
                        type="number"
                        className="soft-input"
                        value={salespersonUpload.target}
                        onChange={(event) => setSalespersonUpload({ ...salespersonUpload, target: Number(event.target.value) })}
                      />
                    </div>
                  </div>
                  <button type="submit" className="w-full rounded-xl bg-harvey-red px-4 py-3 font-medium text-white hover:bg-red-700">
                    Submit salesperson EOD KPI
                  </button>
                </form>
              </div>

              <div className="card-surface p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-red-100 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    <BriefcaseBusiness className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Manager upload</p>
                    <h3 className="text-xl font-semibold">EOD store performance</h3>
                  </div>
                </div>

                <form onSubmit={handleStoreUpload} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Date</label>
                    <input
                      type="date"
                      className="soft-input"
                      value={storeUpload.date}
                      onChange={(event) => setStoreUpload({ ...storeUpload, date: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Store</label>
                    <input
                      className="soft-input"
                      value={storeUpload.storeName}
                      onChange={(event) => setStoreUpload({ ...storeUpload, storeName: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Store sales</label>
                      <input
                        type="number"
                        className="soft-input"
                        value={storeUpload.sales}
                        onChange={(event) => setStoreUpload({ ...storeUpload, sales: Number(event.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Target</label>
                      <input
                        type="number"
                        className="soft-input"
                        value={storeUpload.target}
                        onChange={(event) => setStoreUpload({ ...storeUpload, target: Number(event.target.value) })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Fulfillment %</label>
                    <input
                      type="number"
                      className="soft-input"
                      value={storeUpload.fulfillmentRate}
                      onChange={(event) => setStoreUpload({ ...storeUpload, fulfillmentRate: Number(event.target.value) })}
                    />
                  </div>
                  <button type="submit" className="w-full rounded-xl bg-harvey-red px-4 py-3 font-medium text-white hover:bg-red-700">
                    Upload store EOD data
                  </button>
                </form>
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
                    {recordTableRows.map((row, index) => (
                      <tr key={`${row.store}-${row.item}-${index}`} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-3 pr-4 font-medium">{row.store}</td>
                        <td className="py-3 pr-4">{row.item}</td>
                        <td className="py-3 pr-4">{row.value}</td>
                        <td className="py-3 pr-4">{row.target}</td>
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

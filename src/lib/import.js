import * as XLSX from 'xlsx';

const normalizeValue = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  return value ?? null;
};

export const sanitizeNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number.parseFloat(String(value).replace(/[$,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function normalizeRecord(record = {}) {
  return {
    id: record.id ?? `${record.storeName ?? 'store'}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    sourceName: normalizeValue(record.sourceName) ?? 'Imported',
    date: normalizeValue(record.date) ?? new Date().toISOString().slice(0, 10),
    storeName: normalizeValue(record.storeName) ?? 'Unknown Store',
    location: normalizeValue(record.location) ?? 'Unknown Location',
    region: normalizeValue(record.region) ?? 'Unknown',
    salesPerson: normalizeValue(record.salesPerson) ?? normalizeValue(record.salesperson) ?? 'Unassigned',
    category: normalizeValue(record.category) ?? 'General',
    product: normalizeValue(record.product) ?? normalizeValue(record.productName) ?? 'General Product',
    units: sanitizeNumber(record.units),
    sales: sanitizeNumber(record.sales ?? record.salesValue ?? record.revenue),
    inventory: sanitizeNumber(record.inventory ?? record.stockOnHand ?? record.stock),
    fulfillmentRate: sanitizeNumber(record.fulfillmentRate ?? record.fulfillment),
    target: sanitizeNumber(record.target ?? record.salesTarget),
    status: normalizeValue(record.status) ?? 'Healthy',
    channel: normalizeValue(record.channel) ?? 'Retail',
  };
}

export function parseGoogleSheetInput(source) {
  const id = source.trim();
  if (!id) {
    return [];
  }

  return [
    normalizeRecord({
      sourceName: `Google Sheet ${id}`,
      date: new Date().toISOString().slice(0, 10),
      storeName: 'Harvey Norman Sydney',
      location: 'Sydney NSW',
      region: 'NSW',
      salesPerson: 'Alicia Smith',
      category: 'Audio',
      product: 'Smart TV',
      units: 38,
      sales: 21980,
      inventory: 320,
      fulfillmentRate: 97,
      target: 22000,
      status: 'Healthy',
      channel: 'Digital',
    }),
  ];
}

export function parseCsvText(csvText) {
  const rows = csvText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].split(',').map((header) => header.trim().replace(/"/g, ''));
  return rows.slice(1).map((row) => {
    const values = row.split(',').map((cell) => cell.trim().replace(/"/g, ''));
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    return normalizeRecord(record);
  });
}

export async function parseXlsxFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map((row) => normalizeRecord(row));
}

export function parseAccessFile(file) {
  const label = file.name || 'Access database';
  const payload = {
    sourceName: label,
    date: new Date().toISOString().slice(0, 10),
    storeName: 'Access Import',
    location: 'System detected',
    region: 'Unknown',
    salesPerson: 'Warehouse Ops',
    category: 'Inventory',
    product: 'Database Input',
    units: 0,
    sales: 0,
    inventory: 0,
    fulfillmentRate: 0,
    target: 0,
    status: 'Queued',
    channel: 'Import',
  };

  return [normalizeRecord(payload)];
}

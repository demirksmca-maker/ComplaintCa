'use strict';

const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const state = {
  employees: [],
  shiftTemplates: [],
  lastSchedule: null,
};

let editingEmployeeId = null;
let editingShiftId = null;

// ---------- yardımcılar ----------

function uid() {
  return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shiftHoursLocal(template) {
  const [sh, sm] = template.start.split(':').map(Number);
  const [eh, em] = template.end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

function employeeById(id) {
  return state.employees.find((e) => e.id === id);
}

async function persist() {
  await window.api.saveData({
    employees: state.employees,
    shiftTemplates: state.shiftTemplates,
    lastSchedule: state.lastSchedule,
  });
}

// ---------- sekmeler ----------

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ---------- personel formu ----------

function renderDaysOffCheckboxes(selected = []) {
  const container = document.getElementById('employee-days-off');
  container.innerHTML = '';
  DAY_NAMES.forEach((name, idx) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(idx);
    input.checked = selected.includes(idx);
    input.className = 'day-off-checkbox';
    label.appendChild(input);
    label.appendChild(document.createTextNode(DAY_SHORT[idx]));
    container.appendChild(label);
  });
}

function addUnavailabilityRow(entry = { day: 0, start: '00:00', end: '00:00' }) {
  const list = document.getElementById('employee-unavailability-list');
  const row = document.createElement('div');
  row.className = 'unavailability-row';

  const daySelect = document.createElement('select');
  DAY_NAMES.forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = name;
    if (idx === entry.day) opt.selected = true;
    daySelect.appendChild(opt);
  });

  const startInput = document.createElement('input');
  startInput.type = 'time';
  startInput.value = entry.start;

  const endInput = document.createElement('input');
  endInput.type = 'time';
  endInput.value = entry.end;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'icon-btn danger';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => row.remove());

  row.append(daySelect, startInput, endInput, removeBtn);
  list.appendChild(row);
}

function readUnavailabilityRows() {
  return [...document.querySelectorAll('#employee-unavailability-list .unavailability-row')].map((row) => {
    const [daySelect, startInput, endInput] = row.querySelectorAll('select, input');
    return { day: Number(daySelect.value), start: startInput.value, end: endInput.value };
  });
}

function resetEmployeeForm() {
  editingEmployeeId = null;
  document.getElementById('employee-form-title').textContent = 'Yeni Personel Ekle';
  document.getElementById('employee-id').value = '';
  document.getElementById('employee-form').reset();
  document.getElementById('employee-min-hours').value = '0';
  document.getElementById('employee-max-hours').value = '40';
  document.getElementById('employee-min-rest').value = '11';
  document.getElementById('employee-max-consecutive').value = '6';
  renderDaysOffCheckboxes([]);
  document.getElementById('employee-unavailability-list').innerHTML = '';
}

function fillEmployeeForm(employee) {
  editingEmployeeId = employee.id;
  document.getElementById('employee-form-title').textContent = 'Personeli Düzenle';
  document.getElementById('employee-id').value = employee.id;
  document.getElementById('employee-name').value = employee.name;
  document.getElementById('employee-role').value = employee.role || '';
  document.getElementById('employee-min-hours').value = employee.minWeeklyHours;
  document.getElementById('employee-max-hours').value = employee.maxWeeklyHours;
  document.getElementById('employee-min-rest').value = employee.minRestHours;
  document.getElementById('employee-max-consecutive').value = employee.maxConsecutiveDays;
  renderDaysOffCheckboxes(employee.daysOff || []);
  document.getElementById('employee-unavailability-list').innerHTML = '';
  (employee.unavailability || []).forEach(addUnavailabilityRow);
}

function renderEmployeeTable() {
  const tbody = document.getElementById('employee-table-body');
  tbody.innerHTML = '';
  if (state.employees.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Henüz personel eklenmedi.</td></tr>';
    return;
  }
  state.employees.forEach((employee) => {
    const tr = document.createElement('tr');
    const daysOffLabel = (employee.daysOff || []).map((d) => DAY_SHORT[d]).join(', ') || '—';
    tr.innerHTML = `
      <td>${escapeHtml(employee.name)}</td>
      <td>${escapeHtml(employee.role || '—')}</td>
      <td>${employee.minWeeklyHours}–${employee.maxWeeklyHours} sa</td>
      <td>${daysOffLabel}</td>
      <td></td>
    `;
    const actionsTd = tr.lastElementChild;
    const editBtn = makeIconButton('✎', () => fillEmployeeForm(employee));
    const delBtn = makeIconButton('🗑', () => deleteEmployee(employee.id), true);
    actionsTd.append(editBtn, delBtn);
    tbody.appendChild(tr);
  });
}

function deleteEmployee(id) {
  if (!window.confirm('Bu personeli silmek istediğinize emin misiniz?')) return;
  state.employees = state.employees.filter((e) => e.id !== id);
  renderEmployeeTable();
  renderReports();
  persist();
}

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  renderDaysOffCheckboxes([]);
  populateShiftDaySelect();
  bindEmployeeForm();
  bindShiftForm();
  bindScheduleActions();
  loadInitialData();
});

function bindEmployeeForm() {
  document.getElementById('add-unavailability-btn').addEventListener('click', () => addUnavailabilityRow());
  document.getElementById('employee-cancel-btn').addEventListener('click', resetEmployeeForm);
  document.getElementById('employee-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const daysOff = [...document.querySelectorAll('.day-off-checkbox:checked')].map((cb) => Number(cb.value));
    const employee = {
      id: editingEmployeeId || uid(),
      name: document.getElementById('employee-name').value.trim(),
      role: document.getElementById('employee-role').value.trim(),
      minWeeklyHours: Number(document.getElementById('employee-min-hours').value) || 0,
      maxWeeklyHours: Number(document.getElementById('employee-max-hours').value) || 0,
      minRestHours: Number(document.getElementById('employee-min-rest').value) || 0,
      maxConsecutiveDays: Number(document.getElementById('employee-max-consecutive').value) || 6,
      daysOff,
      unavailability: readUnavailabilityRows(),
    };
    if (!employee.name) return;
    if (editingEmployeeId) {
      const idx = state.employees.findIndex((e) => e.id === editingEmployeeId);
      state.employees[idx] = employee;
    } else {
      state.employees.push(employee);
    }
    resetEmployeeForm();
    renderEmployeeTable();
    renderReports();
    persist();
  });
}

// ---------- vardiya formu ----------

function populateShiftDaySelect() {
  const select = document.getElementById('shift-day');
  select.innerHTML = '';
  DAY_NAMES.forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function resetShiftForm() {
  editingShiftId = null;
  document.getElementById('shift-form-title').textContent = 'Yeni Vardiya Şablonu';
  document.getElementById('shift-form').reset();
  document.getElementById('shift-id').value = '';
  document.getElementById('shift-start').value = '09:00';
  document.getElementById('shift-end').value = '17:00';
  document.getElementById('shift-required-count').value = '1';
}

function fillShiftForm(template) {
  editingShiftId = template.id;
  document.getElementById('shift-form-title').textContent = 'Vardiyayı Düzenle';
  document.getElementById('shift-id').value = template.id;
  document.getElementById('shift-name').value = template.name;
  document.getElementById('shift-day').value = String(template.day);
  document.getElementById('shift-start').value = template.start;
  document.getElementById('shift-end').value = template.end;
  document.getElementById('shift-required-count').value = template.requiredCount;
  document.getElementById('shift-required-role').value = template.requiredRole || '';
}

function renderShiftTable() {
  const tbody = document.getElementById('shift-table-body');
  tbody.innerHTML = '';
  if (state.shiftTemplates.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Henüz vardiya şablonu eklenmedi.</td></tr>';
    return;
  }
  const sorted = [...state.shiftTemplates].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  sorted.forEach((template) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${DAY_NAMES[template.day]}</td>
      <td>${escapeHtml(template.name)}</td>
      <td>${template.start}–${template.end}</td>
      <td>${template.requiredCount}</td>
      <td>${escapeHtml(template.requiredRole || 'Herkes')}</td>
      <td></td>
    `;
    const actionsTd = tr.lastElementChild;
    const editBtn = makeIconButton('✎', () => fillShiftForm(template));
    const delBtn = makeIconButton('🗑', () => deleteShift(template.id), true);
    actionsTd.append(editBtn, delBtn);
    tbody.appendChild(tr);
  });
}

function deleteShift(id) {
  if (!window.confirm('Bu vardiya şablonunu silmek istediğinize emin misiniz?')) return;
  state.shiftTemplates = state.shiftTemplates.filter((t) => t.id !== id);
  renderShiftTable();
  persist();
}

function bindShiftForm() {
  document.getElementById('shift-cancel-btn').addEventListener('click', resetShiftForm);
  document.getElementById('shift-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const template = {
      id: editingShiftId || uid(),
      name: document.getElementById('shift-name').value.trim(),
      day: Number(document.getElementById('shift-day').value),
      start: document.getElementById('shift-start').value,
      end: document.getElementById('shift-end').value,
      requiredCount: Number(document.getElementById('shift-required-count').value) || 1,
      requiredRole: document.getElementById('shift-required-role').value.trim() || null,
    };
    if (!template.name) return;
    if (editingShiftId) {
      const idx = state.shiftTemplates.findIndex((t) => t.id === editingShiftId);
      state.shiftTemplates[idx] = template;
    } else {
      state.shiftTemplates.push(template);
    }
    resetShiftForm();
    renderShiftTable();
    persist();
  });
}

// ---------- program (schedule) ----------

function bindScheduleActions() {
  document.getElementById('generate-schedule-btn').addEventListener('click', async () => {
    if (state.employees.length === 0 || state.shiftTemplates.length === 0) {
      window.alert('Program oluşturmak için en az bir personel ve bir vardiya şablonu ekleyin.');
      return;
    }
    const result = await window.api.generateSchedule({
      employees: state.employees,
      shiftTemplates: state.shiftTemplates,
    });
    state.lastSchedule = { ...result, generatedAt: Date.now() };
    renderSchedule();
    renderReports();
    await persist();
  });

  document.getElementById('export-csv-btn').addEventListener('click', async () => {
    if (!state.lastSchedule) {
      window.alert('Önce bir program oluşturun.');
      return;
    }
    const content = buildCsv();
    const dateStr = new Date().toISOString().slice(0, 10);
    await window.api.exportCsv({ content, defaultName: `program-${dateStr}.csv` });
  });
}

function renderSchedule() {
  const warningsBox = document.getElementById('schedule-warnings');
  const grid = document.getElementById('schedule-grid');
  warningsBox.innerHTML = '';
  grid.innerHTML = '';

  if (!state.lastSchedule) {
    grid.innerHTML = '<p>Henüz bir program oluşturulmadı.</p>';
    return;
  }

  const { slots, warnings } = state.lastSchedule;

  if (warnings && warnings.length > 0) {
    warningsBox.className = 'warning-box';
    warningsBox.innerHTML = `<strong>⚠ ${warnings.length} uyarı</strong><ul>${warnings
      .map((w) => `<li>${escapeHtml(w)}</li>`)
      .join('')}</ul>`;
  }

  const byDay = new Map();
  slots.forEach((slot) => {
    const list = byDay.get(slot.template.day) || [];
    list.push(slot);
    byDay.set(slot.template.day, list);
  });

  for (let day = 0; day < 7; day++) {
    const daySlots = (byDay.get(day) || []).sort((a, b) => a.template.start.localeCompare(b.template.start));
    if (daySlots.length === 0) continue;
    const dayEl = document.createElement('div');
    dayEl.className = 'schedule-day';
    dayEl.innerHTML = `<h3>${DAY_NAMES[day]}</h3>`;
    daySlots.forEach((slot) => {
      const card = document.createElement('div');
      const understaffed = slot.assigned.length < slot.capacity;
      card.className = 'shift-card' + (understaffed ? ' understaffed' : '');
      const names = slot.assigned.map((id) => employeeById(id)?.name || '(silinmiş personel)').join(', ') || '— Atama yok —';
      card.innerHTML = `
        <strong>${escapeHtml(slot.template.name)}</strong>
        <div class="meta">${slot.template.start}–${slot.template.end} · ${shiftHoursLocal(slot.template)} sa ·
          ${slot.assigned.length}/${slot.capacity} kişi
          ${slot.template.requiredRole ? ` · Rol: ${escapeHtml(slot.template.requiredRole)}` : ''}</div>
        <div class="assigned">${escapeHtml(names)}</div>
      `;
      dayEl.appendChild(card);
    });
    grid.appendChild(dayEl);
  }
}

function buildCsv() {
  const rows = [['Gün', 'Vardiya', 'Başlangıç', 'Bitiş', 'Süre (saat)', 'Gereken', 'Atanan Personel']];
  const sorted = [...state.lastSchedule.slots].sort(
    (a, b) => a.template.day - b.template.day || a.template.start.localeCompare(b.template.start)
  );
  sorted.forEach((slot) => {
    const names = slot.assigned.map((id) => employeeById(id)?.name || '').join('; ');
    rows.push([
      DAY_NAMES[slot.template.day],
      slot.template.name,
      slot.template.start,
      slot.template.end,
      String(shiftHoursLocal(slot.template)),
      String(slot.capacity),
      names,
    ]);
  });
  const csvBody = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  return '﻿' + csvBody;
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// ---------- raporlar ----------

function renderReports() {
  const tbody = document.getElementById('reports-table-body');
  tbody.innerHTML = '';
  if (state.employees.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Henüz personel eklenmedi.</td></tr>';
    return;
  }
  const hoursByEmployee = (state.lastSchedule && state.lastSchedule.hoursByEmployee) || {};
  state.employees.forEach((employee) => {
    const hours = hoursByEmployee[employee.id] || 0;
    let statusLabel = 'Uygun';
    let statusClass = 'status-ok';
    if (employee.maxWeeklyHours != null && hours > employee.maxWeeklyHours) {
      statusLabel = 'Aşım';
      statusClass = 'status-over';
    } else if (employee.minWeeklyHours != null && hours < employee.minWeeklyHours && state.lastSchedule) {
      statusLabel = 'Eksik';
      statusClass = 'status-under';
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(employee.name)}</td>
      <td>${escapeHtml(employee.role || '—')}</td>
      <td>${hours} sa</td>
      <td>${employee.minWeeklyHours}–${employee.maxWeeklyHours} sa</td>
      <td class="${statusClass}">${statusLabel}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- ortak yardımcılar ----------

function makeIconButton(label, onClick, danger = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn' + (danger ? ' danger' : '');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadInitialData() {
  const data = await window.api.loadData();
  state.employees = data.employees || [];
  state.shiftTemplates = data.shiftTemplates || [];
  state.lastSchedule = data.lastSchedule || null;
  renderEmployeeTable();
  renderShiftTable();
  renderSchedule();
  renderReports();
}

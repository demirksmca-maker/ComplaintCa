'use strict';

// AI destekli otomatik vardiya optimizasyon motoru.
//
// Bir LLM'e ağ çağrısı yapmaz; tamamen çevrimdışı çalışan, kısıt tabanlı
// (constraint-based) bir sezgisel/yerel-arama optimizasyon algoritmasıdır.
// Amaç: her vardiya pozisyonunu, uygunluk/rol/dinlenme kısıtlarını ihlal
// etmeden ve çalışanlar arasında saatleri olabildiğince adil dağıtarak
// doldurmak.
//
// Gün indeksi: 0 = Pazartesi ... 6 = Pazar.

const MINUTES_IN_DAY = 24 * 60;

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Bir vardiya şablonunu, haftanın o günü içindeki mutlak dakika aralığına
// çevirir. Bitiş saati başlangıçtan küçükse (ör. 22:00-06:00) gece yarısını
// geçen vardiya olarak kabul edilir.
function shiftAbsoluteRange(template) {
  const dayStart = template.day * MINUTES_IN_DAY;
  const start = dayStart + toMinutes(template.start);
  let end = dayStart + toMinutes(template.end);
  if (end <= start) end += MINUTES_IN_DAY;
  return { start, end };
}

function shiftHours(template) {
  const { start, end } = shiftAbsoluteRange(template);
  return (end - start) / 60;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function isEmployeeUnavailable(employee, template) {
  if (employee.daysOff && employee.daysOff.includes(template.day)) return true;
  const shiftRange = shiftAbsoluteRange(template);
  for (const block of employee.unavailability || []) {
    const blockTemplate = { day: block.day, start: block.start, end: block.end };
    const blockRange = shiftAbsoluteRange(blockTemplate);
    if (rangesOverlap(shiftRange, blockRange)) return true;
  }
  return false;
}

function restGapHours(prevTemplate, nextTemplate) {
  const prev = shiftAbsoluteRange(prevTemplate);
  const next = shiftAbsoluteRange(nextTemplate);
  return (next.start - prev.start >= 0 ? next.start - prev.end : Infinity) / 60;
}

function assignedTemplatesFor(state, employeeId) {
  return state.assignmentsByEmployee.get(employeeId) || [];
}

// İki vardiyanın aynı anda çakışması (aynı slota iki kez atanmak dahil)
// hiçbir esneklik seviyesinde göz ardı edilemeyecek sert bir kısıttır.
function violatesOverlap(state, employee, template) {
  const newRange = shiftAbsoluteRange(template);
  for (const other of assignedTemplatesFor(state, employee.id)) {
    if (rangesOverlap(shiftAbsoluteRange(other), newRange)) return true;
  }
  return false;
}

// Çakışmayan ama aralarında yeterli dinlenme süresi olmayan vardiyaları
// tespit eder. Bu, yüksek esneklik seviyesinde göz ardı edilebilir.
function violatesRest(state, employee, template) {
  const minRest = employee.minRestHours != null ? employee.minRestHours : 11;
  const newRange = shiftAbsoluteRange(template);
  for (const other of assignedTemplatesFor(state, employee.id)) {
    const otherRange = shiftAbsoluteRange(other);
    if (rangesOverlap(otherRange, newRange)) continue; // ayrı kural olarak ele alınıyor
    const gap = otherRange.start <= newRange.start
      ? restGapHours(other, template)
      : restGapHours(template, other);
    if (gap < minRest) return true;
  }
  return false;
}

function violatesConsecutiveDays(state, employee, template) {
  const maxConsecutive = employee.maxConsecutiveDays || 6;
  const workedDays = new Set(assignedTemplatesFor(state, employee.id).map((t) => t.day));
  workedDays.add(template.day);
  const days = [...workedDays].sort((a, b) => a - b);
  let longest = 1;
  let current = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest > maxConsecutive;
}

function currentHours(state, employeeId) {
  return state.hoursByEmployee.get(employeeId) || 0;
}

// Bir çalışanın bir slota atanabilirliğini kontrol eder.
// relax seviyeleri: 0 = tüm kısıtlar sert, 1 = maksimum haftalık saat aşımına
// izin ver (uyarıyla), 2 = dinlenme süresine de esneklik tanı (uyarıyla).
function candidateViolations(state, employee, template, relaxLevel) {
  const violations = [];
  if (template.requiredRole && employee.role !== template.requiredRole) {
    violations.push('role');
    return violations; // rol uyuşmazlığı hiçbir zaman esnetilmez
  }
  if (isEmployeeUnavailable(employee, template)) {
    violations.push('unavailable');
    return violations; // müsaitlik/izin günü hiçbir zaman esnetilmez
  }
  if (violatesOverlap(state, employee, template)) {
    violations.push('overlap');
    return violations; // aynı çalışan iki çakışan vardiyaya asla atanamaz
  }
  const hours = shiftHours(template);
  const maxHours = employee.maxWeeklyHours;
  if (maxHours != null && currentHours(state, employee.id) + hours > maxHours) {
    if (relaxLevel < 1) violations.push('maxHours');
  }
  if (violatesRest(state, employee, template)) {
    if (relaxLevel < 2) violations.push('rest');
  }
  if (violatesConsecutiveDays(state, employee, template)) {
    if (relaxLevel < 2) violations.push('consecutiveDays');
  }
  return violations;
}

function pickBestCandidate(state, employees, template, relaxLevel) {
  let best = null;
  let bestScore = null;
  for (const employee of employees) {
    const violations = candidateViolations(state, employee, template, relaxLevel);
    if (violations.length > 0) continue;
    const hours = currentHours(state, employee.id);
    const shiftCount = assignedTemplatesFor(state, employee.id).length;
    // Adalet için: en az saat çalışana öncelik, eşitlikte en az vardiya
    // sayısına sahip olana öncelik ver.
    const score = hours * 1000 + shiftCount;
    if (bestScore === null || score < bestScore) {
      bestScore = score;
      best = employee;
    }
  }
  return best;
}

function assignEmployee(state, employee, template, slot) {
  slot.assigned.push(employee.id);
  const hours = shiftHours(template);
  state.hoursByEmployee.set(employee.id, currentHours(state, employee.id) + hours);
  const list = assignedTemplatesFor(state, employee.id);
  list.push(template);
  state.assignmentsByEmployee.set(employee.id, list);
}

// Kıtlık puanı: bir slotun doldurulması ne kadar zor olabilir? Önce bu
// slotları doldurmaya çalışmak, kolay slotları en sona bırakarak daha iyi
// genel doluluk sağlar.
function scarcityScore(employees, template) {
  let eligibleCount = 0;
  for (const employee of employees) {
    if (template.requiredRole && employee.role !== template.requiredRole) continue;
    if (isEmployeeUnavailable(employee, template)) continue;
    eligibleCount += 1;
  }
  return eligibleCount;
}

function generateSchedule(employees, shiftTemplates, options = {}) {
  const state = {
    hoursByEmployee: new Map(),
    assignmentsByEmployee: new Map(),
  };
  for (const e of employees) state.hoursByEmployee.set(e.id, 0);

  const slots = shiftTemplates
    .slice()
    .sort((a, b) => scarcityScore(employees, a) - scarcityScore(employees, b))
    .map((template) => ({
      template,
      capacity: template.requiredCount || 1,
      assigned: [],
    }));

  const warnings = [];

  for (const slot of slots) {
    while (slot.assigned.length < slot.capacity) {
      let chosen = null;
      for (let relaxLevel = 0; relaxLevel <= 2 && !chosen; relaxLevel++) {
        chosen = pickBestCandidate(state, employees, slot.template, relaxLevel);
        if (chosen && relaxLevel > 0) {
          warnings.push(
            `${chosen.name}, ${dayName(slot.template.day)} "${slot.template.name}" vardiyasında ` +
              (relaxLevel === 1 ? 'haftalık maksimum saatini aşıyor.' : 'dinlenme/ardışık gün kısıtını esnetiyor.')
          );
        }
      }
      if (!chosen) {
        warnings.push(
          `${dayName(slot.template.day)} "${slot.template.name}" vardiyası için yeterli uygun personel bulunamadı ` +
            `(${slot.assigned.length}/${slot.capacity} dolduruldu).`
        );
        break;
      }
      assignEmployee(state, chosen, slot.template, slot);
    }
  }

  // Yerel iyileştirme: adaleti artırmak için aynı role sahip iki atamayı
  // takas ederek saat varyansını azaltmayı dener. Sert kısıtları ihlal eden
  // takaslar kabul edilmez.
  improveFairness(state, employees, slots, options.improvementIterations || 200);

  for (const employee of employees) {
    const hours = currentHours(state, employee.id);
    if (employee.minWeeklyHours != null && hours < employee.minWeeklyHours) {
      warnings.push(
        `${employee.name}, minimum haftalık saatinin altında planlandı (${hours}/${employee.minWeeklyHours} saat).`
      );
    }
  }

  const assignments = {};
  slots.forEach((slot, index) => {
    assignments[slot.template.id != null ? slot.template.id : index] = slot.assigned.slice();
  });

  const hoursByEmployee = {};
  for (const [id, hours] of state.hoursByEmployee.entries()) hoursByEmployee[id] = hours;

  return { assignments, hoursByEmployee, warnings, slots };
}

function improveFairness(state, employees, slots, iterations) {
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  function hoursVariance() {
    const values = [...state.hoursByEmployee.values()];
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    return values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length || 1);
  }

  for (let iter = 0; iter < iterations; iter++) {
    let improved = false;
    for (const slot of slots) {
      for (let i = 0; i < slot.assigned.length; i++) {
        const employeeAId = slot.assigned[i];
        const employeeA = employeeById.get(employeeAId);
        for (const employeeB of employees) {
          if (employeeB.id === employeeAId) continue;
          if (slot.assigned.includes(employeeB.id)) continue;
          const before = hoursVariance();

          // Geçici olarak A'yı kaldırıp B'yi ekleyerek dene.
          const hours = shiftHours(slot.template);
          const aHours = currentHours(state, employeeAId) - hours;
          const bHours = currentHours(state, employeeB.id) + hours;

          const aList = assignedTemplatesFor(state, employeeAId).filter((t) => t !== slot.template);
          state.assignmentsByEmployee.set(employeeAId, aList);
          const bList = assignedTemplatesFor(state, employeeB.id);
          const wouldViolate =
            (employeeB.maxWeeklyHours != null && bHours > employeeB.maxWeeklyHours) ||
            candidateViolations(state, employeeB, slot.template, 0).length > 0;

          if (wouldViolate) {
            state.assignmentsByEmployee.set(employeeAId, [...aList, slot.template]);
            continue;
          }

          state.hoursByEmployee.set(employeeAId, aHours);
          state.hoursByEmployee.set(employeeB.id, bHours);
          state.assignmentsByEmployee.set(employeeB.id, [...bList, slot.template]);

          const after = hoursVariance();
          if (after < before - 1e-9) {
            slot.assigned[i] = employeeB.id;
            improved = true;
          } else {
            // Geri al.
            state.hoursByEmployee.set(employeeAId, aHours + hours);
            state.hoursByEmployee.set(employeeB.id, bHours - hours);
            state.assignmentsByEmployee.set(employeeAId, [...aList, slot.template]);
            state.assignmentsByEmployee.set(
              employeeB.id,
              bList.filter((t) => t !== slot.template)
            );
          }
        }
      }
    }
    if (!improved) break;
  }
}

const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
function dayName(dayIndex) {
  return DAY_NAMES[dayIndex] || `Gün ${dayIndex}`;
}

module.exports = {
  generateSchedule,
  shiftHours,
  dayName,
  DAY_NAMES,
};

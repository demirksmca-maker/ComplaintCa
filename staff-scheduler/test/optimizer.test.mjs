import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateSchedule, shiftHours, dayName } from '../src/optimizer.js';

describe('shiftHours', () => {
  test('computes same-day duration', () => {
    const template = { day: 0, start: '09:00', end: '17:00' };
    assert.equal(shiftHours(template), 8);
  });

  test('computes overnight duration', () => {
    const template = { day: 0, start: '22:00', end: '06:00' };
    assert.equal(shiftHours(template), 8);
  });
});

describe('dayName', () => {
  test('maps index to Turkish day name', () => {
    assert.equal(dayName(0), 'Pazartesi');
    assert.equal(dayName(6), 'Pazar');
  });
});

describe('generateSchedule', () => {
  test('fills a simple week without conflicts and respects days off', () => {
    const employees = [
      { id: 'a', name: 'Ayşe', role: 'Kasiyer', maxWeeklyHours: 40, minWeeklyHours: 20, daysOff: [6] },
      { id: 'b', name: 'Burak', role: 'Kasiyer', maxWeeklyHours: 40, minWeeklyHours: 20, daysOff: [] },
      { id: 'c', name: 'Cem', role: 'Kasiyer', maxWeeklyHours: 40, minWeeklyHours: 20, daysOff: [] },
    ];
    const shiftTemplates = [];
    for (let day = 0; day < 7; day++) {
      shiftTemplates.push({ id: `d${day}-morning`, day, name: 'Sabah', start: '08:00', end: '16:00', requiredCount: 1 });
    }

    const result = generateSchedule(employees, shiftTemplates);

    // Pazar (day 6) için Ayşe atanmamalı çünkü izinli.
    const sundaySlotId = 'd6-morning';
    assert.ok(!result.assignments[sundaySlotId].includes('a'));

    // Her slotun dolu olduğunu doğrula (yeterli personel var).
    for (const slotId of Object.keys(result.assignments)) {
      assert.equal(result.assignments[slotId].length, 1, `slot ${slotId} should be filled`);
    }

    // Kimse haftalık max saatini aşmamalı.
    for (const hours of Object.values(result.hoursByEmployee)) {
      assert.ok(hours <= 40);
    }
  });

  test('reports a warning when demand exceeds supply', () => {
    const employees = [{ id: 'a', name: 'Ayşe', role: 'Kasiyer', maxWeeklyHours: 40 }];
    const shiftTemplates = [
      { id: 's1', day: 0, name: 'Sabah', start: '08:00', end: '16:00', requiredCount: 2 },
    ];
    const result = generateSchedule(employees, shiftTemplates);
    assert.equal(result.assignments['s1'].length, 1);
    assert.ok(result.warnings.some((w) => w.includes('yeterli uygun personel bulunamadı')));
  });

  test('respects required role matching', () => {
    const employees = [
      { id: 'a', name: 'Ayşe', role: 'Aşçı', maxWeeklyHours: 40 },
      { id: 'b', name: 'Burak', role: 'Garson', maxWeeklyHours: 40 },
    ];
    const shiftTemplates = [
      { id: 's1', day: 0, name: 'Mutfak', start: '08:00', end: '16:00', requiredCount: 1, requiredRole: 'Aşçı' },
    ];
    const result = generateSchedule(employees, shiftTemplates);
    assert.deepEqual(result.assignments['s1'], ['a']);
  });

  test('does not double-book overlapping shifts for the same employee', () => {
    const employees = [{ id: 'a', name: 'Ayşe', role: 'Kasiyer', maxWeeklyHours: 60, minRestHours: 0 }];
    const shiftTemplates = [
      { id: 's1', day: 0, name: 'Sabah', start: '08:00', end: '16:00', requiredCount: 1 },
      { id: 's2', day: 0, name: 'Çakışan', start: '12:00', end: '20:00', requiredCount: 1 },
    ];
    const result = generateSchedule(employees, shiftTemplates);
    const totalAssigned = result.assignments['s1'].length + result.assignments['s2'].length;
    assert.ok(totalAssigned <= 1, 'employee should not be double-booked into overlapping shifts');
  });
});

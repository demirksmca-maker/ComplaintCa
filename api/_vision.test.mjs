import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseImages, parseVision, visionPrompt, MAX_IMAGES } from './_vision.js';

const img = 'data:image/jpeg;base64,' + 'A'.repeat(100);

describe('parseImages', () => {
  test('accepts 1–3 jpeg/png/webp data URLs', () => {
    assert.equal(parseImages([img]).length, 1);
    assert.deepEqual(parseImages([img])[0].type, 'image/jpeg');
    assert.equal(parseImages(Array(MAX_IMAGES).fill(img)).length, MAX_IMAGES);
  });
  test('rejects empty, too many, wrong type, oversize or scripted input', () => {
    assert.equal(parseImages([]), null);
    assert.equal(parseImages(Array(MAX_IMAGES + 1).fill(img)), null);
    assert.equal(parseImages(['data:image/svg+xml;base64,AAAA']), null);
    assert.equal(parseImages(['data:image/jpeg;base64,' + 'A'.repeat(1_500_000)]), null);
    assert.equal(parseImages(['data:image/jpeg;base64,AA"><script>']), null);
    assert.equal(parseImages('nope'), null);
  });
});

describe('parseVision', () => {
  test('keeps visible facts and masks full card numbers', () => {
    const v = parseVision('Here: {"kind":"receipt","place":"Tim Hortons","address":"123 Queen St W, Toronto, ON","date":"2026-10-08","time":"08:42","amount":"$14.20","cardLast4":"4821","reference":"Card 4111 1111 1111 4821","summary":"A receipt.","threat":false,"threatQuote":"x"}');
    assert.equal(v.kind, 'receipt'); assert.equal(v.place, 'Tim Hortons'); assert.equal(v.date, '2026-10-08');
    assert.equal(v.cardLast4, '4821'); assert.ok(!/4111/.test(v.reference)); assert.match(v.reference, /•••• 4821/);
    assert.equal(v.threatQuote, '', 'no quote without a threat');
  });
  test('flags a threat with its quote; unknown kind and bad dates fall back', () => {
    const v = parseVision('{"kind":"weird","date":"8 Oct","threat":true,"threatQuote":"I will hurt you <b>"}');
    assert.equal(v.kind, 'other'); assert.equal(v.date, ''); assert.equal(v.threat, true); assert.equal(v.threatQuote, 'I will hurt you b');
  });
  test('returns null for no JSON', () => { assert.equal(parseVision('sorry'), null); });
  test('keeps the drafted story, masked and trimmed', () => {
    const v = parseVision('{"kind":"receipt","story":"I paid with card 4111 1111 1111 4821 and was charged twice."}');
    assert.match(v.story, /charged twice/); assert.ok(!/4111/.test(v.story));
  });
  test('asks for the story in the panel language', () => {
    assert.match(visionPrompt('tr'), /in Turkish/); assert.match(visionPrompt('xx'), /in English/);
  });
});

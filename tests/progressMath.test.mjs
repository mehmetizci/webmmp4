import test from 'node:test'; import assert from 'node:assert/strict';
function speed(processed, elapsed){return processed>0&&elapsed>0?processed/elapsed:null}
test('speed hesaplar',()=>assert.equal(speed(30,15),2));
test('sıfır elapsed null döner',()=>assert.equal(speed(30,0),null));

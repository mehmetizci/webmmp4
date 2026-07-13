import test from 'node:test'; import assert from 'node:assert/strict';
function valid(name,type,size){if(!name.toLowerCase().endsWith('.webm')&&type!=='video/webm')return false;return size>0}
test('webm kabul edilir',()=>assert.equal(valid('a.webm','video/webm',10),true));
test('mp4 reddedilir',()=>assert.equal(valid('a.mp4','video/mp4',10),false));

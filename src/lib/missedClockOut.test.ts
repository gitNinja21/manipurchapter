import test from "node:test";
import assert from "node:assert/strict";
import {missedClockOutEntries} from "./missedClockOut";
test("missed clock-out points are once per employee/date with traceable history",()=>{
  const a={recordId:"a",userId:"one",workDate:"2026-09-27"};
  const entries=missedClockOutEntries([a,a,{...a,recordId:"recreated"},{...a,userId:"two"},{...a,workDate:"2026-09-28"}]);
  assert.equal(entries.length,3);assert.equal(entries.reduce((sum,e)=>sum+e.points,0),-1.5);
  assert.equal(entries.filter(e=>e.userId==="one").length,2);
  assert.deepEqual(missedClockOutEntries([]),[]);
});

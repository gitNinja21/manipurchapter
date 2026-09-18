import assert from "node:assert/strict";
import { test } from "node:test";
import { nextBirthday, validBirthday } from "./teamValidation";
test("birthday validation accepts Feb 29 without retaining age and rejects invalid input",()=>{
 assert.equal(validBirthday(2,29),true);assert.equal(validBirthday(2,30),false);assert.equal(validBirthday(4,31),false);assert.equal(validBirthday(13,1),false);assert.equal(validBirthday("2",3),false);assert.equal(validBirthday(1,0),false);
});
test("birthday ordering rolls years and celebrates leap birthdays on February 28",()=>{
 assert.equal(nextBirthday(1,2,"2026-12-31"),"2027-01-02");assert.equal(nextBirthday(9,18,"2026-09-18"),"2026-09-18");assert.equal(nextBirthday(2,29,"2027-01-01"),"2027-02-28");assert.equal(nextBirthday(2,29,"2028-01-01"),"2028-02-29");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewScore, REVIEW_QUESTIONS } from "./customerReviews";
const ratings = Object.fromEntries(REVIEW_QUESTIONS.map(q=>[q.key,5]));
test("five ratings determine points; customer-supplied points are ignored",()=>{
  assert.equal(reviewScore({...ratings,points:1000,userId:"someone-else"})?.points,1);
  assert.equal(reviewScore({...ratings,overall:1})?.points,.84);
  assert.equal(reviewScore(Object.fromEntries(REVIEW_QUESTIONS.map(q=>[q.key,1])))?.points,.2);
});
test("missing, fractional, out-of-range and non-numeric ratings are rejected",()=>{
  for(const bad of [undefined,null,"5",0,6,1.5,NaN,Infinity]) assert.equal(reviewScore({...ratings,overall:bad}),null);
  assert.equal(reviewScore(null),null); assert.equal(reviewScore([]),null);
});

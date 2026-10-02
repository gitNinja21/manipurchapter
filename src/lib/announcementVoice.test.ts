import test from "node:test";
import assert from "node:assert/strict";
import {voicePhone,voiceXml,callOutcome,voiceConfig} from "./announcementVoice";
test("voice phone normalization never guesses an international country",()=>{
  assert.equal(voicePhone("98765 43210"),"+919876543210");
  assert.equal(voicePhone("919876543210"),"+919876543210");
  assert.equal(voicePhone("+1 (415) 555-1234"),"+14155551234");
  for(const v of [null,"","abc9876543210","123","9876543210 ext 4"]) assert.equal(voicePhone(v),null);
});
test("English voice XML escapes announcements and requires a keypad acknowledgement",()=>{
  const xml=voiceXml('Hello <Hangup/> & team','https://example.test/ack?a=1&b=2');
  assert.ok(xml.includes('language="en-IN"'));assert.ok(xml.includes('&lt;Hangup/&gt; &amp; team'));
  assert.ok(xml.includes('numDigits="1"'));assert.ok(xml.includes('input="dtmf"'));
  assert.equal((voiceXml('a'.repeat(10000),'https://example.test/ack').match(/<Say/g)||[]).length,5);
});
test("unanswered calls get exactly one retry, answered is not acknowledged",()=>{
  const now=new Date("2026-09-27T10:00:00Z");
  assert.deepEqual(callOutcome("no-answer",1,now),{status:"RETRY_WAIT",nextAttemptAt:new Date(+now+300000)});
  assert.equal(callOutcome("busy",2,now)?.status,"UNANSWERED");
  assert.equal(callOutcome("failed",2,now)?.status,"FAILED");
  assert.equal(callOutcome("completed",1,now)?.status,"NO_ACK");
  assert.equal(callOutcome("ringing",1,now),null);
  assert.equal(voiceConfig(),null);
});

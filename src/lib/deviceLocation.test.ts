import test from "node:test";
import assert from "node:assert/strict";
import { locateDevice } from "./deviceLocation";
const position = {coords: {latitude: 24.8, longitude: 93.9}} as GeolocationPosition;
const failure = (code: number) => ({code}) as GeolocationPositionError;

test("GPS success needs only one fresh location request", async () => {
  const options: PositionOptions[] = [];
  const result = await locateDevice({getCurrentPosition(success, _error, option) {
    options.push(option!); success(position);
  }});
  assert.equal(result, position);
  assert.deepEqual(options, [{enableHighAccuracy:true,timeout:12000,maximumAge:0}]);
});
for (const code of [2, 3]) {
  test(`GPS error ${code} retries a fresh standard-provider location`, async () => {
    const options: PositionOptions[] = [];
    const result = await locateDevice({getCurrentPosition(success, error, option) {
      options.push(option!);
      if (options.length === 1) error!(failure(code)); else success(position);
    }});
    assert.equal(result, position);
    assert.deepEqual(options.map(o => [o.enableHighAccuracy,o.maximumAge]), [[true,0],[false,0]]);
  });
}
test("permission denial does not retry", async () => {
  let calls = 0;
  await assert.rejects(locateDevice({getCurrentPosition(_success,error) {
    calls++; error!(failure(1));
  }}), e => (e as GeolocationPositionError).code === 1);
  assert.equal(calls,1);
});
test("two failed attempts return an error rather than bypass location", async () => {
  let calls = 0;
  await assert.rejects(locateDevice({getCurrentPosition(_success,error) {
    calls++; error!(failure(3));
  }}), e => (e as GeolocationPositionError).code === 3);
  assert.equal(calls,2);
});

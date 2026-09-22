<?php
header('Content-Type: text/html');
{
  $ok_status = $_POST['Status'];
  $lat = $_POST['Lat'];
  $lon = $_POST['Lon'];
  $acc = $_POST['Acc'];
  $alt = $_POST['Alt'];
  $dir = $_POST['Dir'];
  $spd = $_POST['Spd'];
  $acc_alt = $_POST['AccAlt'] ?? 'Not Available';
  $ts = $_POST['Ts'] ?? '';
  $samples = $_POST['Samples'] ?? '';
  $acc_best = $_POST['AccBest'] ?? '';
  $acc_worst = $_POST['AccWorst'] ?? '';
  $time_to_best = $_POST['TimeToBest'] ?? '';

  $data = array(
    'status' => $ok_status,
    'lat' => $lat,
    'lon' => $lon,
    'acc' => $acc,
    'alt' => $alt,
    'dir' => $dir,
    'spd' => $spd,
    'acc_alt' => $acc_alt,
    'ts' => $ts,
    'samples' => $samples,
    'acc_best' => $acc_best,
    'acc_worst' => $acc_worst,
    'time_to_best' => $time_to_best);

  $json_data = json_encode($data);

  $f = fopen('../../logs/result.txt', 'w+');
  fwrite($f, $json_data);
  fclose($f);
}
?>

<?php
declare(strict_types=1);

// 使用記録の登録(POST /app/lucid-dream/api/session.php)
// 「誘導を開始する」を押したときに、その晩の設定と対象の朝を記録する。

require_once __DIR__ . '/_survey.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  json_out(['error' => 'POSTで呼び出してください'], 405);
}

require_app(SURVEY_APP);

$body = survey_body();
$deviceId = survey_device_id($body['deviceId'] ?? null);
$morning = survey_target_morning($body['targetMorning'] ?? null);

$delay = (int) ($body['delayMins'] ?? -1);
$duration = (int) ($body['playDurationMins'] ?? -1);
$audioId = is_string($body['audioId'] ?? null) ? substr($body['audioId'], 0, 40) : '';

// 端末側のキュー再送で重複しうるため、同じ端末・同じ朝・同じ設定の記録は1件にまとめる
foreach (survey_read('sessions') as $s) {
  if (($s['device_id'] ?? '') === $deviceId
    && ($s['target_morning'] ?? '') === $morning
    && (int) ($s['delay_mins'] ?? -1) === $delay
    && (int) ($s['play_duration_mins'] ?? -1) === $duration
    && ($s['audio_id'] ?? '') === $audioId) {
    json_out(['ok' => true, 'duplicate' => true]);
  }
}

$ok = survey_append('sessions', [
  'device_id' => $deviceId,
  'target_morning' => $morning,
  'started_at' => date('c'),
  'delay_mins' => $delay,
  'play_duration_mins' => $duration,
  'audio_id' => $audioId,
]);

if (!$ok) json_out(['error' => '記録に失敗しました'], 500);

json_out(['ok' => true]);

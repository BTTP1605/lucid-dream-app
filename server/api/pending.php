<?php
declare(strict_types=1);

// 未回答の質問があるか問い合わせる(GET /app/lucid-dream/api/pending.php?deviceId=...)
// 同じ晩に複数回使っていても、質問は「対象の朝」ごとに1回だけ出す。

require_once __DIR__ . '/_survey.php';

require_app(SURVEY_APP);

$deviceId = survey_device_id($_GET['deviceId'] ?? null);

$today = date('Y-m-d');
$oldest = date('Y-m-d', strtotime('-' . SURVEY_PENDING_DAYS . ' days'));
$answered = survey_answered_mornings($deviceId);

// 対象の朝ごとに、その晩の最後の設定を残す
$byMorning = [];
foreach (survey_read('sessions') as $s) {
  if (($s['device_id'] ?? '') !== $deviceId) continue;
  $morning = (string) ($s['target_morning'] ?? '');
  if ($morning === '' || $morning > $today || $morning < $oldest) continue;
  if (isset($answered[$morning])) continue;
  $prev = $byMorning[$morning] ?? null;
  if ($prev === null || (string) ($s['started_at'] ?? '') >= (string) ($prev['started_at'] ?? '')) {
    $byMorning[$morning] = $s;
  }
}

if (!$byMorning) json_out(['ok' => true, 'pending' => null]);

// 未回答が複数あれば、いちばん新しい朝から順に聞く
krsort($byMorning);
$target = reset($byMorning);

json_out([
  'ok' => true,
  'pending' => [
    'targetMorning' => $target['target_morning'],
    'delayMins' => (int) ($target['delay_mins'] ?? -1),
    'playDurationMins' => (int) ($target['play_duration_mins'] ?? -1),
    'audioId' => (string) ($target['audio_id'] ?? ''),
  ],
  'remaining' => count($byMorning),
]);

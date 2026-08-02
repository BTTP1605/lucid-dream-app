<?php
declare(strict_types=1);

// 回答の保存(POST /app/lucid-dream/api/answer.php)

require_once __DIR__ . '/_survey.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  json_out(['error' => 'POSTで呼び出してください'], 405);
}

require_app(SURVEY_APP);

$body = survey_body();
$deviceId = survey_device_id($body['deviceId'] ?? null);
$morning = survey_target_morning($body['targetMorning'] ?? null);

$choice = is_string($body['choice'] ?? null) ? $body['choice'] : '';
if (!in_array($choice, SURVEY_CHOICES, true)) {
  json_out(['error' => '回答の種類が不正です'], 400);
}

$note = is_string($body['note'] ?? null) ? trim($body['note']) : '';
if (mb_strlen($note) > SURVEY_NOTE_MAX) {
  $note = mb_substr($note, 0, SURVEY_NOTE_MAX);
}
if ($choice !== 'other') $note = '';

// その晩の設定を回答にも持たせておく(集計時に結合しなくて済む)
$settings = ['delay_mins' => -1, 'play_duration_mins' => -1, 'audio_id' => ''];
foreach (survey_read('sessions') as $s) {
  if (($s['device_id'] ?? '') === $deviceId && ($s['target_morning'] ?? '') === $morning) {
    $settings = [
      'delay_mins' => (int) ($s['delay_mins'] ?? -1),
      'play_duration_mins' => (int) ($s['play_duration_mins'] ?? -1),
      'audio_id' => (string) ($s['audio_id'] ?? ''),
    ];
  }
}

$ok = survey_append('answers', [
  'device_id' => $deviceId,
  'target_morning' => $morning,
  'choice' => $choice,
  'note' => $note,
  'answered_at' => date('c'),
  'delay_mins' => $settings['delay_mins'],
  'play_duration_mins' => $settings['play_duration_mins'],
  'audio_id' => $settings['audio_id'],
]);

if (!$ok) json_out(['error' => '保存に失敗しました'], 500);

json_out(['ok' => true]);

<?php
declare(strict_types=1);

// 明晰夢アンケート 共通処理(配置: /app/lucid-dream/api/_survey.php)
//
// 認証・設定は夢日記の共通ライブラリを流用する(会員Cookie unlock_app_lucid-dream)。
// 保存は _private/lucid-dream/ 配下のJSONL(追記のみ)。
// 追記のみにすることで、同時アクセスでも既存行が壊れない。

require_once __DIR__ . '/../../dream-diary/api/_lib.php';

date_default_timezone_set('Asia/Tokyo');

const SURVEY_APP = 'lucid-dream';
const SURVEY_CHOICES = ['lucid', 'normal', 'none', 'other'];
const SURVEY_NOTE_MAX = 200;
const SURVEY_PENDING_DAYS = 7;   // 何日前の分まで質問するか
const SURVEY_MAX_BODY = 8000;

function survey_dir(): string {
  $dir = __DIR__ . '/../../_private/lucid-dream';
  if (!is_dir($dir)) @mkdir($dir, 0700, true);
  return $dir;
}

function survey_file(string $kind, string $month): string {
  return survey_dir() . '/' . $kind . '-' . $month . '.jsonl';
}

// 直近nか月分の年月(古い順)。月末日の繰り上がりを避けるため1日を基準に計算する
function survey_months(int $n): array {
  $months = [];
  $base = strtotime(date('Y-m-01'));
  for ($i = $n - 1; $i >= 0; $i--) {
    $months[] = date('Y-m', strtotime('-' . $i . ' month', $base));
  }
  return $months;
}

function survey_append(string $kind, array $row): bool {
  $fp = @fopen(survey_file($kind, date('Y-m')), 'a');
  if (!$fp) return false;
  flock($fp, LOCK_EX);
  fwrite($fp, json_encode($row, JSON_UNESCAPED_UNICODE) . "\n");
  flock($fp, LOCK_UN);
  fclose($fp);
  return true;
}

function survey_read(string $kind, int $months = 2): array {
  $rows = [];
  foreach (survey_months($months) as $m) {
    $f = survey_file($kind, $m);
    if (!is_file($f)) continue;
    $lines = @file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) continue;
    foreach ($lines as $line) {
      $row = json_decode($line, true);
      if (is_array($row)) $rows[] = $row;
    }
  }
  return $rows;
}

function survey_body(): array {
  $raw = file_get_contents('php://input');
  if ($raw === false || strlen($raw) > SURVEY_MAX_BODY) {
    json_out(['error' => 'リクエストが不正です'], 400);
  }
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function survey_device_id($value): string {
  $id = is_string($value) ? $value : '';
  if (!preg_match('/\A[A-Za-z0-9_-]{8,64}\z/', $id)) {
    json_out(['error' => '端末IDが不正です'], 400);
  }
  return $id;
}

// 対象の朝。今日を挟んで前後1日まで許容する(端末の時計ずれの吸収)
function survey_target_morning($value): string {
  $s = is_string($value) ? $value : '';
  if (!preg_match('/\A\d{4}-\d{2}-\d{2}\z/', $s)) {
    json_out(['error' => '日付が不正です'], 400);
  }
  $ts = strtotime($s);
  if ($ts === false) json_out(['error' => '日付が不正です'], 400);
  $min = strtotime('-' . SURVEY_PENDING_DAYS . ' days', strtotime(date('Y-m-d')));
  $max = strtotime('+1 day', strtotime(date('Y-m-d')));
  if ($ts < $min || $ts > $max) json_out(['error' => '日付が範囲外です'], 400);
  return $s;
}

// その端末が回答済みの「対象の朝」の一覧
function survey_answered_mornings(string $deviceId): array {
  $done = [];
  foreach (survey_read('answers') as $a) {
    if (($a['device_id'] ?? '') === $deviceId && isset($a['target_morning'])) {
      $done[$a['target_morning']] = true;
    }
  }
  return $done;
}

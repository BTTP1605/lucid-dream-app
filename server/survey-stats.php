<?php
declare(strict_types=1);

// 明晰夢アンケート 集計ダッシュボード(デプロイ先: /app/lucid-dream/survey-stats.php)【オーナー専用】
//
// - 初回: /app/lucid-dream/survey-stats.php?k=<admin_key> → 管理者Cookie(1年)を発行
// - 2回目以降: Cookieだけで開ける(/app/stats.php と共通のCookie)
// - admin_key は /app/_private/config.php で管理

require_once __DIR__ . '/api/_survey.php';

/* ---------- 認証(オーナー専用。会員の解錠Cookieでは開けない) ---------- */
$key = (string) ($_GET['k'] ?? '');
if ($key !== '') {
  if (!attempt_rate_ok('survey_stats', 10)) {
    http_response_code(429);
    exit('試行回数が多すぎます。1分ほど待ってください。');
  }
  $adminKey = (string) (cfg()['admin_key'] ?? '');
  if ($adminKey === '' || !hash_equals($adminKey, $key)) {
    http_response_code(403);
    exit('アクセスキーが違います。');
  }
  $exp = time() + 365 * 24 * 60 * 60;
  setcookie('unlock_app_admin', make_app_cookie('admin', $exp), [
    'expires' => $exp, 'path' => '/app/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax',
  ]);
  header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'), true, 302);
  exit;
}
if (!verify_app_cookie('admin')) {
  http_response_code(403);
  header('Content-Type: text/html; charset=utf-8');
  exit('<!DOCTYPE html><html lang="ja"><body style="font-family:sans-serif;max-width:480px;margin:3em auto;">'
     . '<h2>オーナー専用ページです</h2><p>?k=アクセスキー を付けて開いてください。</p></body></html>');
}

/* ---------- 読み込み(保存されている全期間) ---------- */
function survey_read_all(string $kind): array {
  $rows = [];
  foreach (glob(survey_dir() . '/' . $kind . '-*.jsonl') ?: [] as $f) {
    $lines = @file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) continue;
    foreach ($lines as $line) {
      $row = json_decode($line, true);
      if (is_array($row)) $rows[] = $row;
    }
  }
  return $rows;
}

$sessions = survey_read_all('sessions');
$answersRaw = survey_read_all('answers');

// 同じ朝に answers が複数あれば最後の回答を採用する
$answers = [];
foreach ($answersRaw as $a) {
  $k = ($a['device_id'] ?? '') . '|' . ($a['target_morning'] ?? '');
  if (!isset($answers[$k]) || (string) ($a['answered_at'] ?? '') >= (string) ($answers[$k]['answered_at'] ?? '')) {
    $answers[$k] = $a;
  }
}
$answers = array_values($answers);

/* ---------- 集計 ---------- */
const CHOICE_LABELS = [
  'lucid' => '明晰夢を見た',
  'normal' => '普通の夢',
  'none' => '夢を見なかった',
  'other' => 'その他',
];
const AUDIO_LABELS = [
  'affirmation-female' => 'アファメーション(女性)',
  'affirmation-male' => 'アファメーション(男性)',
  'binaural-beats' => 'バイノーラルビート',
  'my-recording' => '自分の録音',
];

function delay_label(int $m): string {
  if ($m < 0) return '不明';
  if ($m === 0) return '即時';
  if ($m < 60) return $m . '分';
  // アプリ側の表示に合わせる(1時間 / 4.5時間 のように、割り切れれば整数)
  return ($m % 60 === 0 ? (string) intdiv($m, 60) : number_format($m / 60, 1)) . '時間';
}

function pct(int $n, int $total): float {
  return $total > 0 ? round($n * 100 / $total, 1) : 0.0;
}

// 使用した「晩」の数(端末×対象の朝)。今日より後の朝はまだ質問対象外なので除く
$today = date('Y-m-d');
$nights = [];
foreach ($sessions as $s) {
  $morning = (string) ($s['target_morning'] ?? '');
  if ($morning === '' || $morning > $today) continue;
  $nights[($s['device_id'] ?? '') . '|' . $morning] = true;
}

$devices = [];
foreach ($answers as $a) $devices[$a['device_id'] ?? ''] = true;

$totalAnswers = count($answers);
$totalNights = count($nights);

// 選択肢ごと
$byChoice = ['lucid' => 0, 'normal' => 0, 'none' => 0, 'other' => 0];
foreach ($answers as $a) {
  $c = (string) ($a['choice'] ?? '');
  if (isset($byChoice[$c])) $byChoice[$c]++;
}

// 条件ごとの成功率を出す(件数と明晰夢の数)
function group_by(array $answers, callable $keyOf): array {
  $g = [];
  foreach ($answers as $a) {
    $k = $keyOf($a);
    if ($k === null) continue;
    if (!isset($g[$k])) $g[$k] = ['n' => 0, 'lucid' => 0];
    $g[$k]['n']++;
    if (($a['choice'] ?? '') === 'lucid') $g[$k]['lucid']++;
  }
  return $g;
}

$byDelay = group_by($answers, fn($a) => (int) ($a['delay_mins'] ?? -1));
krsort($byDelay);
$byAudio = group_by($answers, fn($a) => (string) ($a['audio_id'] ?? ''));
arsort($byAudio);
$byDuration = group_by($answers, fn($a) => (int) ($a['play_duration_mins'] ?? -1));
krsort($byDuration);

// 日別(直近14日)
$byDay = [];
for ($i = 13; $i >= 0; $i--) {
  $d = date('Y-m-d', strtotime("-{$i} days"));
  $byDay[$d] = ['lucid' => 0, 'normal' => 0, 'none' => 0, 'other' => 0, 'n' => 0];
}
foreach ($answers as $a) {
  $m = (string) ($a['target_morning'] ?? '');
  if (!isset($byDay[$m])) continue;
  $c = (string) ($a['choice'] ?? '');
  if (isset($byDay[$m][$c])) $byDay[$m][$c]++;
  $byDay[$m]['n']++;
}

// 自由回答(新しい順)
$notes = array_filter($answers, fn($a) => trim((string) ($a['note'] ?? '')) !== '');
usort($notes, fn($x, $y) => strcmp((string) ($y['answered_at'] ?? ''), (string) ($x['answered_at'] ?? '')));

$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?>
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>明晰夢アンケート 集計</title>
<style>
  :root {
    --bg: #0a0e17; --card: #151c2c; --line: #1e293b;
    --text: #ffffff; --sub: #94a3b8; --accent: #10b981; --primary: #3b82f6;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif; line-height: 1.6; padding: 20px; }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 1.3rem; margin-bottom: 4px; }
  .updated { color: var(--sub); font-size: 0.8rem; margin-bottom: 24px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 18px; }
  .card h2 { font-size: 0.95rem; color: var(--sub); font-weight: 600; margin-bottom: 14px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }
  .kpi { background: rgba(255,255,255,0.03); border-radius: 10px; padding: 12px; }
  .kpi .v { font-size: 1.6rem; font-weight: 800; }
  .kpi .l { font-size: 0.75rem; color: var(--sub); }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: middle; }
  th { color: var(--sub); font-weight: 600; font-size: 0.8rem; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .bar { background: rgba(255,255,255,0.07); border-radius: 4px; height: 10px; min-width: 60px; }
  .bar > span { display: block; height: 100%; border-radius: 4px; background: var(--primary); }
  .bar.ok > span { background: var(--accent); }
  .note { border-left: 3px solid var(--accent); padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 0 8px 8px 0; margin-bottom: 10px; }
  .note .meta { font-size: 0.75rem; color: var(--sub); margin-bottom: 4px; }
  .empty { color: var(--sub); text-align: center; padding: 24px 0; }
  .caption { color: var(--sub); font-size: 0.75rem; margin-top: 10px; }
  .scroll { overflow-x: auto; }
</style>
</head>
<body>
<div class="wrap">
  <h1>🌙 明晰夢アンケート 集計</h1>
  <p class="updated"><?= $h(date('Y-m-d H:i')) ?> 時点</p>

<?php if ($totalAnswers === 0 && $totalNights === 0): ?>
  <div class="card"><div class="empty">まだデータがありません。<br>会員が「協力する」を選んでアプリを使うと、翌朝から回答が集まります。</div></div>
<?php else: ?>

  <div class="card">
    <h2>全体</h2>
    <div class="kpis">
      <div class="kpi"><div class="v"><?= $totalAnswers ?></div><div class="l">回答数</div></div>
      <div class="kpi"><div class="v"><?= count($devices) ?></div><div class="l">回答した端末</div></div>
      <div class="kpi"><div class="v"><?= $totalNights ?></div><div class="l">使用した晩</div></div>
      <div class="kpi"><div class="v"><?= pct($totalAnswers, $totalNights) ?>%</div><div class="l">回答率</div></div>
      <div class="kpi"><div class="v" style="color:var(--accent)"><?= pct($byChoice['lucid'], $totalAnswers) ?>%</div><div class="l">明晰夢の成功率</div></div>
    </div>
  </div>

  <div class="card">
    <h2>回答の内訳</h2>
    <table>
      <?php foreach (CHOICE_LABELS as $id => $label): $n = $byChoice[$id]; $p = pct($n, $totalAnswers); ?>
      <tr>
        <td style="width:9em"><?= $h($label) ?></td>
        <td><div class="bar <?= $id === 'lucid' ? 'ok' : '' ?>"><span style="width:<?= $p ?>%"></span></div></td>
        <td class="num"><?= $n ?>件 / <?= $p ?>%</td>
      </tr>
      <?php endforeach; ?>
    </table>
  </div>

  <div class="card">
    <h2>開始までの遅延ごとの成功率</h2>
    <div class="scroll">
    <table>
      <tr><th>遅延</th><th>成功率</th><th class="num">明晰夢 / 回答</th></tr>
      <?php foreach ($byDelay as $mins => $g): $p = pct($g['lucid'], $g['n']); ?>
      <tr>
        <td style="width:6em"><?= $h(delay_label((int) $mins)) ?></td>
        <td><div class="bar ok"><span style="width:<?= $p ?>%"></span></div></td>
        <td class="num"><?= $g['lucid'] ?> / <?= $g['n'] ?>件 (<?= $p ?>%)</td>
      </tr>
      <?php endforeach; ?>
    </table>
    </div>
    <p class="caption">回答が数件だけの行は割合が大きく振れます。件数を見ながら判断してください。</p>
  </div>

  <div class="card">
    <h2>音声ごとの成功率</h2>
    <table>
      <?php foreach ($byAudio as $id => $g): $p = pct($g['lucid'], $g['n']); ?>
      <tr>
        <td style="width:11em"><?= $h(AUDIO_LABELS[$id] ?? ($id === '' ? '不明' : $id)) ?></td>
        <td><div class="bar ok"><span style="width:<?= $p ?>%"></span></div></td>
        <td class="num"><?= $g['lucid'] ?> / <?= $g['n'] ?>件 (<?= $p ?>%)</td>
      </tr>
      <?php endforeach; ?>
    </table>
  </div>

  <div class="card">
    <h2>再生時間ごとの成功率</h2>
    <table>
      <?php foreach ($byDuration as $mins => $g): $p = pct($g['lucid'], $g['n']); ?>
      <tr>
        <td style="width:6em"><?= (int) $mins < 0 ? '不明' : (int) $mins . '分' ?></td>
        <td><div class="bar ok"><span style="width:<?= $p ?>%"></span></div></td>
        <td class="num"><?= $g['lucid'] ?> / <?= $g['n'] ?>件 (<?= $p ?>%)</td>
      </tr>
      <?php endforeach; ?>
    </table>
  </div>

  <div class="card">
    <h2>日別(直近14日)</h2>
    <div class="scroll">
    <table>
      <tr><th>朝</th><th class="num">明晰夢</th><th class="num">普通の夢</th><th class="num">見なかった</th><th class="num">その他</th><th class="num">計</th></tr>
      <?php foreach (array_reverse($byDay, true) as $day => $c): ?>
      <tr<?= $c['n'] === 0 ? ' style="opacity:.45"' : '' ?>>
        <td><?= $h(substr($day, 5)) ?></td>
        <td class="num" style="color:var(--accent)"><?= $c['lucid'] ?></td>
        <td class="num"><?= $c['normal'] ?></td>
        <td class="num"><?= $c['none'] ?></td>
        <td class="num"><?= $c['other'] ?></td>
        <td class="num"><?= $c['n'] ?></td>
      </tr>
      <?php endforeach; ?>
    </table>
    </div>
  </div>

  <div class="card">
    <h2>自由回答(<?= count($notes) ?>件)</h2>
    <?php if (!$notes): ?>
      <div class="empty">まだありません。</div>
    <?php else: foreach ($notes as $a): ?>
      <div class="note">
        <div class="meta">
          <?= $h((string) ($a['target_morning'] ?? '')) ?> の朝 ／
          遅延 <?= $h(delay_label((int) ($a['delay_mins'] ?? -1))) ?> ／
          <?= $h(AUDIO_LABELS[$a['audio_id'] ?? ''] ?? '不明') ?>
        </div>
        <div><?= nl2br($h((string) ($a['note'] ?? ''))) ?></div>
      </div>
    <?php endforeach; endif; ?>
  </div>

<?php endif; ?>
</div>
</body>
</html>

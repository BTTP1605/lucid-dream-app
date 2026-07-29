<?php
declare(strict_types=1);

// 明晰夢誘導アプリ 会員ゲート(デプロイ先: /app/lucid-dream/index.php)
//
// このアプリにはAPIがないため、ページ本体をゲートする:
// - ビルドされた index.html の実体は /app/_private/lucid-dream-index.html (Web非公開)
// - 会員Cookie(unlock_app_lucid-dream)を検証できた場合のみ、その中身を出力する
// - JS/CSS/音声などのアセットは公開のまま(秘密を含まず、単体では意味を持たない)
// - 解錠リンク: /app/unlock.php?a=lucid-dream&t=<専用TOKEN>
//
// 共通ライブラリは夢日記のAPIと共用(署名・設定の一元管理のため)

require __DIR__ . '/../dream-diary/api/_lib.php';

if (!verify_app_cookie('lucid-dream')) {
  http_response_code(403);
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: no-store');
  echo '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">'
     . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
     . '<title>会員専用</title></head>'
     . '<body style="font-family:sans-serif;max-width:480px;margin:3em auto;padding:0 1em;">'
     . '<h2>このアプリはコミュニティ会員専用です</h2>'
     . '<p>コミュニティ内で案内している「明晰夢アプリの解錠リンク」を一度開くと、'
     . '1年間このページを利用できるようになります。</p>'
     . '</body></html>';
  exit;
}

$file = __DIR__ . '/../_private/lucid-dream-index.html';
if (!is_file($file)) {
  http_response_code(503);
  header('Content-Type: text/plain; charset=utf-8');
  echo 'メンテナンス中です。しばらくしてからアクセスしてください。';
  exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache'); // 更新を確実に届ける(アセットはハッシュ名なので長期キャッシュ可)
readfile($file);

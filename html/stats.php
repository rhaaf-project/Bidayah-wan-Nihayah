<?php
// =====================================================================
// SECRET — server-side only, NEVER hardcode in HTML/JS.
// Ganti URL di bawah dengan stats endpoint Worker lo.
// =====================================================================
$STATS_URL = "https://bidaya-bot.fajar-mulyawan.workers.dev/stats/sVDKcPnj69_W66SBtIurAer4WbGeGVpS.json";

// Fetch JSON server-side
$ctx = stream_context_create([
    'http' => ['timeout' => 5, 'ignore_errors' => true, 'header' => "Accept: application/json\r\n"]
]);
$raw = @file_get_contents($STATS_URL, false, $ctx);

$err = null;
$d = ['unique_users' => 0, 'total_queries' => 0, 'total_starts' => 0, 'total_events' => 0,
      'breakdown' => ['start' => 0, 'tanya' => 0, 'plain' => 0, 'help' => 0]];

if ($raw === false) {
    $err = "Gagal fetch stats (network error)";
} else {
    $parsed = json_decode($raw, true);
    if (!is_array($parsed)) {
        $err = "Response bukan JSON valid";
    } else {
        $d = array_merge($d, $parsed);
        if (!isset($d['breakdown']) || !is_array($d['breakdown'])) {
            $d['breakdown'] = ['start' => 0, 'tanya' => 0, 'plain' => 0, 'help' => 0];
        }
    }
}

$now = (new DateTime('now', new DateTimeZone('Asia/Jakarta')))->format('d/m/Y H:i:s');
?><!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>BidayahWanNihayah Bot — Stats</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<style>
  body { background: #f8f9fa; }
  .stat-num { font-size: 2.75rem; font-weight: 700; line-height: 1; color: #198754; }
  .stat-label { color: #6c757d; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .updated { color: #adb5bd; font-size: 0.8rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1d21; color: #e9ecef; }
    .card { background: #25282d; border-color: #34373c; color: #e9ecef; }
    .stat-num { color: #51cf66; }
    .stat-label, .updated { color: #adb5bd; }
    .text-body-secondary { color: #adb5bd !important; }
    a { color: #51cf66; }
  }
</style>
</head>
<body>

<div class="container py-4" style="max-width:760px">

  <div class="d-flex justify-content-between align-items-end mb-4">
    <div>
      <h1 class="h4 mb-1">BidayahWanNihayah Search</h1>
      <a href="https://t.me/bidaya_nihaya_search_bot" class="text-body-secondary small text-decoration-none">@bidaya_nihaya_search_bot</a>
    </div>
    <a href="?" class="btn btn-sm btn-outline-secondary">refresh</a>
  </div>

  <?php if ($err): ?>
    <div class="alert alert-warning"><?= htmlspecialchars($err) ?></div>
  <?php endif; ?>

  <div class="row g-3 mb-3">
    <div class="col-6 col-md-3">
      <div class="card h-100">
        <div class="card-body text-center">
          <div class="stat-num"><?= (int)$d['unique_users'] ?></div>
          <div class="stat-label mt-2">Unique<br>Users</div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card h-100">
        <div class="card-body text-center">
          <div class="stat-num"><?= (int)$d['total_queries'] ?></div>
          <div class="stat-label mt-2">Total<br>Pertanyaan</div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card h-100">
        <div class="card-body text-center">
          <div class="stat-num"><?= (int)$d['total_starts'] ?></div>
          <div class="stat-label mt-2">Bot<br>Dibuka</div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card h-100">
        <div class="card-body text-center">
          <div class="stat-num"><?= (int)$d['total_events'] ?></div>
          <div class="stat-label mt-2">Total<br>Pesan</div>
        </div>
      </div>
    </div>
  </div>

  <div class="card mb-3">
    <div class="card-body">
      <h6 class="text-body-secondary mb-3" style="text-transform:uppercase;letter-spacing:0.05em;font-size:0.8rem">Breakdown per tipe</h6>
      <div class="d-flex justify-content-between py-2 border-bottom">
        <span>/start</span><strong><?= (int)$d['breakdown']['start'] ?></strong>
      </div>
      <div class="d-flex justify-content-between py-2 border-bottom">
        <span>/tanya</span><strong><?= (int)$d['breakdown']['tanya'] ?></strong>
      </div>
      <div class="d-flex justify-content-between py-2 border-bottom">
        <span>pesan langsung</span><strong><?= (int)$d['breakdown']['plain'] ?></strong>
      </div>
      <div class="d-flex justify-content-between py-2">
        <span>/help</span><strong><?= (int)$d['breakdown']['help'] ?></strong>
      </div>
    </div>
  </div>

  <div class="updated text-center mb-3">last updated <?= htmlspecialchars($now) ?> WIB · auto-refresh tiap 30 detik</div>

</div>

</body>
</html>

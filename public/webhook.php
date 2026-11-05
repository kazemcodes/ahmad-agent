<?php
require __DIR__.'/../src/Ahmad.php';
$c=require __DIR__.'/../config.php';
if (!$c['webhook_secret'] || !hash_equals($c['webhook_secret'], $_GET['secret']??'')) { http_response_code(403); exit; }
$u=json_decode(file_get_contents('php://input'),true);
if (!is_array($u)) { http_response_code(400); exit; }
try { (new Ahmad($c))->handle($u); http_response_code(200); } catch(Throwable $e) { error_log($e->getMessage()); http_response_code(500); }

<?php
require __DIR__.'/../src/ContextBudget.php';
$turns=[['role'=>'user','content'=>str_repeat('الف',150)],['role'=>'assistant','content'=>'پاسخ'],['role'=>'user','content'=>'سؤال جدید']];
$r=ContextBudget::history($turns,2,1000);
if (count($r)!==2 || $r[1]['content']!=='سؤال جدید') throw new RuntimeException('Recent turns not preserved');
if (ContextBudget::history($turns,0,100)!==[]) throw new RuntimeException('History disabled');
$r=ContextBudget::history($turns,3,110);
if (mb_strlen(implode('',array_column($r,'content')))>111) throw new RuntimeException('Context limit exceeded');
echo "Context budget checks passed.\n";

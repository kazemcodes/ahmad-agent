<?php
require __DIR__.'/../src/ClassInstructions.php';
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]); $m=new ClassInstructions($db);
if(ClassInstructions::parse('یادت باشه هر کی پرسید عکس میسازی جواب بده سهمیه‌ام تموم شده')===null) throw new RuntimeException('parse failed');
$id=$m->add(12,3,'امروز سهمیه تمام شده'); if(count($m->list(12))!==1 || count($m->list(13))!==0 || $m->delete(13,$id) || !$m->delete(12,$id)) throw new RuntimeException('scope failed');
echo "Class instruction checks passed.\n";

<?php
require __DIR__.'/../src/Memory.php';
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE TABLE messages(id INTEGER PRIMARY KEY,chat INTEGER,user_id INTEGER,at INTEGER,text TEXT,name TEXT)');
$m=new Memory($db); $m->remember(1,7,'user','میخواهم درباره منظومه شمسی یاد بگیرم');
for($i=0;$i<14;$i++) $m->remember(1,7,'user','پیام تازه شماره '.$i);
$m->remember(1,8,'user','راز منظومه شمسی');
if ($m->relevant(1,7,'درباره منظومه شمسی بگو')!==['میخواهم درباره منظومه شمسی یاد بگیرم']) throw new RuntimeException('retrieval or isolation failure');
if ($m->relevant(2,7,'منظومه شمسی')!==[]) throw new RuntimeException('cross-chat leak');
echo "Memory retrieval checks passed.\n";

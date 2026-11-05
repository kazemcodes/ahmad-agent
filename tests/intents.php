<?php
require __DIR__.'/../src/ClassroomIntent.php';
require __DIR__.'/../src/ConversationPrompt.php';
$cases=[['استاد احمد امروز کیا حاضر بودن؟',true,'/report'],['استاد احمد برنامه کلاس امروز چیه؟',true,'/today'],['امروز کیا حاضر بودن؟',false,null],['/image حضور',true,null],['استاد احمد خوبی؟',true,null]];
foreach($cases as [$text,$addressed,$expected]) if (ClassroomIntent::command($text,$addressed)!==$expected) throw new RuntimeException('Intent mismatch: '.$text);
$prompt=ConversationPrompt::build([], 'سلام', true, 'علی', false);
if (!str_contains($prompt[0]['content'],'قابلیت ساخت تصویر داری') || $prompt[count($prompt)-1]['content']!=='سلام') throw new RuntimeException('Prompt mismatch');
echo "Classroom intent checks passed.\n";

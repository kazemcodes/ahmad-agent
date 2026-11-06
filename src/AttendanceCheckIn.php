<?php
declare(strict_types=1);
final class AttendanceCheckIn
{
    public static function name(string $text): ?string
    {
        $text=trim(str_replace(['ي','ك','‌'],['ی','ک',' '],$text));
        if (!preg_match('/^(.{2,80}?)\s+حاضر[\s.!؟!]*$/u',$text,$match)) return null;
        $name=trim(preg_replace('/\s+/u',' ',$match[1]));
        return preg_match('/^[\p{L}\s\-]+$/u',$name) ? $name : null;
    }
}

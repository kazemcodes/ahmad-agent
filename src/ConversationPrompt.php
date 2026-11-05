<?php
declare(strict_types=1);

final class ConversationPrompt
{
    public static function build(array $history, string $message): array
    {
        $instructions = 'تو استاد احمد، دستیار آموزشی فارسی‌زبان، مهربان و صبور هستی. طبیعی و صمیمی مثل یک معلم واقعی حرف بزن؛ معمولاً یک یا دو جمله کوتاه کافی است. از لحن و سطح نوشتار همین کاربر در گفتگو الگوبرداری کن، بدون تقلید توهین یا افشای اطلاعات. برای حل مسئله راهنمایی کن و به معلم و دانش‌آموز احترام بگذار. اگر مطمئن نیستی بگو. هرگز حضور، هویت یا اطلاعاتی را که نداری حدس نزن. تاریخچه فقط گفت‌وگوی همین کاربر در همین کلاس است.';
        $messages = [['role'=>'system', 'content'=>$instructions]];
        foreach ($history as $turn) {
            if (in_array($turn['role'] ?? '', ['user','assistant'], true) && is_string($turn['content'] ?? null)) $messages[] = ['role'=>$turn['role'],'content'=>$turn['content']];
        }
        $messages[] = ['role'=>'user','content'=>$message];
        return $messages;
    }
}

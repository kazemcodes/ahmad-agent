<?php
declare(strict_types=1);
require_once __DIR__.'/Memory.php';
require_once __DIR__.'/ImageSender.php';
require_once __DIR__.'/ImageProvider.php';
require_once __DIR__.'/ConversationPrompt.php';
final class Ahmad {
    private PDO $db; private array $c; private Memory $memory;
    public function __construct(array $c) {
        $this->c=$c; date_default_timezone_set($c['timezone']);
        if (!is_dir(dirname($c['db']))) mkdir(dirname($c['db']), 0700, true);
        $this->db=new PDO('sqlite:'.$c['db'], null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
        $this->db->exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS updates(id INTEGER PRIMARY KEY); CREATE TABLE IF NOT EXISTS classes(chat INTEGER PRIMARY KEY, start TEXT, end TEXT); CREATE TABLE IF NOT EXISTS roster(id INTEGER PRIMARY KEY, chat INTEGER, name TEXT, user_id INTEGER, UNIQUE(chat,name)); CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, chat INTEGER, user_id INTEGER, name TEXT, text TEXT, at INTEGER); CREATE TABLE IF NOT EXISTS attendance(chat INTEGER, day TEXT, student INTEGER, at INTEGER, PRIMARY KEY(chat,day,student)); CREATE TABLE IF NOT EXISTS session_attendance(chat INTEGER NOT NULL, day TEXT NOT NULL, schedule_id INTEGER NOT NULL, student INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(chat,day,schedule_id,student)); CREATE TABLE IF NOT EXISTS schedules(id INTEGER PRIMARY KEY, chat INTEGER NOT NULL, weekday INTEGER NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, UNIQUE(chat,weekday,start,end)); CREATE TABLE IF NOT EXISTS corrections(id INTEGER PRIMARY KEY, chat INTEGER, user_id INTEGER, requested TEXT, status TEXT DEFAULT \'pending\');');
        $this->memory = new Memory($this->db);
    }
    private function log(string $event,array $context=[]): void { error_log('[ahmad] '.date(DATE_ATOM).' '.$event.' '.json_encode($context,JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); }
    private function query(string $sql,array $args=[]): PDOStatement { $s=$this->db->prepare($sql); $s->execute($args); return $s; }
    private function api(string $method,array $data): array { return $this->http('https://tapi.bale.ai/bot'.$this->c['bale_token'].'/'.$method,$data); }
    private function http(string $url,array $data,array $headers=[]): array {
        $service=str_contains($url,'tapi.bale.ai')?'Bale':'AI provider'; $path=parse_url($url,PHP_URL_PATH) ?: ''; $operation=$service==='Bale'?basename($path):$path; $started=microtime(true); $this->log('request.start',['service'=>$service,'operation'=>$operation]); $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($data,JSON_UNESCAPED_UNICODE),CURLOPT_HTTPHEADER=>array_merge(['Content-Type: application/json'],$headers),CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>60]);
        $out=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_HTTP_CODE); $contentType=curl_getinfo($ch,CURLINFO_CONTENT_TYPE) ?: 'unknown'; $err=curl_error($ch); curl_close($ch); $this->log('request.end',['service'=>$service,'operation'=>$operation,'status'=>$status,'content_type'=>$contentType,'bytes'=>strlen($out?:''),'duration_ms'=>(int)((microtime(true)-$started)*1000),'curl_error'=>$err]);
        if ($out===false || $status>=400) throw new RuntimeException($service.' request failed: HTTP '.$status.' '.$err);
        $json=json_decode($out,true);
        if (!is_array($json) && str_contains(strtolower($contentType),'text/event-stream')) {
            $content=''; $streamError=null; $events=0;
            foreach (preg_split('/\r?\n/', $out) as $line) {
                if (!str_starts_with($line,'data:')) continue;
                $data=trim(substr($line,5)); if ($data==='' || $data==='[DONE]') continue;
                $event=json_decode($data,true); if (!is_array($event)) continue; $events++;
                if (isset($event['error'])) $streamError=is_array($event['error'])?($event['error']['message']??'stream error'):'stream error';
                $piece=$event['choices'][0]['delta']['content']??$event['choices'][0]['message']['content']??'';
                if (is_string($piece)) $content.=$piece;
            }
            $this->log('stream.parsed',['events'=>$events,'content_chars'=>mb_strlen($content),'has_error'=>$streamError!==null]);
            if ($streamError!==null) throw new RuntimeException('AI provider stream reported an error');
            if ($content!=='') $json=['choices'=>[['message'=>['content'=>$content]]]];
        }
        if (!is_array($json)) throw new RuntimeException($service.' returned invalid JSON: HTTP '.$status.', content type '.$contentType.', bytes '.strlen($out)); if (array_key_exists('ok',$json) && !$json['ok']) throw new RuntimeException('Bale API rejected request: '.($json['description']??'unknown error')); return $json;
    }
    private function send(int $chat,string $text,?int $reply=null): void { $d=['chat_id'=>$chat,'text'=>$text]; if ($reply) $d['reply_to_message_id']=$reply; $this->api('sendMessage',$d); }
    private function staff(int $user): bool { return in_array((string)$user,$this->c['admin_ids'],true); }
    private function norm(string $s): string { return trim(preg_replace('/\s+/u',' ',str_replace(['ي','ك','‌'],['ی','ک',' '],$s))); }
    public function handle(array $u): void {
        if (!isset($u['update_id'])) { $this->log('update.missing_id'); return; } $this->log('update.received',['update_id'=>$u['update_id'],'kind'=>isset($u['message'])?'message':'other']);
        $s=$this->query('INSERT OR IGNORE INTO updates(id) VALUES(?)',[$u['update_id']]); if (!$s->rowCount()) { $this->log('update.duplicate',['update_id'=>$u['update_id']]); return; }
        $m=$u['message']??null; if (!$m || !isset($m['from']['id'],$m['chat']['id'])) return;
        $chat=(int)$m['chat']['id']; $user=(int)$m['from']['id']; $text=trim($m['text']??''); $mid=$m['message_id']??null; $at=(int)($m['date']??time());
        $name=trim(($m['from']['first_name']??'').' '.($m['from']['last_name']??'')); $this->log('message.received',['chat_id'=>$chat,'user_id'=>$user,'message_id'=>$mid,'text_length'=>mb_strlen($text),'chat_type'=>$m['chat']['type']??'unknown']);
        $this->query('INSERT INTO messages(chat,user_id,name,text,at) VALUES(?,?,?,?,?)',[$chat,$user,$name,$text,$at]);
        if ($text==='/start' || $text==='/help') { $this->send($chat,"سلام، من استاد احمد هستم. دانش‌آموزان در زمان کلاس نام خود را بفرستند.\nدستورات معلم: /class HH:MM HH:MM ، /roster نام‌ها (هر نام در یک خط)، /report ، /rename نام قدیم | نام جدید.\nبرای پرسش مرا با «استاد احمد» صدا بزنید یا به پیام من پاسخ دهید.",$mid); return; }
        if (preg_match('~^/(class|schedule|schedules|unschedule|roster|report|sessions|rename|requests|approve)(?:@\w+)?(?:\s+([\s\S]*))?$~u',$text,$a)) {
            if (!$this->staff($user)) { $this->send($chat,'این دستور فقط برای معلم یا مدیر مجاز است.',$mid); return; }
            $arg=trim($a[2]??'');
            if ($a[1]==='class') { if (!preg_match('/^(\d{2}:\d{2})\s+(\d{2}:\d{2})$/',$arg,$t) || $t[1]>='24:00' || $t[2]>='24:00' || substr($t[1],3)>='60' || substr($t[2],3)>='60' || $t[1]>=$t[2]) { $this->send($chat,'نمونه: /class 08:00 09:30',$mid); return; } $this->query('INSERT INTO classes VALUES(?,?,?) ON CONFLICT(chat) DO UPDATE SET start=excluded.start,end=excluded.end',[$chat,$t[1],$t[2]]); $this->send($chat,'زمان کلاس ذخیره شد.',$mid); return; }
            if ($a[1]==='schedule') {
                if (!preg_match('/^([0-6])\s+([0-2][0-9]:[0-5][0-9])\s+([0-2][0-9]:[0-5][0-9])$/',$arg,$parts) || $parts[2]>='24:00' || $parts[3]>='24:00' || $parts[2]>=$parts[3]) { $this->send($chat,'نمونه: /schedule 6 08:00 09:30 (شنبه ۶، یکشنبه ۰)',$mid); return; }
                $this->query('INSERT OR IGNORE INTO schedules(chat,weekday,start,end) VALUES(?,?,?,?)',[$chat,(int)$parts[1],$parts[2],$parts[3]]); $this->send($chat,'زمان هفتگی کلاس ثبت شد.',$mid); return;
            }
            if ($a[1]==='schedules') { $rows=$this->query('SELECT id,weekday,start,end FROM schedules WHERE chat=? ORDER BY weekday,start',[$chat])->fetchAll(PDO::FETCH_ASSOC); $days=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه']; $out="برنامه هفتگی:\n"; foreach($rows as $r) $out.='#'.$r['id'].' '.$days[$r['weekday']].' '.$r['start'].' تا '.$r['end']."\n"; $this->send($chat,$rows?$out:'برنامه هفتگی ثبت نشده است.',$mid); return; }
            if ($a[1]==='unschedule') { if (!ctype_digit($arg)) { $this->send($chat,'نمونه: /unschedule 1',$mid); return; } $deleted=$this->query('DELETE FROM schedules WHERE chat=? AND id=?',[$chat,(int)$arg])->rowCount(); $this->send($chat,$deleted?'زمان حذف شد.':'زمان پیدا نشد.',$mid); return; }
            if ($a[1]==='sessions') {
                $day=date('Y-m-d'); $windows=$this->query('SELECT id,start,end FROM schedules WHERE chat=? AND weekday=? ORDER BY start',[$chat,(int)date('w')])->fetchAll(PDO::FETCH_ASSOC); $out="حضور کلاس‌های امروز:\n";
                foreach($windows as $window) { $out.="\n".$window['start'].' تا '.$window['end']."\n"; $rows=$this->query('SELECT r.name,a.at FROM roster r LEFT JOIN session_attendance a ON a.student=r.id AND a.chat=r.chat AND a.day=? AND a.schedule_id=? WHERE r.chat=? ORDER BY r.name',[$day,$window['id'],$chat])->fetchAll(PDO::FETCH_ASSOC); foreach($rows as $r) $out.=$r['name'].' — '.($r['at']?date('H:i',$r['at']):'نامشخص')."\n"; }
                $this->send($chat,$windows?$out:'برای امروز برنامه هفتگی ثبت نشده است.',$mid); return;
            }
            if ($a[1]==='roster') { $n=0; foreach(preg_split('/[\r\n،,]+/u',$arg) as $v) { $v=$this->norm($v); if ($v!=='') { $this->query('INSERT OR IGNORE INTO roster(chat,name) VALUES(?,?)',[$chat,$v]); $n++; } } $this->send($chat,"نام‌ها دریافت شد: $n",$mid); return; }
            if ($a[1]==='requests') { $rows=$this->query("SELECT id,user_id,requested FROM corrections WHERE chat=? AND status='pending' ORDER BY id",[$chat])->fetchAll(PDO::FETCH_ASSOC); $out="درخواست‌های اصلاح نام:\n"; foreach($rows as $r) $out.='#'.$r['id'].' — '.$r['requested'].' ('.$r['user_id'].")\n"; $this->send($chat,$rows?$out:'درخواستی وجود ندارد.',$mid); return; }
            if ($a[1]==='approve') { if (!ctype_digit($arg)) { $this->send($chat,'نمونه: /approve 1',$mid); return; } $r=$this->query("SELECT * FROM corrections WHERE id=? AND chat=? AND status='pending'",[(int)$arg,$chat])->fetch(PDO::FETCH_ASSOC); if (!$r) { $this->send($chat,'درخواست پیدا نشد.',$mid); return; } $old=$this->query('SELECT id FROM roster WHERE chat=? AND user_id=?',[$chat,$r['user_id']])->fetchColumn(); if (!$old) { $this->send($chat,'دانش‌آموز ابتدا باید به یک نام در فهرست متصل شود.',$mid); return; } try { $this->query('UPDATE roster SET name=? WHERE id=?',[$r['requested'],$old]); $this->query("UPDATE corrections SET status='approved' WHERE id=?",[$r['id']]); $this->send($chat,'اصلاح نام تأیید شد.',$mid); } catch(Throwable $e) { $this->send($chat,'نام تکراری است یا قابل ثبت نیست.',$mid); } return; }
            if ($a[1]==='rename') { $p=explode('|',$arg,2); if(count($p)!==2) { $this->send($chat,'نمونه: /rename نام قدیم | نام جدید',$mid); return; } try { $s=$this->query('UPDATE roster SET name=? WHERE chat=? AND name=?',[$this->norm($p[1]),$chat,$this->norm($p[0])]); $this->send($chat,$s->rowCount()?'نام اصلاح شد.':'نام پیدا نشد.',$mid); } catch(Throwable $e) { $this->send($chat,'این نام تکراری است یا قابل ثبت نیست.',$mid); } return; }
            $day=date('Y-m-d'); $rows=$this->query('SELECT r.name,a.at FROM roster r LEFT JOIN attendance a ON a.student=r.id AND a.chat=r.chat AND a.day=? WHERE r.chat=? ORDER BY r.name',[$day,$chat])->fetchAll(PDO::FETCH_ASSOC); $out="گزارش $day\n"; foreach($rows as $r) $out.=$r['name'].' — '.($r['at']?('ثبت حضور '.date('H:i',$r['at'])):'نامشخص')."\n"; $windows=$this->query('SELECT start,end FROM schedules WHERE chat=? AND weekday=?',[$chat,(int)date('w')])->fetchAll(PDO::FETCH_ASSOC); $hasWeekly=(bool)$this->query('SELECT 1 FROM schedules WHERE chat=? LIMIT 1',[$chat])->fetchColumn(); if (!$hasWeekly) { $legacy=$this->query('SELECT start,end FROM classes WHERE chat=?',[$chat])->fetch(PDO::FETCH_ASSOC); if ($legacy) $windows=[$legacy]; } $conditions=[]; $params=[$chat]; foreach($windows as $window) { $conditions[]='(at>=? AND at<?)'; $params[]=strtotime($day.' '.$window['start']); $params[]=strtotime($day.' '.$window['end'])+60; } $counts=$conditions?$this->query('SELECT name,COUNT(*) n FROM messages WHERE chat=? AND ('.implode(' OR ',$conditions).') GROUP BY user_id ORDER BY n DESC',$params)->fetchAll(PDO::FETCH_ASSOC):[]; $out.="\nفعالیت در بازه کلاس (تعداد پیام):\n"; foreach($counts as $r) $out.=$r['name'].': '.$r['n']."\n"; $this->send($chat,$out,$mid); return;
        }
        if (preg_match('~^/correct(?:@\w+)?\s+(.+)$~u',$text,$change)) { $new=$this->norm($change[1]); if ($new==='') return; $this->query('INSERT INTO corrections(chat,user_id,requested) VALUES(?,?,?)',[$chat,$user,$new]); $this->send($chat,'درخواست اصلاح نام برای بررسی معلم ثبت شد.',$mid); return; }
        $time=date('H:i',$at); $class=$this->query('SELECT id,start,end FROM schedules WHERE chat=? AND weekday=? AND start<=? AND end>=? ORDER BY start DESC LIMIT 1',[$chat,(int)date('w',$at),$time,$time])->fetch(PDO::FETCH_ASSOC); $hasWeekly=(bool)$this->query('SELECT 1 FROM schedules WHERE chat=? LIMIT 1',[$chat])->fetchColumn(); if (!$hasWeekly) $class=$this->query('SELECT * FROM classes WHERE chat=?',[$chat])->fetch(PDO::FETCH_ASSOC);
        if ($class && $time >= $class['start'] && $time <= $class['end'] && $text!=='') { $matches=$this->query('SELECT * FROM roster WHERE chat=? AND name=?',[$chat,$this->norm($text)])->fetchAll(PDO::FETCH_ASSOC); if(count($matches)===1) { $r=$matches[0]; if ($r['user_id']!==null && (int)$r['user_id']!==$user) { $this->send($chat,'این نام قبلاً به حساب دیگری متصل شده است؛ لطفاً از معلم کمک بخواهید.',$mid); return; } $linked=$this->query('SELECT id FROM roster WHERE chat=? AND user_id=? AND id<>?',[$chat,$user,$r['id']])->fetchColumn(); if ($linked) { $this->send($chat,'حساب شما به نام دیگری متصل است؛ لطفاً از معلم بخواهید آن را اصلاح کند.',$mid); return; } $this->query('UPDATE roster SET user_id=? WHERE id=?',[$user,$r['id']]); $day=date('Y-m-d',$at); $this->query('INSERT OR IGNORE INTO attendance VALUES(?,?,?,?)',[$chat,$day,$r['id'],$at]); if (isset($class['id'])) $this->query('INSERT OR IGNORE INTO session_attendance VALUES(?,?,?,?,?)',[$chat,$day,$class['id'],$r['id'],$at]); $late=$time>$class['start']; $this->send($chat,$r['name'].' عزیز، حضورت ثبت شد'.($late?' (پس از شروع کلاس)':'').'.',$mid); return; } }
        if (preg_match('~^/(search|mysearch)(?:@\w+)?\s+(.+)$~us', $text, $search)) {
            if ($search[1] === 'search' && !$this->staff($user)) { $this->send($chat, 'جستجوی همه پیام‌ها فقط برای معلم یا مدیر مجاز است.', $mid); return; }
            $term=trim($search[2]); if (mb_strlen($term)<2) { $this->send($chat,'عبارت جستجو باید حداقل دو حرف باشد.',$mid); return; }
            $rows=$this->memory->search($chat,$search[1]==='mysearch'?$user:null,$term); $output="نتایج جستجو:\n";
            foreach($rows as $row) $output.=date('Y-m-d H:i',$row['at']).' — '.$row['name'].': '.mb_substr($row['text'],0,200)."\n";
            $this->send($chat,$rows?$output:'پیامی پیدا نشد.',$mid); return;
        }
        if ($text==='/forget') { $this->memory->forget($chat,$user); $this->send($chat,'حافظه گفت‌وگوی ما پاک شد؛ پیام‌های کلاس و حضور جداگانه نگهداری می‌شوند.',$mid); return; }
        $imagePrompt = null;
        if (preg_match('~^/image(?:@\w+)?\s+([\s\S]+)$~u', $text, $image)) {
            $imagePrompt = trim($image[1]);
        } elseif (preg_match('~(?:عکس|تصویر|نقاشی)~u', $text) && preg_match('~(?:بساز|بکش|تولید کن|درست کن|ایجاد کن|بفرست|میخوام|می‌خوام|میخواهم)~u', $text) && (($m['chat']['type']??'')==='private' || str_contains($text,'استاد احمد') || (!empty($this->c['bot_username']) && stripos($text,'@'.$this->c['bot_username'])!==false) || (!empty($this->c['bot_username']) && strcasecmp($m['reply_to_message']['from']['username']??'', $this->c['bot_username'])===0))) {
            $imagePrompt = $text;
        }
        if ($imagePrompt !== null) {
            if (!$this->c['image_key'] || !$this->c['image_model']) { $this->send($chat,'سرویس تولید تصویر تنظیم نشده است.',$mid); return; }
            try {
                $this->log('image.requested',['chat_id'=>$chat,'model'=>$this->c['image_model']]);
                $imageData=(new ImageProvider($this->c))->generate($imagePrompt);
                (new ImageSender($this->c['bale_token']))->send($chat,$mid,$imageData);
            } catch(Throwable $e) { $this->log('image.error',['error'=>$e->getMessage()]); $this->send($chat,'ساخت یا ارسال تصویر ممکن نشد؛ لطفاً دوباره تلاش کنید.',$mid); }
            return;
        }
        $called=str_contains($text,'استاد احمد') || (!empty($this->c['bot_username']) && stripos($text,'@'.$this->c['bot_username'])!==false) || (!empty($this->c['bot_username']) && strcasecmp($m['reply_to_message']['from']['username']??'', $this->c['bot_username'])===0) || ($m['chat']['type']??'')==='private';
        if (!$called || $text==='') { $this->log('message.no_reply',['chat_id'=>$chat]); return; } $this->log('ai.triggered',['chat_id'=>$chat,'message_id'=>$mid]);
        if (!$this->c['ai_url'] || !$this->c['ai_key'] || !$this->c['ai_model']) { $this->send($chat,'هوش مصنوعی هنوز تنظیم نشده است.',$mid); return; }
        try {
            $msgs=ConversationPrompt::build($this->memory->recent($chat,$user),$text);
            $response=$this->http($this->c['ai_url'].'/chat/completions',['model'=>$this->c['ai_model'],'messages'=>$msgs,'stream'=>false],['Authorization: Bearer '.$this->c['ai_key']]);
            $answer=$response['choices'][0]['message']['content']??null;
            if (!is_string($answer) || trim($answer)==='') throw new RuntimeException('AI provider returned no text');
            $this->send($chat,$answer,$mid);
            $this->memory->remember($chat,$user,'user',$text);
            $this->memory->remember($chat,$user,'assistant',$answer);
        } catch(Throwable $e) { $this->log('ai.error',['error'=>$e->getMessage()]); $this->send($chat,'در حال حاضر پاسخ‌گویی ممکن نیست؛ لطفاً بعداً تلاش کنید.',$mid); }

    }
    public function poll(): void { $this->log('poll.start',['timezone'=>$this->c['timezone']]); while (true) { try { $this->api('deleteWebhook',[]); break; } catch (Throwable $e) { $this->log('poll.startup_retry',['error'=>$e->getMessage(),'retry_seconds'=>5]); sleep(5); } } $offset=(int)$this->query('SELECT COALESCE(MAX(id),-1)+1 FROM updates')->fetchColumn(); while(true) { try { $r=$this->api('getUpdates',['offset'=>$offset,'timeout'=>30]); foreach($r['result']??[] as $u) { $this->handle($u); $offset=max($offset,$u['update_id']+1); } } catch(Throwable $e) { $this->log('poll.error',['error'=>$e->getMessage()]); sleep(3); } } }
}

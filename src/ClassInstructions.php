<?php
declare(strict_types=1);
final class ClassInstructions
{
    public function __construct(private PDO $db)
    {
        $db->exec('CREATE TABLE IF NOT EXISTS class_instructions (id INTEGER PRIMARY KEY AUTOINCREMENT, chat INTEGER NOT NULL, author INTEGER NOT NULL, instruction TEXT NOT NULL, created_at INTEGER NOT NULL)');
    }
    public static function parse(string $text): ?string
    {
        $text=trim(str_replace(['ي','ك','‌'],['ی','ک',' '],$text));
        if (!preg_match('/^(?:آقای\s+ناظر[،,:\s]*)?یادت\s+باشه[،,:\s]+(.+)$/us',$text,$m)) return null;
        $note=trim($m[1]); return $note!=='' ? $note : null;
    }
    public function add(int $chat,int $author,string $instruction): int
    {
        $s=$this->db->prepare('INSERT INTO class_instructions(chat,author,instruction,created_at) VALUES(?,?,?,?)');
        $s->execute([$chat,$author,$instruction,time()]); return (int)$this->db->lastInsertId();
    }
    public function list(int $chat): array
    {
        $s=$this->db->prepare('SELECT id,instruction FROM class_instructions WHERE chat=? ORDER BY id DESC LIMIT 10'); $s->execute([$chat]); return $s->fetchAll(PDO::FETCH_ASSOC);
    }
    public function delete(int $chat,int $id): bool
    {
        $s=$this->db->prepare('DELETE FROM class_instructions WHERE chat=? AND id=?'); $s->execute([$chat,$id]); return $s->rowCount()>0;
    }
}

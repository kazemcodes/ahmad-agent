<?php
declare(strict_types=1);

final class Memory
{
    public function __construct(private PDO $db)
    {
        $this->db->exec('CREATE TABLE IF NOT EXISTS conversation_turns (id INTEGER PRIMARY KEY, chat INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, at INTEGER NOT NULL)');
        $this->db->exec('CREATE INDEX IF NOT EXISTS conversation_scope ON conversation_turns(chat,user_id,id)');
        $this->db->exec('CREATE INDEX IF NOT EXISTS messages_scope ON messages(chat,user_id,at)');
    }

    public function remember(int $chat, int $user, string $role, string $content): void
    {
        $statement = $this->db->prepare('INSERT INTO conversation_turns(chat,user_id,role,content,at) VALUES(?,?,?,?,?)');
        $statement->execute([$chat, $user, $role, $content, time()]);
    }

    public function recent(int $chat, int $user, int $limit = 12): array
    {
        $statement = $this->db->prepare('SELECT role,content FROM conversation_turns WHERE chat=? AND user_id=? ORDER BY id DESC LIMIT ?');
        $statement->bindValue(1, $chat, PDO::PARAM_INT);
        $statement->bindValue(2, $user, PDO::PARAM_INT);
        $statement->bindValue(3, $limit, PDO::PARAM_INT);
        $statement->execute();
        return array_reverse($statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function search(int $chat, ?int $user, string $term, int $limit = 10): array
    {
        $term = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term);
        $sql = "SELECT name,text,at FROM messages WHERE chat=? AND text LIKE ? ESCAPE '\\'";
        $args = [$chat, '%'.$term.'%'];
        if ($user !== null) { $sql .= ' AND user_id=?'; $args[] = $user; }
        $sql .= ' ORDER BY at DESC LIMIT '.max(1, min(20, $limit));
        $statement = $this->db->prepare($sql);
        $statement->execute($args);
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    public function forget(int $chat, int $user): void
    {
        $statement = $this->db->prepare('DELETE FROM conversation_turns WHERE chat=? AND user_id=?');
        $statement->execute([$chat, $user]);
    }
}

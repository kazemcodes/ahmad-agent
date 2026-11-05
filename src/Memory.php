<?php
declare(strict_types=1);

final class Memory
{
    public function __construct(private PDO $db)
    {
        $this->db->exec('CREATE TABLE IF NOT EXISTS conversation_turns (id INTEGER PRIMARY KEY, chat INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, at INTEGER NOT NULL)');
        $this->db->exec('CREATE INDEX IF NOT EXISTS conversation_scope ON conversation_turns(chat,user_id,id)');
        $this->db->exec('CREATE INDEX IF NOT EXISTS messages_scope ON messages(chat,user_id,at)');
        $this->db->exec('CREATE TABLE IF NOT EXISTS student_notes (chat INTEGER NOT NULL, user_id INTEGER NOT NULL, note TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(chat,user_id))');
        $this->db->exec('CREATE TABLE IF NOT EXISTS observed_users (chat INTEGER NOT NULL, user_id INTEGER NOT NULL, username TEXT, first_name TEXT, last_name TEXT, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(chat,user_id))');
    }

    public function observeUser(int $chat, array $user, int $at): void
    {
        $statement = $this->db->prepare('INSERT INTO observed_users(chat,user_id,username,first_name,last_name,first_seen,last_seen) VALUES(?,?,?,?,?,?,?) ON CONFLICT(chat,user_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name, last_seen=MAX(observed_users.last_seen,excluded.last_seen) WHERE excluded.last_seen>=observed_users.last_seen');
        $statement->execute([$chat, (int)$user['id'], $user['username'] ?? null, $user['first_name'] ?? null, $user['last_name'] ?? null, $at, $at]);
    }

    public function setNote(int $chat, int $user, string $note): void
    {
        $s=$this->db->prepare('INSERT INTO student_notes(chat,user_id,note,updated_at) VALUES(?,?,?,?) ON CONFLICT(chat,user_id) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at');
        $s->execute([$chat,$user,$note,time()]);
    }
    public function note(int $chat, int $user): string
    {
        $s=$this->db->prepare('SELECT note FROM student_notes WHERE chat=? AND user_id=?'); $s->execute([$chat,$user]); return (string)($s->fetchColumn() ?: '');
    }
    public function deleteNote(int $chat, int $user): void
    {
        $s=$this->db->prepare('DELETE FROM student_notes WHERE chat=? AND user_id=?'); $s->execute([$chat,$user]);
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

    public function relevant(int $chat, int $user, string $query, int $limit = 4): array
    {
        $terms=preg_split('/[^\p{L}\p{N}]+/u',mb_strtolower($query),-1,PREG_SPLIT_NO_EMPTY);
        $stop=['استاد','احمد','چیه','چیست','چطور','چگونه','برای','لطفا','بگو','میشه','سلام','کنم','کردم','بود','the','what','that','this'];
        $terms=array_slice(array_values(array_unique(array_filter($terms,fn($word)=>mb_strlen($word)>=3 && !in_array($word,$stop,true)))),0,8);
        if (!$terms) return [];
        $q=$this->db->prepare("SELECT id,content FROM conversation_turns WHERE chat=? AND user_id=? AND role='user' AND id NOT IN (SELECT id FROM conversation_turns WHERE chat=? AND user_id=? ORDER BY id DESC LIMIT 12) ORDER BY id DESC LIMIT 500");
        $q->execute([$chat,$user,$chat,$user]); $matches=[];
        foreach($q->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $text=mb_strtolower($row['content']); $score=0; foreach($terms as $term) if (mb_strpos($text,$term)!==false) $score++;
            if ($score>0) $matches[]=['score'=>$score,'id'=>(int)$row['id'],'content'=>mb_substr($row['content'],0,500)];
        }
        usort($matches,fn($a,$b)=>($b['score']<=>$a['score']) ?: ($b['id']<=>$a['id']));
        return array_column(array_slice($matches,0,max(0,min($limit,4))),'content');
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

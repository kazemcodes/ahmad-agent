<?php
declare(strict_types=1);
final class FuzzyMatch
{
    public static function levenshtein(string $a, string $b): int
    {
        $a = str_replace(['ي','ك','‌'],['ی','ک',' '], mb_strtolower(trim($a)));
        $b = str_replace(['ي','ك','‌'],['ی','ک',' '], mb_strtolower(trim($b)));
        $la = mb_strlen($a); $lb = mb_strlen($b);
        if ($la === 0) return $lb; if ($lb === 0) return $la;
        $prev = range(0, $lb); $curr = array_fill(0, $lb+1, 0);
        for ($i = 1; $i <= $la; $i++) {
            $curr[0] = $i;
            $ca = mb_substr($a, $i-1, 1);
            for ($j = 1; $j <= $lb; $j++) {
                $cb = mb_substr($b, $j-1, 1);
                $cost = ($ca === $cb) ? 0 : 1;
                $curr[$j] = min($prev[$j] + 1, $curr[$j-1] + 1, $prev[$j-1] + $cost);
            }
            [$prev, $curr] = [$curr, $prev];
        }
        return $prev[$lb];
    }
    public static function bestMatch(string $input, array $candidates): ?string
    {
        $input = self::norm($input);
        $best = null; $bestDist = PHP_INT_MAX;
        foreach ($candidates as $c) {
            $nc = self::norm($c);
            if ($nc === $input) return $c;
            $d = self::levenshtein($input, $nc);
            $threshold = max(1, (int)floor(mb_strlen($nc) * 0.3));
            if ($d <= $threshold && $d < $bestDist) { $best = $c; $bestDist = $d; }
        }
        return $best;
    }
    private static function norm(string $s): string { return trim(preg_replace('/\s+/u',' ', str_replace(['ي','ك','‌'],['ی','ک',' '], mb_strtolower(trim($s))))); }
}

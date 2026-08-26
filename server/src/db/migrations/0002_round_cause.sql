-- fim de rodada: a partida termina com o mundo explodindo (nem morte nem saída)
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_cause_check;
ALTER TABLE matches ADD CONSTRAINT matches_cause_check CHECK (cause IN ('eaten','blackhole','left','shutdown','round'));

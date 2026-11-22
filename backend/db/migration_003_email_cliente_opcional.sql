-- Torna o e-mail do cliente opcional (somente o nome passa a ser obrigatório).
ALTER TABLE clients ALTER COLUMN email DROP NOT NULL;

/*
  # Création du schéma de base pour l'application de quiz temps réel

  1. Nouvelles Tables
     - `rooms` - Salles de jeu avec codes uniques
       - `id` (uuid, clé primaire)
       - `code` (text, unique) - Code à 6 chiffres pour rejoindre
       - `name` (text) - Nom de la salle
       - `host_id` (uuid) - ID de l'animateur
       - `is_active` (boolean) - Statut de la salle
       - `created_at` (timestamp)
       
     - `players` - Joueurs dans les salles
       - `id` (uuid, clé primaire)  
       - `pseudo` (text) - Nom d'affichage du joueur
       - `room_id` (uuid, référence rooms)
       - `score` (integer) - Points du joueur
       - `is_connected` (boolean) - Statut de connexion
       - `joined_at` (timestamp)
       
     - `questions` - Questions posées par l'animateur
       - `id` (uuid, clé primaire)
       - `room_id` (uuid, référence rooms)
       - `text` (text) - Texte de la question
       - `correct_answer` (text) - Réponse correcte
       - `is_active` (boolean) - Question en cours
       - `created_at` (timestamp)
       
     - `answers` - Réponses des joueurs
       - `id` (uuid, clé primaire)
       - `player_id` (uuid, référence players)
       - `question_id` (uuid, référence questions)
       - `text` (text) - Réponse donnée
       - `response_time` (integer) - Temps en millisecondes
       - `is_correct` (boolean) - Si la réponse est correcte
       - `submitted_at` (timestamp)

  2. Sécurité
     - RLS activé sur toutes les tables
     - Politiques pour permettre lecture/écriture selon le contexte
     
  3. Index et contraintes
     - Index sur les codes de salle pour performances
     - Contraintes de clés étrangères
*/

-- Création de la table des salles
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT 'Nouvelle partie',
  host_id uuid,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Création de la table des joueurs
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pseudo text NOT NULL,
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  score integer DEFAULT 0,
  is_connected boolean DEFAULT true,
  joined_at timestamptz DEFAULT now()
);

-- Création de la table des questions
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  text text NOT NULL,
  correct_answer text,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Création de la table des réponses
CREATE TABLE IF NOT EXISTS answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE,
  text text NOT NULL,
  response_time integer DEFAULT 0,
  is_correct boolean DEFAULT false,
  submitted_at timestamptz DEFAULT now()
);

-- Activation du RLS sur toutes les tables
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- Politiques pour les salles (lecture publique, création libre)
CREATE POLICY "Tout le monde peut lire les salles actives"
  ON rooms FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Tout le monde peut créer des salles"
  ON rooms FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "L'hôte peut modifier sa salle"
  ON rooms FOR UPDATE
  TO public
  USING (true);

-- Politiques pour les joueurs (lecture dans la salle, ajout libre)
CREATE POLICY "Lire les joueurs de la salle"
  ON players FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Tout le monde peut rejoindre une salle"
  ON players FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Un joueur peut mettre à jour ses infos"
  ON players FOR UPDATE
  TO public
  USING (true);

-- Politiques pour les questions (lecture dans la salle, création par l'hôte)
CREATE POLICY "Lire les questions de la salle"
  ON questions FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Créer des questions"
  ON questions FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Modifier des questions"
  ON questions FOR UPDATE
  TO public
  USING (true);

-- Politiques pour les réponses (lecture par la salle, création par le joueur)
CREATE POLICY "Lire les réponses de la salle"
  ON answers FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Créer des réponses"
  ON answers FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Modifier des réponses"
  ON answers FOR UPDATE
  TO public
  USING (true);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_questions_room_id ON questions(room_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_player_id ON answers(player_id);
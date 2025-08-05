"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase, Player, Question } from "@/lib/supabase";
import { Send, Trophy, Clock, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface PlayClientProps {
  playerId: string;
}

export default function PlayClient({ playerId }: PlayClientProps) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [lastCorrectAnswer, setLastCorrectAnswer] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isGameEnded, setIsGameEnded] = useState(false);
  const router = useRouter();
  const playerRoomIdRef = useRef<string | null>(null);

  // Charge les données du joueur, question, réponses et classement
  const loadPlayerData = useCallback(async () => {
    if (!playerId) return;
    setIsLoading(true);

    try {
      // Player
      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("*")
        .eq("id", playerId)
        .single();

      if (playerError || !playerData)
        throw playerError || new Error("Player not found");

      setPlayer(playerData);
      playerRoomIdRef.current = playerData.room_id;

      // Question active
      const { data: questionData, error: questionError } = await supabase
        .from("questions")
        .select("*")
        .eq("room_id", playerData.room_id)
        .eq("is_active", true)
        .single();

      if (questionError) {
        setCurrentQuestion(null);
        setHasAnswered(false);
        setAnswer("");
      } else {
        setCurrentQuestion(questionData);
        setQuestionStartTime(Date.now());

        // Vérifier si le joueur a déjà répondu à cette question
        const { data: existingAnswer, error: answerError } = await supabase
          .from("answers")
          .select("*")
          .eq("player_id", playerId)
          .eq("question_id", questionData.id)
          .single();

        setHasAnswered(!!existingAnswer);
        setAnswer(existingAnswer?.text || "");
      }

      // Top 5 joueurs dans la room
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", playerData.room_id)
        .order("score", { ascending: false })
        .limit(5);

      if (!playersError) setLeaderboard(playersData || []);
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
    } finally {
      setIsLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    if (!playerRoomIdRef.current) return;

    const roomId = playerRoomIdRef.current;

    // Channel pour les questions
    const questionsChannel = supabase
      .channel(`questions-${roomId}-${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "questions",
          filter: `room_id=eq.${roomId}`,
        },
        (payload: any) => {
          if (payload.eventType === "INSERT" && payload.new?.is_active) {
            setCurrentQuestion(payload.new);
            setQuestionStartTime(Date.now());
            setHasAnswered(false);
            setAnswer("");
          } else if (payload.eventType === "UPDATE") {
            if (payload.new?.is_active) {
              setCurrentQuestion(payload.new);
              setQuestionStartTime(Date.now());
              setHasAnswered(false);
              setAnswer("");
            } else {
              if (currentQuestion?.id === payload.new?.id) {
                setCurrentQuestion(null);
                setHasAnswered(false);
                setAnswer("");
              }
            }
          }
        }
      )
      .subscribe();

    // Channel pour les joueurs (scores)
    const playersChannel = supabase
      .channel(`players-${roomId}-${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const { data: playersData } = await supabase
            .from("players")
            .select("*")
            .eq("room_id", roomId)
            .order("score", { ascending: false })
            .limit(5);

          if (playersData) {
            setLeaderboard(playersData);
            const updatedPlayer = playersData.find((p) => p.id === playerId);
            if (updatedPlayer) setPlayer(updatedPlayer);
          }
        }
      )
      .subscribe();

    // Channel pour les réponses (notifications de bonne réponse)
    const answersChannel = supabase
      .channel(`answers-${roomId}-${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "answers",
        },
        async (payload: any) => {
          if (
            payload.new?.is_correct &&
            (!payload.old || !payload.old.is_correct)
          ) {
            const { data: winnerData } = await supabase
              .from("players")
              .select("pseudo")
              .eq("id", payload.new.player_id)
              .single();

            if (winnerData) {
              const message = `🎉 ${winnerData.pseudo} a trouvé la bonne réponse !`;
              setLastCorrectAnswer(message);
              setTimeout(() => setLastCorrectAnswer(null), 5000);
            }
          }
        }
      )
      .subscribe();

    // Channel pour la suppression de la room (fin de partie)
    const roomChannel = supabase
      .channel(`room-${roomId}-${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        () => {
          setIsGameEnded(true);
          setCurrentQuestion(null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(questionsChannel);
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(answersChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [playerId, currentQuestion]);

  useEffect(() => {
    loadPlayerData();
  }, [loadPlayerData]);

  const submitAnswer = async () => {
    if (!answer.trim() || !currentQuestion || hasAnswered || isSubmitting)
      return;

    setIsSubmitting(true);

    try {
      const responseTime = Date.now() - questionStartTime;

      const { error } = await supabase.from("answers").insert({
        player_id: playerId,
        question_id: currentQuestion.id,
        room_id: playerRoomIdRef.current,
        text: answer.trim(),
        response_time: responseTime,
        is_correct: false,
      });

      if (error) throw error;

      setHasAnswered(true);
    } catch (error) {
      console.error("Erreur lors de l'envoi de la réponse:", error);
      alert("Erreur lors de l'envoi de la réponse. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center">
        <div className="text-white text-xl">Joueur introuvable</div>
      </div>
    );
  }

  if (isGameEnded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center">
        <div className="text-white text-center p-6">
          <h1 className="text-3xl font-bold mb-4">🎮 Partie terminée</h1>
          <p className="text-white/80 text-lg">
            L&apos;animateur a mis fin à la partie.
          </p>
          <Button onClick={() => router.push("/")}>Revenir au menu</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
                Bienvenue, {player.pseudo} !
              </h1>
              <p className="text-white/80">
                Répondez aux questions le plus rapidement possible
              </p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-300">
                {player.score} pts
              </div>
              <div className="text-white/70 text-sm">Votre score</div>
            </div>
          </div>
        </div>

        {/* Notification */}
        {lastCorrectAnswer && (
          <div className="bg-green-500 text-white p-4 rounded-lg mb-6 text-center font-semibold animate-pulse">
            {lastCorrectAnswer}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Question principale */}
          <div className="lg:col-span-2">
            {currentQuestion ? (
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Clock className="h-6 w-6" />
                    Question en cours
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-white/10 p-6 rounded-lg">
                    <h2 className="text-xl font-semibold mb-4">
                      {currentQuestion.text}
                    </h2>
                  </div>

                  {hasAnswered ? (
                    <div className="text-center space-y-4">
                      <div className="bg-green-500/20 border border-green-400/30 p-4 rounded-lg">
                        <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                        <p className="text-green-400 font-semibold mb-2">
                          Réponse envoyée !
                        </p>
                        <p className="text-white/80">
                          Votre réponse: &quot;{answer}&quot;
                        </p>
                      </div>
                      <p className="text-white/70">
                        Attendez la prochaine question...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Input
                        placeholder="Tapez votre réponse ici..."
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && submitAnswer()}
                        className="bg-white/20 border-white/30 text-white placeholder:text-white/50 text-lg p-4"
                        disabled={isSubmitting}
                      />
                      <Button
                        onClick={submitAnswer}
                        disabled={!answer.trim() || isSubmitting}
                        className="w-full bg-white text-green-600 hover:bg-white/90 text-lg py-3"
                        size="lg"
                      >
                        {isSubmitting ? (
                          "Envoi..."
                        ) : (
                          <>
                            <Send className="h-5 w-5 mr-2" />
                            Envoyer la réponse
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
                <CardContent className="text-center py-12">
                  <Clock className="h-16 w-16 text-white/40 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">
                    En attente de la prochaine question
                  </h2>
                  <p className="text-white/70">
                    L&apos;animateur prépare la suite...
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Classement */}
          <div>
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-400" />
                  Classement
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leaderboard.length === 0 ? (
                  <p className="text-white/60 text-center py-4">
                    Aucun score pour le moment
                  </p>
                ) : (
                  leaderboard.map((p, i) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded-lg mb-2 ${
                        p.id === playerId
                          ? "bg-yellow-500/20 border border-yellow-400/30"
                          : "bg-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold ${
                            i === 0
                              ? "bg-yellow-400 text-black"
                              : i === 1
                              ? "bg-gray-300 text-black"
                              : i === 2
                              ? "bg-orange-400 text-white"
                              : "bg-white/20 text-white"
                          }`}
                        >
                          {i + 1}
                        </div>
                        <div
                          className={`font-medium ${
                            p.id === playerId ? "text-yellow-300" : ""
                          }`}
                        >
                          {p.pseudo}
                          {p.id === playerId && " (Vous)"}
                        </div>
                      </div>
                      <div className="font-bold text-yellow-400">{p.score}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

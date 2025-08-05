"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase, Room, Player, Question, Answer } from "@/lib/supabase";
import { Users, Send, CheckCircle, Clock, Trophy, Copy } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";

type Props = {
  initialRoom: Room;
  roomId: string;
};

export default function HostClient({ initialRoom, roomId }: Props) {
  const [room, setRoom] = useState<Room | null>(initialRoom);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [questionText, setQuestionText] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [jsonQuestions, setJsonQuestions] = useState<
    { text: string; answer: string }[]
  >([]);
  const [isGameEnded, setIsGameEnded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/questions.json")
      .then((res) => res.json())
      .then((data) => setJsonQuestions(data))
      .catch((err) => console.error("Erreur chargement JSON", err));
  }, []);

  const removeQuestionFromList = (text: string) => {
    setJsonQuestions((prev) => prev.filter((q) => q.text !== text));
  };

  // Fonction pour afficher un message
  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 2000);
  };

  useEffect(() => {
    supabase.realtime.connect();
  }, []);

  const loadAnswersForQuestion = useCallback(async (questionId: string) => {
    try {
      const { data, error } = await supabase
        .from("answers")
        .select("*, player:players(*)")
        .eq("question_id", questionId)
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      setAnswers(data || []);
    } catch (error) {
      console.error("Erreur chargement réponses", error);
      setAnswers([]);
    }
  }, []);

  const loadRoomData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        { data: roomData },
        { data: playersData },
        { data: questionData, error: questionError },
      ] = await Promise.all([
        supabase.from("rooms").select("*").eq("id", roomId).single(),
        supabase
          .from("players")
          .select("*")
          .eq("room_id", roomId)
          .order("score", { ascending: false }),
        supabase
          .from("questions")
          .select("*")
          .eq("room_id", roomId)
          .eq("is_active", true)
          .single(),
      ]);

      setRoom(roomData || null);
      setPlayers(playersData || []);

      if (questionError) {
        setCurrentQuestion(null);
        setAnswers([]);
      } else {
        setCurrentQuestion(questionData);
        if (questionData) {
          await loadAnswersForQuestion(questionData.id);
        }
      }
    } catch (error) {
      console.error("Erreur chargement salle", error);
    } finally {
      setIsLoading(false);
    }
  }, [roomId, loadAnswersForQuestion]);

  useEffect(() => {
    loadRoomData();
  }, [loadRoomData]);

  useEffect(() => {
    if (!roomId) return;

    const playersChannel = supabase
      .channel(`players-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${roomId}`,
        },
        (payload: any) => {
          supabase
            .from("players")
            .select("*")
            .eq("room_id", roomId)
            .order("score", { ascending: false })
            .then(({ data }) => {
              if (data) setPlayers(data);
            });
        }
      )
      .subscribe();

    const answersChannel = supabase
      .channel(`answers-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers" },
        async (payload: any) => {
          if (currentQuestion) {
            const answerQuestionId =
              payload.new?.question_id || payload.old?.question_id;
            if (answerQuestionId === currentQuestion.id) {
              await loadAnswersForQuestion(currentQuestion.id);
            }
          }
        }
      )
      .subscribe();

    const questionsChannel = supabase
      .channel(`questions-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "questions",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload: any) => {
          if (payload.eventType === "INSERT" && payload.new?.is_active) {
            setCurrentQuestion(payload.new);
            setAnswers([]);
          } else if (
            payload.eventType === "UPDATE" &&
            !payload.new?.is_active
          ) {
            if (currentQuestion?.id === payload.new?.id) {
              setCurrentQuestion(null);
              setAnswers([]);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(answersChannel);
      supabase.removeChannel(questionsChannel);
    };
  }, [roomId, loadAnswersForQuestion, currentQuestion]);

  const sendQuestion = async () => {
    if (!questionText.trim()) {
      showNotification("Veuillez saisir une question");
      return;
    }
    try {
      if (currentQuestion) {
        await supabase
          .from("questions")
          .update({ is_active: false })
          .eq("id", currentQuestion.id);
      }

      const { data, error } = await supabase
        .from("questions")
        .insert({
          room_id: roomId,
          text: questionText.trim(),
          correct_answer: correctAnswer.trim(),
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      removeQuestionFromList(questionText);
      setCurrentQuestion(data);
      setAnswers([]);
      setQuestionText("");
      setCorrectAnswer("");
      showNotification("Question envoyée !");
    } catch (error) {
      console.error("Erreur lors de l'envoi de la question:", error);
      showNotification("Erreur lors de l'envoi de la question");
    }
  };

  const endGame = async () => {
    if (!roomId) return;

    try {
      // Suppression des réponses
      await supabase.from("answers").delete().eq("room_id", roomId);

      // Suppression des questions
      await supabase.from("questions").delete().eq("room_id", roomId);

      // Suppression des joueurs
      await supabase.from("players").delete().eq("room_id", roomId);

      // (Optionnel) Suppression de la salle
      await supabase.from("rooms").delete().eq("id", roomId);

      setRoom(null);
      setPlayers([]);
      setCurrentQuestion(null);
      setAnswers([]);
      showNotification("🎮 Partie terminée et données supprimées !");
      setIsGameEnded(true);
    } catch (error) {
      console.error("Erreur lors de la suppression :", error);
      showNotification("⚠️ Impossible de terminer la partie.");
    }
  };

  const markAnswerCorrect = async (answer: Answer) => {
    try {
      const { error: answerError } = await supabase
        .from("answers")
        .update({ is_correct: true })
        .eq("id", answer.id);

      if (answerError) throw answerError;

      const { error: playerError } = await supabase
        .from("players")
        .update({ score: (answer.player?.score || 0) + 1 })
        .eq("id", answer.player_id);

      if (playerError) throw playerError;

      await loadRoomData();
      showNotification(
        `🎉 ${answer.player?.pseudo} a donné la bonne réponse !`
      );
    } catch (error) {
      console.error("Erreur mise à jour score", error);
      showNotification("Erreur mise à jour score");
    }
  };

  const copyRoomCode = () => {
    if (room?.code) {
      navigator.clipboard.writeText(room.code);
      showNotification("Code copié dans le presse-papier !");
    }
  };

  const updatePlayerScore = async (playerId: string, amount: number) => {
    try {
      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("score")
        .eq("id", playerId)
        .single();

      if (playerError) throw playerError;

      const newScore = (playerData?.score || 0) + amount;

      const { error: updateError } = await supabase
        .from("players")
        .update({ score: newScore })
        .eq("id", playerId);

      if (updateError) throw updateError;

      setPlayers((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, score: newScore } : p))
      );
      showNotification("Score mis à jour !");
    } catch (error) {
      console.error("Erreur mise à jour score manuel:", error);
      showNotification("Impossible de modifier le score.");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Interface Animateur
            </h1>
            <p className="text-white/80">Gérez votre partie en temps réel</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{room?.code}</div>
              <div className="text-white/70 text-sm">Code de la salle</div>
            </div>
            <Button
              onClick={copyRoomCode}
              variant="secondary"
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white border-white/30"
            >
              <Copy className="h-4 w-4 mr-1" />
              Copier
            </Button>
            <Button
              onClick={endGame}
              variant="destructive"
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white border-white/30"
            >
              🛑 Terminer la partie
            </Button>
          </div>
        </div>
        {notification && (
          <div className="bg-green-500 text-white p-4 rounded-lg mb-4 text-center font-semibold animate-pulse">
            {notification}
          </div>
        )}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Nouvelle Question
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  onValueChange={(val) => {
                    const selected = jsonQuestions.find((q) => q.text === val);
                    if (selected) {
                      setQuestionText(selected.text);
                      setCorrectAnswer(selected.answer);
                    }
                  }}
                >
                  <SelectTrigger className="bg-white/20 border-white/30 text-white">
                    <SelectValue placeholder="Choisissez une question" />
                  </SelectTrigger>
                  <SelectContent>
                    {jsonQuestions.map((q, idx) => (
                      <SelectItem key={idx} value={q.text}>
                        {q.text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={sendQuestion}
                  className="w-full bg-white text-orange-600 hover:bg-white/90"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Envoyer la Question
                </Button>
              </CardContent>
            </Card>

            {currentQuestion && (
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Question en cours
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-white/10 p-4 rounded-lg">
                    <h3 className="font-semibold text-lg mb-2">
                      {currentQuestion.text}
                    </h3>
                    {currentQuestion.correct_answer && (
                      <p className="text-green-300 text-sm">
                        Réponse attendue: {currentQuestion.correct_answer}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium text-white/90">
                      Réponses reçues ({answers.length})
                    </h4>
                    {answers.length === 0 ? (
                      <p className="text-white/60 text-center py-4">
                        En attente des réponses...
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {answers.map((answer) => (
                          <div
                            key={answer.id}
                            className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                              answer.is_correct
                                ? "bg-green-500/20 border border-green-400/30"
                                : "bg-white/10 hover:bg-white/15"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="font-medium">
                                {answer.player?.pseudo}
                              </div>
                              <div className="text-white/80">
                                &quot;{answer.text}&quot;
                              </div>
                              <div className="text-xs text-white/60 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {answer.response_time}ms
                              </div>
                            </div>
                            {!answer.is_correct ? (
                              <Button
                                onClick={() => markAnswerCorrect(answer)}
                                size="sm"
                                className="bg-green-500 hover:bg-green-600 text-white"
                              >
                                ✓ Correct
                              </Button>
                            ) : (
                              <Badge className="bg-green-500">
                                🎉 Correct !
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
            {isGameEnded && (
              <Button onClick={() => router.push("/")}>
                Revenir au menu
              </Button>
            )}
          </div>

          <div className="space-y-6">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Joueurs ({players.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {players.length === 0 ? (
                  <p className="text-white/60 text-center py-4">
                    Aucun joueur connecté
                  </p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {players.map((player, index) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-3 bg-white/10 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-full text-sm font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium">{player.pseudo}</div>
                            <div className="text-xs text-white/60">
                              {player.is_connected ? "En ligne" : "Hors ligne"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="bg-green-500 hover:bg-green-600 text-white px-2"
                            onClick={() => updatePlayerScore(player.id, 1)}
                          >
                            +1
                          </Button>
                          <Button
                            size="sm"
                            className="bg-red-500 hover:bg-red-600 text-white px-2"
                            onClick={() => updatePlayerScore(player.id, -1)}
                          >
                            -1
                          </Button>
                          <Trophy className="h-4 w-4 text-yellow-400" />
                          <span className="font-bold text-yellow-400">
                            {player.score}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

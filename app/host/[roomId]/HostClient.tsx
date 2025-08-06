"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase, Room, Player, Answer } from "@/lib/supabase";
import {
  Users,
  Send,
  CheckCircle,
  Clock,
  Trophy,
  Copy,
  Upload,
  Trash2,
  RefreshCw,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  initialRoom: Room;
  roomId: string;
};

export default function HostClient({ initialRoom, roomId }: Props) {
  const [room, setRoom] = useState<Room | null>(initialRoom);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<{
    text: string;
    answer: string;
  } | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [jsonQuestions, setJsonQuestions] = useState<
    { text: string; answer: string }[]
  >([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [isGameEnded, setIsGameEnded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [manualQuestion, setManualQuestion] = useState({
    text: "",
    answer: "",
  });
  const [showManualDialog, setShowManualDialog] = useState(false);
  const router = useRouter();

  /** Load questions from Supabase Storage */
  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      const { data } = supabase.storage
        .from("questions")
        .getPublicUrl(`questions-${roomId}.json`);
      const url = data?.publicUrl;

      if (url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch questions");

        let json = await res.json();

        // Handle different JSON structures
        if (!Array.isArray(json) && Array.isArray(json.questions)) {
          json = json.questions;
        }

        // Validate question structure
        const validQuestions = Array.isArray(json)
          ? json.filter(
              (q) =>
                q.text &&
                q.answer &&
                typeof q.text === "string" &&
                typeof q.answer === "string"
            )
          : [];

        setJsonQuestions(validQuestions);
        if (validQuestions.length !== json.length) {
          showNotification(
            "⚠️ Certaines questions ont été ignorées (format invalide)"
          );
        }
      }
    } catch (error) {
      console.error("Error loading questions:", error);
      setJsonQuestions([]);
      showNotification("⚠️ Erreur lors du chargement des questions");
    } finally {
      setIsLoading(false);
    }
  };

  /** Upload file to Storage with validation */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];

    // Validate file type and size
    if (!file.name.endsWith(".json")) {
      showNotification("⚠️ Seuls les fichiers JSON sont acceptés");
      return;
    }

    if (file.size > 1024 * 1024) {
      // 1MB limit
      showNotification("⚠️ Le fichier est trop volumineux (max 1MB)");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.storage
        .from("questions")
        .upload(`questions-${roomId}.json`, file, { upsert: true });

      if (!error) {
        showNotification("✅ Questions importées avec succès !");
        await loadQuestions();
      } else {
        throw error;
      }
    } catch (error) {
      console.error("Upload error:", error);
      showNotification("⚠️ Erreur lors de l'import");
    } finally {
      setIsLoading(false);
    }
  };

  /** Delete file from Storage */
  const deleteFile = async () => {
    if (
      !window.confirm(
        "Êtes-vous sûr de vouloir supprimer le fichier de questions ?"
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.storage
        .from("questions")
        .remove([`questions-${roomId}.json`]);

      if (!error) {
        showNotification("🗑️ Fichier supprimé !");
        setJsonQuestions([]);
      } else {
        throw error;
      }
    } catch (error) {
      console.error("Delete error:", error);
      showNotification("⚠️ Erreur lors de la suppression");
    } finally {
      setIsLoading(false);
    }
  };

  /** Load room and players data */
  const loadRoomData = useCallback(async () => {
    try {
      const [
        { data: roomData, error: roomError },
        { data: playersData, error: playersError },
      ] = await Promise.all([
        supabase.from("rooms").select("*").eq("id", roomId).single(),
        supabase
          .from("players")
          .select("*")
          .eq("room_id", roomId)
          .order("score", { ascending: false }),
      ]);

      if (roomError && roomError.code !== "PGRST116") {
        console.error("Room error:", roomError);
      }
      if (playersError) {
        console.error("Players error:", playersError);
      }

      setRoom(roomData || null);
      setPlayers(playersData || []);
    } catch (error) {
      console.error("Error loading room data:", error);
    }
  }, [roomId]);

  /** Load answers for current question */
  const loadAnswersForQuestion = async () => {
    try {
      // Récupérer d'abord la question active
      const { data: activeQuestion, error: questionError } = await supabase
        .from("questions")
        .select("id")
        .eq("room_id", roomId)
        .eq("is_active", true)
        .single();

      if (questionError || !activeQuestion) {
        setAnswers([]);
        return;
      }

      // Puis charger les réponses liées à cette question active
      const { data, error } = await supabase
        .from("answers")
        .select("*, player:players(*)")
        .eq("room_id", roomId)
        .eq("question_id", activeQuestion.id)
        .order("submitted_at", { ascending: true });

      if (error) throw error;

      setAnswers(data ?? []);
    } catch (err) {
      console.error("Erreur chargement réponses:", err);
      showNotification("⚠️ Erreur lors du chargement des réponses");
    }
  };

  /** Send question from JSON or manual input */
  const sendQuestion = async (questionData?: {
    text: string;
    answer: string;
  }) => {
    const questionToSend = questionData || currentQuestion;

    if (
      !questionToSend ||
      !questionToSend.text.trim() ||
      !questionToSend.answer.trim()
    ) {
      showNotification("⚠️ Veuillez saisir une question et une réponse");
      return;
    }

    setIsLoading(true);
    try {
      // Disable previous active question
      await supabase
        .from("questions")
        .update({ is_active: false })
        .eq("room_id", roomId)
        .eq("is_active", true);

      // Insert new active question
      const { data, error } = await supabase
        .from("questions")
        .insert({
          room_id: roomId,
          text: questionToSend.text.trim(),
          correct_answer: questionToSend.answer.trim(),
          is_active: true,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error("Failed to insert question");
      }

      // Clear existing answers
      await supabase.from("answers").delete().eq("room_id", roomId);
      setAnswers([]);

      // Update current question
      setCurrentQuestion({
        text: data.text,
        answer: data.correct_answer,
      });

      showNotification("✅ Question envoyée !");

      if (questionData) {
        setManualQuestion({ text: "", answer: "" });
        setShowManualDialog(false);
      }
    } catch (error) {
      console.error("Send question error:", error);
      showNotification("⚠️ Erreur lors de l'envoi de la question");
    } finally {
      setIsLoading(false);
    }
  };

  /** Send manual question */
  const sendManualQuestion = () => {
    if (!manualQuestion.text.trim() || !manualQuestion.answer.trim()) {
      showNotification("⚠️ Veuillez saisir une question et une réponse");
      return;
    }
    sendQuestion(manualQuestion);
  };

  /** End game with confirmation */
  const endGame = async () => {
    if (
      !window.confirm(
        "Êtes-vous sûr de vouloir terminer la partie ? Cette action est irréversible."
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      // Clean up in order
      await Promise.all([
        supabase.from("answers").delete().eq("room_id", roomId),
        supabase.from("questions").delete().eq("room_id", roomId),
        supabase.from("players").delete().eq("room_id", roomId),
      ]);

      await supabase.from("rooms").delete().eq("id", roomId);
      await deleteFile();

      setRoom(null);
      setPlayers([]);
      setCurrentQuestion(null);
      setAnswers([]);
      setIsGameEnded(true);
      showNotification("🎮 Partie terminée !");
    } catch (error) {
      console.error("End game error:", error);
      showNotification("⚠️ Erreur lors de la fin de partie");
    } finally {
      setIsLoading(false);
    }
  };

  /** Mark answer as correct */
  const markAnswerCorrect = async (answer: Answer) => {
    if (answer.is_correct) return; // Already marked correct

    setIsLoading(true);
    try {
      await Promise.all([
        supabase
          .from("answers")
          .update({ is_correct: true })
          .eq("id", answer.id),
        supabase
          .from("players")
          .update({
            score: (answer.player?.score || 0) + 1,
          })
          .eq("id", answer.player_id),
      ]);

      await Promise.all([loadAnswersForQuestion(), loadRoomData()]);
      showNotification(
        `🎉 ${answer.player?.pseudo} a donné la bonne réponse !`
      );
    } catch (error) {
      console.error("Mark correct error:", error);
      showNotification("⚠️ Erreur lors de la validation");
    } finally {
      setIsLoading(false);
    }
  };

  /** Copy room code */
  const copyRoomCode = async () => {
    if (!room?.code) return;

    try {
      await navigator.clipboard.writeText(room.code);
      showNotification("📋 Code copié !");
    } catch (error) {
      console.error("Copy error:", error);
      showNotification("⚠️ Erreur lors de la copie");
    }
  };

  /** Update player score */
  const updatePlayerScore = async (playerId: string, amount: number) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;

    const newScore = Math.max(0, player.score + amount); // Prevent negative scores

    setIsLoading(true);
    try {
      await supabase
        .from("players")
        .update({ score: newScore })
        .eq("id", playerId);

      setPlayers((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, score: newScore } : p))
      );
      showNotification(`📊 Score de ${player.pseudo} mis à jour !`);
    } catch (error) {
      console.error("Update score error:", error);
      showNotification("⚠️ Erreur lors de la mise à jour du score");
    } finally {
      setIsLoading(false);
    }
  };

  /** Show notification */
  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  /** Setup real-time subscriptions */
  useEffect(() => {
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${roomId}`,
        },
        () => loadRoomData()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "answers",
          filter: `room_id=eq.${roomId}`,
        },
        () => loadAnswersForQuestion()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadRoomData]);

  /** Initialize */
  useEffect(() => {
    loadQuestions();
    loadRoomData();
  }, [loadRoomData]);

  if (isGameEnded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center p-4">
        <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white text-center p-8">
          <h1 className="text-3xl font-bold mb-4">🎮 Partie Terminée</h1>
          <p className="text-white/80 mb-6">
            La partie s&apos;est terminée avec succès !
          </p>
          <Button
            onClick={() => router.push("/")}
            className="bg-white text-orange-600 hover:bg-white/90"
          >
            Revenir au menu principal
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              🎯 Interface Animateur
            </h1>
            <p className="text-white/80">Gérez votre partie en temps réel</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white bg-white/20 px-4 py-2 rounded-lg">
                {room?.code}
              </div>
              <div className="text-white/70 text-sm mt-1">Code de la salle</div>
            </div>
            <Button
              onClick={copyRoomCode}
              variant="secondary"
              size="sm"
              disabled={!room?.code || isLoading}
              className="bg-white/20 hover:bg-white/30 text-white border-white/30"
            >
              <Copy className="h-4 w-4 mr-1" /> Copier
            </Button>
            <Button
              onClick={endGame}
              variant="destructive"
              size="sm"
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              🛑 Terminer
            </Button>
          </div>
        </div>

        {/* Notification */}
        {notification && (
          <div className="bg-green-500/90 backdrop-blur-sm text-white p-4 rounded-lg mb-4 text-center font-semibold animate-pulse">
            {notification}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Questions Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Question Management */}
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" /> Gestion des Questions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Upload */}
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      disabled={isLoading}
                      className="bg-white/20 border-white/30 text-white file:bg-white/20 file:text-white file:border-0"
                    />
                  </div>
                  <Button
                    onClick={deleteFile}
                    disabled={isLoading || jsonQuestions.length === 0}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={loadQuestions}
                    disabled={isLoading}
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                {/* Question Selection */}
                <div className="space-y-2">
                  <Label className="text-white/90">
                    Questions disponibles ({jsonQuestions.length})
                  </Label>
                  <Select
                    disabled={isLoading || jsonQuestions.length === 0}
                    onValueChange={(val) => {
                      const selected = jsonQuestions.find(
                        (q) => q.text === val
                      );
                      setCurrentQuestion(
                        selected
                          ? { text: selected.text, answer: selected.answer }
                          : null
                      );
                    }}
                  >
                    <SelectTrigger className="bg-white/20 border-white/30 text-white">
                      <SelectValue
                        placeholder={
                          jsonQuestions.length === 0
                            ? "Aucune question disponible"
                            : "Choisissez une question"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {jsonQuestions.map((q, idx) => (
                        <SelectItem key={idx} value={q.text}>
                          {q.text.length > 80
                            ? `${q.text.substring(0, 80)}...`
                            : q.text}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => sendQuestion()}
                    disabled={!currentQuestion || isLoading}
                    className="flex-1 bg-white text-orange-600 hover:bg-white/90"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {isLoading ? "Envoi..." : "Envoyer la question"}
                  </Button>

                  <Dialog
                    open={showManualDialog}
                    onOpenChange={setShowManualDialog}
                  >
                    <DialogTrigger asChild>
                      <Button
                        disabled={isLoading}
                        className="bg-purple-500 hover:bg-purple-600 text-white"
                      >
                        Saisie manuelle
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-gray-800 text-white border-gray-600">
                      <DialogHeader>
                        <DialogTitle>Créer une question</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Question</Label>
                          <Textarea
                            value={manualQuestion.text}
                            onChange={(e) =>
                              setManualQuestion((prev) => ({
                                ...prev,
                                text: e.target.value,
                              }))
                            }
                            placeholder="Saisissez votre question..."
                            className="bg-gray-700 border-gray-600 text-white"
                          />
                        </div>
                        <div>
                          <Label>Réponse attendue</Label>
                          <Input
                            value={manualQuestion.answer}
                            onChange={(e) =>
                              setManualQuestion((prev) => ({
                                ...prev,
                                answer: e.target.value,
                              }))
                            }
                            placeholder="Réponse correcte..."
                            className="bg-gray-700 border-gray-600 text-white"
                          />
                        </div>
                        <Button
                          onClick={sendManualQuestion}
                          disabled={
                            !manualQuestion.text.trim() ||
                            !manualQuestion.answer.trim() ||
                            isLoading
                          }
                          className="w-full bg-green-500 hover:bg-green-600"
                        >
                          Envoyer cette question
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>

            {/* Current Question & Answers */}
            {currentQuestion && (
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" /> Question en cours
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-white/10 p-4 rounded-lg">
                    <h3 className="font-semibold text-lg mb-2">
                      {currentQuestion.text}
                    </h3>
                    <p className="text-green-300 text-sm">
                      Réponse attendue:{" "}
                      <span className="font-mono bg-green-500/20 px-2 py-1 rounded">
                        {currentQuestion.answer}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-white/90">
                        Réponses reçues ({answers.length})
                      </h4>
                      <Button
                        onClick={loadAnswersForQuestion}
                        size="sm"
                        disabled={isLoading}
                        className="bg-white/20 hover:bg-white/30 text-white"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>

                    {answers.length === 0 ? (
                      <p className="text-white/60 text-center py-8 bg-white/5 rounded-lg">
                        ⏳ En attente des réponses des joueurs...
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {answers.map((answer) => (
                          <div
                            key={answer.id}
                            className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                              answer.is_correct
                                ? "bg-green-500/20 border-l-4 border-green-400"
                                : "bg-white/10 hover:bg-white/15"
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <div className="font-medium text-white">
                                {answer.player?.pseudo}
                              </div>
                              <div className="text-white/80 flex-1">
                                &quot;<em>{answer.text}</em>&quot;
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
                                disabled={isLoading}
                                className="bg-green-500 hover:bg-green-600 text-white ml-2"
                              >
                                ✓ Correct
                              </Button>
                            ) : (
                              <Badge className="bg-green-500 ml-2">
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
          </div>

          {/* Players Section */}
          <div className="space-y-6">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Joueurs ({players.length})
                  </div>
                  <Button
                    onClick={loadRoomData}
                    size="sm"
                    disabled={isLoading}
                    className="bg-white/20 hover:bg-white/30 text-white"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {players.length === 0 ? (
                  <div className="text-center py-8 text-white/60">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Aucun joueur connecté</p>
                    <p className="text-sm mt-1">
                      Partagez le code: <strong>{room?.code}</strong>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {players.map((player, index) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-3 bg-white/10 rounded-lg hover:bg-white/15 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              index === 0
                                ? "bg-yellow-500"
                                : index === 1
                                ? "bg-gray-400"
                                : index === 2
                                ? "bg-yellow-600"
                                : "bg-white/20"
                            }`}
                          >
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium">{player.pseudo}</div>
                            <div className="text-xs text-white/60 flex items-center gap-1">
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  player.is_connected
                                    ? "bg-green-400"
                                    : "bg-red-400"
                                }`}
                              />
                              {player.is_connected ? "En ligne" : "Hors ligne"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              disabled={isLoading}
                              className="bg-green-500 hover:bg-green-600 text-white px-2 h-8"
                              onClick={() => updatePlayerScore(player.id, 1)}
                            >
                              +1
                            </Button>
                            <Button
                              size="sm"
                              disabled={isLoading || player.score <= 0}
                              className="bg-red-500 hover:bg-red-600 text-white px-2 h-8"
                              onClick={() => updatePlayerScore(player.id, -1)}
                            >
                              -1
                            </Button>
                          </div>
                          <div className="flex items-center gap-1 min-w-[40px]">
                            <Trophy className="h-4 w-4 text-yellow-400" />
                            <span className="font-bold text-yellow-400">
                              {player.score}
                            </span>
                          </div>
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

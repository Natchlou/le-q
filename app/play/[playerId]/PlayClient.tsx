"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase, Player, Question } from "@/lib/supabase";
import {
  Send,
  Trophy,
  Clock,
  CheckCircle,
  Wifi,
  WifiOff,
  Users,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
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
  const [isConnected, setIsConnected] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [notification, setNotification] = useState<string | null>(null);

  const router = useRouter();
  const playerRoomIdRef = useRef<string | null>(null);
  const answerInputRef = useRef<HTMLInputElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Show notification helper
  const showNotification = (message: string, duration = 3000) => {
    setNotification(message);
    setTimeout(() => setNotification(null), duration);
  };

  // Update connection status
  const updateConnectionStatus = async (connected: boolean) => {
    if (!player || !playerRoomIdRef.current) return;

    try {
      await supabase
        .from("players")
        .update({ is_connected: connected })
        .eq("id", playerId);
      setIsConnected(connected);
    } catch (error) {
      console.error("Error updating connection status:", error);
    }
  };

  // Load player data with error handling
  const loadPlayerData = useCallback(async () => {
    if (!playerId) {
      setConnectionError("ID joueur manquant");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setConnectionError(null);

    try {
      // Load player data
      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("*")
        .eq("id", playerId)
        .single();

      if (playerError || !playerData) {
        throw new Error("Joueur introuvable ou session expirée");
      }

      setPlayer(playerData);
      playerRoomIdRef.current = playerData.room_id;

      // Update connection status
      await updateConnectionStatus(true);

      // Load active question
      const { data: questionData, error: questionError } = await supabase
        .from("questions")
        .select("*")
        .eq("room_id", playerData.room_id)
        .eq("is_active", true)
        .single();

      if (questionError) {
        // No active question is not an error
        setCurrentQuestion(null);
        setHasAnswered(false);
        setAnswer("");
        setResponseTime(null);
      } else {
        setCurrentQuestion(questionData);
        setQuestionStartTime(Date.now());

        // Check if player already answered this question
        const { data: existingAnswer, error: answerError } = await supabase
          .from("answers")
          .select("*")
          .eq("player_id", playerId)
          .eq("question_id", questionData.id)
          .single();

        if (!answerError && existingAnswer) {
          setHasAnswered(true);
          setAnswer(existingAnswer.text || "");
          setResponseTime(existingAnswer.response_time);
        } else {
          setHasAnswered(false);
          setAnswer("");
          setResponseTime(null);
        }
      }

      // Load leaderboard and total players
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", playerData.room_id)
        .order("score", { ascending: false });

      if (!playersError && playersData) {
        setLeaderboard(playersData.slice(0, 10)); // Top 10
        setTotalPlayers(playersData.length);
      }
    } catch (error) {
      console.error("Error loading player data:", error);
      setConnectionError(
        error instanceof Error ? error.message : "Erreur de connexion"
      );
    } finally {
      setIsLoading(false);
    }
  }, [playerId]);

  // Setup real-time subscriptions
  useEffect(() => {
    if (!playerRoomIdRef.current) return;

    const roomId = playerRoomIdRef.current;

    // Questions subscription
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
          try {
            if (payload.eventType === "INSERT" && payload.new?.is_active) {
              setCurrentQuestion(payload.new);
              setQuestionStartTime(Date.now());
              setHasAnswered(false);
              setAnswer("");
              setResponseTime(null);
              showNotification("📝 Nouvelle question !");
              // Focus input field
              setTimeout(() => answerInputRef.current?.focus(), 100);
            } else if (payload.eventType === "UPDATE") {
              if (payload.new?.is_active) {
                setCurrentQuestion(payload.new);
                setQuestionStartTime(Date.now());
                setHasAnswered(false);
                setAnswer("");
                setResponseTime(null);
                showNotification("📝 Nouvelle question !");
                setTimeout(() => answerInputRef.current?.focus(), 100);
              } else if (currentQuestion?.id === payload.new?.id) {
                setCurrentQuestion(null);
                setHasAnswered(false);
                setAnswer("");
                setResponseTime(null);
              }
            }
          } catch (error) {
            console.error("Error handling question update:", error);
          }
        }
      )
      .subscribe();

    // Players subscription (scores and connection status)
    const playersChannel = supabase
      .channel(`players-${roomId}-${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          try {
            const { data: playersData, error } = await supabase
              .from("players")
              .select("*")
              .eq("room_id", roomId)
              .order("score", { ascending: false });

            if (!error && playersData) {
              setLeaderboard(playersData.slice(0, 10));
              setTotalPlayers(playersData.length);

              const updatedPlayer = playersData.find((p) => p.id === playerId);
              if (updatedPlayer && updatedPlayer.score > (player?.score || 0)) {
                showNotification("🎉 Vous avez gagné des points !");
                setPlayer(updatedPlayer);
              } else if (updatedPlayer) {
                setPlayer(updatedPlayer);
              }
            }
          } catch (error) {
            console.error("Error updating players:", error);
          }
        }
      )
      .subscribe();

    // Answers subscription (correct answer notifications)
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
          try {
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
                const isCurrentPlayer = payload.new.player_id === playerId;
                const message = isCurrentPlayer
                  ? "🎉 Bonne réponse ! Vous avez gagné un point !"
                  : `🏆 ${winnerData.pseudo} a trouvé la bonne réponse !`;
                setLastCorrectAnswer(message);
                setTimeout(() => setLastCorrectAnswer(null), 5000);
              }
            }
          } catch (error) {
            console.error("Error handling answer update:", error);
          }
        }
      )
      .subscribe();

    // Room deletion subscription (game ended)
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
          showNotification("🎮 La partie est terminée", 5000);
        }
      )
      .subscribe();

    // Connection status monitoring
    const handleConnectionChange = (event: string, payload?: any) => {
      if (event === "SUBSCRIBED") {
        setIsConnected(true);
        setConnectionError(null);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      } else if (event === "CHANNEL_ERROR" || event === "TIMED_OUT") {
        setIsConnected(false);
        setConnectionError("Connexion interrompue");

        // Attempt to reconnect after delay
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            loadPlayerData();
          }, 3000);
        }
      }
    };

    questionsChannel.on("system", {}, (payload) =>
      handleConnectionChange(payload.type)
    );

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      supabase.removeChannel(questionsChannel);
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(answersChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [playerId, currentQuestion, player?.score]);

  // Initialize and cleanup
  useEffect(() => {
    loadPlayerData();

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateConnectionStatus(true);
        loadPlayerData(); // Refresh data when tab becomes visible
      } else {
        updateConnectionStatus(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Handle beforeunload
    const handleBeforeUnload = () => {
      updateConnectionStatus(false);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      updateConnectionStatus(false);
    };
  }, [loadPlayerData]);

  // Submit answer with enhanced error handling
  const submitAnswer = async () => {
    if (!answer.trim() || !currentQuestion || hasAnswered || isSubmitting)
      return;

    setIsSubmitting(true);

    try {
      const responseTimeMs = Date.now() - questionStartTime;
      setResponseTime(responseTimeMs);

      const { error } = await supabase.from("answers").insert({
        player_id: playerId,
        question_id: currentQuestion.id,
        room_id: playerRoomIdRef.current,
        text: answer.trim(),
        response_time: responseTimeMs,
        is_correct: false,
      });

      if (error) throw error;

      setHasAnswered(true);
      showNotification("✅ Réponse envoyée !");
    } catch (error) {
      console.error("Error submitting answer:", error);
      showNotification("❌ Erreur lors de l'envoi. Réessayez !", 4000);
      setResponseTime(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Retry connection
  const retryConnection = () => {
    setIsLoading(true);
    loadPlayerData();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center">
        <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white p-8 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <div className="text-xl">Connexion en cours...</div>
        </Card>
      </div>
    );
  }

  // Error state
  if (!player || connectionError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center p-4">
        <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white p-8 text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Erreur de connexion</h1>
          <p className="text-white/80 mb-6">
            {connectionError || "Joueur introuvable"}
          </p>
          <div className="space-y-3">
            <Button
              onClick={retryConnection}
              className="w-full bg-white text-green-600 hover:bg-white/90"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
            <Button
              onClick={() => router.push("/")}
              variant="outline"
              className="w-full border-white/30 text-white hover:bg-white/10"
            >
              Revenir au menu
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Game ended state
  if (isGameEnded) {
    const finalPosition = leaderboard.findIndex((p) => p.id === playerId) + 1;

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center p-4">
        <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white text-center p-8 max-w-md">
          <Trophy className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-2">🎮 Partie terminée !</h1>
          <div className="mb-6 space-y-2">
            <p className="text-xl">
              Score final:{" "}
              <span className="font-bold text-yellow-400">
                {player.score} points
              </span>
            </p>
            {finalPosition > 0 && (
              <p className="text-white/80">
                Position: {finalPosition}ème sur {totalPlayers}
              </p>
            )}
          </div>
          <Button
            onClick={() => router.push("/")}
            className="bg-white text-green-600 hover:bg-white/90"
          >
            Revenir au menu principal
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-white">
                  Salut, {player.pseudo} ! 👋
                </h1>
                <div className="flex items-center gap-1">
                  {isConnected ? (
                    <Wifi className="h-4 w-4 text-green-400" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-400" />
                  )}
                </div>
              </div>
              <p className="text-white/80">
                Répondez aux questions le plus rapidement possible
              </p>
              <div className="flex items-center gap-3 mt-2">
                <Badge variant="secondary" className="bg-white/20 text-white">
                  <Users className="h-3 w-3 mr-1" />
                  {totalPlayers} joueur{totalPlayers > 1 ? "s" : ""}
                </Badge>
                {!isConnected && (
                  <Badge variant="destructive" className="bg-red-500/80">
                    Connexion instable
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-300 bg-yellow-300/20 px-4 py-2 rounded-lg">
                {player.score}
              </div>
              <div className="text-white/70 text-sm mt-1">Points</div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        {notification && (
          <div className="bg-blue-500/90 backdrop-blur-sm text-white p-4 rounded-lg mb-4 text-center font-semibold animate-pulse">
            {notification}
          </div>
        )}

        {lastCorrectAnswer && (
          <div className="bg-green-500/90 backdrop-blur-sm text-white p-4 rounded-lg mb-6 text-center font-semibold animate-pulse">
            {lastCorrectAnswer}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Question Area */}
          <div className="lg:col-span-2">
            {currentQuestion ? (
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xl">
                      <Clock className="h-6 w-6" />
                      Question en cours
                    </div>
                    {responseTime && (
                      <Badge className="bg-blue-500">{responseTime}ms</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-white/10 p-6 rounded-lg border-l-4 border-blue-400">
                    <h2 className="text-xl font-semibold leading-relaxed">
                      {currentQuestion.text}
                    </h2>
                  </div>

                  {hasAnswered ? (
                    <div className="text-center space-y-4">
                      <div className="bg-green-500/20 border border-green-400/30 p-6 rounded-lg">
                        <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                        <p className="text-green-400 font-semibold text-lg mb-2">
                          Réponse envoyée ! ✨
                        </p>
                        <p className="text-white/90 text-lg">
                          &quot;<em>{answer}</em>&quot;
                        </p>
                        {responseTime && (
                          <p className="text-white/70 text-sm mt-2">
                            Temps de réponse: {responseTime}ms
                          </p>
                        )}
                      </div>
                      <p className="text-white/70 text-lg">
                        ⏳ En attente de la prochaine question...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Input
                          ref={answerInputRef}
                          placeholder="Tapez votre réponse ici..."
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          onKeyPress={(e) =>
                            e.key === "Enter" && submitAnswer()
                          }
                          className="bg-white/20 border-white/30 text-white placeholder:text-white/50 text-lg p-4 h-14"
                          disabled={isSubmitting || !isConnected}
                          autoFocus
                        />
                        {!isConnected && (
                          <p className="text-red-400 text-sm">
                            ⚠️ Connexion instable - la réponse pourrait ne pas
                            être envoyée
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={submitAnswer}
                        disabled={
                          !answer.trim() || isSubmitting || !isConnected
                        }
                        className="w-full bg-white text-green-600 hover:bg-white/90 text-lg py-4 h-14"
                        size="lg"
                      >
                        {isSubmitting ? (
                          <div className="flex items-center gap-2">
                            <RefreshCw className="h-5 w-5 animate-spin" />
                            Envoi en cours...
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Send className="h-5 w-5" />
                            Envoyer la réponse
                          </div>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
                <CardContent className="text-center py-16">
                  <Clock className="h-20 w-20 text-white/40 mx-auto mb-6 animate-pulse" />
                  <h2 className="text-2xl font-semibold mb-3">
                    En attente de la prochaine question
                  </h2>
                  <p className="text-white/70 text-lg">
                    L&apos;animateur prépare la suite... 🎯
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Leaderboard */}
          <div>
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-400" />
                    Classement
                  </div>
                  <Badge variant="secondary" className="bg-white/20 text-white">
                    Top 10
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leaderboard.length === 0 ? (
                  <div className="text-center py-8 text-white/60">
                    <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Aucun score pour le moment</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96">
                    {leaderboard.map((p, i) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                          p.id === playerId
                            ? "bg-yellow-500/20 border border-yellow-400/30 scale-105"
                            : "bg-white/10 hover:bg-white/15"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
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
                          <div>
                            <div
                              className={`font-medium ${
                                p.id === playerId ? "text-yellow-300" : ""
                              }`}
                            >
                              {p.pseudo}
                              {p.id === playerId && " 🎯"}
                            </div>
                            <div className="text-xs text-white/60 flex items-center gap-1">
                              {p.is_connected ? (
                                <>
                                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                                  En ligne
                                </>
                              ) : (
                                <>
                                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                                  Hors ligne
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="font-bold text-yellow-400 text-lg">
                          {p.score}
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

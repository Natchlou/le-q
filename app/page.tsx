"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase, generateRoomCode } from "@/lib/supabase";
import { Users, Play, Trophy, Zap } from "lucide-react";

export default function HomePage() {
  const [roomCode, setRoomCode] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const router = useRouter();

  const createRoom = useCallback(async () => {
    setLoading("create");
    try {
      const { data, error } = await supabase
        .from("rooms")
        .insert({
          code: generateRoomCode(),
          name: "Nouvelle partie",
          host_id: crypto.randomUUID(),
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      router.push(`/host/${data.id}`);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la création de la salle");
    } finally {
      setLoading(null);
    }
  }, [router]);

  const joinRoom = useCallback(async () => {
    const code = roomCode.trim().toUpperCase();
    const name = pseudo.trim();
    if (!code || !name) {
      alert("Entrez un code et un pseudo");
      return;
    }

    setLoading("join");
    try {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("id")
        .eq("code", code)
        .eq("is_active", true)
        .single();

      if (roomError || !room) throw new Error("Salle introuvable ou inactive");

      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert({ pseudo: name, room_id: room.id })
        .select()
        .single();

      if (playerError) throw playerError;
      router.push(`/play/${player.id}`);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la connexion");
    } finally {
      setLoading(null);
    }
  }, [roomCode, pseudo, router]);

  const handleRoomCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRoomCode(e.target.value.toUpperCase());
    },
    []
  );

  const handlePseudoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPseudo(e.target.value);
    },
    []
  );

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent, action: () => void) => {
      if (e.key === "Enter") {
        e.preventDefault();
        action();
      }
    },
    []
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-teal-500 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl text-center">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-white/20 p-4 rounded-full backdrop-blur-sm">
              <Zap className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-2">
            QuizTime
          </h1>
          <p className="text-xl text-white/80">
            Jeu de questions/réponses en temps réel
          </p>
        </div>

        {/* Actions */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Animateur */}
          <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/15 transition">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-orange-500/20 rounded-full w-fit">
                <Users className="h-8 w-8 text-orange-300" />
              </div>
              <CardTitle className="text-2xl">Animateur</CardTitle>
              <CardDescription className="text-white/70">
                Créez une nouvelle salle de jeu
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-sm text-white/80 space-y-1">
                <li>• Posez des questions à vos joueurs</li>
                <li>• Gérez les scores en temps réel</li>
                <li>• Suivez les réponses instantanément</li>
              </ul>
              <Button
                onClick={createRoom}
                disabled={loading !== null}
                className="w-full bg-orange-500 hover:bg-orange-500/80 text-white font-semibold py-3 text-lg"
              >
                {loading === "create" ? "Création..." : "Créer une salle"}
              </Button>
            </CardContent>
          </Card>

          {/* Joueur */}
          <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/15 transition">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-3 bg-green-500/20 rounded-full w-fit">
                <Play className="h-8 w-8 text-green-300" />
              </div>
              <CardTitle className="text-2xl">Joueur</CardTitle>
              <CardDescription className="text-white/70">
                Rejoignez une partie existante
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-left">
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    htmlFor="roomCode"
                  >
                    Code de la salle
                  </label>
                  <Input
                    id="roomCode"
                    type="text"
                    placeholder="Ex: ABC123"
                    value={roomCode}
                    onChange={handleRoomCodeChange}
                    onKeyPress={(e) => handleKeyPress(e, joinRoom)}
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/50 focus:bg-white/25"
                    maxLength={6}
                    autoComplete="off"
                    disabled={loading !== null}
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    htmlFor="pseudo"
                  >
                    Votre pseudo
                  </label>
                  <Input
                    id="pseudo"
                    type="text"
                    placeholder="Entrez votre nom"
                    value={pseudo}
                    onChange={handlePseudoChange}
                    onKeyPress={(e) => handleKeyPress(e, joinRoom)}
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/50 focus:bg-white/25"
                    maxLength={20}
                    autoComplete="off"
                    disabled={loading !== null}
                  />
                </div>
              </div>
              <Button
                onClick={joinRoom}
                disabled={
                  loading !== null || !roomCode.trim() || !pseudo.trim()
                }
                className="w-full bg-green-500 hover:bg-green-500/80 text-white font-semibold py-3 text-lg disabled:bg-gray-500/50"
              >
                {loading === "join" ? "Connexion..." : "Rejoindre"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto text-white/80">
          <div className="text-center">
            <div className="h-6 w-6 mx-auto mb-2">
              <Trophy className="h-6 w-6" />
            </div>
            <p className="text-sm">Scores temps réel</p>
          </div>
          <div className="text-center">
            <div className="h-6 w-6 mx-auto mb-2">
              <Zap className="h-6 w-6" />
            </div>
            <p className="text-sm">Réponses instantanées</p>
          </div>
          <div className="text-center">
            <div className="h-6 w-6 mx-auto mb-2">
              <Users className="h-6 w-6" />
            </div>
            <p className="text-sm">Multijoueur</p>
          </div>
        </div>
      </div>
    </div>
  );
}

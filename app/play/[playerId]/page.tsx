import { supabase } from "@/lib/supabase";
import PlayClient from "./PlayClient";
import { notFound } from "next/navigation";

type Props = {
  params: { playerId: string };
};

export async function generateStaticParams() {
  const { data: players, error } = await supabase.from("players").select("id");

  if (error || !players) return [];

  return players.map((p) => ({ playerId: p.id }));
}

export default async function PlayPage({ params }: Props) {
  const { playerId } = params;

  const { data: player, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", playerId)
    .single();

  if (error || !player) notFound();

  return <PlayClient playerId={playerId} />;
}

import { supabase } from "@/lib/supabase";
import HostClient from "./HostClient";
import { notFound } from "next/navigation";

type Props = {
  params: { roomId: string };
};

export async function generateStaticParams() {
  const { data: rooms, error } = await supabase.from("rooms").select("id");

  if (error || !rooms) return [];

  return rooms.map((room) => ({
    roomId: room.id,
  }));
}

export default async function HostPage({ params }: Props) {
  const { roomId } = params;

  const { data: room, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (error || !room) notFound();

  return <HostClient initialRoom={room} roomId={roomId} />;
}

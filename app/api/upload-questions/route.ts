import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // ⚠️ clé admin
);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const roomId = formData.get("roomId") as string;

    if (!file || !roomId) {
      return NextResponse.json(
        { error: "Fichier ou roomId manquant" },
        { status: 400 }
      );
    }

    // Convertir en buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Nom du fichier dans le bucket
    const fileName = `questions-${roomId}.json`;

    // Upload avec service role
    const { error } = await supabase.storage
      .from("questions")
      .upload(fileName, buffer, {
        upsert: true,
        contentType: "application/json",
      });

    if (error) {
      console.error("Erreur Supabase upload:", error.message);
      return NextResponse.json(
        { error: "Erreur lors de l'upload Supabase" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur upload questions:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { roomId } = await req.json();

    if (!roomId) {
      return NextResponse.json({ error: "roomId manquant" }, { status: 400 });
    }

    const fileName = `questions-${roomId}.json`;

    const { error } = await supabase.storage
      .from("questions")
      .remove([fileName]);

    if (error) {
      console.error("Erreur Supabase delete:", error.message);
      return NextResponse.json(
        { error: "Erreur lors de la suppression" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression questions:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression" },
      { status: 500 }
    );
  }
}

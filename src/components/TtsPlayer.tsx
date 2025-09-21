"use client";
import { useRef } from "react";

export default function TtsPlayer({ simplifiedText }: { simplifiedText: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playTTS = async () => {
    const ttsUrl = process.env.NEXT_PUBLIC_TTS_URL + "/speak";
    const res = await fetch(ttsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: simplifiedText }),
    });

    if (!res.ok) {
      alert("TTS error");
      return;
    }

    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play();
    }
  };

  return (
    <div className="mt-2 p-2 bg-gray-100 rounded flex items-center space-x-2">
      <p className="text-sm text-gray-800 flex-1">{simplifiedText}</p>
      <button
        onClick={playTTS}
        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        ▶ Play
      </button>
      <audio ref={audioRef} />
    </div>
  );
}
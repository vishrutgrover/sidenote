"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export type Player = {
  time: number;
  duration: number;
  playing: boolean;
  speed: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (sec: number) => void;
  skip: (delta: number) => void;
  setSpeed: (speed: number) => void;
};

/**
 * Playback state for one meeting. With a media url it drives a real audio element; without one
 * (the uploaded transcripts have no recording) a timer plays the clock instead. Everything else,
 * from the seek bar to the transcript highlight, uses the same `time` either way.
 */
export function usePlayer(durationSec: number, mediaUrl: string | null): Player {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const clock = useRef(0); // the current time while no audio element exists
  const speedRef = useRef(1);
  const duration = mediaUrl && mediaDuration ? mediaDuration : durationSec;

  useEffect(() => {
    if (!mediaUrl) return;
    const a = new Audio(mediaUrl);
    a.preload = "metadata";
    a.playbackRate = speedRef.current;
    a.addEventListener("timeupdate", () => setTime(a.currentTime));
    a.addEventListener("loadedmetadata", () => Number.isFinite(a.duration) && setMediaDuration(a.duration));
    a.addEventListener("play", () => setPlaying(true));
    a.addEventListener("pause", () => setPlaying(false));
    a.addEventListener("ended", () => setPlaying(false));
    audio.current = a;
    return () => {
      a.pause();
      a.removeAttribute("src");
      audio.current = null;
    };
  }, [mediaUrl]);

  useEffect(() => {
    if (mediaUrl || !playing) return;
    const id = setInterval(() => {
      const next = Math.min(clock.current + 0.1 * speed, durationSec);
      clock.current = next;
      setTime(next);
      if (next >= durationSec) setPlaying(false);
    }, 100);
    return () => clearInterval(id);
  }, [mediaUrl, playing, speed, durationSec]);

  const seek = useCallback(
    (sec: number) => {
      const t = Math.min(Math.max(Number.isFinite(sec) ? sec : 0, 0), duration);
      if (audio.current) audio.current.currentTime = t;
      clock.current = t;
      setTime(t);
    },
    [duration],
  );

  const play = useCallback(() => {
    if (clock.current >= duration - 0.05 && duration > 0) seek(0); // at the end: play again from the start
    if (audio.current) audio.current.play().catch(() => setPlaying(false)); // the browser may refuse to autoplay
    else setPlaying(true);
  }, [duration, seek]);

  const pause = useCallback(() => (audio.current ? audio.current.pause() : setPlaying(false)), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause]);
  const skip = useCallback((delta: number) => seek(clock.current + delta), [seek]);

  const setSpeed = useCallback((s: number) => {
    speedRef.current = s;
    if (audio.current) audio.current.playbackRate = s;
    setSpeedState(s);
  }, []);

  return { time, duration, playing, speed, play, pause, toggle, seek, skip, setSpeed };
}

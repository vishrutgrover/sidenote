"use client";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { clock } from "@/lib/format";
import { SPEEDS, type Player } from "@/lib/usePlayer";
import styles from "./PlayerBar.module.css";

const speedLabel = (s: number) => `${s}×`;

/** Seek bar, time, speed, skip and play. `children` is for extra buttons on the right. */
export function PlayerBar({ player, children }: { player: Player; children?: React.ReactNode }) {
  const { time, duration, playing, speed } = player;
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  const progress = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div className={styles.bar} role="group" aria-label="Player">
      <input
        type="range"
        className={styles.seek}
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(time, duration || 1)}
        onChange={(e) => player.seek(Number(e.target.value))}
        style={{ "--progress": `${progress}%` } as React.CSSProperties}
        aria-label="Seek"
        aria-valuetext={`${clock(time)} of ${clock(duration)}`}
      />
      <div className={styles.row}>
        <div className={styles.time} aria-label="Time">
          <strong>{clock(time)}</strong> / {clock(duration)}
        </div>
        <div className={styles.controls}>
          <button className="btn btn-ghost" onClick={() => player.setSpeed(nextSpeed)} aria-label={`Speed ${speedLabel(speed)}, change`} title="Playback speed">
            {speedLabel(speed)}
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => player.skip(-10)} aria-label="Back 10 seconds">
            <RotateCcw size={18} />
          </button>
          <button className={styles.play} onClick={player.toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => player.skip(10)} aria-label="Forward 10 seconds">
            <RotateCw size={18} />
          </button>
        </div>
        <div className={styles.extra}>{children}</div>
      </div>
    </div>
  );
}

/** A page with a folded corner and a margin note: "side note". */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="var(--primary)" />
      <rect x="6.5" y="7" width="7" height="1.8" rx="0.9" fill="#fff" />
      <rect x="6.5" y="11" width="11" height="1.8" rx="0.9" fill="#fff" opacity="0.85" />
      <rect x="6.5" y="15" width="8" height="1.8" rx="0.9" fill="#fff" opacity="0.7" />
      <circle cx="17.5" cy="7.9" r="1.6" fill="#8de6ab" />
    </svg>
  );
}

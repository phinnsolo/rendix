/** Isotipo: un árbol de decisión mínimo (nodo raíz + dos ramas). */
export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect x="0.75" y="0.75" width="26.5" height="26.5" rx="8" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
      <path d="M14 9.5V13M14 13L8.5 18M14 13L19.5 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="14" cy="8" r="2.6" fill="currentColor" />
      <circle cx="8" cy="19.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="17.4" y="17.4" width="4.2" height="4.2" rx="1" fill="#8b8177" />
    </svg>
  );
}

/** Patrón de nodos y conectores, para fondos muy sutiles. */
export function NodePattern({ className, width = 220, height = 260 }: { className?: string; width?: number; height?: number }) {
  return (
    <svg className={className} width={width} height={height} viewBox="0 0 220 260" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.5">
        <path d="M110 30v40M110 70 50 130M110 70l60 60M50 130v50M170 130l-30 60M170 130l30 60M50 180l-25 45M50 180l25 45" />
        <circle cx="110" cy="24" r="8" />
        <rect x="96" y="62" width="28" height="16" rx="4" />
        <circle cx="50" cy="132" r="9" />
        <circle cx="170" cy="132" r="9" />
        <rect x="38" y="174" width="24" height="14" rx="4" />
        <circle cx="140" cy="194" r="6" />
        <circle cx="200" cy="194" r="6" />
        <circle cx="25" cy="230" r="6" />
        <circle cx="75" cy="230" r="6" />
      </g>
    </svg>
  );
}

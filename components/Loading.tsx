import { Skeleton } from "@/components/ui/Misc";

/** Estado de carga con esqueletos: la página "se arma" en lugar de mostrar solo un spinner. */
export default function Loading({ texto = "Cargando...", filas = 5 }: { texto?: string; filas?: number }) {
  return (
    <div className="skeleton-page" role="status" aria-live="polite">
      <span className="sr-only">{texto}</span>
      <div className="stack-sm" style={{ marginBottom: "1.75rem" }}>
        <Skeleton width={120} height={12} />
        <Skeleton width="38%" height={30} />
        <Skeleton width="52%" height={14} />
      </div>
      <div className="skeleton-toolbar">
        <Skeleton width={340} height={34} radius={10} />
        <Skeleton width={240} height={34} radius={10} />
      </div>
      <div className="row-list" aria-hidden>
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="row-item" style={{ borderTop: i ? "1px solid var(--border)" : undefined }}>
            <Skeleton width={44} height={44} radius={10} />
            <div className="row-main" style={{ gap: "0.5rem" }}>
              <Skeleton width={`${45 - (i % 3) * 8}%`} height={14} />
              <Skeleton width={`${60 - (i % 2) * 15}%`} height={10} />
            </div>
            <Skeleton width={90} height={24} radius={999} />
            <Skeleton width={70} height={32} radius={8} />
          </div>
        ))}
      </div>
    </div>
  );
}

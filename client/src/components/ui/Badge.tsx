import { Server, Smartphone } from "lucide-react";
import { machineStatusMeta, tunnelStatusMeta } from "../../lib/warp";
import type { MeshEntry } from "../../lib/api";
import { useLanguage } from "../../hooks/useLanguage";

export function KindBadge({ kind }: { kind: "node" | "device" }) {
  const { t } = useLanguage();
  const Icon = kind === "node" ? Server : Smartphone;
  const label = kind === "node" ? t("mesh.filterKind.node") : t("mesh.filterKind.device");

  return (
    <span className={`badge ${kind}`}>
      <Icon size={12} strokeWidth={2.25} aria-hidden />
      {label}
    </span>
  );
}

export function CombinedStatusBadge({ entry }: { entry: MeshEntry }) {
  const { t } = useLanguage();
  const meta = machineStatusMeta(entry.status);
  const Icon = entry.kind === "node" ? Server : Smartphone;
  const kindLabel = entry.kind === "node" ? "Node" : "Device";
  const statusKey = `status.${meta.label.toLowerCase()}`;
  const statusLabel = t(statusKey, { defaultValue: meta.label });

  return (
    <span className="status-pill" data-tone={meta.tone}>
      <Icon size={12} strokeWidth={2.25} aria-hidden />
      <span>{kindLabel} · {statusLabel}</span>
    </span>
  );
}

export function MachineKindStatus({ entry, size = 14 }: { entry: MeshEntry; size?: number }) {
  const { t } = useLanguage();
  const meta = machineStatusMeta(entry.status);
  const Icon = entry.kind === "node" ? Server : Smartphone;
  const kindLabel = entry.kind === "node" ? "Node" : "Device";
  const statusKey = `status.${meta.label.toLowerCase()}`;
  const statusLabel = t(statusKey, { defaultValue: meta.label });
  const tip = `${kindLabel} · ${statusLabel}`;

  return (
    <span
      className={`machine-kind-status ${entry.kind}`}
      data-tone={meta.tone}
      data-tip={tip}
      tabIndex={0}
      aria-label={`${kindLabel}, ${statusLabel}`}
    >
      <Icon size={size} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const { t } = useLanguage();
  const meta = tunnelStatusMeta(status);
  const statusKey = `status.${status.toLowerCase()}`;
  const localizedLabel = t(statusKey, { defaultValue: meta.label });

  return (
    <span
      className="status-dot"
      style={{ position: "relative", top: 1 }}
      data-tone={meta.tone}
      data-tip={localizedLabel}
      tabIndex={0}
      aria-label={localizedLabel}
    />
  );
}

import { Server, Smartphone } from "lucide-react";
import { machineStatusMeta, tunnelStatusMeta } from "../../lib/warp";
import {
  machineStatusLabel,
  machineStatusTip,
  tunnelStatusTip,
} from "../../i18n/status";
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

/** Kind chip with status available on hover (table rows). */
export function CombinedStatusBadge({ entry }: { entry: MeshEntry }) {
  const { t } = useLanguage();
  const meta = machineStatusMeta(entry.status);
  const Icon = entry.kind === "node" ? Server : Smartphone;
  const kindLabel = entry.kind === "node" ? t("mesh.filterKind.node") : t("mesh.filterKind.device");
  const statusLabel = machineStatusLabel(t, entry.status);
  const tip = machineStatusTip(t, entry.status);

  return (
    <span
      className="status-pill"
      data-tone={meta.tone}
      data-tip={tip}
      tabIndex={0}
      aria-label={`${kindLabel}, ${statusLabel}`}
    >
      <Icon size={12} strokeWidth={2.25} aria-hidden />
      <span>{kindLabel}</span>
    </span>
  );
}

/** Status-only chip for drawer headers. */
export function StatusChip({ status }: { status: string }) {
  const { t } = useLanguage();
  const meta = machineStatusMeta(status);
  const statusLabel = machineStatusLabel(t, status);
  const tip = machineStatusTip(t, status);

  return (
    <span
      className="status-pill"
      data-tone={meta.tone}
      data-tip={tip}
      tabIndex={0}
      aria-label={tip}
    >
      {statusLabel}
    </span>
  );
}

export function MachineKindStatus({ entry, size = 14 }: { entry: MeshEntry; size?: number }) {
  const { t } = useLanguage();
  const meta = machineStatusMeta(entry.status);
  const Icon = entry.kind === "node" ? Server : Smartphone;
  const kindLabel = entry.kind === "node" ? t("mesh.filterKind.node") : t("mesh.filterKind.device");
  const statusLabel = machineStatusLabel(t, entry.status);
  const tip = machineStatusTip(t, entry.status);

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
  const tip = tunnelStatusTip(t, status);

  return (
    <span
      className="status-dot"
      style={{ position: "relative", top: 1 }}
      data-tone={meta.tone}
      data-tip={tip}
      tabIndex={0}
      aria-label={tip}
    />
  );
}

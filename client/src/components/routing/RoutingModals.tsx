import { useMemo, useState, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { Switch } from "../ui/Switch";
import { useLanguage } from "../../hooks/useLanguage";
import { emailsToMatch, isEmail, matchToEmails, parseBulk, toSplitItem } from "../../lib/routing";
import type { ProfileInput, RoutingConnector, RoutingProfile, SplitTunnelItem } from "../../lib/api";

const looksLikeNetwork = (v: string) => /^[\d.]+(\/\d+)?$/.test(v) || v.includes(":");

/** Paste many destinations at once; one description for the batch. */
export function AddSplitModal({
  isOpen,
  mode,
  profileName,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  mode: "include" | "exclude";
  profileName: string;
  onClose: () => void;
  onSubmit: (items: SplitTunnelItem[]) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const values = parseBulk(text);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.length || busy) return;
    setBusy(true);
    const items = values.flatMap((v) => toSplitItem(v, description) ?? []);
    const ok = await onSubmit(items);
    setBusy(false);
    if (ok) {
      setText("");
      setDescription("");
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "exclude" ? t("routing.split.addTitleExclude") : t("routing.split.addTitleInclude")}
    >
      <form onSubmit={submit}>
        <p className="hint">{t("routing.split.addDesc", { profile: profileName })}</p>
        <div className="field">
          <label htmlFor="split-bulk">{t("routing.split.valuesLabel")}</label>
          <textarea
            id="split-bulk"
            className="input mono textarea"
            dir="ltr"
            rows={5}
            spellCheck={false}
            placeholder={"*.klikbca.com\nklikbca.com\n10.0.0.0/8"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <span className="hint">{t("routing.bulkCount", { count: values.length })}</span>
        </div>
        <div className="field">
          <label htmlFor="split-bulk-desc">{t("settings.splitTunnels.descriptionLabel")}</label>
          <input
            id="split-bulk-desc"
            type="text"
            value={description}
            placeholder={t("routing.split.descPlaceholder")}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="row-actions modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!values.length || busy}>
            {busy ? <Spinner label={t("common.saving")} /> : t("routing.addCount", { count: values.length })}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Edit one split-tunnel entry or one route comment. */
export function EditEntryModal({
  isOpen,
  title,
  value,
  valueEditable,
  description,
  descriptionLabel,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  title: string;
  value: string;
  valueEditable: boolean;
  description: string;
  descriptionLabel: string;
  onClose: () => void;
  onSubmit: (value: string, description: string) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [draftValue, setDraftValue] = useState(value);
  const [draftDesc, setDraftDesc] = useState(description);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draftValue.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit(draftValue.trim(), draftDesc.trim());
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="entry-value">{t("routing.destination")}</label>
          <input
            id="entry-value"
            type="text"
            className="mono"
            dir="ltr"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            disabled={!valueEditable || busy}
            autoFocus={valueEditable}
          />
        </div>
        <div className="field">
          <label htmlFor="entry-desc">{descriptionLabel}</label>
          <input
            id="entry-desc"
            type="text"
            value={draftDesc}
            maxLength={100}
            onChange={(e) => setDraftDesc(e.target.value)}
            disabled={busy}
            autoFocus={!valueEditable}
          />
        </div>
        <div className="row-actions modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!draftValue.trim() || busy}>
            {busy ? <Spinner label={t("common.saving")} /> : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Bulk-add routes to one exit. `fixedConnectorId` locks the exit (used from a drawer). */
export function AddRoutesModal({
  isOpen,
  connectors,
  fixedConnectorId,
  defaultConnectorId,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  connectors: RoutingConnector[];
  fixedConnectorId?: string;
  defaultConnectorId?: string;
  onClose: () => void;
  onSubmit: (v: { connectorId: string; values: string[]; comment?: string }) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [connectorId, setConnectorId] = useState(fixedConnectorId ?? defaultConnectorId ?? "");
  const [text, setText] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const values = parseBulk(text);
  const target = fixedConnectorId ?? connectorId;

  const counts = useMemo(() => {
    const networks = values.filter(looksLikeNetwork).length;
    return { networks, hostnames: values.length - networks };
  }, [values]);

  const tunnels = connectors.filter((c) => c.kind === "tunnel");
  const nodes = connectors.filter((c) => c.kind === "node");
  const hostnamesToNode = counts.hostnames > 0 && nodes.some((n) => n.id === target);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.length || !target || busy) return;
    setBusy(true);
    const ok = await onSubmit({ connectorId: target, values, comment: comment.trim() || undefined });
    setBusy(false);
    if (ok) {
      setText("");
      setComment("");
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("routing.routes.addTitle")}>
      <form onSubmit={submit}>
        <p className="hint">{t("routing.routes.addDesc")}</p>
        {!fixedConnectorId && (
          <div className="field">
            <label htmlFor="route-exit">{t("routing.routes.exitLabel")}</label>
            <select
              id="route-exit"
              className="input select"
              value={connectorId}
              onChange={(e) => setConnectorId(e.target.value)}
              disabled={busy}
              required
            >
              <option value="" disabled>
                {t("routing.routes.exitPlaceholder")}
              </option>
              {tunnels.length > 0 && (
                <optgroup label={t("routing.kind.tunnel")}>
                  {tunnels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status !== "healthy" ? ` (${c.status})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {nodes.length > 0 && (
                <optgroup label={t("routing.kind.node")}>
                  {nodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status !== "healthy" ? ` (${c.status})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="route-bulk">{t("routing.routes.valuesLabel")}</label>
          <textarea
            id="route-bulk"
            className="input mono textarea"
            dir="ltr"
            rows={5}
            spellCheck={false}
            placeholder={"reddit.com\nredd.it\n10.10.0.0/24"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            autoFocus={Boolean(fixedConnectorId)}
          />
          <span className="hint">
            {values.length === 0
              ? t("routing.routes.valuesHint")
              : t("routing.routes.parsed", { hostnames: counts.hostnames, networks: counts.networks })}
          </span>
        </div>
        {hostnamesToNode && (
          <p className="hint hint-warn" role="alert">
            {t("routing.routes.nodeHostnameWarn")}
          </p>
        )}
        <div className="field">
          <label htmlFor="route-bulk-comment">{t("mesh.modals.commentLabel")}</label>
          <input
            id="route-bulk-comment"
            type="text"
            maxLength={100}
            value={comment}
            placeholder={t("routing.routes.commentPlaceholder")}
            onChange={(e) => setComment(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="row-actions modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!values.length || !target || busy}>
            {busy ? <Spinner label={t("common.saving")} /> : t("routing.addCount", { count: values.length })}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Create or edit a custom device profile: name, who it applies to, on/off. */
export function ProfileModal({
  isOpen,
  profile,
  dashUrl,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  /** Missing when creating. */
  profile?: RoutingProfile;
  dashUrl: string | null;
  onClose: () => void;
  onSubmit: (input: ProfileInput) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const initialEmails = profile ? matchToEmails(profile.match) : [];
  const [name, setName] = useState(profile?.name ?? "");
  const [byEmail, setByEmail] = useState(initialEmails !== null);
  const [emailsText, setEmailsText] = useState((initialEmails ?? []).join("\n"));
  const [rule, setRule] = useState(profile?.match ?? "");
  const [enabled, setEnabled] = useState(profile?.enabled ?? true);
  const [busy, setBusy] = useState(false);

  const emails = parseBulk(emailsText);
  const badEmail = emails.find((e) => !isEmail(e));
  const match = byEmail ? (emails.length && !badEmail ? emailsToMatch(emails) : "") : rule.trim();
  const valid = name.trim().length > 0 && match.length > 0;

  const switchToRule = () => {
    if (match) setRule(match);
    setByEmail(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onSubmit({ name: name.trim(), match, enabled });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title={profile ? t("routing.profiles.editTitle") : t("routing.profiles.newTitle")}
    >
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="profile-name">{t("routing.profiles.nameLabel")}</label>
          <input
            id="profile-name"
            type="text"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </div>

        {byEmail ? (
          <div className="field">
            <label htmlFor="profile-emails">{t("routing.profiles.emailsLabel")}</label>
            <textarea
              id="profile-emails"
              className="input mono textarea"
              dir="ltr"
              rows={3}
              spellCheck={false}
              value={emailsText}
              onChange={(e) => setEmailsText(e.target.value)}
              disabled={busy}
            />
            {badEmail ? (
              <span className="hint hint-warn" role="alert">
                {t("routing.profiles.invalidEmail", { value: badEmail })}
              </span>
            ) : (
              <span className="hint">{t("routing.profiles.emailsHint")}</span>
            )}
            <button type="button" className="btn btn-sm btn-ghost profile-match-toggle" onClick={switchToRule} disabled={busy}>
              {t("routing.profiles.useRule")}
            </button>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="profile-rule">{t("routing.profiles.ruleLabel")}</label>
            <textarea
              id="profile-rule"
              className="input mono textarea"
              dir="ltr"
              rows={3}
              spellCheck={false}
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              disabled={busy}
            />
            <span className="hint">{t("routing.profiles.ruleHint")}</span>
            {matchToEmails(rule) !== null || !rule.trim() ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost profile-match-toggle"
                onClick={() => {
                  setEmailsText((matchToEmails(rule) ?? []).join("\n"));
                  setByEmail(true);
                }}
                disabled={busy}
              >
                {t("routing.profiles.useEmails")}
              </button>
            ) : null}
          </div>
        )}

        <div className="field">
          <Switch
            checked={enabled}
            label={t("routing.profiles.enabledLabel")}
            endLabel={t("routing.profiles.enabledLabel")}
            disabled={busy}
            onChange={setEnabled}
          />
        </div>

        <p className="hint">
          {!profile && <>{t("routing.profiles.copiesDefault")} </>}
          {dashUrl && (
            <>
              {t("routing.profiles.moreInDash")}{" "}
              <a href={dashUrl} target="_blank" rel="noreferrer">
                {t("routing.profiles.openDash")}
              </a>
            </>
          )}
        </p>

        <div className="row-actions modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
            {busy ? <Spinner label={t("common.saving")} /> : profile ? t("common.save") : t("routing.profiles.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

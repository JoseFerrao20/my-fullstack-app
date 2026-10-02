import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import {
  reminderApi,
  usePreferences,
  usePushConfig,
  useUpdatePreferences,
  type NotificationPreferences,
} from "@/features/account/notificationsApi";
import { pushState, subscribe, unsubscribe, type PushState } from "@/features/account/push";
import { browserTimeZone } from "@/features/tasks/schema";
import { useErrorMessage } from "@/lib/errors";
import { intlLocale } from "@/lib/i18n";

function Checkbox({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-start gap-3 text-sm text-slate-800">
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" {...props} />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function hourLabel(hour: number) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(intlLocale(), { hour: "2-digit", minute: "2-digit" });
}

function PushControls({ publicKey }: { publicKey: string | null | undefined }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ReactNode>(null);

  useEffect(() => {
    void pushState().then(setState);
  }, []);

  if (publicKey === undefined || state === "loading") return null;
  if (publicKey === null) return <p className="text-sm text-slate-500">{t("notificationSettings.pushUnavailable")}</p>;
  if (state === "unsupported") return <p className="text-sm text-slate-500">{t("notificationSettings.pushUnsupported")}</p>;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(<span className="text-red-600">{errorMessage(err)}</span>);
    } finally {
      setBusy(false);
      setState(await pushState());
    }
  };

  const enable = () =>
    run(async () => {
      const subscription = await subscribe(publicKey);
      if (subscription) await reminderApi.subscribe(subscription);
    });

  const disable = () =>
    run(async () => {
      const endpoint = await unsubscribe();
      if (endpoint) await reminderApi.unsubscribe(endpoint);
    });

  const test = () =>
    run(async () => {
      await reminderApi.sendTest();
      setMessage(t("notificationSettings.pushTestSent"));
    });

  return (
    <div className="space-y-2 rounded-md bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-800">
        {t("notificationSettings.pushTitle")}:{" "}
        <span className={state === "on" ? "text-emerald-700" : "text-slate-600"}>
          {state === "on" ? t("notificationSettings.pushOn") : t("notificationSettings.pushOff")}
        </span>
      </p>
      <p className="text-xs text-slate-500">{t("notificationSettings.pushHint")}</p>
      {state === "blocked" ? (
        <p role="alert" className="text-sm text-amber-700">
          {t("notificationSettings.pushBlocked")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {state === "on" ? (
            <>
              <Button variant="secondary" disabled={busy} onClick={disable}>
                {t("notificationSettings.pushDisable")}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={test}>
                {t("notificationSettings.pushTest")}
              </Button>
            </>
          ) : (
            <Button disabled={busy} onClick={enable}>
              {t("notificationSettings.pushEnable")}
            </Button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-slate-700">
          {message}
        </p>
      )}
    </div>
  );
}

function PreferencesForm({ initial }: { initial: NotificationPreferences }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdatePreferences();
  const [prefs, setPrefs] = useState(initial);
  const set = (patch: Partial<NotificationPreferences>) => setPrefs((p) => ({ ...p, ...patch }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // The digest hour is in local time, so save where "local" currently is.
    update.mutate({ ...prefs, timezone: browserTimeZone() });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Checkbox
        label={t("notificationSettings.emailReminders")}
        checked={prefs.emailReminders}
        onChange={(e) => set({ emailReminders: e.target.checked })}
      />
      <Checkbox
        label={t("notificationSettings.pushReminders")}
        checked={prefs.pushReminders}
        onChange={(e) => set({ pushReminders: e.target.checked })}
      />
      <Checkbox
        label={t("notificationSettings.digest")}
        hint={t("notificationSettings.digestHint")}
        checked={prefs.dailyDigest}
        onChange={(e) => set({ dailyDigest: e.target.checked })}
      />
      {prefs.dailyDigest && (
        <div className="w-40 pl-7">
          <Select
            label={t("notificationSettings.digestHour")}
            value={prefs.digestHour}
            onChange={(e) => set({ digestHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={update.isPending}>
          {t("notificationSettings.save")}
        </Button>
        {update.error ? (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(update.error)}
          </p>
        ) : (
          update.isSuccess && (
            <p role="status" className="text-sm text-emerald-700">
              {t("notificationSettings.saved")}
            </p>
          )
        )}
      </div>
    </form>
  );
}

export function NotificationsSection() {
  const { t } = useTranslation();
  const { data: prefs } = usePreferences();
  const { data: config } = usePushConfig();

  return (
    <section aria-labelledby="settings-notifications" className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <h2 id="settings-notifications" className="text-lg font-semibold text-slate-900">
        {t("notificationSettings.title")}
      </h2>
      <p className="text-sm text-slate-600">{t("notificationSettings.intro")}</p>
      <PushControls publicKey={config === undefined ? undefined : config.publicKey} />
      {prefs ? <PreferencesForm initial={prefs} /> : <p className="text-sm text-slate-500">{t("app.loading")}</p>}
    </section>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/apiClient";
import { useErrorMessage } from "@/lib/errors";
import { formatDueDate } from "@/lib/format";

interface FeedStatus {
  enabled: boolean;
  createdAt: string | null;
}

const feedKey = ["calendar-feed"] as const;
const feedApi = {
  status: () => api.get<FeedStatus>("/calendar-feed").then((r) => r.data),
  create: () => api.post<FeedStatus & { url: string }>("/calendar-feed").then((r) => r.data),
  remove: () => api.delete("/calendar-feed"),
};

export function CalendarFeedSection() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { data: status } = useQuery({ queryKey: feedKey, queryFn: feedApi.status });
  // The full URL is only known right after creating it (the server keeps just a hash).
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: feedApi.create,
    onSuccess: (created) => {
      setUrl(created.url);
      setCopied(false);
      queryClient.setQueryData(feedKey, { enabled: true, createdAt: created.createdAt });
    },
  });
  const remove = useMutation({
    mutationFn: feedApi.remove,
    onSuccess: () => {
      setUrl(null);
      queryClient.setQueryData(feedKey, { enabled: false, createdAt: null });
    },
  });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked: the field is selectable, people can copy by hand.
    }
  };

  const error = create.error ?? remove.error;

  return (
    <section aria-labelledby="settings-feed" className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <h2 id="settings-feed" className="text-lg font-semibold text-slate-900">
        {t("feed.title")}
      </h2>
      <p className="text-sm text-slate-600">{t("feed.intro")}</p>

      {url && (
        <div className="space-y-2 rounded-md bg-amber-50 p-3">
          <label htmlFor="feed-url" className="block text-sm font-medium text-slate-800">
            {t("feed.urlLabel")}
          </label>
          <div className="flex gap-2">
            <input
              id="feed-url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
            />
            <Button variant="secondary" onClick={copy}>
              {copied ? t("feed.copied") : t("feed.copy")}
            </Button>
          </div>
          <p className="text-xs text-amber-800">{t("feed.urlOnce")}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <a
              href={`https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-indigo-600 hover:underline"
            >
              {t("feed.google")}
            </a>
            <a href={url.replace(/^https?:/, "webcal:")} className="font-medium text-indigo-600 hover:underline">
              {t("feed.apple")}
            </a>
          </div>
        </div>
      )}

      {status && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-700">
            {status.enabled && status.createdAt ? t("feed.on", { date: formatDueDate(status.createdAt) }) : t("feed.off")}
          </p>
          {status.enabled ? (
            <>
              <Button
                variant="secondary"
                disabled={create.isPending}
                onClick={() => confirm(t("feed.confirmRegenerate")) && create.mutate()}
              >
                {t("feed.regenerate")}
              </Button>
              <Button
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => confirm(t("feed.confirmDisable")) && remove.mutate()}
              >
                {t("feed.disable")}
              </Button>
            </>
          ) : (
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {t("feed.enable")}
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage(error)}
        </p>
      )}
    </section>
  );
}

import { useCallback } from "react";
import { translate, type TranslationKey } from "../i18n/messages";
import { useLocaleStore } from "../stores/localeStore";

export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale],
  );
}

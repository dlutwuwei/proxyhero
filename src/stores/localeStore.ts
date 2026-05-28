import { create } from "zustand";
import { detectLocale, type Locale } from "../i18n/messages";

interface LocaleStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleStore>((set) => {
  const initial = detectLocale();
  document.documentElement.lang = initial === "zh" ? "zh-CN" : "en";
  return {
    locale: initial,
    setLocale: (locale) => {
      try {
        localStorage.setItem("proxyhero-locale", locale);
      } catch {
        /* ignore */
      }
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
      set({ locale });
    },
  };
});

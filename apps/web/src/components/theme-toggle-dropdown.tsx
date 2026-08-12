import { MoonIcon, SunIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { useUserPreferencesStore } from "@/store/user-preferences";

export function ThemeToggleDropdown() {
  const { theme, setTheme } = useUserPreferencesStore();
  const { t } = useTranslation();

  const options = [
    {
      value: "dark" as const,
      label: t("settings:preferencesPage.themeDark"),
      content: <MoonIcon aria-hidden="true" size={13} />,
    },
    {
      value: "light" as const,
      label: t("settings:preferencesPage.themeLight"),
      content: <SunIcon aria-hidden="true" size={13} />,
    },
    {
      value: "bp" as const,
      label: t("settings:preferencesPage.themeBp"),
      content: (
        <span className="text-[11px] font-semibold leading-none">BP</span>
      ),
    },
  ];

  return (
    <div
      role="group"
      aria-label={t("settings:preferencesPage.theme")}
      className="inline-flex h-7 items-center rounded-full bg-input/50 p-0.5 font-medium text-sm"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          aria-label={option.label}
          onClick={() => setTheme(option.value)}
          className={cn(
            "flex h-6 min-w-7 items-center justify-center rounded-full px-1 transition-colors duration-300 ease-out",
            theme === option.value
              ? option.value === "bp"
                ? "bg-background text-bp-primary shadow-sm"
                : "bg-background text-foreground shadow-sm"
              : "text-muted-foreground/70 hover:text-foreground",
          )}
        >
          {option.content}
        </button>
      ))}
    </div>
  );
}

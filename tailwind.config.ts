import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        /* Analitik konsolu tasarım token'ları.
           Nötr gri gövde + tek marka rengi; anlam taşımayan renk kullanılmaz. */
        canvas: "#0A0B0D",
        panel: {
          DEFAULT: "#111317",
          raised: "#171A20",
          sunken: "#0D0F13",
        },
        hairline: {
          DEFAULT: "rgba(255, 255, 255, 0.07)",
          strong: "rgba(255, 255, 255, 0.13)",
        },
        brand: {
          DEFAULT: "#005BFF",
          soft: "rgba(0, 91, 255, 0.12)",
        },
        gain: "#35C07E",
        caution: "#F59E0B",
        loss: "#EF4444",
        /* Soft UI SaaS Dashboard Design Tokens (AGENTS.md Section 7) */
        "bg-page": "var(--bg-page)",
        surface: {
          DEFAULT: "var(--surface)",
          muted: "var(--surface-muted)",
          accent: "var(--surface-accent)",
        },
        "border-subtle": "var(--border-subtle)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          foreground: "var(--ink-foreground)",
          muted: "var(--ink-muted)",
          subtle: "var(--ink-subtle)",
          faint: "var(--ink-faint)",
        },
        status: {
          "success-bg": "var(--status-success-bg)",
          "success-text": "var(--status-success-text)",
          "danger-bg": "var(--status-danger-bg)",
          "danger-text": "var(--status-danger-text)",
          "info-bg": "var(--status-info-bg)",
          "info-text": "var(--status-info-text)",
          "warning-bg": "var(--status-warning-bg)",
          "warning-text": "var(--status-warning-text)",
          "pink-bg": "var(--status-pink-bg)",
          "pink-text": "var(--status-pink-text)",
          "neutral-bg": "var(--status-neutral-bg)",
          "neutral-text": "var(--status-neutral-text)",
        },
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        card: "var(--radius-card)",
        inner: "var(--radius-inner)",
        "sm-token": "var(--radius-sm)",
        panel: "12px",
      },
      boxShadow: {
        hairline: "var(--shadow-hairline)",
        float: "var(--shadow-float)",
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
export default config;

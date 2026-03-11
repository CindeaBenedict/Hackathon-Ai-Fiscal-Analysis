import React from "react";

type ErrorVariant = "network" | "server" | "validation" | "generic";

type CoolErrorPageProps = {
  title: string;
  message: string;
  variant?: ErrorVariant;
  compact?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
};

const VARIANT_TEXT: Record<ErrorVariant, string> = {
  network: "Connection anomaly",
  server: "Backend disturbance",
  validation: "Input mismatch",
  generic: "Unexpected behavior",
};

const VARIANT_EMOJI: Record<ErrorVariant, string> = {
  network: "0101",
  server: "500",
  validation: "!",
  generic: "ERR",
};

export default function CoolErrorPage({
  title,
  message,
  variant = "generic",
  compact = false,
  onRetry,
  onDismiss,
}: CoolErrorPageProps) {
  return (
    <section className={`error-page ${compact ? "compact" : ""} ${variant}`}>
      <div className="error-page-glow" aria-hidden="true" />
      <div className="error-page-badge" aria-hidden="true">
        {VARIANT_EMOJI[variant]}
      </div>
      <p className="error-page-kicker">{VARIANT_TEXT[variant]}</p>
      <h3>{title}</h3>
      <p>{message}</p>
      {(onRetry || onDismiss) ? (
        <div className="error-page-actions">
          {onRetry ? (
            <button type="button" className="primary-button" onClick={onRetry}>
              Retry
            </button>
          ) : null}
          {onDismiss ? (
            <button type="button" className="secondary-button" onClick={onDismiss}>
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { GraduationCap, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { appPath } from "@/lib/app-paths";

type TrainingModeResponse = {
  training_mode: boolean;
  data_mode: "training" | "production";
};

function readError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Unable to update Training Mode.";
  const first = Object.values(payload as Record<string, unknown>)[0];
  if (Array.isArray(first)) return String(first[0]);
  return typeof first === "string" ? first : "Unable to update Training Mode.";
}

export function TrainingModeSettings() {
  const [setting, setSetting] = useState<TrainingModeResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSetting() {
      try {
        const response = await fetch(appPath("/api/settings/training-mode"), {
          cache: "no-store",
        });
        const payload = (await response.json()) as TrainingModeResponse | Record<string, unknown>;
        if (!response.ok) throw new Error(readError(payload));
        if (active) setSetting(payload as TrainingModeResponse);
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load Training Mode.");
        }
      }
    }

    void loadSetting();
    return () => {
      active = false;
    };
  }, []);

  async function toggleTrainingMode() {
    if (!setting || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(appPath("/api/settings/training-mode"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ training_mode: !setting.training_mode }),
      });
      const payload = (await response.json()) as TrainingModeResponse | Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setSetting(payload as TrainingModeResponse);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update Training Mode.");
    } finally {
      setSaving(false);
    }
  }

  const trainingEnabled = setting?.training_mode ?? false;

  return (
    <section className="settings-section" aria-labelledby="general-settings-title">
      <header className="settings-section-header">
        <p>Application</p>
        <h2 id="general-settings-title">General</h2>
        <span>Choose how Table Host behaves for this restaurant.</span>
      </header>

      <article className={`settings-option${trainingEnabled ? " is-enabled" : ""}`}>
        <div className="settings-option-icon" aria-hidden="true">
          <GraduationCap />
        </div>
        <div className="settings-option-copy">
          <div className="settings-option-title-row">
            <div>
              <h3>Enable Training Mode</h3>
              <span className={`data-mode-badge ${trainingEnabled ? "training" : "production"}`}>
                {setting ? (trainingEnabled ? "Training mode" : "Production mode") : "Loading mode"}
              </span>
            </div>
            <button
              type="button"
              className="settings-switch"
              role="switch"
              aria-checked={trainingEnabled}
              aria-label="Enable Training Mode"
              disabled={!setting || saving}
              onClick={() => void toggleTrainingMode()}
            >
              <span />
            </button>
          </div>
          <p>
            Practice with sample reservations, seated parties, and walk-ins created as you open
            each service day and shift.
          </p>
          <div className="settings-safety-note">
            <ShieldCheck aria-hidden="true" />
            <span>
              Training records stay separate from production data. Turn Training Mode off at any
              time to return to the restaurant&apos;s live records without changing them.
            </span>
          </div>
          {saving && (
            <span className="settings-option-status" role="status">
              <LoaderCircle className="spin" aria-hidden="true" /> Updating mode…
            </span>
          )}
          {error && <span className="settings-option-error" role="alert">{error}</span>}
        </div>
      </article>
    </section>
  );
}

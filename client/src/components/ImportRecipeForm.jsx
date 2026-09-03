import { useState } from "react";
import { api } from "../api.js";

export function ImportRecipeForm({ onImported }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const recipe = await api.importRecipe(url.trim());
      onImported(recipe);
      setUrl("");
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card import-panel">
      <form className="import-row" onSubmit={handleSubmit}>
        <input
          type="url"
          placeholder="Paste a recipe URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "Importing…" : "Import"}
        </button>
      </form>
      {error && (
        <p className="import-error">
          {error.message}
          {error.needsManualEntry &&
            (error.message.startsWith("Failed to fetch")
              ? " — this site is blocking automated requests, so it can't be auto-imported. You can add it manually instead."
              : " — this site doesn't expose structured recipe data, so it can't be auto-imported. You can add it manually instead.")}
        </p>
      )}
    </div>
  );
}

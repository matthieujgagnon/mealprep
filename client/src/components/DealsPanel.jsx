import { useEffect, useState } from "react";
import { api } from "../api.js";

export function DealsPanel() {
  const [deals, setDeals] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [store, setStore] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  function loadDeals() {
    api.getDeals().then(setDeals).catch(() => setDeals(null));
  }

  useEffect(() => {
    loadDeals();
  }, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!store.trim() || !file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadFlyer(store.trim(), file);
      setStore("");
      setFile(null);
      setShowUpload(false);
      loadDeals();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (!deals) return null;

  return (
    <section className="deals-section">
      <div className="deals-header">
        <h2 className="deals-heading">This week's specials</h2>
        <button type="button" className="btn subtle" onClick={() => setShowUpload((s) => !s)}>
          {showUpload ? "Cancel" : "Upload flyer"}
        </button>
      </div>
      <p className="deals-sub">
        {deals.stores.join(" · ")}
        {deals.isMockData && " — sample data, upload a flyer to replace it with real deals"}
      </p>

      {showUpload && (
        <form className="flyer-upload-form" onSubmit={handleUpload}>
          <label className="form-label">
            Store
            <input
              type="text"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="e.g. Metro"
              required
            />
          </label>
          <label className="form-label">
            Flyer PDF
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
          </label>
          <button type="submit" className="btn primary" disabled={uploading}>
            {uploading ? "Reading flyer…" : "Extract deals"}
          </button>
          {error && <p className="flyer-upload-error">{error}</p>}
        </form>
      )}

      <div className="deals-row">
        {deals.deals.map((d) => (
          <div key={d.id} className={`price-tag${d.category === "protein" ? " sale" : ""}`}>
            <span className="item">{d.item}</span>
            <span className="price">{d.price}</span>
            <span className="store">{d.store}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
